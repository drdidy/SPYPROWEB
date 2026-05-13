"""Line re-entry / rejection confirmation watch.

Per current ES rules:

  Buy trigger:
    A bearish candle drops to a watched line and CLOSES ABOVE it.

  Sell trigger:
    A bullish candle rises to a watched line and CLOSES BELOW it.

The watch state lives between hourly bars: inside means dormant; outside the
previous-RTH swing-close framework arms and waits for the touch-and-close pattern.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from .candles import Candle
from .channel import Line, project_line
from .scenario import Scenario

ReentrySide = Literal["BUY_FROM_ABOVE", "SELL_FROM_BELOW"]


@dataclass(frozen=True)
class ReentryWatch:
    active: bool
    side: Optional[ReentrySide]
    detail: str


def _is_bearish(c: Candle) -> bool:
    return c.c < c.o


def _is_bullish(c: Candle) -> bool:
    return c.c > c.o


def evaluate_reentry(
    scenario: Scenario,
    last_candle: Optional[Candle],
    ceiling: Optional[Line],
    floor: Optional[Line],
) -> ReentryWatch:
    """Resolve the rejection watch state for the active session."""
    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        return ReentryWatch(
            active=False,
            side=None,
            detail="Inside the previous-RTH swing-close ES framework - rejection watch dormant.",
        )

    if scenario == "OUTSIDE_PLAY":
        return ReentryWatch(
            active=False,
            side=None,
            detail="Outside the planned play - no rejection watch today.",
        )

    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        if last_candle is None or ceiling is None:
            return ReentryWatch(
                active=True,
                side="BUY_FROM_ABOVE",
                detail=(
                    "Above the active swing pair - awaiting a bearish candle "
                    "that touches the buy line and closes above it."
                ),
            )
        ceil_at_close = project_line(ceiling, last_candle.t)
        touched = last_candle.l <= ceil_at_close <= last_candle.h
        closed_above = last_candle.c > ceil_at_close
        if _is_bearish(last_candle) and touched and closed_above:
            return ReentryWatch(
                active=True,
                side="BUY_FROM_ABOVE",
                detail=(
                    f"Bearish candle touched the buy line ({ceil_at_close:.2f}) and "
                    f"closed above ({last_candle.c:.2f}) - continuation buy confirmed."
                ),
            )
        return ReentryWatch(
            active=True,
            side="BUY_FROM_ABOVE",
            detail=(
                "Above the active swing pair - awaiting a bearish candle "
                "that touches the buy line and closes above it."
            ),
        )

    if last_candle is None or floor is None:
        return ReentryWatch(
            active=True,
            side="SELL_FROM_BELOW",
            detail=(
                "Below the active swing pair - awaiting a bullish candle "
                "that touches the sell line and closes below it."
            ),
        )
    floor_at_close = project_line(floor, last_candle.t)
    touched = last_candle.l <= floor_at_close <= last_candle.h
    closed_below = last_candle.c < floor_at_close
    if _is_bullish(last_candle) and touched and closed_below:
        return ReentryWatch(
            active=True,
            side="SELL_FROM_BELOW",
            detail=(
                f"Bullish candle touched the sell line ({floor_at_close:.2f}) and "
                f"closed below ({last_candle.c:.2f}) - continuation sell confirmed."
            ),
        )
    return ReentryWatch(
        active=True,
        side="SELL_FROM_BELOW",
        detail=(
            "Below the active swing pair - awaiting a bullish candle "
            "that touches the sell line and closes below it."
        ),
    )
