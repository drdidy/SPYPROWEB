"""Scenario classifier + primary/alternate play construction.

ES now classifies price against a six-line framework:

  - ascending and descending projections from the overnight swing-high close
  - ascending and descending projections from the overnight swing-low close
  - previous RTH high ascending for high-side sell entries or buy exits
  - previous RTH low descending for low-side buy entries or sell exits

Hourly confirmation remains rule-based: buys require a bearish touch that
closes above the line, and sells require a bullish touch that closes below the
line. The legacy scenario names are retained for API compatibility.
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
    """Map price and projected lines to one of the existing scenario tags.

    The direction parameter is retained for compatibility. ES no longer
    relies on Sydney/Tokyo direction; it reads price against the swing-high
    and swing-low ascending/descending pairs.
    """
    by = _by_kind(lines)
    swing_high_asc = by.get("SWING_HIGH_ASC")
    swing_high_desc = by.get("SWING_HIGH_DESC")
    swing_low_asc = by.get("SWING_LOW_ASC")
    swing_low_desc = by.get("SWING_LOW_DESC")
    prev_high = by.get("PREV_RTH_HIGH_ASC")
    prev_low = by.get("PREV_RTH_LOW_DESC")

    if None in (swing_high_asc, swing_high_desc, swing_low_asc, swing_low_desc):
        return "OUTSIDE_PLAY"

    if prev_high is not None and price > prev_high:
        return "ABOVE_ASCENDING"
    if prev_low is not None and price < prev_low:
        return "BELOW_DESCENDING"

    assert swing_high_asc is not None and swing_high_desc is not None
    assert swing_low_asc is not None and swing_low_desc is not None

    if price > swing_high_asc and price > swing_high_desc:
        return "ABOVE_ASCENDING"
    if price < swing_low_asc and price < swing_low_desc:
        return "BELOW_DESCENDING"
    return "INSIDE_DESCENDING"


def explain_scenario(scenario: Scenario, price: float, lines: list[ProjectedLine]) -> str:
    """Human-readable one-liner describing where price sits."""
    by = _by_kind(lines)
    upper = by.get("SWING_HIGH_DESC")
    lower = by.get("SWING_LOW_ASC")
    if scenario == "OUTSIDE_PLAY":
        return f"Last print {price:.2f} does not have a complete six-line ES framework yet."
    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        pair = _ordered_swing_pair(by)
        assert pair is not None
        lower_pair, upper_pair = pair
        return (
            f"Last print {price:.2f} sits inside the ES six-line framework - "
            f"{price - lower_pair[1]:+.2f} above {lower_pair[0].lower()}, "
            f"{upper_pair[1] - price:+.2f} below {upper_pair[0].lower()}. "
            "Wait for an hourly rejection into a line."
        )
    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        return (
            f"Last print {price:.2f} is above both swing-high lines - "
            "previous RTH high ascending becomes the sell entry or buy-exit reference."
        )
    return (
        f"Last print {price:.2f} is below both swing-low lines - "
        "previous RTH low descending becomes the buy entry or sell-exit reference."
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
    entry_price = by[entry]
    exit_price = by[exit_]
    if side == "BUY" and exit_price <= entry_price:
        return None
    if side == "SELL" and exit_price >= entry_price:
        return None
    return Trade(
        side=side,
        entry_line=entry,
        entry_price=entry_price,
        exit_line=exit_,
        exit_price=exit_price,
    )


def _ordered_swing_pair(
    by: dict[LineKind, float],
) -> Optional[tuple[tuple[LineKind, float], tuple[LineKind, float]]]:
    candidates: list[tuple[LineKind, float]] = []
    for kind in ("SWING_HIGH_DESC", "SWING_LOW_ASC"):
        if kind in by:
            candidates.append((kind, by[kind]))
    if len(candidates) != 2:
        return None
    low, high = sorted(candidates, key=lambda item: item[1])
    if low[1] >= high[1]:
        return None
    return low, high


def build_plays(scenario: Scenario, lines: list[ProjectedLine]) -> Plays:
    """Primary + alternate per the spec.

    Descending mirrors ascending - same line roles, same play shape;
    direction-specific scenario tags are decorative.
    """
    by = _by_kind(lines)

    if scenario == "OUTSIDE_PLAY":
        return Plays(None, None)

    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        primary = _trade("SELL", "PREV_RTH_HIGH_ASC", "SWING_HIGH_DESC", by)
        alternate = _trade("BUY", "SWING_HIGH_DESC", "PREV_RTH_HIGH_ASC", by)
        return Plays(primary, alternate)

    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        pair = _ordered_swing_pair(by)
        if pair is None:
            return Plays(None, None)
        low, high = pair
        primary = Trade("BUY", low[0], low[1], high[0], high[1])
        alternate = Trade("SELL", high[0], high[1], low[0], low[1])
        return Plays(primary, alternate)

    # BELOW_*
    primary = _trade("BUY", "PREV_RTH_LOW_DESC", "SWING_LOW_ASC", by)
    alternate = _trade("SELL", "SWING_LOW_ASC", "PREV_RTH_LOW_DESC", by)
    return Plays(primary, alternate)
