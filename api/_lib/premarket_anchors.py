"""Premarket-anchor entry model.

Replaces the UA/UD primary path. The new entry-line system anchors three
parallel descending lines on a qualifying bearish candle from the signal
day's premarket session. Triggers fire during RTH on touch+close patterns
at any active line.

Spec:
  - Anchor candidate: bearish hourly candle in 3:00-7:00 CT whose LOW <
    immediately-prior candle's LOW AND whose immediately-following candle
    closes green.
  - Primary anchor: candidate with the lowest LOW in 3:00-6:00 CT.
  - Anchor 2: 7:00 CT candle, only if it qualifies AND its low < primary.low.
  - Secondaries: every other bearish candle in 3:00-6:00 CT (whether or
    not it qualifies); shown as backup entry candidates.
  - Lines per anchor: Upper (+3.4 SPY pts), Main (anchor.low),
    Lower (-3.4), all descending at the engine's calibrated slope. Slope
    accumulation starts at the bar AFTER the anchor (anchor.timestamp + 1h).
  - Buy trigger: red candle wicks down to a line, closes above by 0 < d <= 1.7.
  - Sell trigger: green candle wicks up to a line, closes below by 0 < d <= 1.7.
  - Triggers fire on ANY RTH bar; the next bar is the expected entry.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

import pandas as pd

from . import prophet_core as pc


ANCHOR_BAND_OFFSET = 3.4              # SPY pts above/below the anchor low
ANCHOR_TRIGGER_MAX_DISTANCE = 1.7     # SPY pts; close must be within this of line
PREMARKET_ANCHOR_PRIMARY_HOURS = (3, 4, 5, 6)   # CT hours eligible for primary
PREMARKET_ANCHOR_EXTENDED_HOUR = 7              # CT hour eligible for Anchor 2 only


@dataclass(frozen=True)
class PremarketAnchor:
    """A bearish premarket candle that anchors a set of descending lines."""
    role: str                # "PRIMARY", "ANCHOR_2", or "SECONDARY"
    timestamp: pd.Timestamp
    low: float
    open: float
    high: float
    close: float
    is_qualified: bool
    next_bar_color: Optional[str]


@dataclass(frozen=True)
class AnchorTrigger:
    """A live trigger candle on an anchor line during RTH."""
    trigger_id: str
    direction: str           # "BUY" or "SELL"
    line_name: str
    line_value: float
    candle_time: pd.Timestamp
    candle_color: str        # "red" / "green"
    candle_close: float
    distance_to_line: float
    expected_entry_time: Optional[pd.Timestamp]


def _candle_is_bearish(row: pd.Series) -> bool:
    try:
        return float(row["Close"]) < float(row["Open"])
    except Exception:
        return False


def _candle_is_bullish(row: pd.Series) -> bool:
    try:
        return float(row["Close"]) > float(row["Open"])
    except Exception:
        return False


def _make_anchor(
    role: str, ts: pd.Timestamp, row: pd.Series,
    is_qualified: bool, next_color: Optional[str],
) -> PremarketAnchor:
    return PremarketAnchor(
        role=role,
        timestamp=ts,
        low=float(row["Low"]),
        open=float(row["Open"]),
        high=float(row["High"]),
        close=float(row["Close"]),
        is_qualified=is_qualified,
        next_bar_color=next_color,
    )


def find_premarket_anchors(df: pd.DataFrame, signal_day) -> dict:
    """Identify primary, anchor 2, and secondary anchors for the signal day.

    Returns:
        {"primary": PremarketAnchor or None,
         "anchor2": PremarketAnchor or None,
         "secondaries": list[PremarketAnchor]}
    """
    empty = {"primary": None, "anchor2": None, "secondaries": []}
    if df is None or df.empty:
        return empty

    ct = pc.get_central_tz()
    if isinstance(signal_day, pd.Timestamp):
        day_ts = signal_day.tz_convert(ct) if signal_day.tzinfo else signal_day.tz_localize(ct)
        day_date = day_ts.date()
    else:
        day_date = signal_day

    day_start = pd.Timestamp(day_date, tz=ct)
    ctx_start = day_start.replace(hour=2)
    ctx_end = day_start.replace(hour=9)
    ctx = df[(df.index >= ctx_start) & (df.index < ctx_end)].sort_index()
    if ctx.empty:
        return empty

    qualified: list = []
    bearish_3_to_6: list = []

    for i in range(len(ctx)):
        ts = ctx.index[i]
        hour = ts.hour
        if hour < 3 or hour > PREMARKET_ANCHOR_EXTENDED_HOUR:
            continue
        row = ctx.iloc[i]
        if not _candle_is_bearish(row):
            continue
        if hour in PREMARKET_ANCHOR_PRIMARY_HOURS:
            bearish_3_to_6.append((ts, row))
        if i == 0 or i + 1 >= len(ctx):
            continue
        prior_low = float(ctx.iloc[i - 1]["Low"])
        if float(row["Low"]) >= prior_low:
            continue
        next_row = ctx.iloc[i + 1]
        next_color = pc.candle_color(next_row)
        if not _candle_is_bullish(next_row):
            continue
        qualified.append((ts, row, next_color))

    primary = None
    primary_pool = [(ts, row, nc) for ts, row, nc in qualified if ts.hour in PREMARKET_ANCHOR_PRIMARY_HOURS]
    if primary_pool:
        primary_ts, primary_row, primary_next = min(primary_pool, key=lambda c: float(c[1]["Low"]))
        primary = _make_anchor("PRIMARY", primary_ts, primary_row, True, primary_next)

    anchor2 = None
    if primary is not None:
        for ts, row, nc in qualified:
            if ts.hour == PREMARKET_ANCHOR_EXTENDED_HOUR and float(row["Low"]) < primary.low:
                anchor2 = _make_anchor("ANCHOR_2", ts, row, True, nc)
                break

    qualified_ts = {ts for ts, _, _ in qualified}
    secondaries: list = []
    for ts, row in bearish_3_to_6:
        if primary is not None and ts == primary.timestamp:
            continue
        is_q = ts in qualified_ts
        try:
            i = ctx.index.get_loc(ts)
            next_color = pc.candle_color(ctx.iloc[i + 1]) if i + 1 < len(ctx) else None
        except Exception:
            next_color = None
        secondaries.append(_make_anchor("SECONDARY", ts, row, is_q, next_color))

    return {"primary": primary, "anchor2": anchor2, "secondaries": secondaries}


def build_anchor_lines(anchor, slope: float):
    """Three parallel descending lines from a single anchor: Upper/Main/Lower.

    Slope accumulation starts at the END of the anchor candle (i.e., the
    open of the next bar). For an hourly anchor at 5:00 CT this means:
      5:00 anchor open -> line value = anchor.low (raw)
      6:00 next bar    -> 0 hours of slope have elapsed; line = anchor.low
      7:00             -> 1 hour of slope; line = anchor.low - slope
      9:00             -> 3 hours of slope; line = anchor.low - 3*slope
    Implemented by shifting the line's anchor_time forward by one hour so
    DynamicLine.hours_since() returns 0 at the next-bar timestamp.
    """
    if anchor is None:
        return []
    s = abs(float(slope))
    base = f"ANC_{anchor.role}_{anchor.timestamp.strftime('%H%M')}"
    is_primary = anchor.role in ("PRIMARY", "ANCHOR_2")
    src = f"premarket_anchor_{anchor.role.lower()}"
    line_anchor_time = anchor.timestamp + pd.Timedelta(hours=1)
    return [
        pc.DynamicLine(
            name=f"{base}_UPPER",
            anchor_price=anchor.low + ANCHOR_BAND_OFFSET,
            anchor_time=line_anchor_time,
            slope_per_hour=s,
            direction="descending",
            zone_type="CALL_ZONE",
            source=src,
            is_primary=is_primary,
            description=f"Anchor {anchor.role} Upper (+{ANCHOR_BAND_OFFSET})",
        ),
        pc.DynamicLine(
            name=f"{base}_MAIN",
            anchor_price=anchor.low,
            anchor_time=line_anchor_time,
            slope_per_hour=s,
            direction="descending",
            zone_type="MAIN",
            source=src,
            is_primary=is_primary,
            description=f"Anchor {anchor.role} Main",
        ),
        pc.DynamicLine(
            name=f"{base}_LOWER",
            anchor_price=anchor.low - ANCHOR_BAND_OFFSET,
            anchor_time=line_anchor_time,
            slope_per_hour=s,
            direction="descending",
            zone_type="PUT_ZONE",
            source=src,
            is_primary=is_primary,
            description=f"Anchor {anchor.role} Lower (-{ANCHOR_BAND_OFFSET})",
        ),
    ]


def build_all_anchor_lines(anchors_payload: dict, slope: float):
    """Concatenate Upper/Main/Lower lines from every anchor in the payload."""
    out: list = []
    out.extend(build_anchor_lines(anchors_payload.get("primary"), slope))
    out.extend(build_anchor_lines(anchors_payload.get("anchor2"), slope))
    for sec in anchors_payload.get("secondaries", []):
        out.extend(build_anchor_lines(sec, slope))
    return out


def is_anchor_buy_trigger(candle_row: pd.Series, line, candle_time: pd.Timestamp) -> bool:
    """Red candle wicks down to the line and closes above, within trigger band."""
    try:
        open_ = float(candle_row["Open"])
        close_ = float(candle_row["Close"])
        low_ = float(candle_row["Low"])
    except Exception:
        return False
    if close_ >= open_:
        return False
    line_val = line.tradable_value_at(candle_time)
    if pd.isna(line_val):
        return False
    if low_ > line_val:
        return False
    if close_ <= line_val:
        return False
    if (close_ - line_val) > ANCHOR_TRIGGER_MAX_DISTANCE:
        return False
    return True


def is_anchor_sell_trigger(candle_row: pd.Series, line, candle_time: pd.Timestamp) -> bool:
    """Green candle wicks up to the line and closes below, within trigger band."""
    try:
        open_ = float(candle_row["Open"])
        close_ = float(candle_row["Close"])
        high_ = float(candle_row["High"])
    except Exception:
        return False
    if close_ <= open_:
        return False
    line_val = line.tradable_value_at(candle_time)
    if pd.isna(line_val):
        return False
    if high_ < line_val:
        return False
    if close_ >= line_val:
        return False
    if (line_val - close_) > ANCHOR_TRIGGER_MAX_DISTANCE:
        return False
    return True


def detect_anchor_triggers(rth_candles: pd.DataFrame, anchor_lines: list):
    """Walk RTH candles and emit AnchorTrigger events for every line touch."""
    triggers: list = []
    if rth_candles is None or rth_candles.empty or not anchor_lines:
        return triggers
    df = rth_candles.sort_index()
    for i in range(len(df)):
        ts = df.index[i]
        row = df.iloc[i]
        next_ts = df.index[i + 1] if (i + 1) < len(df) else None
        for line in anchor_lines:
            line_val = line.tradable_value_at(ts)
            if pd.isna(line_val):
                continue
            if is_anchor_buy_trigger(row, line, ts):
                close_ = float(row["Close"])
                triggers.append(AnchorTrigger(
                    trigger_id=f"BUY:{line.name}:{pd.Timestamp(ts).isoformat()}",
                    direction="BUY",
                    line_name=line.name,
                    line_value=float(line_val),
                    candle_time=ts,
                    candle_color="red",
                    candle_close=close_,
                    distance_to_line=close_ - float(line_val),
                    expected_entry_time=next_ts,
                ))
            elif is_anchor_sell_trigger(row, line, ts):
                close_ = float(row["Close"])
                triggers.append(AnchorTrigger(
                    trigger_id=f"SELL:{line.name}:{pd.Timestamp(ts).isoformat()}",
                    direction="SELL",
                    line_name=line.name,
                    line_value=float(line_val),
                    candle_time=ts,
                    candle_color="green",
                    candle_close=close_,
                    distance_to_line=float(line_val) - close_,
                    expected_entry_time=next_ts,
                ))
    return triggers


def anchor_open_zone(price_at_9am: float, primary_lines: list, dt_at_9am: datetime) -> str:
    """Preliminary read at 9 AM RTH open: which zone the price falls in.

    Returns: "ABOVE_UPPER" | "UPPER_TO_MAIN" | "MAIN_TO_LOWER" | "BELOW_LOWER" | "UNKNOWN"
    """
    if not primary_lines or pd.isna(price_at_9am):
        return "UNKNOWN"
    by_zone = {l.zone_type: l for l in primary_lines if l.is_primary and l.source.startswith("premarket_anchor_")}
    upper = by_zone.get("CALL_ZONE")
    main = by_zone.get("MAIN")
    lower = by_zone.get("PUT_ZONE")
    if not (upper and main and lower):
        return "UNKNOWN"
    u = upper.tradable_value_at(dt_at_9am)
    m = main.tradable_value_at(dt_at_9am)
    lo = lower.tradable_value_at(dt_at_9am)
    if pd.isna(u) or pd.isna(m) or pd.isna(lo):
        return "UNKNOWN"
    if price_at_9am > u:
        return "ABOVE_UPPER"
    if price_at_9am >= m:
        return "UPPER_TO_MAIN"
    if price_at_9am >= lo:
        return "MAIN_TO_LOWER"
    return "BELOW_LOWER"


__all__ = [
    "ANCHOR_BAND_OFFSET", "ANCHOR_TRIGGER_MAX_DISTANCE",
    "PREMARKET_ANCHOR_PRIMARY_HOURS", "PREMARKET_ANCHOR_EXTENDED_HOUR",
    "PremarketAnchor", "AnchorTrigger",
    "find_premarket_anchors", "build_anchor_lines", "build_all_anchor_lines",
    "is_anchor_buy_trigger", "is_anchor_sell_trigger",
    "detect_anchor_triggers", "anchor_open_zone",
]
