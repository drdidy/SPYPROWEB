"""Scenario classifier + plays."""
import pytest

from _lib.spx.scenario import ProjectedLine, build_plays, classify, explain_scenario


def _projected(ceiling=5883.27, floor=5864.95, prev_high=5899.68, prev_low=5823.93):
    return [
        ProjectedLine("CHANNEL_CEILING", ceiling),
        ProjectedLine("CHANNEL_FLOOR", floor),
        ProjectedLine("PREV_RTH_HIGH_ASC", prev_high),
        ProjectedLine("PREV_RTH_LOW_DESC", prev_low),
    ]


def test_inside_ascending_when_price_between_rails():
    s = classify("ASCENDING", 5872.0, _projected())
    assert s == "INSIDE_ASCENDING"


def test_above_ascending_when_price_above_ceiling():
    s = classify("ASCENDING", 5890.0, _projected())
    assert s == "ABOVE_ASCENDING"


def test_below_ascending_when_price_below_floor():
    s = classify("ASCENDING", 5860.0, _projected())
    assert s == "BELOW_ASCENDING"


def test_outside_play_when_above_prev_high_ref():
    s = classify("ASCENDING", 5901.0, _projected())  # > 5899.68
    assert s == "OUTSIDE_PLAY"


def test_outside_play_when_below_prev_low_ref():
    s = classify("ASCENDING", 5820.0, _projected())  # < 5823.93
    assert s == "OUTSIDE_PLAY"


def test_descending_classification_mirrors():
    # Same projected values but DESCENDING direction.
    assert classify("DESCENDING", 5872.0, _projected()) == "INSIDE_DESCENDING"
    assert classify("DESCENDING", 5890.0, _projected()) == "ABOVE_DESCENDING"
    assert classify("DESCENDING", 5860.0, _projected()) == "BELOW_DESCENDING"


def test_none_direction_always_outside_play():
    assert classify("NONE", 5872.0, _projected()) == "OUTSIDE_PLAY"


def test_inverted_channel_rails_stand_down():
    assert classify("ASCENDING", 5872.0, _projected(ceiling=5860.0, floor=5880.0)) == "OUTSIDE_PLAY"


def test_inside_plays_buy_floor_sell_ceiling():
    plays = build_plays("INSIDE_ASCENDING", _projected())
    assert plays.primary is not None and plays.alternate is not None
    assert plays.primary.side == "BUY"
    assert plays.primary.entry_line == "CHANNEL_FLOOR"
    assert plays.primary.exit_line == "CHANNEL_CEILING"
    assert plays.alternate.side == "SELL"
    assert plays.alternate.entry_line == "CHANNEL_CEILING"
    assert plays.alternate.exit_line == "CHANNEL_FLOOR"


def test_above_plays_use_ceiling_and_prev_high_ref():
    plays = build_plays("ABOVE_ASCENDING", _projected())
    assert plays.primary.entry_line == "CHANNEL_CEILING"
    assert plays.primary.exit_line == "PREV_RTH_HIGH_ASC"
    assert plays.alternate.entry_line == "PREV_RTH_HIGH_ASC"
    assert plays.alternate.exit_line == "CHANNEL_CEILING"


def test_below_plays_use_prev_low_ref_and_floor():
    plays = build_plays("BELOW_ASCENDING", _projected())
    assert plays.primary.entry_line == "PREV_RTH_LOW_DESC"
    assert plays.primary.exit_line == "CHANNEL_FLOOR"
    assert plays.alternate.entry_line == "CHANNEL_FLOOR"
    assert plays.alternate.exit_line == "PREV_RTH_LOW_DESC"


def test_outside_play_returns_no_plays():
    plays = build_plays("OUTSIDE_PLAY", _projected())
    assert plays.primary is None
    assert plays.alternate is None


def test_unfavorable_play_prices_are_suppressed():
    plays = build_plays("ABOVE_ASCENDING", _projected(ceiling=5890.0, prev_high=5880.0))
    assert plays.primary is None
    assert plays.alternate is None


def test_explain_inside_mentions_distances():
    text = explain_scenario("INSIDE_ASCENDING", 5872.0, _projected())
    assert "above floor" in text
    assert "below ceiling" in text
