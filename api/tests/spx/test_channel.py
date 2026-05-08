"""Channel: anchor extraction, direction selector, line build, projection."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from _lib.spx.channel import (
    Anchor,
    SessionRange,
    build_lines,
    determine_channel,
    overnight_anchors,
    prev_rth_anchors,
    project_line,
    sydney_range,
    tokyo_range,
)
from _lib.spx.offset import apply_offset_to_series


CT = ZoneInfo("America/Chicago")


def _spx(es_candles, offset):
    return apply_offset_to_series(es_candles, offset)


def test_overnight_anchors_ascending_uses_highest_and_lowest_close(
    es_candles_ascending_inside, es_offset, session_date
):
    """For an ASCENDING channel: anchors are the highest CLOSE and the
    lowest CLOSE of the overnight window (15:00 prev -> 00:00 today).
    Wicks are ignored.
    """
    spx = _spx(es_candles_ascending_inside, es_offset)
    high, low = overnight_anchors(spx, session_date, direction="ASCENDING")
    # 23:00 bar's close is 5870.00 (its h=5872.40 wick is intentionally
    # NOT used). 5870 is the highest close in the window.
    assert high.price == pytest.approx(5870.00)
    assert high.time == datetime(2026, 5, 7, 23, 0, tzinfo=CT)
    # 17:00 bar's close is 5850.00 (its l=5848.20 wick is NOT used).
    # 5850 is the lowest close in the window.
    assert low.price == pytest.approx(5850.00)
    assert low.time == datetime(2026, 5, 7, 17, 0, tzinfo=CT)


def test_overnight_anchors_descending_uses_raw_wicks(
    es_candles_ascending_inside, es_offset, session_date
):
    """For a DESCENDING channel: anchors are the raw highest WICK and
    lowest WICK (h, l). The synthetic data is ascending-shaped but we
    can still ask for the descending-rule anchors and verify they're the
    raw extremes.
    """
    spx = _spx(es_candles_ascending_inside, es_offset)
    high, low = overnight_anchors(spx, session_date, direction="DESCENDING")
    # Raw highest wick in window is 5872.40 (the 23:00 bar's h).
    assert high.price == pytest.approx(5872.40)
    # Raw lowest wick in window is 5848.20 (the 17:00 bar's l).
    assert low.price == pytest.approx(5848.20)


def test_overnight_anchors_window_excludes_after_midnight(
    es_candles_ascending_inside, es_offset, session_date
):
    """Overnight scanning stops at midnight CT — the 00:00 and 01:00
    bars are NOT candidates even though they're inside the Tokyo
    session window used for direction determination."""
    spx = _spx(es_candles_ascending_inside, es_offset)
    high, low = overnight_anchors(spx, session_date, direction="ASCENDING")
    midnight = datetime(2026, 5, 8, 0, 0, tzinfo=CT)
    assert high.time < midnight
    assert low.time < midnight


def test_sydney_range_reads_only_sydney_bars(es_candles_ascending_inside, es_offset, session_date):
    spx = _spx(es_candles_ascending_inside, es_offset)
    syd = sydney_range(spx, session_date)
    assert syd is not None
    assert syd.high == pytest.approx(5862.10)
    assert syd.low == pytest.approx(5848.20)


def test_tokyo_range_higher_than_sydney(es_candles_ascending_inside, es_offset, session_date):
    spx = _spx(es_candles_ascending_inside, es_offset)
    syd = sydney_range(spx, session_date)
    tky = tokyo_range(spx, session_date)
    assert tky is not None and syd is not None
    assert tky.high > syd.high
    assert tky.low > syd.low  # HH + HL


def test_determine_channel_ascending_when_tokyo_HH_HL(es_candles_ascending_inside, es_offset, session_date):
    spx = _spx(es_candles_ascending_inside, es_offset)
    syd = sydney_range(spx, session_date)
    tky = tokyo_range(spx, session_date)
    ch = determine_channel(syd, tky)
    assert ch.direction == "ASCENDING"
    assert "rising" in ch.reason.lower() or "ascending" in ch.reason.lower()


def test_determine_channel_descending_when_tokyo_LH_LL():
    syd = SessionRange(
        high=5870.0, low=5850.0,
        high_time=datetime(2026, 5, 7, 20, tzinfo=CT),
        low_time=datetime(2026, 5, 7, 17, tzinfo=CT),
    )
    tky = SessionRange(
        high=5860.0, low=5840.0,
        high_time=datetime(2026, 5, 7, 22, tzinfo=CT),
        low_time=datetime(2026, 5, 8, 1, tzinfo=CT),
    )
    ch = determine_channel(syd, tky)
    assert ch.direction == "DESCENDING"


def test_determine_channel_expansion_when_higher_high_lower_low():
    syd = SessionRange(
        high=5870.0, low=5860.0,
        high_time=datetime(2026, 5, 7, 20, tzinfo=CT),
        low_time=datetime(2026, 5, 7, 17, tzinfo=CT),
    )
    tky = SessionRange(
        high=5875.0, low=5855.0,  # HH + LL
        high_time=datetime(2026, 5, 7, 22, tzinfo=CT),
        low_time=datetime(2026, 5, 8, 1, tzinfo=CT),
    )
    ch = determine_channel(syd, tky)
    assert ch.direction == "NONE"
    assert ch.no_channel_reason == "EXPANSION"


def test_determine_channel_contraction_when_lower_high_higher_low():
    syd = SessionRange(
        high=5870.0, low=5850.0,
        high_time=datetime(2026, 5, 7, 20, tzinfo=CT),
        low_time=datetime(2026, 5, 7, 17, tzinfo=CT),
    )
    tky = SessionRange(
        high=5865.0, low=5855.0,  # LH + HL
        high_time=datetime(2026, 5, 7, 22, tzinfo=CT),
        low_time=datetime(2026, 5, 8, 1, tzinfo=CT),
    )
    ch = determine_channel(syd, tky)
    assert ch.direction == "NONE"
    assert ch.no_channel_reason == "CONTRACTION"


def test_prev_rth_anchors_reads_thursday(es_candles_ascending_inside, es_offset, session_date):
    spx = _spx(es_candles_ascending_inside, es_offset)
    res = prev_rth_anchors(spx, session_date)
    assert res is not None
    high, low = res
    assert high.price == pytest.approx(5878.50)
    assert low.price == pytest.approx(5849.00)


def test_build_lines_ascending_has_four_lines(es_candles_ascending_inside, es_offset, session_date):
    spx = _spx(es_candles_ascending_inside, es_offset)
    high, low = overnight_anchors(spx, session_date)
    prev = prev_rth_anchors(spx, session_date)
    lines = build_lines(
        direction="ASCENDING",
        overnight_high=high,
        overnight_low=low,
        prev_rth_high=prev[0],
        prev_rth_low=prev[1],
    )
    kinds = {l.kind for l in lines}
    assert kinds == {"CHANNEL_FLOOR", "CHANNEL_CEILING", "PREV_RTH_HIGH_ASC", "PREV_RTH_LOW_DESC"}


def test_build_lines_none_direction_omits_channel_rails():
    high = Anchor(price=5872.40, time=datetime(2026, 5, 7, 23, tzinfo=CT))
    low = Anchor(price=5848.20, time=datetime(2026, 5, 7, 17, tzinfo=CT))
    lines = build_lines(direction="NONE", overnight_high=high, overnight_low=low,
                        prev_rth_high=None, prev_rth_low=None)
    assert lines == []


def test_project_line_arithmetic():
    from _lib.spx.channel import Line
    anchor_t = datetime(2026, 5, 7, 17, tzinfo=CT)
    line = Line("CHANNEL_FLOOR", Anchor(5848.20, anchor_t), 1.05)
    # 16 hours later: 5848.20 + 16 * 1.05 = 5865.00
    later = datetime(2026, 5, 8, 9, tzinfo=CT)
    assert project_line(line, later) == pytest.approx(5865.00)
