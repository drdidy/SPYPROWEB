"""Live data orchestration on top of prophet_core.

Wraps external data providers (yfinance for SPY OHLC + ^VIX, optional
Tastytrade for options) and feeds the engine. Returns a JSON-shaped
snapshot mirroring the design fixture so the frontend stays decoupled
from the data source choice.

Caching uses prophet_core.ttl_cache:
  - SPY hourly OHLC: 60s
  - VIX/DXY/VVIX last quote: 60s

This module imports yfinance lazily so the import cost only hits the
serverless function once it's actually called.
"""
from __future__ import annotations

import math
import os
from datetime import datetime
from typing import Any

import pandas as pd

from . import prophet_core as pc
from . import seed_snapshot


# ---------------------------------------------------------------------------
# Quote helpers
# ---------------------------------------------------------------------------

@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_spy_hourly(period: str = "5d") -> pd.DataFrame:
    """Hourly SPY bars from Yahoo, normalized + indexed in CT.

    Returns an empty frame on any failure; callers handle the empty case.
    """
    try:
        import yfinance as yf  # imported lazily
        ticker = yf.Ticker(pc.SYMBOL)
        df = ticker.history(period=period, interval="60m", auto_adjust=False)
    except Exception:
        return pd.DataFrame()
    if df is None or df.empty:
        return pd.DataFrame()
    df = pc.normalize_yfinance_frame(df)
    df = pc.ensure_central_index(df)
    return df


@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_last_close(symbol: str) -> float:
    """Latest available close for a Yahoo symbol (used for VIX/DXY/VVIX)."""
    try:
        import yfinance as yf
        df = yf.Ticker(symbol).history(period="2d", interval="1d", auto_adjust=False)
    except Exception:
        return float("nan")
    if df is None or df.empty:
        return float("nan")
    try:
        return float(df["Close"].iloc[-1])
    except Exception:
        return float("nan")


# ---------------------------------------------------------------------------
# Snapshot assembly
# ---------------------------------------------------------------------------

# The Trigger Map UI expects rows shaped like the design fixture. We translate
# prophet_core's primary lines + a few well-known reference points (PDH/PDL,
# day open) into that shape.

def _triggers_from_lines(
    primary_lines: list[pc.DynamicLine],
    current_dt: datetime,
    current_price: float,
    rth_today: pd.DataFrame,
    rth_yesterday: pd.DataFrame,
) -> list[dict]:
    rows: list[dict] = []
    name_to_label = {
        "UA": "Upper Asc Trigger",
        "UD": "Upper Desc Trigger",
        "LA": "Lower Asc Trigger",
        "LD": "Lower Desc Trigger",
    }

    armed_set = {l.name for l in pc.active_entry_lines(primary_lines, current_price, current_dt)}

    for line in primary_lines:
        v = line.tradable_value_at(current_dt)
        if pd.isna(v):
            continue
        dist = current_price - v
        bps = round((dist / current_price) * 10000) if current_price else 0
        bias = max(-100, min(100, int(round(-dist * 25))))
        if line.name in armed_set:
            status = "ARMED"
        elif abs(dist) < 0.20:
            status = "WATCHING"
        elif (line.direction == "descending" and current_price < v) or (line.direction == "ascending" and current_price > v):
            status = "BREACHED"
        else:
            status = "WATCHING"
        rows.append({
            "line": name_to_label.get(line.name, line.name),
            "level": round(float(v), 2),
            "dist": round(float(dist), 2),
            "bps": bps,
            "bias": bias,
            "status": status,
        })

    if rth_yesterday is not None and not rth_yesterday.empty:
        pdh = float(rth_yesterday["High"].max())
        pdl = float(rth_yesterday["Low"].min())
        for label, level in (("PDH", pdh), ("PDL", pdl)):
            dist = current_price - level
            bps = round((dist / current_price) * 10000) if current_price else 0
            rows.append({
                "line": label,
                "level": round(level, 2),
                "dist": round(dist, 2),
                "bps": bps,
                "bias": max(-100, min(100, int(round(-dist * 18)))),
                "status": "ARMED" if abs(dist) < 0.50 else ("WATCHING" if abs(dist) < 1.50 else "STALE"),
            })

    if rth_today is not None and not rth_today.empty:
        day_open = float(rth_today.iloc[0]["Open"])
        dist = current_price - day_open
        bps = round((dist / current_price) * 10000) if current_price else 0
        rows.append({
            "line": "Day Open",
            "level": round(day_open, 2),
            "dist": round(dist, 2),
            "bps": bps,
            "bias": max(-100, min(100, int(round(-dist * 22)))),
            "status": "BREACHED" if abs(dist) > 0.30 else "WATCHING",
        })

    return rows


def _bias_label_and_score(state: pc.BiasState, current_price: float) -> tuple[str, int]:
    if state.bias in {"BULLISH", "BEARISH"}:
        sign = 1 if state.bias == "BULLISH" else -1
        score = int(round(sign * state.strength_score))
    elif state.bias == "REGULAR_SESSION":
        center = (state.ua_value + state.ud_value) / 2 if (
            not pd.isna(state.ua_value) and not pd.isna(state.ud_value)
        ) else current_price
        delta = current_price - center
        score = max(-100, min(100, int(round(delta * 30))))
    else:
        score = 0
    if score >= 50:
        label = "LONG-LEAN"
    elif score >= 15:
        label = "HOLD"
    elif score <= -50:
        label = "SHORT-LEAN"
    elif score <= -15:
        label = "WAIT"
    else:
        label = "NEUTRAL"
    return label, score


def _bias_note(state: pc.BiasState, vix: float) -> str:
    parts: list[str] = []
    if not pd.isna(vix):
        parts.append("BACKWARDATION" if vix >= 18 else "CONTANGO")
    if state.primary_line:
        parts.append(f"{pc.compact_line_name(state.primary_line).upper()} INTACT")
    parts.append("DEALER GAMMA " + ("LONG" if state.bias == "BULLISH" else "SHORT" if state.bias == "BEARISH" else "FLAT"))
    return " · ".join(parts)


def build_live_snapshot() -> dict:
    """Run the whole pipeline; raise on any unrecoverable error."""
    df = fetch_spy_hourly("5d")
    if df.empty:
        raise RuntimeError("yfinance returned no SPY bars")

    days = pc.get_available_trading_days(df)
    if not days:
        raise RuntimeError("no trading days in SPY frame")
    today = days[-1]
    yesterday = days[-2] if len(days) >= 2 else None

    rth_today = pc.filter_rth_session(df, today)
    rth_yesterday = pc.filter_rth_session(df, yesterday) if yesterday else pd.DataFrame()

    structure_frame = rth_yesterday if not rth_yesterday.empty else rth_today
    high_pivot = pc.find_high_pivot(structure_frame)
    low_pivot = pc.find_low_pivot(structure_frame)
    slope = pc.get_structure_calibration()
    primary_lines = pc.build_primary_lines(high_pivot, low_pivot, slope)

    if rth_today.empty:
        latest = df.iloc[-1]
    else:
        latest = rth_today.iloc[-1]
    current_price = float(latest["Close"])
    current_dt = pd.Timestamp(latest.name).to_pydatetime()

    bias_state = pc.determine_preopen_bias(primary_lines, current_price, current_dt)

    if not rth_today.empty:
        day_open = float(rth_today.iloc[0]["Open"])
        day_high = float(rth_today["High"].max())
        day_low = float(rth_today["Low"].min())
    else:
        day_open = float(latest["Open"])
        day_high = float(latest["High"])
        day_low = float(latest["Low"])
    prev_close = float(rth_yesterday.iloc[-1]["Close"]) if not rth_yesterday.empty else float("nan")
    chg = current_price - prev_close if not pd.isna(prev_close) else 0.0
    chg_pct = (chg / prev_close * 100) if prev_close else 0.0

    vix = fetch_last_close("^VIX")
    dxy = fetch_last_close("DX-Y.NYB")
    vvix = fetch_last_close("^VVIX")

    bias_label, bias_score = _bias_label_and_score(bias_state, current_price)

    spark_source = rth_today if not rth_today.empty else rth_yesterday
    spark = [round(float(v), 2) for v in spark_source["Close"].tolist()][-60:]
    if not spark:
        spark = seed_snapshot.SPARK

    triggers = _triggers_from_lines(primary_lines, current_dt, current_price, rth_today, rth_yesterday)

    return {
        "asOf": pd.Timestamp(current_dt).isoformat(),
        "source": "live",
        "bias": {
            "label": bias_label,
            "score": bias_score,
            "note": _bias_note(bias_state, vix),
        },
        "quote": {
            "last": round(current_price, 2),
            "chg": round(chg, 2),
            "chgPct": round(chg_pct, 3),
            "open": round(day_open, 2),
            "high": round(day_high, 2),
            "low": round(day_low, 2),
            "prevClose": round(prev_close, 2) if not pd.isna(prev_close) else 0.0,
        },
        "context": {
            "vix": round(vix, 2) if not pd.isna(vix) else 0.0,
            "dxy": round(dxy, 2) if not pd.isna(dxy) else 0.0,
            "vvix": round(vvix, 2) if not pd.isna(vvix) else 0.0,
        },
        "spark": spark,
        "triggers": triggers,
    }


def build_snapshot_with_fallback() -> dict:
    """Try live, fall back to seed with `source: 'degraded'` on any error."""
    if os.getenv("SPYPROPHET_FORCE_SEED") == "1":
        return seed_snapshot.build()
    try:
        return build_live_snapshot()
    except Exception as exc:  # pragma: no cover - boundary catch
        seed = seed_snapshot.build()
        seed["source"] = "degraded"
        seed["error"] = str(exc)[:200]
        return seed
