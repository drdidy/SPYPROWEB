"""Scenario classifier + primary/alternate play construction.

ES now classifies price against a previous-RTH swing-close framework:

  - previous RTH swing-high close ascending and descending
  - previous RTH swing-low close ascending and descending
  - the previous RTH high descending line is the major flow/bias reference

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
    relies on Sydney/Tokyo direction; it reads price against the previous
    RTH swing-close projections. The high-descending line is the major flow
    reference.
    """
    by = _by_kind(lines)
    high_asc = by.get("PREV_RTH_HIGH_ASC")
    high_desc = by.get("PREV_RTH_HIGH_DESC") or by.get("SWING_HIGH_DESC")
    low_asc = by.get("PREV_RTH_LOW_ASC") or by.get("SWING_LOW_ASC")
    low_desc = by.get("PREV_RTH_LOW_DESC")

    if None in (high_asc, high_desc, low_asc, low_desc):
        return "OUTSIDE_PLAY"

    assert high_desc is not None
    assert low_desc is not None

    if price > high_desc:
        return "ABOVE_DESCENDING"
    if price < low_desc:
        return "BELOW_DESCENDING"
    return "INSIDE_DESCENDING"


def explain_scenario(scenario: Scenario, price: float, lines: list[ProjectedLine]) -> str:
    """Human-readable one-liner describing where price sits."""
    by = _by_kind(lines)
    high_desc = by.get("PREV_RTH_HIGH_DESC") or by.get("SWING_HIGH_DESC")
    high_asc = by.get("PREV_RTH_HIGH_ASC")
    low_desc = by.get("PREV_RTH_LOW_DESC")
    if scenario == "OUTSIDE_PLAY":
        return f"Last print {price:.2f} does not have the previous-RTH swing-close ES framework yet."
    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        assert high_desc is not None
        relation = _relative_phrase(price, high_desc, "PREV_RTH_HIGH_DESC")
        return (
            f"Last print {price:.2f} is near the major previous-RTH high descending line - "
            f"{relation}. Wait for the hourly touch-and-close confirmation."
        )
    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        target = f" toward previous RTH high ascending {high_asc:.2f}" if high_asc is not None else ""
        return (
            f"Last print {price:.2f} is above the major previous-RTH high descending line{target}. "
            "If price returns to the major line and closes above it, the buy continuation is active; "
            "if it extends first, the high ascending line is the sell or buy-exit reference."
        )
    target = f" toward previous RTH low descending {low_desc:.2f}" if low_desc is not None else ""
    return (
        f"Last print {price:.2f} is below the major previous-RTH high descending line{target}. "
        "If price returns to the major line and closes below it, the sell continuation is active; "
        "if it drops first, the low descending line is the buy or sell-exit reference."
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


def _line_label(kind: LineKind) -> str:
    labels: dict[LineKind, str] = {
        "PREV_RTH_HIGH_ASC": "previous RTH high ascending",
        "PREV_RTH_HIGH_DESC": "previous RTH high descending",
        "PREV_RTH_LOW_ASC": "previous RTH low ascending",
        "PREV_RTH_LOW_DESC": "previous RTH low descending",
        "SWING_HIGH_ASC": "swing-high ascending",
        "SWING_HIGH_DESC": "swing-high descending",
        "SWING_LOW_ASC": "swing-low ascending",
        "SWING_LOW_DESC": "swing-low descending",
    }
    return labels[kind]


def _relative_phrase(price: float, line_value: float, kind: LineKind) -> str:
    delta = price - line_value
    if abs(delta) < 0.005:
        return f"on {_line_label(kind)}"
    if delta > 0:
        return f"{abs(delta):.2f} above {_line_label(kind)}"
    return f"{abs(delta):.2f} below {_line_label(kind)}"


def build_plays(scenario: Scenario, lines: list[ProjectedLine]) -> Plays:
    """Primary + alternate per the spec.

    Descending mirrors ascending - same line roles, same play shape;
    direction-specific scenario tags are decorative.
    """
    by = _by_kind(lines)

    if scenario == "OUTSIDE_PLAY":
        return Plays(None, None)

    high_desc = "PREV_RTH_HIGH_DESC" if "PREV_RTH_HIGH_DESC" in by else "SWING_HIGH_DESC"
    low_desc = "PREV_RTH_LOW_DESC"

    if scenario in ("ABOVE_ASCENDING", "ABOVE_DESCENDING"):
        primary = _trade("SELL", "PREV_RTH_HIGH_ASC", high_desc, by)
        alternate = _trade("BUY", high_desc, "PREV_RTH_HIGH_ASC", by)
        return Plays(primary, alternate)

    if scenario in ("INSIDE_ASCENDING", "INSIDE_DESCENDING"):
        if high_desc not in by or low_desc not in by:
            return Plays(None, None)
        primary = Trade("BUY", low_desc, by[low_desc], high_desc, by[high_desc])
        alternate = Trade("SELL", high_desc, by[high_desc], low_desc, by[low_desc])
        return Plays(primary, alternate)

    # BELOW_*
    primary = _trade("BUY", low_desc, high_desc, by)
    alternate = _trade("SELL", high_desc, low_desc, by)
    return Plays(primary, alternate)
