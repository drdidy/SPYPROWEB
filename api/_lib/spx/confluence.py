"""ES confluence: implemented factors + weighted sum + action gate.

Three factors are implemented as reasonable proxies (asian, london,
reaction). Unimplemented factor ideas are intentionally not emitted.
Production surfaces should show only actionable, real inputs.
nothing — the score is honest about its provisional state.

Contract:
  evaluate(...) -> Confluence
    .factors  list of FactorResult, one per slot
    .score    0..100
    .action   TAKE / SELECTIVE / STAND_DOWN

Action gate:
  Scenario 7 (OUTSIDE_PLAY) -> always STAND_DOWN regardless of score.
  Otherwise:
    score >= ACTION_TAKE_THRESHOLD       -> TAKE
    score >= ACTION_SELECTIVE_THRESHOLD  -> SELECTIVE
    else                                 -> STAND_DOWN
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal, Optional

from .candles import Candle, in_window
from .channel import Channel, Line, SessionRange, project_line
from .constants import (
    ACTION_SELECTIVE_THRESHOLD,
    ACTION_TAKE_THRESHOLD,
    FACTOR_WEIGHTS,
)
from .scenario import Scenario
from .time_utils import at_ct, rth_window
from datetime import time

Action = Literal["TAKE", "SELECTIVE", "STAND_DOWN"]
FactorKey = Literal["asian", "london", "reaction"]


@dataclass(frozen=True)
class FactorResult:
    key: FactorKey
    label: str
    value: float       # 0..1
    weight: float      # 0..1
    contribution: float
    note: Optional[str] = None


@dataclass(frozen=True)
class Confluence:
    factors: list[FactorResult]
    score: float       # 0..100
    action: Action


# ---------------------------------------------------------------------------
# Factor implementations
# ---------------------------------------------------------------------------


def _factor_asian(channel: Channel, sydney: Optional[SessionRange], tokyo: Optional[SessionRange]) -> FactorResult:
    """Whether the overnight swing framework has usable range data.

    This no longer determines direction. Direction comes from the six-line
    framework; the Asian factor only answers whether the overnight build has
    enough measured range to be useful.
    """
    ranges = [r for r in (sydney, tokyo) if r is not None]
    if not ranges:
        return FactorResult(
            key="asian",
            label="Asian session",
            value=0.0,
            weight=FACTOR_WEIGHTS["asian"],
            contribution=0.0,
            note="Overnight session data missing.",
        )

    high = max(r.high for r in ranges)
    low = min(r.low for r in ranges)
    span = max(0.0, high - low)
    value = 0.65 if len(ranges) == 2 else 0.35
    note = (
        f"Overnight swing framework resolved with {span:.2f} pts of measured "
        f"range across {len(ranges)} session block{'s' if len(ranges) != 1 else ''}."
    )
    weight = FACTOR_WEIGHTS["asian"]
    return FactorResult(
        key="asian", label="Asian session", value=value,
        weight=weight, contribution=value * weight, note=note,
    )


def _factor_london(
    candles: list[Candle], session_date: date, upper: Optional[Line], lower: Optional[Line]
) -> FactorResult:
    """Did London (02:00-08:00 CT) hold the active swing pair?

    'Hold' = London bars stayed inside the active line pair. Each bar
    counts; clean holds score high, frequent breaches score low.
    """
    weight = FACTOR_WEIGHTS["london"]
    if upper is None or lower is None:
        return FactorResult(
            key="london", label="London session", value=0.0,
            weight=weight, contribution=0.0,
            note="No active swing pair; London check skipped.",
        )

    # London window: 02:00 -> 08:00 CT on session_date.
    from .time_utils import SessionWindow  # local import to avoid cycle
    london = SessionWindow(at_ct(session_date, time(2, 0)), at_ct(session_date, time(8, 0)))
    bars = in_window(candles, london)
    if not bars:
        return FactorResult(
            key="london", label="London session", value=0.0,
            weight=weight, contribution=0.0,
            note="London window has no candles.",
        )

    held = 0
    for bar in bars:
        c_val = project_line(upper, bar.t)
        f_val = project_line(lower, bar.t)
        # Bar held the framework if both wicks stay within the active pair.
        if bar.l >= f_val and bar.h <= c_val:
            held += 1
    fraction = held / len(bars)
    value = 0.30 + 0.65 * fraction  # [0.30, 0.95]
    return FactorResult(
        key="london", label="London session", value=value,
        weight=weight, contribution=value * weight,
        note=f"{held}/{len(bars)} London bars held the active swing pair.",
    )


def _factor_reaction(
    candles: list[Candle], session_date: date, scenario: Scenario, upper: Optional[Line], lower: Optional[Line]
) -> FactorResult:
    """First RTH bar's reaction to the active swing pair.

    Looks at the 08:30 bar (first RTH hour). If it touched a rail and
    rejected (wicked back), that's a confirming reaction. If it sliced
    straight through, that's a non-confirming reaction.
    """
    weight = FACTOR_WEIGHTS["reaction"]
    bars = in_window(candles, rth_window(session_date))
    if not bars:
        return FactorResult(
            key="reaction", label="RTH reaction", value=0.0,
            weight=weight, contribution=0.0,
            note="RTH has no candles yet.",
        )

    first = bars[0]
    if scenario == "OUTSIDE_PLAY" or upper is None or lower is None:
        return FactorResult(
            key="reaction", label="RTH reaction", value=0.0,
            weight=weight, contribution=0.0,
            note="No play in scope; reaction not graded.",
        )

    c_val = project_line(upper, first.t)
    f_val = project_line(lower, first.t)

    # Did the first bar interact cleanly with one of the rails?
    touched_ceiling = first.l <= c_val <= first.h
    touched_floor = first.l <= f_val <= first.h
    body_top = max(first.o, first.c)
    body_bottom = min(first.o, first.c)

    if touched_ceiling:
        # rejection = body stayed below ceiling, wick poked through
        rejection = first.h - body_top
        wick_fraction = min(1.0, rejection / max(first.h - first.l, 1e-6))
        value = 0.40 + 0.55 * wick_fraction
        note = f"First RTH bar tested the upper swing line; rejection wick {wick_fraction * 100:.0f}% of bar range."
    elif touched_floor:
        rejection = body_bottom - first.l
        wick_fraction = min(1.0, rejection / max(first.h - first.l, 1e-6))
        value = 0.40 + 0.55 * wick_fraction
        note = f"First RTH bar tested the lower swing line; rejection wick {wick_fraction * 100:.0f}% of bar range."
    else:
        # Bar built inside the framework without touching either active line.
        value = 0.55
        note = "First RTH bar built inside the six-line framework without testing an active line."
    return FactorResult(
        key="reaction", label="RTH reaction", value=value,
        weight=weight, contribution=value * weight, note=note,
    )


# ---------------------------------------------------------------------------
# Top-level evaluator
# ---------------------------------------------------------------------------


def evaluate(
    *,
    candles: list[Candle],
    session_date: date,
    channel: Channel,
    sydney: Optional[SessionRange],
    tokyo: Optional[SessionRange],
    scenario: Scenario,
    ceiling: Optional[Line],
    floor: Optional[Line],
) -> Confluence:
    factors = [
        _factor_asian(channel, sydney, tokyo),
        _factor_london(candles, session_date, ceiling, floor),
        _factor_reaction(candles, session_date, scenario, ceiling, floor),
    ]
    raw_score = sum(f.contribution for f in factors)  # 0..1
    score = round(raw_score * 100, 1)

    if scenario == "OUTSIDE_PLAY":
        action: Action = "STAND_DOWN"
    elif score >= ACTION_TAKE_THRESHOLD:
        action = "TAKE"
    elif score >= ACTION_SELECTIVE_THRESHOLD:
        action = "SELECTIVE"
    else:
        action = "STAND_DOWN"

    return Confluence(factors=factors, score=score, action=action)
