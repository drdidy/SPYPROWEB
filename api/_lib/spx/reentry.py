"""Channel re-entry / breakout confirmation watch.

Per spec:

  Above the channel:
    A bearish candle that touches the ceiling and CLOSES ABOVE it
    triggers a continuation BUY from above.

  Below the channel:
    A bullish candle that touches the floor and CLOSES BELOW it
    triggers a continuation SELL from below.

The watch state lives between bars: 'inside' means dormant; outside the
channel it arms and waits for the touch-and-close pattern.
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
    """Resolve the re-entry watch state for the active session.

    Inside the channel -> dormant.
    Above with no qualifying candle -> armed, waiting.
    Above with a bearish-touch-close-above -> triggered (BUY from above).
    Below with no qualifying candle -> armed, waiting.
    Below with a bullish-touch-close-below -> triggered (SELL from below).
    """
    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        return ReentryWatch(
            active=False,
            side=None,
            detail="Inside channel — re-entry watch dormant.",
        )

    if scenario == "OUTSIDE_PLAY":
        return ReentryWatch(
            active=False,
            side=None,
            detail="Outside the planned play — no re-entry watch today.",
        )

    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        if last_candle is None or ceiling is None:
            return ReentryWatch(
                active=True,
                side="BUY_FROM_ABOVE",
                detail="Above channel — awaiting bearish candle that touches ceiling and closes above it.",
            )
        ceil_at_close = project_line(ceiling, last_candle.t)
        touched = last_candle.l <= ceil_at_close <= last_candle.h
        closed_above = last_candle.c > ceil_at_close
        if _is_bearish(last_candle) and touched and closed_above:
            return ReentryWatch(
                active=True,
                side="BUY_FROM_ABOVE",
                detail=(
                    f"Bearish candle touched ceiling ({ceil_at_close:.2f}) and "
                    f"closed above ({last_candle.c:.2f}) — continuation buy confirmed."
                ),
            )
        return ReentryWatch(
            active=True,
            side="BUY_FROM_ABOVE",
            detail="Above channel — awaiting bearish candle that touches ceiling and closes above it.",
        )

    # BELOW_*
    if last_candle is None or floor is None:
        return ReentryWatch(
            active=True,
            side="SELL_FROM_BELOW",
            detail="Below channel — awaiting bullish candle that touches floor and closes below it.",
        )
    floor_at_close = project_line(floor, last_candle.t)
    touched = last_candle.l <= floor_at_close <= last_candle.h
    closed_below = last_candle.c < floor_at_close
    if _is_bullish(last_candle) and touched and closed_below:
        return ReentryWatch(
            active=True,
            side="SELL_FROM_BELOW",
            detail=(
                f"Bullish candle touched floor ({floor_at_close:.2f}) and "
                f"closed below ({last_candle.c:.2f}) — continuation sell confirmed."
            ),
        )
    return ReentryWatch(
        active=True,
        side="SELL_FROM_BELOW",
        detail="Below channel — awaiting bullish candle that touches floor and closes below it.",
    )
