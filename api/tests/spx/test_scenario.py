"""Scenario classifier + plays for the ES previous-RTH pivot framework."""

from _lib.spx.scenario import ProjectedLine, build_plays, classify, explain_scenario


def _projected(
    high_desc=5883.27,
    low_desc=5823.93,
    high_asc=5899.68,
    low_asc=5864.95,
    legacy_high_desc=5883.27,
    legacy_low_asc=5864.95,
):
    return [
        ProjectedLine("PREV_RTH_HIGH_ASC", high_asc),
        ProjectedLine("PREV_RTH_HIGH_DESC", high_desc),
        ProjectedLine("PREV_RTH_LOW_ASC", low_asc),
        ProjectedLine("PREV_RTH_LOW_DESC", low_desc),
        ProjectedLine("SWING_HIGH_DESC", legacy_high_desc),
        ProjectedLine("SWING_LOW_ASC", legacy_low_asc),
    ]


def test_inside_when_price_between_active_swing_lines():
    assert classify("ASCENDING", 5872.0, _projected()) == "INSIDE_DESCENDING"


def test_above_when_price_above_both_swing_high_lines():
    assert classify("ASCENDING", 5891.0, _projected()) == "ABOVE_DESCENDING"


def test_below_when_price_below_both_swing_low_lines():
    assert classify("ASCENDING", 5820.0, _projected()) == "BELOW_DESCENDING"


def test_past_prev_refs_still_maps_to_outer_posture():
    assert classify("ASCENDING", 5901.0, _projected()) == "ABOVE_DESCENDING"
    assert classify("ASCENDING", 5820.0, _projected()) == "BELOW_DESCENDING"


def test_direction_argument_no_longer_controls_classification():
    assert classify("DESCENDING", 5872.0, _projected()) == "INSIDE_DESCENDING"
    assert classify("NONE", 5872.0, _projected()) == "INSIDE_DESCENDING"


def test_missing_six_line_framework_stands_down():
    partial = [ProjectedLine("PREV_RTH_HIGH_ASC", 5899.68)]
    assert classify("ASCENDING", 5872.0, partial) == "OUTSIDE_PLAY"


def test_inside_plays_sort_crossed_swing_lines():
    plays = build_plays("INSIDE_ASCENDING", _projected(high_desc=5858.0, low_desc=5824.0))
    assert plays.primary is not None and plays.alternate is not None
    assert plays.primary.side == "BUY"
    assert plays.primary.entry_line == "PREV_RTH_LOW_DESC"
    assert plays.primary.exit_line == "PREV_RTH_HIGH_DESC"
    assert plays.alternate.side == "SELL"
    assert plays.alternate.entry_line == "PREV_RTH_HIGH_DESC"
    assert plays.alternate.exit_line == "PREV_RTH_LOW_DESC"


def test_above_plays_use_prev_high_ascending_for_sell_entry():
    plays = build_plays("ABOVE_ASCENDING", _projected())
    assert plays.primary is not None and plays.alternate is not None
    assert plays.primary.side == "SELL"
    assert plays.primary.entry_line == "PREV_RTH_HIGH_ASC"
    assert plays.primary.exit_line == "PREV_RTH_HIGH_DESC"
    assert plays.alternate.side == "BUY"
    assert plays.alternate.entry_line == "PREV_RTH_HIGH_DESC"
    assert plays.alternate.exit_line == "PREV_RTH_HIGH_ASC"


def test_below_plays_use_prev_low_descending_for_buy_entry():
    plays = build_plays("BELOW_ASCENDING", _projected())
    assert plays.primary is not None and plays.alternate is not None
    assert plays.primary.side == "BUY"
    assert plays.primary.entry_line == "PREV_RTH_LOW_DESC"
    assert plays.primary.exit_line == "PREV_RTH_HIGH_DESC"
    assert plays.alternate.side == "SELL"
    assert plays.alternate.entry_line == "PREV_RTH_HIGH_DESC"
    assert plays.alternate.exit_line == "PREV_RTH_LOW_DESC"


def test_outside_play_returns_no_plays():
    plays = build_plays("OUTSIDE_PLAY", _projected())
    assert plays.primary is None
    assert plays.alternate is None


def test_unfavorable_play_prices_are_suppressed():
    plays = build_plays("ABOVE_ASCENDING", _projected(high_desc=5905.0, high_asc=5899.0))
    assert plays.primary is None
    assert plays.alternate is None


def test_explain_inside_mentions_previous_rth_framework():
    text = explain_scenario("INSIDE_ASCENDING", 5872.0, _projected())
    assert "previous-RTH" in text
    assert "hourly touch-and-close" in text
