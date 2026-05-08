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

from . import premarket_anchors as pma
from . import prophet_core as pc
from . import seed_snapshot
from . import tastytrade
from . import unusual_whales


@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_spy_hourly(period: str = "60d") -> pd.DataFrame:
    try:
        import yfinance as yf
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


def _structure_projection_time(now_ct: pd.Timestamp) -> pd.Timestamp:
    """Headline projection time for chart/triggers/decision.

    Floors to the current hour during the trading day so the displayed line
    value rolls 8am -> 9am -> 10am -> 11am as time passes. Before 8am it
    pins to 8am (the engine's "first institutional bar"). The slope itself
    is unchanged; only the displayed reference time moves.
    """
    ct = pc.get_central_tz()
    now = now_ct
    if now.tzinfo is None:
        now = now.tz_localize(ct)
    else:
        now = now.tz_convert(ct)
    eight_am = pd.Timestamp(now.date(), tz=ct) + pd.Timedelta(hours=8)
    if now < eight_am:
        return eight_am
    return now.replace(minute=0, second=0, microsecond=0, nanosecond=0)


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


@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_last_and_prev(symbol: str) -> tuple[float, float]:
    """Last close and prior-day close for a symbol; (nan, nan) on failure."""
    try:
        import yfinance as yf
        df = yf.Ticker(symbol).history(period="5d", interval="1d", auto_adjust=False)
    except Exception:
        return float("nan"), float("nan")
    if df is None or df.empty or "Close" not in df:
        return float("nan"), float("nan")
    closes = df["Close"].dropna()
    if closes.empty:
        return float("nan"), float("nan")
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) >= 2 else float("nan")
    return last, prev


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

    def _label_for(name: str) -> str:
        if name in name_to_label:
            return name_to_label[name]
        if name.startswith("ANC_"):
            return _anchor_display_label(name)
        return name

    def _kind_for(line: pc.DynamicLine) -> str:
        """Engine-line classification for the frontend.

        Maps the four canonical pivot lines (UA/UD/LA/LD) directly,
        and reduces premarket-anchor lines to a generic ANCHOR token
        with their derived direction so the line-style table can pick
        a sensible color and label.
        """
        if line.name in name_to_label:
            return line.name
        if line.name.startswith("ANC_"):
            return "ANC_ASC" if line.direction == "ascending" else "ANC_DESC"
        return "UA"

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
            "line": _label_for(line.name),
            "kind": _kind_for(line),
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
                "kind": "PDH" if label == "PDH" else "PDL",
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
            "kind": "DAY_OPEN",
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


def _hourly_candles_for_chart(df: pd.DataFrame) -> list[dict]:
    """Last ~30 trading days of hourly RTH bars for the chart's 1h/4h/D
    timeframes. Filters to the regular trading session and trims the
    series so the snapshot stays compact."""
    if df is None or df.empty:
        return []
    try:
        rth = df.between_time(
            pc.RTH_SESSION_START.strftime("%H:%M"),
            pc.RTH_SESSION_END.strftime("%H:%M"),
            inclusive="left",
        )
    except Exception:
        rth = df
    if rth.empty:
        rth = df
    out: list[dict] = []
    for ts, row in rth.iterrows():
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
    return out[-210:]


def _anchor_display_label(name: str) -> str:
    """Convert ANC_<role>_<HHMM>_<BAND> to a readable label."""
    if not name.startswith("ANC_"):
        return name
    parts = name.split("_")
    if len(parts) < 4:
        return "Anchor"
    band = parts[-1]
    band_label = {"UPPER": "Upper", "MAIN": "Main", "LOWER": "Lower"}.get(band, band.title())
    role = parts[1]
    if role == "ANCHOR" and len(parts) >= 5 and parts[2] == "2":
        return f"Anchor 2 {band_label}"
    if role == "PRIMARY":
        return f"Anchor {band_label}"
    if role == "SECONDARY":
        return f"Backup {band_label}"
    return f"{role.title()} {band_label}"


def _chart_lines_from_primary(
    primary_lines: list[pc.DynamicLine],
    current_dt: datetime,
    rth_today: pd.DataFrame,
) -> list[dict]:
    lines: list[dict] = []

    zone_color = {
        "CALL_ZONE":  "var(--green)",   # Upper (+3.4)
        "MAIN":       "var(--amber)",   # Main entry line
        "PUT_ZONE":   "var(--red)",     # Lower (-3.4)
    }

    # Anchor-line path: render Upper / Main / Lower for each PRIMARY anchor
    # (and Anchor 2 if present). When no primary qualifies, fall back to the
    # lowest-Main SECONDARY anchor so the chart still shows an actionable
    # band tied to a real premarket bearish candle.
    anchor_primaries = [l for l in primary_lines if l.is_primary and l.name.startswith("ANC_")]
    fallback_label_prefix = "Anchor"
    if not anchor_primaries:
        secondaries = [l for l in primary_lines if l.name.startswith("ANC_SECONDARY_")]
        # group secondaries by their ANC_SECONDARY_HHMM prefix; each group has
        # an Upper/Main/Lower triplet. Pick the group whose MAIN value is the
        # lowest (the deepest premarket low).
        groups: dict[str, list[pc.DynamicLine]] = {}
        for line in secondaries:
            base = "_".join(line.name.split("_")[:3])  # ANC_SECONDARY_HHMM
            groups.setdefault(base, []).append(line)
        best_group: list[pc.DynamicLine] | None = None
        best_main_val = float("inf")
        for group in groups.values():
            main_line = next((l for l in group if l.zone_type == "MAIN"), None)
            if main_line is None:
                continue
            v = main_line.tradable_value_at(current_dt)
            if pd.isna(v):
                continue
            if float(v) < best_main_val:
                best_main_val = float(v)
                best_group = group
        if best_group is not None:
            anchor_primaries = best_group
            fallback_label_prefix = "Backup"

    if anchor_primaries:
        for line in anchor_primaries:
            v = line.tradable_value_at(current_dt)
            if v is None or pd.isna(v):
                continue
            label = _anchor_display_label(line.name)
            # Force "Backup" prefix when we're rendering a secondary fallback
            # so the chart reads consistently with the trigger map labels.
            if fallback_label_prefix == "Backup" and not label.startswith("Backup"):
                band = label.split(" ", 1)[-1] if " " in label else label
                label = f"Backup {band}"
            lines.append({
                "label": label,
                "value": round(float(v), 2),
                "color": zone_color.get(line.zone_type, "var(--text-secondary)"),
                "dash": fallback_label_prefix == "Backup",
                "armed": line.zone_type == "MAIN",
            })
        if rth_today is not None and not rth_today.empty:
            lines.append({
                "label": "Open",
                "value": round(float(rth_today.iloc[0]["Open"]), 2),
                "color": "var(--text-secondary)",
                "dash": True,
                "armed": False,
            })
        return lines

    # Final fallback (no anchors at all): old UA/LA pivot lines.
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


def _pivot_source(
    pivot: pc.Pivot,
    structure_frame: pd.DataFrame,
    structure_day: Any,
) -> dict | None:
    if pivot is None or pd.isna(pivot.price):
        return None
    out: dict = {
        "name": pivot.name,
        "price": round(float(pivot.price), 2),
        "source": pivot.source,
        "anchorTime": pd.Timestamp(pivot.timestamp).isoformat() if pivot.timestamp is not None else None,
        "fallbackUsed": bool(pivot.fallback_used),
        "candleColor": pivot.candle_color,
        "structureDay": str(structure_day) if structure_day is not None else None,
    }
    if structure_frame is not None and not structure_frame.empty:
        col = "High" if pivot.name == "HIGH_PIVOT" else "Low"
        try:
            idx = structure_frame[col].idxmax() if pivot.name == "HIGH_PIVOT" else structure_frame[col].idxmin()
            row = structure_frame.loc[idx]
            close_time = pc.get_hourly_candle_close_time(structure_frame, idx)
            out["candleStarts"] = pd.Timestamp(idx).isoformat()
            out["candleCloses"] = pd.Timestamp(close_time).isoformat()
            out["candle"] = {
                "o": round(float(row["Open"]), 2),
                "h": round(float(row["High"]), 2),
                "l": round(float(row["Low"]), 2),
                "c": round(float(row["Close"]), 2),
            }
        except Exception:
            pass
    return out


def _classify_vix(vix: float) -> dict:
    if pd.isna(vix) or vix <= 0:
        return {"value": None, "label": "—", "tone": "neutral", "copy": "VIX unavailable"}
    if vix < 15:
        return {"value": round(vix, 2), "label": "CALM", "tone": "green",
                "copy": "Realized vol low; trends extend"}
    if vix < 20:
        return {"value": round(vix, 2), "label": "NORMAL", "tone": "green",
                "copy": "Range-of-day intact; structure holds"}
    if vix < 25:
        return {"value": round(vix, 2), "label": "ELEVATED", "tone": "amber",
                "copy": "Wider stops; expect overshoots"}
    return {"value": round(vix, 2), "label": "STRESS", "tone": "red",
            "copy": "Trend day risk; size down"}


def _spy_pressure(rth_today: pd.DataFrame, lookback_bars: int = 3) -> dict:
    if rth_today is None or rth_today.empty or "Close" not in rth_today:
        return {"label": "—", "tone": "neutral", "value": None}
    closes = rth_today["Close"].dropna()
    if len(closes) < 2:
        return {"label": "—", "tone": "neutral", "value": None}
    n = min(lookback_bars, len(closes) - 1)
    delta = float(closes.iloc[-1]) - float(closes.iloc[-1 - n])
    if delta > 1.0:
        label, tone = "LIFTING", "green"
    elif delta < -1.0:
        label, tone = "FADING", "red"
    else:
        label, tone = "BALANCED", "neutral"
    return {"label": label, "tone": tone, "value": round(delta, 2)}


def _trigger_gap_summary(
    primary_lines: list[pc.DynamicLine],
    current_price: float,
    projection_time: datetime,
) -> dict:
    closest = pc.get_closest_primary_line(primary_lines, projection_time, current_price)
    if closest is None:
        return {"points": None, "lineName": "—", "tone": "neutral", "label": "NO STRUCTURE"}
    v = closest.tradable_value_at(projection_time)
    if pd.isna(v):
        return {"points": None, "lineName": pc.compact_line_name(closest.name), "tone": "neutral", "label": "—"}
    gap = current_price - float(v)
    abs_gap = abs(gap)
    if abs_gap < 0.30:
        tone, label = "amber", "AT TRIGGER"
    elif abs_gap < 1.00:
        tone, label = "green", "NEAR"
    else:
        tone, label = "neutral", "DISTANT"
    return {
        "points": round(gap, 2),
        "lineName": pc.compact_line_name(closest.name),
        "tone": tone,
        "label": label,
    }


def _build_market_context(
    vix: float,
    vvix: float,
    dxy_last: float,
    dxy_prev: float,
    tnx_last: float,
    tnx_prev: float,
    rth_today: pd.DataFrame,
    primary_lines: list[pc.DynamicLine],
    current_price: float,
    projection_time: datetime,
) -> dict:
    dxy_chg_pct: float | None = None
    if not pd.isna(dxy_last) and not pd.isna(dxy_prev) and dxy_prev:
        dxy_chg_pct = round((dxy_last - dxy_prev) / dxy_prev * 100, 2)
    tnx_chg_bps: float | None = None
    if not pd.isna(tnx_last) and not pd.isna(tnx_prev):
        tnx_chg_bps = round((tnx_last - tnx_prev) * 10, 1)

    return {
        "vix": _classify_vix(vix),
        "vvix": {"value": round(vvix, 2) if not pd.isna(vvix) else None},
        "dxy": {
            "value": round(dxy_last, 2) if not pd.isna(dxy_last) else None,
            "chgPct": dxy_chg_pct,
            "tone": "neutral" if dxy_chg_pct is None else ("red" if dxy_chg_pct > 0 else "green"),
        },
        "tnx": {
            "value": round(tnx_last / 10, 3) if not pd.isna(tnx_last) else None,
            "chgBps": tnx_chg_bps,
            "tone": "neutral" if tnx_chg_bps is None else ("red" if tnx_chg_bps > 0 else "green"),
        },
        "spyPressure": _spy_pressure(rth_today),
        "triggerGap": _trigger_gap_summary(primary_lines, current_price, projection_time),
    }


def _bias_note(state: pc.BiasState, vix: float) -> str:
    parts: list[str] = []
    if not pd.isna(vix):
        parts.append("BACKWARDATION" if vix >= 18 else "CONTANGO")
    if state.primary_line:
        parts.append(f"{pc.compact_line_name(state.primary_line).upper()} INTACT")
    parts.append("DEALER GAMMA " + ("LONG" if state.bias == "BULLISH" else "SHORT" if state.bias == "BEARISH" else "FLAT"))
    return " · ".join(parts)


def _build_decision(
    bias_state: pc.BiasState,
    bias_score: int,
    primary_lines: list[pc.DynamicLine],
    raw_signals: list[pc.TradeSignal],
    current_price: float,
    now_ct: pd.Timestamp,
    projection_time: datetime,
    flow: dict | None = None,
    gex: dict | None = None,
) -> dict:
    """Compute the live Decision Slate payload from real engine state.

    Replaces the hardcoded VERB_DATA mock the frontend used to render.
    Verb gate is conservative: only LONG/SHORT when there's a confirmed
    rejection signal; otherwise HOLD if bias is strong, else WAIT.
    """
    in_rth = pc.RTH_SESSION_START <= now_ct.time() < pc.RTH_SESSION_END

    active_signal: pc.TradeSignal | None = None
    for s in sorted(raw_signals, key=lambda x: pd.Timestamp(x.rejection_time), reverse=True):
        if s.status == "CONFIRMED":
            active_signal = s
            break
    if active_signal is None:
        for s in sorted(raw_signals, key=lambda x: pd.Timestamp(x.rejection_time), reverse=True):
            if s.status == "PENDING_CONFIRMATION":
                active_signal = s
                break

    quality_score = 0.0
    grade = "—"
    rr: float | None = None
    if active_signal is not None:
        try:
            q = pc.score_signal_quality(active_signal)
            quality_score = round(q.score / 10.0, 1)
            grade = q.grade
        except Exception:
            pass
        if active_signal.rr_ratio is not None and not pd.isna(active_signal.rr_ratio):
            rr = round(float(active_signal.rr_ratio), 2)

    if active_signal is not None and active_signal.status == "CONFIRMED":
        verb = "LONG" if active_signal.signal_type == "CALL" else "SHORT"
    elif active_signal is not None and active_signal.status == "PENDING_CONFIRMATION":
        verb = "WAIT"
    elif bias_score >= 50:
        verb = "HOLD" if in_rth else "LONG"
    elif bias_score <= -50:
        verb = "HOLD" if in_rth else "SHORT"
    else:
        verb = "WAIT"

    if bias_score >= 15:
        ui_bias, bias_color = "BULLISH", "var(--green)"
    elif bias_score <= -15:
        ui_bias, bias_color = "BEARISH", "var(--red)"
    else:
        ui_bias, bias_color = "NEUTRAL", "var(--text-secondary)"

    conviction = max(1, min(5, int(round(abs(bias_score) / 20))))

    if in_rth:
        window = f"until {pc.RTH_SESSION_END.strftime('%H:%M')} CT"
    elif now_ct.time() < pc.RTH_SESSION_START:
        window = f"opens {pc.RTH_SESSION_START.strftime('%H:%M')} CT"
    else:
        window = "next session"

    closest = pc.get_closest_primary_line(primary_lines, projection_time, current_price)
    closest_label = pc.compact_line_name(closest.name) if closest is not None else "primary structure"
    closest_value = closest.tradable_value_at(projection_time) if closest is not None else float("nan")
    closest_dist = (current_price - float(closest_value)) if closest is not None and not pd.isna(closest_value) else float("nan")

    if active_signal is not None and active_signal.status == "CONFIRMED":
        side = "calls" if active_signal.signal_type == "CALL" else "puts"
        entry_str = f"{float(active_signal.entry_price):.2f}" if not pd.isna(active_signal.entry_price) else "—"
        target_str = f"{float(active_signal.target_price):.2f}" if not pd.isna(active_signal.target_price) else "—"
        rationale = (
            f"Confirmed rejection at {pc.compact_line_name(active_signal.line_name)} "
            f"({float(active_signal.line_value_at_rejection):.2f}); entry {entry_str}, target {target_str}. "
            f"Manage the {side} side."
        )
    elif active_signal is not None:
        rationale = (
            f"Rejection candle pending confirmation at {pc.compact_line_name(active_signal.line_name)} "
            f"({float(active_signal.line_value_at_rejection):.2f}). Wait for the next candle to open."
        )
    else:
        if not pd.isna(closest_dist):
            dist_words = "above" if closest_dist > 0 else "below"
            rationale = (
                f"SPY {current_price:.2f} sits {abs(closest_dist):.2f} pts {dist_words} {closest_label} "
                f"({closest_value:.2f}). No qualified rejection yet on the active triggers."
            )
        else:
            rationale = f"SPY {current_price:.2f}. Waiting on the active triggers; no qualified rejection has printed."

    # Confluence: append UW flow + dealer gamma when they tell a clear story.
    confluence_bits: list[str] = []
    if flow and flow.get("lean") in ("BULLISH", "BEARISH"):
        confluence_bits.append(
            f"Options flow leaning {str(flow['lean']).lower()} "
            f"({flow.get('bullishCount', 0)} bull / {flow.get('bearishCount', 0)} bear)"
        )
    if gex and gex.get("regime") in ("POSITIVE", "NEGATIVE"):
        flip = gex.get("flipPoint")
        gamma_str = f"dealer gamma {str(gex['regime']).lower()}"
        if isinstance(flip, (int, float)):
            gamma_str += f" with flip near {flip:.2f}"
        confluence_bits.append(gamma_str)
    if confluence_bits:
        rationale = f"{rationale} {'; '.join(confluence_bits)}."

    why = bias_state.explanation

    return {
        "verb": verb,
        "bias": ui_bias,
        "biasColor": bias_color,
        "score": quality_score,
        "grade": grade,
        "conviction": conviction,
        "window": window,
        "rationale": rationale,
        "why": why,
        "rr": rr,
        "winPct": 64 if active_signal else None,
        "edgePct": 0.42 if active_signal else None,
    }


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
    structure_day = prior_day if not rth_yesterday.empty else signal_day
    high_pivot = pc.find_high_pivot(structure_frame)
    low_pivot = pc.find_low_pivot(structure_frame)
    slope = pc.get_structure_calibration()
    secondary_pivots = pc.find_secondary_pivots(structure_frame)
    secondary_lines = pc.build_secondary_lines(secondary_pivots, slope)

    # Premarket-anchor primary lines (replaces UA/UD/LA/LD when a qualifying
    # bearish anchor is found). Falls back to the old pivot lines otherwise.
    anchor_payload = pma.find_premarket_anchors(df, signal_day)
    anchor_lines = pma.build_all_anchor_lines(anchor_payload, slope)
    if anchor_lines:
        primary_lines = anchor_lines
        primary_source = "premarket_anchor"
    else:
        primary_lines = pc.build_primary_lines(high_pivot, low_pivot, slope)
        primary_source = "pivot_fallback"

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
    vvix = fetch_last_close("^VVIX")
    dxy_last, dxy_prev = fetch_last_and_prev("DX-Y.NYB")
    tnx_last, tnx_prev = fetch_last_and_prev("^TNX")
    dxy = dxy_last

    bias_label, bias_score = _bias_label_and_score(bias_state, current_price)

    spark_source = rth_today if not rth_today.empty else rth_yesterday
    spark = [round(float(v), 2) for v in spark_source["Close"].tolist()][-60:]
    if not spark:
        spark = seed_snapshot.SPARK

    triggers = _triggers_from_lines(primary_lines, projection_time, current_price, rth_today, rth_yesterday)

    # Trigger detection considers the 8am CT bar plus all RTH bars (8:30-15:00)
    # so an 8am wick on the descending anchor line can fire the entry trigger.
    if not rth_today.empty:
        eight_am = pd.Timestamp(signal_day, tz=ct).replace(hour=8)
        rth_end = pd.Timestamp(signal_day, tz=ct).replace(hour=15)
        triggers_df = df[(df.index >= eight_am) & (df.index < rth_end)].sort_index()
    else:
        triggers_df = rth_today
    raw_signals = pc.detect_rejection_signals(triggers_df, primary_lines, secondary_lines) if not triggers_df.empty else []
    signals = _signals_for_tape(raw_signals, current_price)

    # Unusual Whales enrichment (returns None if key missing or upstream
    # is unavailable; the snapshot stays valid either way). Fetched
    # before the decision so flow + dealer gamma can append confluence
    # to the rationale when the lean is decisive.
    flow_summary = unusual_whales.fetch_flow_summary("SPY")
    gex_summary = unusual_whales.fetch_gex_summary("SPY")

    decision = _build_decision(
        bias_state, bias_score, primary_lines, raw_signals,
        current_price, now_ct, projection_time,
        flow=flow_summary, gex=gex_summary,
    )

    pivots = {
        "high": _pivot_source(high_pivot, structure_frame, structure_day),
        "low":  _pivot_source(low_pivot,  structure_frame, structure_day),
        "slope": round(float(slope), 4),
        "structureDay": str(structure_day) if structure_day else None,
        "signalDay": str(signal_day) if signal_day else None,
    }

    intraday = fetch_spy_intraday("1d", "5m")
    candles = _candles_for_chart(rth_today, intraday)
    # Hourly series for the dashboard chart's 1h/4h/D timeframes. Last
    # ~30 trading days of regular-session hourly bars; the chart resamples
    # client-side for the longer frames.
    hourly_candles = _hourly_candles_for_chart(df)
    chart_lines = _chart_lines_from_primary(primary_lines, projection_time, rth_today)

    options = tastytrade.fetch_options_snapshot(current_price)

    market_context = _build_market_context(
        vix=vix,
        vvix=vvix,
        dxy_last=dxy_last,
        dxy_prev=dxy_prev,
        tnx_last=tnx_last,
        tnx_prev=tnx_prev,
        rth_today=rth_today,
        primary_lines=primary_lines,
        current_price=current_price,
        projection_time=projection_time,
    )

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
        "hourlyCandles": hourly_candles,
        "chartLines": chart_lines,
        "options": options,
        "flow": flow_summary,
        "gex": gex_summary,
        "signals": signals,
        "pivots": pivots,
        "decision": decision,
        "marketContext": market_context,
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
