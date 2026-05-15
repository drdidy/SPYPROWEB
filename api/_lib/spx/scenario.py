"""Scenario classifier + primary/alternate play construction.

ES now classifies price against a previous-RTH pivot framework:

  - previous RTH swing-high close ascending and descending
  - previous RTH post-noon low wick ascending and descending
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
FanZone = Literal[
    "ABOVE_BOTH_CEILINGS",
    "BETWEEN_CEILINGS",
    "BELOW_BOTH_CEILINGS",
    "BELOW_HIGH_FLOOR",
    "PENDING",
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


@dataclass(frozen=True)
class FanRead:
    zone: FanZone
    label: str
    summary: str
    primary_reference: Optional[LineKind]
    secondary_reference: Optional[LineKind]


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
    RTH pivot projections. The high-descending line is the major flow
    reference.
    """
    zone = fan_zone(price, lines)
    if zone == "PENDING":
        return "OUTSIDE_PLAY"
    if zone == "ABOVE_BOTH_CEILINGS":
        return "ABOVE_ASCENDING"
    if zone == "BETWEEN_CEILINGS":
        return "INSIDE_ASCENDING"
    if zone == "BELOW_BOTH_CEILINGS":
        return "ABOVE_DESCENDING"
    return "BELOW_DESCENDING"


def fan_zone(price: float, lines: list[ProjectedLine]) -> FanZone:
    by = _by_kind(lines)
    high_ceiling = by.get("PREV_RTH_HIGH_ASC")
    high_floor = by.get("PREV_RTH_HIGH_DESC") or by.get("SWING_HIGH_DESC")
    low_ceiling = by.get("PREV_RTH_LOW_ASC") or by.get("SWING_LOW_ASC")
    low_floor = by.get("PREV_RTH_LOW_DESC")

    if None in (high_ceiling, high_floor, low_ceiling, low_floor):
        return "PENDING"

    assert high_ceiling is not None
    assert high_floor is not None
    assert low_ceiling is not None

    upper_ceiling = max(high_ceiling, low_ceiling)
    lower_ceiling = min(high_ceiling, low_ceiling)

    if price >= upper_ceiling:
        return "ABOVE_BOTH_CEILINGS"
    if price >= lower_ceiling:
        return "BETWEEN_CEILINGS"
    if price >= high_floor:
        return "BELOW_BOTH_CEILINGS"
    return "BELOW_HIGH_FLOOR"


def build_fan_read(price: float, lines: list[ProjectedLine]) -> FanRead:
    zone = fan_zone(price, lines)
    labels: dict[FanZone, str] = {
        "ABOVE_BOTH_CEILINGS": "Above both fan ceilings",
        "BETWEEN_CEILINGS": "Between fan ceilings",
        "BELOW_BOTH_CEILINGS": "Below both fan ceilings",
        "BELOW_HIGH_FLOOR": "Below High Fan Floor",
        "PENDING": "Fan pending",
    }
    summaries: dict[FanZone, str] = {
        "ABOVE_BOTH_CEILINGS": (
            "Price is above both fan ceilings; High Fan Ceiling becomes the buy-support reference."
        ),
        "BETWEEN_CEILINGS": (
            "Price is between the two ceilings; sell rejection at High Fan Ceiling can target High Fan Floor, while a Low Fan Ceiling reclaim can press through High Fan Ceiling."
        ),
        "BELOW_BOTH_CEILINGS": (
            "Price is below both ceilings; ceiling retests can sell, while High Fan Floor becomes the first buy reference."
        ),
        "BELOW_HIGH_FLOOR": (
            "Price is below High Fan Floor; Low Fan Floor becomes the main buy reference."
        ),
        "PENDING": "The four fan references are not resolved yet.",
    }
    references: dict[FanZone, tuple[Optional[LineKind], Optional[LineKind]]] = {
        "ABOVE_BOTH_CEILINGS": ("PREV_RTH_HIGH_ASC", None),
        "BETWEEN_CEILINGS": ("PREV_RTH_HIGH_ASC", "PREV_RTH_LOW_ASC"),
        "BELOW_BOTH_CEILINGS": ("PREV_RTH_LOW_ASC", "PREV_RTH_HIGH_DESC"),
        "BELOW_HIGH_FLOOR": ("PREV_RTH_LOW_DESC", "PREV_RTH_HIGH_DESC"),
        "PENDING": (None, None),
    }
    primary, secondary = references[zone]
    return FanRead(
        zone=zone,
        label=labels[zone],
        summary=summaries[zone],
        primary_reference=primary,
        secondary_reference=secondary,
    )


def explain_scenario(scenario: Scenario, price: float, lines: list[ProjectedLine]) -> str:
    """Human-readable one-liner describing where price sits."""
    by = _by_kind(lines)
    high_floor = by.get("PREV_RTH_HIGH_DESC") or by.get("SWING_HIGH_DESC")
    high_ceiling = by.get("PREV_RTH_HIGH_ASC")
    low_ceiling = by.get("PREV_RTH_LOW_ASC")
    low_floor = by.get("PREV_RTH_LOW_DESC")
    if scenario == "OUTSIDE_PLAY":
        return f"Last print {price:.2f} does not have the ES Pivot Fan resolved yet."
    if scenario == "INSIDE_ASCENDING":
        assert high_ceiling is not None
        assert low_ceiling is not None
        return (
            f"Last print {price:.2f} is between High Fan Ceiling {high_ceiling:.2f} "
            f"and Low Fan Ceiling {low_ceiling:.2f}. Sell rejection at High Fan Ceiling "
            "can rotate toward High Fan Floor; Low Fan Ceiling reclaim can press through the upper fan."
        )
    if scenario == "ABOVE_ASCENDING":
        target = f" at High Fan Ceiling {high_ceiling:.2f}" if high_ceiling is not None else ""
        return (
            f"Last print {price:.2f} is above both fan ceilings{target}. "
            "A qualified touch-and-close above that ceiling is the buy-support read."
        )
    if scenario == "ABOVE_DESCENDING":
        assert low_ceiling is not None
        assert high_floor is not None
        return (
            f"Last print {price:.2f} is below both fan ceilings. "
            f"Low Fan Ceiling {low_ceiling:.2f} can sell on rejection; "
            f"High Fan Floor {high_floor:.2f} is the first buy reference."
        )
    target = f" at Low Fan Floor {low_floor:.2f}" if low_floor is not None else ""
    return (
        f"Last print {price:.2f} is below High Fan Floor{target}. "
        "Low Fan Floor is the main buy reference until price reclaims the high fan."
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


def _fan_trade(
    side: Side,
    entry: LineKind,
    exit_: LineKind,
    by: dict[LineKind, float],
    *,
    exit_price: Optional[float] = None,
) -> Optional[Trade]:
    if entry not in by or exit_ not in by:
        return None
    entry_price = by[entry]
    resolved_exit = by[exit_] if exit_price is None else exit_price
    if side == "BUY" and resolved_exit <= entry_price:
        return None
    if side == "SELL" and resolved_exit >= entry_price:
        return None
    return Trade(side, entry, entry_price, exit_, resolved_exit)


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
        "PREV_RTH_HIGH_ASC": "High Fan Ceiling",
        "PREV_RTH_HIGH_DESC": "High Fan Floor",
        "PREV_RTH_LOW_ASC": "Low Fan Ceiling",
        "PREV_RTH_LOW_DESC": "Low Fan Floor",
        "SWING_HIGH_ASC": "overnight higher-pivot ascending",
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

    The legacy scenario tags now map to the ES Pivot Fan zones:
    above both ceilings, between ceilings, below both ceilings, and
    below High Fan Floor.
    """
    by = _by_kind(lines)

    if scenario == "OUTSIDE_PLAY":
        return Plays(None, None)

    high_ceiling = "PREV_RTH_HIGH_ASC"
    high_floor = "PREV_RTH_HIGH_DESC" if "PREV_RTH_HIGH_DESC" in by else "SWING_HIGH_DESC"
    low_ceiling = "PREV_RTH_LOW_ASC"
    low_floor = "PREV_RTH_LOW_DESC"

    if scenario == "ABOVE_ASCENDING":
        if high_ceiling not in by or high_floor not in by:
            return Plays(None, None)
        width = abs(by[high_ceiling] - by[high_floor])
        target = by[high_ceiling] + width
        primary = _fan_trade("BUY", high_ceiling, high_ceiling, by, exit_price=target)
        alternate = _fan_trade("SELL", high_ceiling, high_floor, by)
        return Plays(primary, alternate)

    if scenario == "INSIDE_ASCENDING":
        if high_ceiling not in by or high_floor not in by or low_ceiling not in by:
            return Plays(None, None)
        primary = _fan_trade("SELL", high_ceiling, high_floor, by)
        alternate = _fan_trade("BUY", low_ceiling, high_ceiling, by)
        return Plays(primary, alternate)

    if scenario == "ABOVE_DESCENDING":
        if high_floor not in by or low_ceiling not in by:
            return Plays(None, None)
        primary = _fan_trade("SELL", low_ceiling, high_floor, by)
        alternate = _fan_trade("BUY", high_floor, low_ceiling, by)
        return Plays(primary, alternate)

    primary = _fan_trade("BUY", low_floor, high_floor, by)
    alternate = _fan_trade("SELL", high_floor, low_floor, by)
    return Plays(primary, alternate)
