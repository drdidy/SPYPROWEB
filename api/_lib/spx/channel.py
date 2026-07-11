"""ES structure line construction and projection.

This module implements the geometry that defines the ES session. The primary
Control Map anchors from the prior RTH noon-to-2 PM high pivot when that window
exists, with a deterministic pre-2 PM fallback for shortened sessions. The
dealer-pressure reference uses the prior RTH low pivot as a secondary regime.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Literal, Optional

from .candles import Candle, in_window, range_high_low, range_high_low_close
from .constants import DEFAULT_SLOPE_PER_HOUR
from .time_utils import (
    es_trading_hours_between,
    hours_between,
    overnight_window,
    previous_futures_session_date,
    rth_window,
    sydney_window,
    to_ct,
    tokyo_window,
)

ChannelDirection = Literal["ASCENDING", "DESCENDING", "NONE"]
NoChannelReason = Literal["EXPANSION", "CONTRACTION"]
LineKind = Literal[
    "PREV_RTH_HIGH_ASC",
    "PREV_RTH_HIGH_DESC",
    "PREV_RTH_LOW_ASC",
    "PREV_RTH_LOW_DESC",
    "SWING_HIGH_ASC",
    "SWING_HIGH_DESC",
    "SWING_LOW_ASC",
    "SWING_LOW_DESC",
]


@dataclass(frozen=True)
class Anchor:
    price: float
    time: datetime


@dataclass(frozen=True)
class SessionRange:
    high: float
    low: float
    high_time: datetime
    low_time: datetime


@dataclass(frozen=True)
class Line:
    kind: LineKind
    anchor: Anchor
    slope_per_hour: float


@dataclass(frozen=True)
class Channel:
    direction: ChannelDirection
    reason: str  # human-readable explanation
    no_channel_reason: Optional[NoChannelReason] = None


# ---------------------------------------------------------------------------
# Pivot extraction
# ---------------------------------------------------------------------------


def overnight_anchors(
    candles: list[Candle],
    session_date: date,
    direction: ChannelDirection = "ASCENDING",
) -> tuple[Anchor, Anchor]:
    """Return (high anchor, low anchor) over the overnight window.

    The live ES framework uses the highest close and lowest close before
    the 02:00 CT boundary. The `direction` argument is ignored and kept
    only so older callers do not break while the app migrates away from
    Sydney/Tokyo direction selection.

    Raises ValueError if the window has no candles.
    """
    bars = in_window(candles, overnight_window(session_date))
    res = range_high_low_close(bars)
    if res is None:
        raise ValueError(f"No ES candles in overnight window for {session_date}")
    high, low, t_hi, t_lo = res
    return Anchor(price=high, time=t_hi), Anchor(price=low, time=t_lo)


def sydney_range(candles: list[Candle], session_date: date) -> Optional[SessionRange]:
    bars = in_window(candles, sydney_window(session_date))
    res = range_high_low(bars)
    if res is None:
        return None
    high, low, t_hi, t_lo = res
    return SessionRange(high=high, low=low, high_time=t_hi, low_time=t_lo)


def tokyo_range(candles: list[Candle], session_date: date) -> Optional[SessionRange]:
    bars = in_window(candles, tokyo_window(session_date))
    res = range_high_low(bars)
    if res is None:
        return None
    high, low, t_hi, t_lo = res
    return SessionRange(high=high, low=low, high_time=t_hi, low_time=t_lo)


def prev_rth_anchors(
    candles: list[Candle], session_date: date
) -> Optional[tuple[Anchor, Anchor]]:
    """Previous futures session's control high and dealer-pressure low.

    The high anchor prefers the noon-to-2 PM RTH pivot. If a shortened futures
    session has no bars in that window, it falls back to pre-2 PM bars so the
    next session can still build a valid map.
    """
    prev, bars = _previous_rth_bars(candles, session_date)
    if prev is None:
        return None

    high_bars = _control_high_candidate_bars(bars)
    if not high_bars:
        return None

    high_bar = max(high_bars, key=lambda bar: float(bar.h))
    low_bar = min(bars, key=lambda bar: float(bar.l))
    return (
        Anchor(price=float(high_bar.h), time=to_ct(high_bar.t)),
        Anchor(price=float(low_bar.l), time=to_ct(low_bar.t)),
    )


def _previous_rth_bars(candles: list[Candle], session_date: date) -> tuple[date | None, list[Candle]]:
    cursor = previous_futures_session_date(session_date)
    for _ in range(7):
        bars = in_window(candles, rth_window(cursor))
        if bars:
            return cursor, bars
        cursor = previous_futures_session_date(cursor)
    return None, []


def _control_high_candidate_bars(bars: list[Candle]) -> list[Candle]:
    noon_to_two = [
        bar for bar in bars
        if time(12, 0) <= to_ct(bar.t).time() < time(14, 0)
    ]
    if noon_to_two:
        return noon_to_two
    pre_two = [bar for bar in bars if to_ct(bar.t).time() < time(14, 0)]
    return pre_two or bars


# ---------------------------------------------------------------------------
# Direction
# ---------------------------------------------------------------------------


def determine_channel(
    sydney: Optional[SessionRange], tokyo: Optional[SessionRange]
) -> Channel:
    """Legacy Sydney/Tokyo diagnostic direction, not the active ES framework."""
    if sydney is None or tokyo is None:
        return Channel(
            direction="NONE",
            reason="Asian session data incomplete; cannot resolve a channel.",
        )

    higher_high = tokyo.high > sydney.high
    higher_low = tokyo.low > sydney.low
    lower_high = tokyo.high < sydney.high
    lower_low = tokyo.low < sydney.low

    if higher_high and higher_low:
        return Channel(
            direction="ASCENDING",
            reason=(
                f"Tokyo printed a higher high ({tokyo.high:.2f} vs {sydney.high:.2f}) "
                f"and higher low ({tokyo.low:.2f} vs {sydney.low:.2f}) than Sydney. "
                "Range is rising in the legacy diagnostic read."
            ),
        )
    if lower_high and lower_low:
        return Channel(
            direction="DESCENDING",
            reason=(
                f"Tokyo printed a lower high ({tokyo.high:.2f} vs {sydney.high:.2f}) "
                f"and lower low ({tokyo.low:.2f} vs {sydney.low:.2f}) than Sydney. "
                "Range is falling in the legacy diagnostic read."
            ),
        )

    # Mixed: one side higher, other lower -> expansion or contraction.
    if higher_high and lower_low:
        return Channel(
            direction="NONE",
            reason="Tokyo expanded both ways relative to Sydney. No clean channel today; stand down.",
            no_channel_reason="EXPANSION",
        )
    if lower_high and higher_low:
        return Channel(
            direction="NONE",
            reason="Tokyo contracted inside Sydney's range. No clean channel today; stand down.",
            no_channel_reason="CONTRACTION",
        )

    # Edge case: one side equal. Treat as expansion/contraction.
    return Channel(
        direction="NONE",
        reason="Tokyo's range doesn't decisively dominate Sydney's. No clean channel today; stand down.",
        no_channel_reason="CONTRACTION" if not (higher_high or lower_low) else "EXPANSION",
    )


# ---------------------------------------------------------------------------
# Line construction + projection
# ---------------------------------------------------------------------------


def build_lines(
    direction: ChannelDirection,
    overnight_high: Anchor,
    overnight_low: Anchor,
    prev_rth_high: Optional[Anchor],
    prev_rth_low: Optional[Anchor],
    slope_per_hour: float = DEFAULT_SLOPE_PER_HOUR,
) -> list[Line]:
    """Build the ES structure lines for the active session.

    Direction and overnight anchors are retained for call-site compatibility.
    The live ES framework uses the prior session's Control Map high plus the
    dealer-pressure low; each major pivot projects both ascending and
    descending lines.
    If the overnight high exceeds the prior control pivot, the app also
    marks a minor ascending watch from that overnight pivot.
    """
    lines: list[Line] = []

    if prev_rth_high is not None:
        lines.append(Line("PREV_RTH_HIGH_ASC", prev_rth_high, +slope_per_hour))
        lines.append(Line("PREV_RTH_HIGH_DESC", prev_rth_high, -slope_per_hour))
        if overnight_high.price > prev_rth_high.price:
            lines.append(Line("SWING_HIGH_ASC", overnight_high, +slope_per_hour))
    if prev_rth_low is not None:
        lines.append(Line("PREV_RTH_LOW_ASC", prev_rth_low, +slope_per_hour))
        lines.append(Line("PREV_RTH_LOW_DESC", prev_rth_low, -slope_per_hour))

    return lines


def project_line(line: Line, at: datetime) -> float:
    """Value of `line` projected to time `at`."""
    return line.anchor.price + line.slope_per_hour * es_trading_hours_between(line.anchor.time, at)
