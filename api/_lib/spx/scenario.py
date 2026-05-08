"""Scenario classifier + primary/alternate play construction.

Given the active channel (lines projected to `now`) and the current
SPX price, classify into one of seven scenarios and produce the
trade pair (primary + alternate) per the spec.

Trade map (ascending channel; descending mirrors with sides flipped):

  ABOVE_ASCENDING
    primary  = BUY  at channel ceiling, exit at prev RTH high asc
    alternate= SELL at prev RTH high asc, exit at channel ceiling

  INSIDE_ASCENDING
    primary  = BUY  at channel floor, exit at channel ceiling
    alternate= SELL at channel ceiling, exit at channel floor

  BELOW_ASCENDING
    primary  = BUY  at prev RTH low desc, exit at channel floor
    alternate= SELL at channel floor, exit at prev RTH low desc

  OUTSIDE_PLAY (scenario 7) — stand down. No primary, no alternate.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from .channel import ChannelDirection, LineKind

Scenario = Literal[
    "ABOVE_ASCENDING",
    "INSIDE_ASCENDING",
    "BELOW_ASCENDING",
    "ABOVE_DESCENDING",
    "INSIDE_DESCENDING",
    "BELOW_DESCENDING",
    "OUTSIDE_PLAY",
]
Side = Literal["BUY", "SELL"]


@dataclass(frozen=True)
class ProjectedLine:
    """A line resolved to its current value (for classification)."""

    kind: LineKind
    value: float


@dataclass(frozen=True)
class Trade:
    side: Side
    entry_line: LineKind
    entry_price: float
    exit_line: LineKind
    exit_price: float


@dataclass(frozen=True)
class Plays:
    primary: Optional[Trade]
    alternate: Optional[Trade]


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------


def _by_kind(lines: list[ProjectedLine]) -> dict[LineKind, float]:
    return {l.kind: l.value for l in lines}


def classify(
    direction: ChannelDirection, price: float, lines: list[ProjectedLine]
) -> Scenario:
    """Map (direction, price, projected lines) to one of 7 scenarios.

    OUTSIDE_PLAY when price is past the prev-RTH-high asc above OR past the
    prev-RTH-low desc below — the user's hard rule for "far outside".
    """
    if direction == "NONE":
        return "OUTSIDE_PLAY"

    by = _by_kind(lines)
    ceiling = by.get("CHANNEL_CEILING")
    floor = by.get("CHANNEL_FLOOR")
    prev_high = by.get("PREV_RTH_HIGH_ASC")
    prev_low = by.get("PREV_RTH_LOW_DESC")

    if ceiling is None or floor is None:
        # Channel rails missing despite a non-NONE direction — defensive.
        return "OUTSIDE_PLAY"

    # Far-outside check: past the prev-RTH reference lines.
    if prev_high is not None and price > prev_high:
        return "OUTSIDE_PLAY"
    if prev_low is not None and price < prev_low:
        return "OUTSIDE_PLAY"

    if direction == "ASCENDING":
        if price > ceiling:
            return "ABOVE_ASCENDING"
        if price < floor:
            return "BELOW_ASCENDING"
        return "INSIDE_ASCENDING"

    # DESCENDING
    if price > ceiling:
        return "ABOVE_DESCENDING"
    if price < floor:
        return "BELOW_DESCENDING"
    return "INSIDE_DESCENDING"


def explain_scenario(scenario: Scenario, price: float, lines: list[ProjectedLine]) -> str:
    """Human-readable one-liner describing where price sits."""
    by = _by_kind(lines)
    ceiling = by.get("CHANNEL_CEILING")
    floor = by.get("CHANNEL_FLOOR")
    if scenario == "OUTSIDE_PLAY":
        return (
            f"Last print {price:.2f} is outside the planned play envelope — "
            "no trade today."
        )
    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        assert ceiling is not None and floor is not None
        return (
            f"Last print {price:.2f} sits inside the channel — "
            f"{price - floor:+.2f} above floor, {ceiling - price:+.2f} below ceiling. "
            "Both rails are reachable on the session."
        )
    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        assert ceiling is not None
        return (
            f"Last print {price:.2f} is above the channel ceiling "
            f"({ceiling:.2f}) — ceiling now acts as support."
        )
    # BELOW_*
    assert floor is not None
    return (
        f"Last print {price:.2f} is below the channel floor "
        f"({floor:.2f}) — floor now acts as resistance."
    )


# ---------------------------------------------------------------------------
# Plays
# ---------------------------------------------------------------------------


def _trade(
    side: Side,
    entry: LineKind,
    exit_: LineKind,
    by: dict[LineKind, float],
) -> Optional[Trade]:
    """Construct a Trade if both lines have current values; else None."""
    if entry not in by or exit_ not in by:
        return None
    return Trade(
        side=side,
        entry_line=entry,
        entry_price=by[entry],
        exit_line=exit_,
        exit_price=by[exit_],
    )


def build_plays(scenario: Scenario, lines: list[ProjectedLine]) -> Plays:
    """Primary + alternate per the spec.

    Descending mirrors ascending — same line roles, same play shape;
    direction-specific scenario tags are decorative.
    """
    by = _by_kind(lines)

    if scenario == "OUTSIDE_PLAY":
        return Plays(None, None)

    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        primary = _trade("BUY", "CHANNEL_CEILING", "PREV_RTH_HIGH_ASC", by)
        alternate = _trade("SELL", "PREV_RTH_HIGH_ASC", "CHANNEL_CEILING", by)
        return Plays(primary, alternate)

    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        primary = _trade("BUY", "CHANNEL_FLOOR", "CHANNEL_CEILING", by)
        alternate = _trade("SELL", "CHANNEL_CEILING", "CHANNEL_FLOOR", by)
        return Plays(primary, alternate)

    # BELOW_*
    primary = _trade("BUY", "PREV_RTH_LOW_DESC", "CHANNEL_FLOOR", by)
    alternate = _trade("SELL", "CHANNEL_FLOOR", "PREV_RTH_LOW_DESC", by)
    return Plays(primary, alternate)
