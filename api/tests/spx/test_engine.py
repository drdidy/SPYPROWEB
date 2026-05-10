"""End-to-end: ES candles + offset -> SPXSnapshot."""
import pytest

from _lib.spx import compute_snapshot


def test_snapshot_basic_shape(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.symbol == "SPX"
    assert snap.session_date_ct == "2026-05-08"
    # Channel resolves ASCENDING from synthetic Tokyo HH+HL.
    assert snap.channel.direction == "ASCENDING"
    # Four lines: 2 channel rails + 2 prev-RTH refs.
    assert len(snap.lines) == 4
    kinds = {l.kind for l in snap.lines}
    assert kinds == {"CHANNEL_FLOOR", "CHANNEL_CEILING", "PREV_RTH_HIGH_ASC", "PREV_RTH_LOW_DESC"}


def test_snapshot_inside_ascending_with_plays(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.scenario == "INSIDE_ASCENDING"
    assert snap.plays.primary is not None
    assert snap.plays.alternate is not None
    assert snap.plays.primary.side == "BUY"
    assert snap.plays.primary.entry_line == "CHANNEL_FLOOR"
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
    assert len(snap.confluence.factors) == 5


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


def test_snapshot_price_is_last_close_in_spx_space(es_candles_ascending_inside, es_offset, as_of):
    """ES candle close + offset = SPX last."""
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    # Last bar before 09:35 is the 09:00 bar with c=5872.00 (in SPX space).
    assert snap.price.last == pytest.approx(5872.00)


def test_snapshot_rejects_empty_candles(as_of):
    with pytest.raises(ValueError):
        compute_snapshot([], 12.0, as_of)
