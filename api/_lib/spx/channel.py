"""ES structure line construction and projection.

This module implements the geometry that defines the ES session:

  1. Previous RTH swing-high close and post-noon RTH low wick.
  2. Line construction: four major lines per active session.
       PREV_RTH_HIGH_ASC  anchor=prev RTH high close, slope=+1.04
       PREV_RTH_HIGH_DESC anchor=prev RTH high close, slope=-1.04
       PREV_RTH_LOW_ASC   anchor=post-noon RTH low wick, slope=+1.04
       PREV_RTH_LOW_DESC  anchor=post-noon RTH low wick, slope=-1.04
     Optional minor watch:
       SWING_HIGH_ASC      anchor=overnight high close when it exceeds
                           the prior RTH high close, slope=+1.04
  4. Projection: anchor_price + slope_per_hour * hours_since_anchor.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Literal, Optional

from .candles import Candle, in_window, range_high_low, range_high_low_close
from .constants import DEFAULT_SLOPE_PER_HOUR
from .time_utils import (
    hours_between,
    overnight_window,
    previous_session_date,
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
    """Previous trading day's RTH high close and post-noon low wick.

    Returns None if no candles fall in the prior RTH window; this happens on
    Mondays if the caller didn't supply Friday's bars.
    """
    prev = previous_session_date(session_date)
    bars = in_window(candles, rth_window(prev))
    res = range_high_low_close(bars)
    if res is None:
        return None

    post_noon = [bar for bar in bars if to_ct(bar.t).time() >= time(12, 0)]
    if not post_noon:
        return None

    high, _, t_hi, _ = res
    low_bar = min(post_noon, key=lambda bar: bar.l)
    low = low_bar.l
    t_lo = to_ct(low_bar.t)
    return Anchor(price=high, time=t_hi), Anchor(price=low, time=t_lo)


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
    The live ES framework uses the highest RTH close plus the lowest post-noon
    RTH wick; each major pivot projects both ascending and descending lines.
    If the overnight high close exceeds the prior RTH high close, the app also
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
    return line.anchor.price + line.slope_per_hour * hours_between(line.anchor.time, at)
