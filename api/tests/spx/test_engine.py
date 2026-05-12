"""End-to-end: ES candles + offset -> SPXSnapshot."""
import pytest

from _lib.spx import compute_snapshot


def test_snapshot_basic_shape(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.symbol == "SPX"
    assert snap.session_date_ct == "2026-05-08"
    # Six-line framework is active after overnight swing closes resolve.
    assert snap.channel.direction == "ASCENDING"
    assert len(snap.lines) == 6
    kinds = {l.kind for l in snap.lines}
    assert kinds == {
        "PREV_RTH_HIGH_ASC",
        "PREV_RTH_LOW_DESC",
        "SWING_HIGH_ASC",
        "SWING_HIGH_DESC",
        "SWING_LOW_ASC",
        "SWING_LOW_DESC",
    }
    assert snap.rth_bias is not None
    assert snap.rth_bias.reference_line in ("SWING_HIGH_DESC", "SWING_LOW_ASC")


def test_snapshot_inside_ascending_with_plays(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.scenario == "INSIDE_DESCENDING"
    assert snap.plays.primary is not None
    assert snap.plays.alternate is not None
    assert snap.plays.primary.side == "BUY"
    assert snap.plays.primary.entry_line in ("SWING_HIGH_DESC", "SWING_LOW_ASC")
    assert snap.plays.alternate.side == "SELL"


def test_snapshot_invalidation_uses_entry_rail(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.plays.primary is not None
    assert snap.invalidation is not None
    assert snap.invalidation.level == pytest.approx(snap.plays.primary.entry_price)


def test_snapshot_contracts_match_play_sides(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.contracts.for_primary is not None
    assert snap.contracts.for_alternate is not None
    assert snap.contracts.for_primary.type == "CALL"   # primary is BUY
    assert snap.contracts.for_alternate.type == "PUT"  # alternate is SELL
    # SPX 5pt board.
    assert snap.contracts.for_primary.strike % 5 == 0
    assert snap.contracts.for_alternate.strike % 5 == 0


def test_snapshot_confluence_action_present(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.confluence.action in ("TAKE", "SELECTIVE", "STAND_DOWN")
    assert 0 <= snap.confluence.score <= 100
    assert len(snap.confluence.factors) == 3


def test_snapshot_serializes_to_camelcase_json(es_candles_ascending_inside, es_offset, as_of):
    """The schema uses camelCase aliases so the JSON matches the TS contract."""
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    js = snap.model_dump(by_alias=True)
    # camelCase keys at top level
    assert "asOf" in js
    assert "sessionDateCT" in js
    assert "scenarioExplanation" in js
    assert "reentryWatch" in js
    # nested camelCase
    assert "changePct" in js["price"]
    assert "currentValue" in js["lines"][0]


def test_snapshot_price_is_last_close_in_native_es_space(es_candles_ascending_inside, es_offset, as_of):
    """ES Channel keeps the displayed price and structure lines native to ES."""
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    # Last bar before 09:35 is the 09:00 ES bar with c=5860.00.
    assert snap.price.last == pytest.approx(5860.00)


def test_snapshot_six_lines_do_not_apply_es_to_spx_offset(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    by_kind = {line.kind: line for line in snap.lines}

    assert by_kind["SWING_HIGH_ASC"].anchor_price == pytest.approx(5858.00)
    assert by_kind["SWING_HIGH_ASC"].entry_value == pytest.approx(5868.40)
    assert by_kind["SWING_HIGH_DESC"].entry_value == pytest.approx(5847.60)
    assert by_kind["SWING_LOW_ASC"].anchor_price == pytest.approx(5838.00)
    assert by_kind["SWING_LOW_ASC"].entry_value == pytest.approx(5854.64)
    assert by_kind["SWING_LOW_DESC"].entry_value == pytest.approx(5821.36)
    assert by_kind["PREV_RTH_HIGH_ASC"].anchor_price == pytest.approx(5866.50)
    assert by_kind["PREV_RTH_HIGH_ASC"].entry_value == pytest.approx(5862.34)
    assert by_kind["PREV_RTH_LOW_DESC"].anchor_price == pytest.approx(5837.00)
    assert by_kind["PREV_RTH_LOW_DESC"].entry_value == pytest.approx(5837.00)


def test_snapshot_rejects_empty_candles(as_of):
    with pytest.raises(ValueError):
        compute_snapshot([], 12.0, as_of)
