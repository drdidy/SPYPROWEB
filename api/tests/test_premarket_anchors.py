"""Tests for the premarket-anchor entry model.

Pins the qualification rule (lower-low + green-follower), primary/anchor-2
selection, secondary collection, line construction (Upper/Main/Lower at
+/-3.4 with descending slope from candle timestamp), and trigger detection
with the 1.7-pt close-distance cap.
"""
from __future__ import annotations

from datetime import date, time

import pandas as pd

from _lib import prophet_core as pc
from _lib import premarket_anchors as pa


def _ct_index(rows):
    ct = pc.get_central_tz()
    idx = pd.DatetimeIndex([pd.Timestamp(t).tz_localize(ct) for t, *_ in rows])
    df = pd.DataFrame(
        {
            "Open":  [r[1] for r in rows],
            "High":  [r[2] for r in rows],
            "Low":   [r[3] for r in rows],
            "Close": [r[4] for r in rows],
        },
        index=idx,
    )
    return df


def _bear(o, l):
    c = o - 0.50
    h = o + 0.05
    return o, h, min(l, c) - 0.01, c


def _bull(o, h):
    c = o + 0.60
    l = o - 0.05
    return o, max(h, c) + 0.01, l, c


# anchor selection ----------------------------------------------------------

def test_no_qualifying_candle_returns_empty():
    rows = [
        ("2026-05-07 02:00", *_bull(580.0, 580.5)),
        ("2026-05-07 03:00", *_bull(580.4, 581.0)),
        ("2026-05-07 04:00", *_bull(580.7, 581.5)),
        ("2026-05-07 05:00", *_bull(581.1, 581.8)),
        ("2026-05-07 06:00", *_bull(581.3, 582.0)),
        ("2026-05-07 07:00", *_bull(581.5, 582.2)),
        ("2026-05-07 08:00", *_bull(581.6, 582.5)),
    ]
    df = _ct_index(rows)
    out = pa.find_premarket_anchors(df, date(2026, 5, 7))
    assert out["primary"] is None
    assert out["anchor2"] is None
    assert out["secondaries"] == []


def test_primary_picks_lowest_lower_low_with_green_follower():
    rows = [
        ("2026-05-07 02:00", 580.0, 580.5, 579.8, 580.3),
        ("2026-05-07 03:00", 580.3, 580.5, 579.7, 580.0),
        ("2026-05-07 04:00", 580.0, 580.2, 579.6, 579.85),
        ("2026-05-07 05:00", 579.85, 580.0, 579.0, 579.40),
        ("2026-05-07 06:00", *_bull(579.40, 580.20)),
        ("2026-05-07 07:00", *_bull(580.20, 580.80)),
        ("2026-05-07 08:00", *_bull(580.80, 581.20)),
    ]
    df = _ct_index(rows)
    out = pa.find_premarket_anchors(df, date(2026, 5, 7))
    assert out["primary"] is not None
    assert out["primary"].timestamp.hour == 5
    assert out["primary"].low == 579.0
    assert out["primary"].is_qualified is True
    assert out["primary"].next_bar_color == "green"
    assert out["anchor2"] is None
    sec_hours = sorted(s.timestamp.hour for s in out["secondaries"])
    assert 3 in sec_hours and 4 in sec_hours


def test_anchor2_added_only_when_7am_lower_and_qualifies():
    rows = [
        ("2026-05-07 02:00", *_bull(580.0, 580.4)),
        ("2026-05-07 03:00", *_bull(580.4, 580.8)),
        ("2026-05-07 04:00", 580.5, 580.9, 580.10, 580.20),
        ("2026-05-07 05:00", 580.20, 580.30, 579.50, 579.80),
        ("2026-05-07 06:00", *_bull(579.80, 580.50)),
        ("2026-05-07 07:00", 580.50, 580.55, 578.00, 578.20),
        ("2026-05-07 08:00", *_bull(578.20, 579.00)),
    ]
    df = _ct_index(rows)
    out = pa.find_premarket_anchors(df, date(2026, 5, 7))
    assert out["primary"].timestamp.hour == 5
    assert out["anchor2"] is not None
    assert out["anchor2"].timestamp.hour == 7
    assert out["anchor2"].low == 578.0


def test_anchor2_skipped_if_7am_not_lower_than_primary():
    rows = [
        ("2026-05-07 02:00", *_bull(580.0, 580.4)),
        ("2026-05-07 03:00", *_bull(580.4, 580.8)),
        ("2026-05-07 04:00", 580.5, 580.9, 580.10, 580.20),
        ("2026-05-07 05:00", 580.20, 580.30, 579.50, 579.80),
        ("2026-05-07 06:00", *_bull(579.80, 580.50)),
        ("2026-05-07 07:00", 580.50, 580.55, 579.80, 580.00),
        ("2026-05-07 08:00", *_bull(580.00, 580.40)),
    ]
    df = _ct_index(rows)
    out = pa.find_premarket_anchors(df, date(2026, 5, 7))
    assert out["primary"].timestamp.hour == 5
    assert out["anchor2"] is None


def test_red_with_red_follower_disqualifies_lowest_low():
    rows = [
        ("2026-05-07 02:00", *_bull(720.0, 720.5)),
        ("2026-05-07 03:00", *_bull(720.4, 720.8)),
        ("2026-05-07 04:00", 720.5, 720.7, 720.10, 720.20),
        ("2026-05-07 05:00", 720.20, 720.30, 716.46, 717.00),
        ("2026-05-07 06:00", 717.00, 717.20, 716.80, 716.90),
        ("2026-05-07 07:00", *_bull(716.90, 720.00)),
        ("2026-05-07 08:00", *_bull(720.00, 721.50)),
    ]
    df = _ct_index(rows)
    out = pa.find_premarket_anchors(df, date(2026, 5, 7))
    assert out["primary"] is None
    sec_hours = sorted(s.timestamp.hour for s in out["secondaries"])
    assert sec_hours == [4, 5, 6]


def test_user_example_6am_anchor_with_5am_lower_secondary():
    rows = [
        ("2026-05-07 02:00", *_bull(720.0, 720.5)),
        ("2026-05-07 03:00", *_bull(720.4, 720.8)),
        ("2026-05-07 04:00", *_bull(720.6, 721.0)),
        ("2026-05-07 05:00", 720.80, 720.90, 716.46, 717.00),
        ("2026-05-07 06:00", 717.00, 717.10, 716.20, 716.40),
        ("2026-05-07 07:00", *_bull(716.40, 720.00)),
        ("2026-05-07 08:00", *_bull(720.00, 721.50)),
    ]
    df = _ct_index(rows)
    out = pa.find_premarket_anchors(df, date(2026, 5, 7))
    assert out["primary"] is not None
    assert out["primary"].timestamp.hour == 6
    assert out["primary"].low == 716.20
    sec_hours = sorted(s.timestamp.hour for s in out["secondaries"])
    assert 5 in sec_hours


# line construction --------------------------------------------------------

def test_anchor_lines_returns_three_descending_lines_at_offset():
    ct = pc.get_central_tz()
    anchor = pa.PremarketAnchor(
        role="PRIMARY",
        timestamp=pd.Timestamp("2026-05-07 05:00", tz=ct),
        low=580.00, open=580.50, high=580.55, close=580.05,
        is_qualified=True, next_bar_color="green",
    )
    lines = pa.build_anchor_lines(anchor, slope=0.20)
    assert len(lines) == 3
    upper, main, lower = lines
    assert upper.zone_type == "CALL_ZONE"
    assert main.zone_type == "MAIN"
    assert lower.zone_type == "PUT_ZONE"
    assert upper.anchor_price == 580.0 + pa.ANCHOR_BAND_OFFSET
    assert main.anchor_price == 580.0
    assert lower.anchor_price == 580.0 - pa.ANCHOR_BAND_OFFSET
    for ln in lines:
        assert ln.direction == "descending"
        assert ln.is_primary is True
        assert ln.source == "premarket_anchor_primary"


def test_anchor_lines_descend_at_slope_to_9am():
    ct = pc.get_central_tz()
    anchor = pa.PremarketAnchor(
        role="PRIMARY",
        timestamp=pd.Timestamp("2026-05-07 05:00", tz=ct),
        low=580.00, open=580.50, high=580.55, close=580.05,
        is_qualified=True, next_bar_color="green",
    )
    lines = pa.build_anchor_lines(anchor, slope=0.20)
    main = lines[1]
    val_at_9 = main.tradable_value_at(pd.Timestamp("2026-05-07 09:00", tz=ct))
    assert val_at_9 == 579.20


# trigger detection --------------------------------------------------------

def _line_at(value, ts):
    return pc.DynamicLine(
        name="TEST_LINE",
        anchor_price=value,
        anchor_time=ts,
        slope_per_hour=0.0,
        direction="descending",
        zone_type="MAIN",
        source="test",
        is_primary=True,
        description="test",
    )


def test_buy_trigger_red_touch_close_above_within_band():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 581.00, "High": 581.20, "Low": 579.50, "Close": 580.50})
    assert pa.is_anchor_buy_trigger(row, line, ts) is True


def test_buy_trigger_rejects_when_close_too_far_above_line():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 583.00, "High": 583.10, "Low": 579.50, "Close": 582.00})
    assert pa.is_anchor_buy_trigger(row, line, ts) is False


def test_buy_trigger_rejects_when_close_below_line():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 580.50, "High": 580.60, "Low": 579.50, "Close": 579.80})
    assert pa.is_anchor_buy_trigger(row, line, ts) is False


def test_buy_trigger_rejects_when_wick_does_not_touch():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 581.00, "High": 581.10, "Low": 580.30, "Close": 580.40})
    assert pa.is_anchor_buy_trigger(row, line, ts) is False


def test_buy_trigger_rejects_green_candle():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 579.80, "High": 580.80, "Low": 579.50, "Close": 580.50})
    assert pa.is_anchor_buy_trigger(row, line, ts) is False


def test_sell_trigger_green_touch_close_below_within_band():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 579.00, "High": 580.50, "Low": 578.80, "Close": 579.50})
    assert pa.is_anchor_sell_trigger(row, line, ts) is True


def test_sell_trigger_rejects_when_close_too_far_below_line():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 577.00, "High": 580.50, "Low": 576.80, "Close": 578.00})
    assert pa.is_anchor_sell_trigger(row, line, ts) is False


def test_sell_trigger_rejects_when_close_above_line():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 579.50, "High": 580.50, "Low": 579.40, "Close": 580.30})
    assert pa.is_anchor_sell_trigger(row, line, ts) is False


def test_sell_trigger_rejects_red_candle():
    ct = pc.get_central_tz()
    ts = pd.Timestamp("2026-05-07 10:00", tz=ct)
    line = _line_at(580.00, ts)
    row = pd.Series({"Open": 580.20, "High": 580.50, "Low": 579.30, "Close": 579.50})
    assert pa.is_anchor_sell_trigger(row, line, ts) is False


def test_detect_anchor_triggers_emits_one_per_touched_line():
    ct = pc.get_central_tz()
    rows = [
        ("2026-05-07 09:00", 580.50, 581.00, 580.20, 580.80),
        ("2026-05-07 10:00", 581.20, 581.30, 579.80, 580.40),
        ("2026-05-07 11:00", 580.40, 580.50, 580.10, 580.20),
    ]
    df = _ct_index(rows)
    line = _line_at(580.00, df.index[0])
    triggers = pa.detect_anchor_triggers(df, [line])
    assert len(triggers) == 1
    t = triggers[0]
    assert t.direction == "BUY"
    assert t.candle_time.hour == 10
    assert t.expected_entry_time.hour == 11


# 9 AM zone preliminary read -----------------------------------------------

def test_anchor_open_zone_categorizes_price():
    ct = pc.get_central_tz()
    ts_anchor = pd.Timestamp("2026-05-07 05:00", tz=ct)
    ts_9 = pd.Timestamp("2026-05-07 09:00", tz=ct)
    anchor = pa.PremarketAnchor(
        role="PRIMARY", timestamp=ts_anchor, low=580.0, open=580.5,
        high=580.55, close=580.05, is_qualified=True, next_bar_color="green",
    )
    lines = pa.build_anchor_lines(anchor, slope=0.20)
    assert pa.anchor_open_zone(583.50, lines, ts_9) == "ABOVE_UPPER"
    assert pa.anchor_open_zone(581.00, lines, ts_9) == "UPPER_TO_MAIN"
    assert pa.anchor_open_zone(577.00, lines, ts_9) == "MAIN_TO_LOWER"
    assert pa.anchor_open_zone(575.00, lines, ts_9) == "BELOW_LOWER"
