"""Channel determination, line construction, line projection.

This module implements the geometry that defines the SPX session:

  1. Overnight high/low — the channel anchors (15:00 prev -> 02:00 today CT).
  2. Sydney range, Tokyo range — used to pick channel direction.
  3. Direction selector:
       Tokyo HH+HL vs Sydney  -> ASCENDING
       Tokyo LH+LL vs Sydney  -> DESCENDING
       otherwise              -> NONE (expansion or contraction)
  4. Line construction: 5 lines per active session.
       CHANNEL_FLOOR     anchor=overnight low,  slope=+/-1.04
       CHANNEL_CEILING   anchor=overnight high, slope=+/-1.04
       PREV_RTH_HIGH_ASC anchor=prev RTH high,  slope=+1.04
       PREV_RTH_LOW_DESC anchor=prev RTH low,   slope=-1.04
       PREV_RTH_HIGH_DESC anchor=prev RTH high, slope=-1.04 (RTH-open bias gate)
  5. Projection: anchor_price + slope_per_hour * hours_since_anchor.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
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
    "CHANNEL_CEILING",
    "CHANNEL_FLOOR",
    "PREV_RTH_HIGH_ASC",
    "PREV_RTH_LOW_DESC",
    "PREV_RTH_HIGH_DESC",
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
    """Return (high anchor, low anchor) over the overnight window
    (15:00 prev-day -> 00:00 today CT).

    The anchor rule depends on channel direction:

      ASCENDING  -> highest CLOSE / lowest CLOSE
      DESCENDING -> highest WICK (h) / lowest WICK (l)
      NONE       -> highest CLOSE / lowest CLOSE (defensive default;
                    no channel rails are drawn anyway)

    Caller must determine direction first (via `determine_channel`) and
    pass it in. The engine orchestrator does this in the right order.

    Raises ValueError if the window has no candles.
    """
    bars = in_window(candles, overnight_window(session_date))
    if direction == "DESCENDING":
        res = range_high_low(bars)  # uses h, l (raw wicks)
    else:
        res = range_high_low_close(bars)  # uses c (closes)
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
    """Previous trading day's RTH high and low.

    Returns None if no candles fall in the prior RTH window — happens on
    Mondays if the caller didn't supply Friday's bars.
    """
    prev = previous_session_date(session_date)
    bars = in_window(candles, rth_window(prev))
    res = range_high_low(bars)
    if res is None:
        return None
    high, low, t_hi, t_lo = res
    return Anchor(price=high, time=t_hi), Anchor(price=low, time=t_lo)


# ---------------------------------------------------------------------------
# Direction
# ---------------------------------------------------------------------------


def determine_channel(
    sydney: Optional[SessionRange], tokyo: Optional[SessionRange]
) -> Channel:
    """Pick channel direction from the Sydney / Tokyo prints."""
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
                "Range is rising — ascending channel."
            ),
        )
    if lower_high and lower_low:
        return Channel(
            direction="DESCENDING",
            reason=(
                f"Tokyo printed a lower high ({tokyo.high:.2f} vs {sydney.high:.2f}) "
                f"and lower low ({tokyo.low:.2f} vs {sydney.low:.2f}) than Sydney. "
                "Range is falling — descending channel."
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
    """Build the four engine lines for the active session.

    When direction == NONE we still return prev-RTH refs (they're symbol-
    invariant) but no channel rails. When prev-RTH anchors are missing
    we omit those refs.
    """
    lines: list[Line] = []

    # Channel rails: floor anchored at overnight low, ceiling at overnight high.
    # Both rails carry the same signed slope based on direction.
    if direction == "ASCENDING":
        channel_slope = +slope_per_hour
    elif direction == "DESCENDING":
        channel_slope = -slope_per_hour
    else:
        channel_slope = None

    if channel_slope is not None:
        lines.append(Line("CHANNEL_FLOOR", overnight_low, channel_slope))
        lines.append(Line("CHANNEL_CEILING", overnight_high, channel_slope))

    # Prev-RTH references used for plays/targets.
    if prev_rth_high is not None:
        lines.append(Line("PREV_RTH_HIGH_ASC", prev_rth_high, +slope_per_hour))
    if prev_rth_low is not None:
        lines.append(Line("PREV_RTH_LOW_DESC", prev_rth_low, -slope_per_hour))
    # RTH-open bias gate: only the previous RTH high descending line
    # carries this role. It does not replace the play/target rails above.
    if prev_rth_high is not None:
        lines.append(Line("PREV_RTH_HIGH_DESC", prev_rth_high, -slope_per_hour))

    return lines


def project_line(line: Line, at: datetime) -> float:
    """Value of `line` projected to time `at`."""
    return line.anchor.price + line.slope_per_hour * hours_between(line.anchor.time, at)
