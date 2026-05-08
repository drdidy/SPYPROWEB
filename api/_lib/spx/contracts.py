"""Contract suggestion: 0DTE OTM strikes 20-25 pts from entry.

Per spec: 'we take a contract that is 20-25 points from the entry so it
will be out of the money but it will move quickly in the money'.

Strike rounding: SPX standard board is in 5-pt increments. We round
*outward* (away from spot) to keep the contract OTM by at least the
minimum distance.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal, Optional

from .constants import DEFAULT_OTM_DISTANCE, SPX_STRIKE_INCREMENT
from .scenario import Trade

ContractType = Literal["CALL", "PUT"]


@dataclass(frozen=True)
class ContractSuggestion:
    type: ContractType
    strike: float
    expiration: date
    dte_label: str
    distance_from_entry: float  # signed; positive = above entry


def _round_up_to_increment(value: float, increment: int) -> float:
    """Round value UP to the nearest multiple of `increment`."""
    return float(((int(value) // increment) + (1 if value % increment else 0)) * increment)


def _round_down_to_increment(value: float, increment: int) -> float:
    """Round value DOWN to the nearest multiple of `increment`."""
    return float((int(value) // increment) * increment)


def suggest_contract(
    trade: Trade,
    expiration: date,
    otm_distance: float = DEFAULT_OTM_DISTANCE,
    increment: int = SPX_STRIKE_INCREMENT,
    dte_label: str = "0DTE",
) -> ContractSuggestion:
    """Pick a strike `otm_distance` points OTM from the trade's entry.

    BUY  -> CALL strike at entry + otm_distance, rounded UP to increment.
    SELL -> PUT  strike at entry - otm_distance, rounded DOWN to increment.
    """
    if trade.side == "BUY":
        target = trade.entry_price + otm_distance
        strike = _round_up_to_increment(target, increment)
        kind: ContractType = "CALL"
    else:
        target = trade.entry_price - otm_distance
        strike = _round_down_to_increment(target, increment)
        kind = "PUT"

    return ContractSuggestion(
        type=kind,
        strike=strike,
        expiration=expiration,
        dte_label=dte_label,
        distance_from_entry=strike - trade.entry_price,
    )


def suggest_for_plays(
    primary: Optional[Trade],
    alternate: Optional[Trade],
    expiration: date,
    **kwargs,
) -> tuple[Optional[ContractSuggestion], Optional[ContractSuggestion]]:
    """Suggest contracts for both plays at once. Either may be None."""
    p = suggest_contract(primary, expiration, **kwargs) if primary else None
    a = suggest_contract(alternate, expiration, **kwargs) if alternate else None
    return p, a
