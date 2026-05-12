"""SPX replay grading requires an actual rail tag and a one-hour exit."""
from __future__ import annotations

from datetime import date, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from spx.snapshot import _build_spx_replay_block

CT = ZoneInfo("America/Chicago")


def _payload(action: str = "STAND_DOWN", direction: str = "ASCENDING", offset: float = 28.0):
    return {
        "confluence": {"action": action, "score": 0.5},
        "channel": {"direction": direction, "reason": ""},
        "_meta": {"appliedOffset": offset},
        "plays": {
            "primary": {
                "side": "BUY",
                "entryLine": "SWING_LOW_ASC",
                "entryPrice": 100.0,
                "exitLine": "SWING_HIGH_DESC",
                "exitPrice": 110.0,
            },
            "alternate": {
                "side": "SELL",
                "entryLine": "SWING_HIGH_DESC",
                "entryPrice": 110.0,
                "exitLine": "SWING_LOW_ASC",
                "exitPrice": 100.0,
            }
        },
        "lines": [
            {
                "kind": "SWING_LOW_ASC",
                "anchorPrice": 100.0,
                "anchorTime": "2026-05-08T09:00:00-05:00",
                "slopePerHour": 0.0,
            },
            {
                "kind": "SWING_HIGH_DESC",
                "anchorPrice": 110.0,
                "anchorTime": "2026-05-08T09:00:00-05:00",
                "slopePerHour": 0.0,
            },
        ],
        "invalidation": {"level": 100.0, "stopOffset": 2.0},
    }


def _ohlc(open_: float = 100.0, close: float = 105.0):
    return {"open": open_, "close": close}


def _bar(hour: int, high: float, low: float, close: float):
    return {
        "time": datetime(2026, 5, 8, hour, 0, tzinfo=CT),
        "open": close,
        "high": high,
        "low": low,
        "close": close,
    }


def test_replay_grades_win_after_entry_rail_tag_and_one_hour_exit():
    with (
        patch("spx.snapshot._spx_session_ohlc", return_value=_ohlc()),
        patch("spx.snapshot._spx_session_intraday", return_value=[
            _bar(9, high=106.0, low=100.0, close=104.0),
            _bar(10, high=111.0, low=103.0, close=110.5),
        ]),
    ):
        block = _build_spx_replay_block(_payload(), date(2026, 5, 8))
    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 10.5


def test_replay_no_tag_is_not_credited_by_day_net():
    with (
        patch("spx.snapshot._spx_session_ohlc", return_value=_ohlc(open_=100.0, close=120.0)),
        patch("spx.snapshot._spx_session_intraday", return_value=[
            _bar(9, high=109.0, low=101.0, close=108.0),
        ]),
    ):
        block = _build_spx_replay_block(_payload(), date(2026, 5, 8))
    assert block["session"]["netPts"] == 20.0
    assert block["verdictOutcome"] == "N_A"
    assert block["verdictPnl"] is None


def test_replay_grades_alternate_when_it_is_first_touched_entry():
    with (
        patch("spx.snapshot._spx_session_ohlc", return_value=_ohlc(open_=100.0, close=99.0)),
        patch("spx.snapshot._spx_session_intraday", return_value=[
            _bar(9, high=110.0, low=104.0, close=108.0),
            _bar(10, high=109.0, low=101.0, close=102.0),
        ]),
    ):
        block = _build_spx_replay_block(_payload(), date(2026, 5, 8))
    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 8.0


def test_replay_one_hour_exit_can_be_loss():
    with (
        patch("spx.snapshot._spx_session_ohlc", return_value=_ohlc()),
        patch("spx.snapshot._spx_session_intraday", return_value=[
            _bar(9, high=101.0, low=100.0, close=100.5),
            _bar(10, high=101.0, low=97.5, close=98.0),
        ]),
    ):
        block = _build_spx_replay_block(_payload(), date(2026, 5, 8))
    assert block["verdictOutcome"] == "LOSS"
    assert block["verdictPnl"] == -2.0


def test_no_channel_direction_stays_n_a():
    with (
        patch("spx.snapshot._spx_session_ohlc", return_value=_ohlc()),
        patch("spx.snapshot._spx_session_intraday", return_value=[
            _bar(9, high=111.0, low=100.0, close=110.0),
        ]),
    ):
        block = _build_spx_replay_block(_payload(direction="NONE"), date(2026, 5, 8))
    assert block["verdictOutcome"] == "N_A"
    assert block["verdictPnl"] is None


def test_replay_date_none_returns_skeleton():
    block = _build_spx_replay_block(_payload(action="TAKE"), None)
    assert block["isReplay"] is False
    assert block["date"] is None
    assert block["verdictOutcome"] is None
    assert block["session"] is None
