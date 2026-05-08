"""Contract suggestion: 0DTE OTM strikes ~22.5 pts from entry."""
from datetime import date

from _lib.spx.contracts import suggest_contract
from _lib.spx.scenario import Trade


def _buy(entry: float) -> Trade:
    return Trade(
        side="BUY",
        entry_line="CHANNEL_FLOOR", entry_price=entry,
        exit_line="CHANNEL_CEILING", exit_price=entry + 18.32,
    )


def _sell(entry: float) -> Trade:
    return Trade(
        side="SELL",
        entry_line="CHANNEL_CEILING", entry_price=entry,
        exit_line="CHANNEL_FLOOR", exit_price=entry - 18.32,
    )


def test_buy_yields_call_rounded_up():
    # Entry 5864.95; +22.5 = 5887.45; round UP to 5pt board -> 5890.
    c = suggest_contract(_buy(5864.95), expiration=date(2026, 5, 8))
    assert c.type == "CALL"
    assert c.strike == 5890.0
    assert c.distance_from_entry > 22.5
    assert c.dte_label == "0DTE"
    assert c.expiration == date(2026, 5, 8)


def test_sell_yields_put_rounded_down():
    # Entry 5883.27; -22.5 = 5860.77; round DOWN to 5pt board -> 5860.
    c = suggest_contract(_sell(5883.27), expiration=date(2026, 5, 8))
    assert c.type == "PUT"
    assert c.strike == 5860.0
    assert c.distance_from_entry < -22.5  # OTM by more than 22.5


def test_distance_signed_relative_to_entry():
    c_call = suggest_contract(_buy(5864.95), expiration=date(2026, 5, 8))
    assert c_call.distance_from_entry == c_call.strike - 5864.95
    c_put = suggest_contract(_sell(5883.27), expiration=date(2026, 5, 8))
    assert c_put.distance_from_entry == c_put.strike - 5883.27


def test_otm_distance_override():
    # Bigger distance -> further-out strike.
    c = suggest_contract(_buy(5864.95), expiration=date(2026, 5, 8), otm_distance=40)
    assert c.strike >= 5905.0  # 5864.95 + 40 = 5904.95 -> round up to 5905
