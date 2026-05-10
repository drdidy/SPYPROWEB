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
    """How decisively Tokyo dominates / fails to dominate Sydney.

    For a clean ASCENDING or DESCENDING read the factor leans high; for
    NONE (expansion/contraction) it leans low.
    """
    if sydney is None or tokyo is None:
        return FactorResult(
            key="asian",
            label="Asian session",
            value=0.0,
            weight=FACTOR_WEIGHTS["asian"],
            contribution=0.0,
            note="Sydney / Tokyo data missing.",
        )

    if channel.direction == "NONE":
        value = 0.20
        note = "Tokyo did not decisively dominate Sydney."
    else:
        # Margin = how far Tokyo's high/low extended past Sydney's, normalized
        # by Sydney's range. Bigger margin -> cleaner Asian read.
        if channel.direction == "ASCENDING":
            margin_h = max(0.0, tokyo.high - sydney.high)
            margin_l = max(0.0, tokyo.low - sydney.low)
        else:
            margin_h = max(0.0, sydney.high - tokyo.high)
            margin_l = max(0.0, sydney.low - tokyo.low)
        sydney_range = max(sydney.high - sydney.low, 1e-6)
        normalized = min(1.0, (margin_h + margin_l) / sydney_range)
        value = 0.60 + 0.35 * normalized  # clean reads land in [0.60, 0.95]
        note = (
            f"Tokyo extended {margin_h + margin_l:.2f} pts beyond Sydney "
            f"({normalized * 100:.0f}% of Sydney's range)."
        )
    weight = FACTOR_WEIGHTS["asian"]
    return FactorResult(
        key="asian", label="Asian session", value=value,
        weight=weight, contribution=value * weight, note=note,
    )


def _factor_london(
    candles: list[Candle], session_date: date, ceiling: Optional[Line], floor: Optional[Line]
) -> FactorResult:
    """Did London (02:00-08:00 CT) hold the channel?

    'Hold' = London bars stayed inside the channel projection. Each bar
    counts; clean holds score high, frequent breaches score low.
    """
    weight = FACTOR_WEIGHTS["london"]
    if ceiling is None or floor is None:
        return FactorResult(
            key="london", label="London session", value=0.0,
            weight=weight, contribution=0.0,
            note="No active channel; London check skipped.",
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
        c_val = project_line(ceiling, bar.t)
        f_val = project_line(floor, bar.t)
        # Bar held the channel if both wicks stay within rails.
        if bar.l >= f_val and bar.h <= c_val:
            held += 1
    fraction = held / len(bars)
    value = 0.30 + 0.65 * fraction  # [0.30, 0.95]
    return FactorResult(
        key="london", label="London session", value=value,
        weight=weight, contribution=value * weight,
        note=f"{held}/{len(bars)} London bars held the channel.",
    )


def _factor_reaction(
    candles: list[Candle], session_date: date, scenario: Scenario, ceiling: Optional[Line], floor: Optional[Line]
) -> FactorResult:
    """First RTH bar's reaction to the active rails.

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
    if scenario == "OUTSIDE_PLAY" or ceiling is None or floor is None:
        return FactorResult(
            key="reaction", label="RTH reaction", value=0.0,
            weight=weight, contribution=0.0,
            note="No play in scope; reaction not graded.",
        )

    c_val = project_line(ceiling, first.t)
    f_val = project_line(floor, first.t)

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
        note = f"First RTH bar tested ceiling; rejection wick {wick_fraction * 100:.0f}% of bar range."
    elif touched_floor:
        rejection = body_bottom - first.l
        wick_fraction = min(1.0, rejection / max(first.h - first.l, 1e-6))
        value = 0.40 + 0.55 * wick_fraction
        note = f"First RTH bar tested floor; rejection wick {wick_fraction * 100:.0f}% of bar range."
    else:
        # Bar built inside the channel without touching a rail — neutral.
        value = 0.55
        note = "First RTH bar built inside the channel without testing a rail."
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
