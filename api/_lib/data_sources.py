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
from . import tastytrade


# ---------------------------------------------------------------------------
# Quote helpers
# ---------------------------------------------------------------------------

@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_spy_hourly(period: str = "60d") -> pd.DataFrame:
    """Hourly SPY bars from Yahoo, normalized + indexed in CT.

    Returns an empty frame on any failure; callers handle the empty case.
    The 60d window matches spyprost so available_session_days agrees
    across holiday weeks.
    """
    try:
        import yfinance as yf  # imported lazily
        df = yf.download(
            tickers=pc.SYMBOL, period=period, interval="60m",
            prepost=True, progress=False, auto_adjust=False, actions=False,
        )
    except Exception:
        return pd.DataFrame()
    if df is None or df.empty:
        return pd.DataFrame()
    df = pc.normalize_yfinance_frame(df)
    df = pc.ensure_central_index(df)
    return df


def _get_latest_available_trading_day(df: pd.DataFrame, current_dt: datetime) -> Any:
    if df is None or df.empty:
        return None
    ct = pc.get_central_tz()
    cur = pd.Timestamp(current_dt)
    cur = cur.tz_localize(ct) if cur.tzinfo is None else cur.tz_convert(ct)
    for day in reversed(pc.get_available_trading_days(df)):
        if day <= cur.date():
            return day
    return None


def _get_live_signal_day(df: pd.DataFrame, current_dt: datetime) -> Any:
    latest_day = _get_latest_available_trading_day(df, current_dt)
    if latest_day is None:
        return None
    ct = pc.get_central_tz()
    cur = pd.Timestamp(current_dt)
    cur = cur.tz_localize(ct) if cur.tzinfo is None else cur.tz_convert(ct)
    if latest_day < cur.date():
        return cur.date()
    return latest_day


def _get_prior_trading_day(df: pd.DataFrame, current_dt: datetime) -> Any:
    if df is None or df.empty:
        return None
    ct = pc.get_central_tz()
    cur = pd.Timestamp(current_dt)
    cur = cur.tz_localize(ct) if cur.tzinfo is None else cur.tz_convert(ct)
    for day in reversed(pc.get_available_trading_days(df)):
        if day < cur.date():
            return day
    return None


def _latest_price_for_session(df: pd.DataFrame, session_day: Any) -> float | None:
    if df is None or df.empty or "Close" not in df:
        return None
    rth_df = pc.filter_rth_session(df, session_day)
    if not rth_df.empty and not rth_df["Close"].dropna().empty:
        return float(rth_df["Close"].dropna().iloc[-1])
    day_df = df[df.index.date == session_day].sort_index()
    if not day_df.empty and not day_df["Close"].dropna().empty:
        return float(day_df["Close"].dropna().iloc[-1])
    close_series = df.get("Close", pd.Series(dtype="float64")).dropna()
    return float(close_series.iloc[-1]) if not close_series.empty else None


def _structure_projection_time(now_ct: pd.Timestamp, hour: int = 9, minute: int = 0) -> pd.Timestamp:
    ct = pc.get_central_tz()
    now = now_ct
    if now.tzinfo is None:
        now = now.tz_localize(ct)
    else:
        now = now.tz_convert(ct)
    return pd.Timestamp(now.date(), tz=ct) + pd.Timedelta(hours=hour, minutes=minute)


@pc.ttl_cache(ttl_seconds=30.0, maxsize=8)
def fetch_spy_intraday(period: str = "1d", interval: str = "5m") -> pd.DataFrame:
    try:
        import yfinance as yf
        ticker = yf.Ticker(pc.SYMBOL)
        df = ticker.history(period=period, interval=interval, auto_adjust=False)
    except Exception:
        return pd.DataFrame()
    if df is None or df.empty:
        return pd.DataFrame()
    df = pc.normalize_yfinance_frame(df)
    df = pc.ensure_central_index(df)
    return df


@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_last_close(symbol: str) -> float:
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

    def _bias_contribution(dist: float, price: float, decay_pct: float = 1.2) -> int:
        if not price:
            return 0
        dist_pct = abs(dist) / price * 100
        mag = max(0.0, 100.0 * (1.0 - dist_pct / (decay_pct * 2)))
        sign = -1 if dist > 0 else 1
        return int(round(sign * mag))

    for line in primary_lines:
        v = line.tradable_value_at(current_dt)
        if pd.isna(v):
            continue
        dist = current_price - v
        bps = round((dist / current_price) * 10000) if current_price else 0
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
            "bias": _bias_contribution(dist, current_price),
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
                "bias": _bias_contribution(dist, current_price, decay_pct=1.6),
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
            "bias": _bias_contribution(dist, current_price, decay_pct=1.0),
            "status": "BREACHED" if abs(dist) > 0.30 else "WATCHING",
        })

    return rows


def _bias_label_and_score(state: pc.BiasState, current_price: float) -> tuple[str, int]:
    if state.bias in {"BULLISH", "BEARISH"}:
        sign = 1 if state.bias == "BULLISH" else -1
        smoothed = 100.0 * math.tanh(float(state.strength_score) / 80.0)
        score = int(round(sign * smoothed))
    elif state.bias in {"NEUTRAL", "REGULAR_SESSION"}:
        if not pd.isna(state.ua_value) and not pd.isna(state.ud_value):
            center = (state.ua_value + state.ud_value) / 2
            half_width = max(0.01, abs(state.ua_value - state.ud_value) / 2)
        else:
            center = current_price
            half_width = 1.0
        delta_norm = (current_price - center) / half_width
        score = int(round(100.0 * math.tanh(delta_norm)))
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


def _candles_for_chart(rth_today: pd.DataFrame, intraday: pd.DataFrame) -> list[dict]:
    frame = intraday if not intraday.empty else rth_today
    if frame is None or frame.empty:
        return []
    out: list[dict] = []
    for ts, row in frame.iterrows():
        try:
            out.append({
                "t": pd.Timestamp(ts).isoformat(),
                "o": round(float(row["Open"]), 2),
                "h": round(float(row["High"]), 2),
                "l": round(float(row["Low"]), 2),
                "c": round(float(row["Close"]), 2),
            })
        except Exception:
            continue
    return out[-90:]


def _chart_lines_from_primary(
    primary_lines: list[pc.DynamicLine],
    current_dt: datetime,
    rth_today: pd.DataFrame,
) -> list[dict]:
    lines: list[dict] = []
    label_for_role = {
        "supply": "4H Supply",
        "pivot_low": "Pivot Low",
        "open": "Open",
        "trigger": "Trigger",
    }
    by_name = {l.name: l for l in primary_lines}

    def add(role: str, value: float, color: str, dash: bool = False, armed: bool = False):
        if value is None or pd.isna(value):
            return
        lines.append({
            "label": label_for_role[role],
            "value": round(float(value), 2),
            "color": color,
            "dash": dash,
            "armed": armed,
        })

    ua = by_name.get("UA")
    la = by_name.get("LA")
    if ua is not None:
        add("supply", ua.tradable_value_at(current_dt), "var(--red)")
    if la is not None:
        add("pivot_low", la.tradable_value_at(current_dt), "var(--blue)")
    if rth_today is not None and not rth_today.empty:
        add("open", float(rth_today.iloc[0]["Open"]), "var(--text-secondary)", dash=True)
    closest = pc.get_closest_primary_line(primary_lines, current_dt, float(rth_today.iloc[-1]["Close"]) if not rth_today.empty else 0.0)
    if closest is not None:
        add("trigger", closest.tradable_value_at(current_dt), "var(--amber)", armed=True)
    return lines


def _signals_for_tape(signals: list[pc.TradeSignal], current_price: float) -> list[dict]:
    """Convert prophet_core signals into rows the Signal Tape and Signal
    Log surfaces consume. Most recent first; outcome column is live P&L
    for confirmed signals or null while pending."""
    rows: list[dict] = []
    for s in sorted(signals, key=lambda x: pd.Timestamp(x.rejection_time), reverse=True)[:20]:
        try:
            quality = pc.score_signal_quality(s)
        except Exception:
            continue
        outcome: float | None = None
        if s.status == "CONFIRMED" and not pd.isna(s.entry_price) and s.entry_price:
            if s.signal_type == "CALL":
                outcome = (current_price - float(s.entry_price)) / float(s.entry_price) * 100
            else:
                outcome = (float(s.entry_price) - current_price) / float(s.entry_price) * 100
            outcome = round(outcome, 2)
        ts = pd.Timestamp(s.rejection_time)
        try:
            ct_ts = ts.tz_convert(pc.get_central_tz()) if ts.tzinfo else ts.tz_localize(pc.get_central_tz())
            ts_str = ct_ts.strftime("%H:%M:%S")
        except Exception:
            ts_str = str(ts)
        rows.append({
            "id": s.signal_id,
            "type": "REJECTION",
            "line": pc.compact_line_name(s.line_name).upper(),
            "ts": ts_str,
            "score": round(quality.score / 10.0, 1),
            "grade": quality.grade,
            "dir": "up" if s.signal_type == "CALL" else "down",
            "status": s.status,
            "outcome": outcome,
            "entry": round(float(s.entry_price), 2) if not pd.isna(s.entry_price) else None,
            "stop": round(float(s.stop_price), 2) if not pd.isna(s.stop_price) else None,
            "target": round(float(s.target_price), 2) if not pd.isna(s.target_price) else None,
            "rr": round(float(s.rr_ratio), 2) if not pd.isna(s.rr_ratio) else None,
        })
    return rows


def _bias_note(state: pc.BiasState, vix: float) -> str:
    parts: list[str] = []
    if not pd.isna(vix):
        parts.append("BACKWARDATION" if vix >= 18 else "CONTANGO")
    if state.primary_line:
        parts.append(f"{pc.compact_line_name(state.primary_line).upper()} INTACT")
    parts.append("DEALER GAMMA " + ("LONG" if state.bias == "BULLISH" else "SHORT" if state.bias == "BEARISH" else "FLAT"))
    return " · ".join(parts)


def build_live_snapshot() -> dict:
    df = fetch_spy_hourly("60d")
    if df.empty:
        raise RuntimeError("yfinance returned no SPY bars")

    days = pc.get_available_trading_days(df)
    if not days:
        raise RuntimeError("no trading days in SPY frame")

    ct = pc.get_central_tz()
    now_ct = pd.Timestamp.now(tz=ct)

    signal_day = _get_live_signal_day(df, now_ct.to_pydatetime())
    if signal_day is None:
        raise RuntimeError("could not resolve signal day")
    prior_day = _get_prior_trading_day(df, pd.Timestamp(signal_day).to_pydatetime())

    rth_today = pc.filter_rth_session(df, signal_day)
    rth_yesterday = pc.filter_rth_session(df, prior_day) if prior_day else pd.DataFrame()

    structure_frame = rth_yesterday if not rth_yesterday.empty else rth_today
    high_pivot = pc.find_high_pivot(structure_frame)
    low_pivot = pc.find_low_pivot(structure_frame)
    slope = pc.get_structure_calibration()
    primary_lines = pc.build_primary_lines(high_pivot, low_pivot, slope)
    secondary_pivots = pc.find_secondary_pivots(structure_frame)
    secondary_lines = pc.build_secondary_lines(secondary_pivots, slope)

    projection_time = _structure_projection_time(now_ct).to_pydatetime()

    current_price = _latest_price_for_session(df, signal_day)
    if current_price is None:
        current_price = float(df["Close"].dropna().iloc[-1])

    bias_state = pc.determine_preopen_bias(primary_lines, current_price, now_ct.to_pydatetime())

    if not rth_today.empty:
        day_open = float(rth_today.iloc[0]["Open"])
        day_high = float(rth_today["High"].max())
        day_low = float(rth_today["Low"].min())
    else:
        latest_session = df[df.index.date == signal_day].sort_index()
        if latest_session.empty:
            latest_session = df.tail(1)
        day_open = float(latest_session.iloc[0]["Open"]) if not latest_session.empty else current_price
        day_high = float(latest_session["High"].max()) if not latest_session.empty else current_price
        day_low = float(latest_session["Low"].min()) if not latest_session.empty else current_price
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

    triggers = _triggers_from_lines(primary_lines, projection_time, current_price, rth_today, rth_yesterday)

    raw_signals = pc.detect_rejection_signals(rth_today, primary_lines, secondary_lines) if not rth_today.empty else []
    signals = _signals_for_tape(raw_signals, current_price)

    intraday = fetch_spy_intraday("1d", "5m")
    candles = _candles_for_chart(rth_today, intraday)
    chart_lines = _chart_lines_from_primary(primary_lines, projection_time, rth_today)

    options = tastytrade.fetch_options_snapshot(current_price)

    return {
        "asOf": now_ct.isoformat(),
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
        "candles": candles,
        "chartLines": chart_lines,
        "options": options,
        "signals": signals,
    }


def build_snapshot_with_fallback() -> dict:
    if os.getenv("SPYPROPHET_FORCE_SEED") == "1":
        return seed_snapshot.build()
    try:
        return build_live_snapshot()
    except Exception as exc:
        seed = seed_snapshot.build()
        seed["source"] = "degraded"
        seed["error"] = str(exc)[:200]
        return seed
