"""Scenario classifier + plays for the ES six-line framework."""

from _lib.spx.scenario import ProjectedLine, build_plays, classify, explain_scenario


def _projected(
    swing_high_desc=5883.27,
    swing_low_asc=5864.95,
    prev_high=5899.68,
    prev_low=5823.93,
    swing_high_asc=5890.0,
    swing_low_desc=5850.0,
):
    return [
        ProjectedLine("SWING_HIGH_ASC", swing_high_asc),
        ProjectedLine("SWING_HIGH_DESC", swing_high_desc),
        ProjectedLine("SWING_LOW_ASC", swing_low_asc),
        ProjectedLine("SWING_LOW_DESC", swing_low_desc),
        ProjectedLine("PREV_RTH_HIGH_ASC", prev_high),
        ProjectedLine("PREV_RTH_LOW_DESC", prev_low),
    ]


def test_inside_when_price_between_active_swing_lines():
    assert classify("ASCENDING", 5872.0, _projected()) == "INSIDE_DESCENDING"


def test_above_when_price_above_both_swing_high_lines():
    assert classify("ASCENDING", 5891.0, _projected()) == "ABOVE_ASCENDING"


def test_below_when_price_below_both_swing_low_lines():
    assert classify("ASCENDING", 5840.0, _projected()) == "BELOW_DESCENDING"


def test_past_prev_refs_still_maps_to_outer_posture():
    assert classify("ASCENDING", 5901.0, _projected()) == "ABOVE_ASCENDING"
    assert classify("ASCENDING", 5820.0, _projected()) == "BELOW_DESCENDING"


def test_direction_argument_no_longer_controls_classification():
    assert classify("DESCENDING", 5872.0, _projected()) == "INSIDE_DESCENDING"
    assert classify("NONE", 5872.0, _projected()) == "INSIDE_DESCENDING"


def test_missing_six_line_framework_stands_down():
    partial = [ProjectedLine("PREV_RTH_HIGH_ASC", 5899.68)]
    assert classify("ASCENDING", 5872.0, partial) == "OUTSIDE_PLAY"


def test_inside_plays_sort_crossed_swing_lines():
    plays = build_plays("INSIDE_ASCENDING", _projected(swing_high_desc=5858.0, swing_low_asc=5867.0))
    assert plays.primary is not None and plays.alternate is not None
    assert plays.primary.side == "BUY"
    assert plays.primary.entry_line == "SWING_HIGH_DESC"
    assert plays.primary.exit_line == "SWING_LOW_ASC"
    assert plays.alternate.side == "SELL"
    assert plays.alternate.entry_line == "SWING_LOW_ASC"
    assert plays.alternate.exit_line == "SWING_HIGH_DESC"


def test_above_plays_use_prev_high_ascending_for_sell_entry():
    plays = build_plays("ABOVE_ASCENDING", _projected())
    assert plays.primary is not None and plays.alternate is not None
    assert plays.primary.side == "SELL"
    assert plays.primary.entry_line == "PREV_RTH_HIGH_ASC"
    assert plays.primary.exit_line == "SWING_HIGH_DESC"
    assert plays.alternate.side == "BUY"
    assert plays.alternate.entry_line == "SWING_HIGH_DESC"
    assert plays.alternate.exit_line == "PREV_RTH_HIGH_ASC"


def test_below_plays_use_prev_low_descending_for_buy_entry():
    plays = build_plays("BELOW_ASCENDING", _projected())
    assert plays.primary is not None and plays.alternate is not None
    assert plays.primary.side == "BUY"
    assert plays.primary.entry_line == "PREV_RTH_LOW_DESC"
    assert plays.primary.exit_line == "SWING_LOW_ASC"
    assert plays.alternate.side == "SELL"
    assert plays.alternate.entry_line == "SWING_LOW_ASC"
    assert plays.alternate.exit_line == "PREV_RTH_LOW_DESC"


def test_outside_play_returns_no_plays():
    plays = build_plays("OUTSIDE_PLAY", _projected())
    assert plays.primary is None
    assert plays.alternate is None


def test_unfavorable_play_prices_are_suppressed():
    plays = build_plays("ABOVE_ASCENDING", _projected(swing_high_desc=5905.0, prev_high=5899.0))
    assert plays.primary is None
    assert plays.alternate is None


def test_explain_inside_mentions_six_line_framework():
    text = explain_scenario("INSIDE_ASCENDING", 5872.0, _projected())
    assert "six-line" in text
    assert "hourly rejection" in text