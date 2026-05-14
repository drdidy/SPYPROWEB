from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

from _lib.data_sources import (
    _build_replay_block,
    _replay_touch_window_entry,
    _spy_state_from_touch_window,
    _triggers_from_lines,
)
from _lib.prophet_core import DynamicLine

CT = ZoneInfo("America/Chicago")


def _ts(hour: int, minute: int = 0) -> pd.Timestamp:
    return pd.Timestamp(datetime(2026, 5, 5, hour, minute, tzinfo=CT))


def _frame(entry_open: float, exit_close: float) -> pd.DataFrame:
    idx = [_ts(8, 30), _ts(9, 30)]
    return pd.DataFrame(
        {
            "Open": [entry_open, exit_close - 0.25],
            "High": [max(entry_open, exit_close), exit_close + 0.25],
            "Low": [min(entry_open, exit_close) - 0.25, exit_close - 0.25],
            "Close": [entry_open + 0.25, exit_close],
        },
        index=idx,
    )


def _window_touch_frame() -> pd.DataFrame:
    idx = [_ts(9), _ts(10), _ts(11)]
    return pd.DataFrame(
        {
            "Open": [101.0, 103.5, 104.0],
            "High": [103.0, 105.0, 104.5],
            "Low": [99.75, 103.0, 103.5],
            "Close": [102.5, 104.0, 104.25],
        },
        index=idx,
    )


def _trigger(line: str, level: float) -> dict:
    return {
        "line": line,
        "kind": "ANC_DESC",
        "level": level,
        "entryLevel": level,
        "dist": 0.0,
        "bps": 0,
        "bias": 0,
        "status": "WATCHING",
    }


def _line(name: str, price: float) -> DynamicLine:
    return DynamicLine(
        name=name,
        anchor_price=price,
        anchor_time=_ts(8, 30),
        slope_per_hour=0.0,
        direction="descending",
        zone_type="CALL_ZONE",
        source="PRIMARY_HIGH",
        is_primary=True,
        description="test primary structure",
    )


def test_spy_replay_grades_first_9_to_11_reference_touch_to_hour_close():
    bars = _window_touch_frame()

    block = _build_replay_block(
        is_replay=True,
        signal_day=_ts(9).date(),
        rth_today=bars,
        decision={},
        primary_lines=[_line("UPPER", 100.0)],
        signals=[],
        intraday_5m=bars,
        triggers=[_trigger("Upper ref", 100.0)],
    )

    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 2.5
    assert block["entry"]["rule"] == "ENTRY_WINDOW_TOUCH"
    assert block["entry"]["line"] == "Upper ref"
    assert block["exit"]["rule"] == "HOURLY_CLOSE"


def test_spy_triggers_use_8am_reference_but_9_to_11_touch_window():
    rows = _triggers_from_lines(
        primary_lines=[_line("UPPER", 100.0)],
        current_dt=_ts(10).to_pydatetime(),
        current_price=101.0,
        rth_today=pd.DataFrame(),
        rth_yesterday=pd.DataFrame(),
        entry_reference_dt=_ts(8).to_pydatetime(),
        slope=0.0,
    )

    assert rows[0]["entryReferenceTime"] == _ts(8).isoformat()
    assert rows[0]["touchWindowStart"] == _ts(9).isoformat()
    assert rows[0]["touchWindowEnd"] == _ts(11).isoformat()


def test_spy_replay_includes_11am_ct_candle_in_plan_window():
    bars = pd.DataFrame(
        {
            "Open": [104.0],
            "High": [105.0],
            "Low": [99.75],
            "Close": [102.5],
        },
        index=[_ts(11)],
    )

    block = _build_replay_block(
        is_replay=True,
        signal_day=_ts(11).date(),
        rth_today=bars,
        decision={},
        primary_lines=[_line("UPPER", 100.0)],
        signals=[],
        intraday_5m=bars,
        triggers=[_trigger("Upper ref", 100.0)],
    )

    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 2.5
    assert block["entry"]["time"] == _ts(11).isoformat()


def test_live_spy_state_uses_touch_window_trade_lifecycle():
    touch = {
        "entry_time": _ts(9, 30),
        "exit_time": _ts(10, 30),
    }

    assert _spy_state_from_touch_window(_ts(10), touch) == "GO"
    assert _spy_state_from_touch_window(_ts(11), touch) == "COOLDOWN"


def test_spy_live_touch_window_aggregates_5m_bars_to_completed_hour():
    idx = [_ts(9), _ts(9, 15), _ts(9, 55), _ts(10)]
    bars = pd.DataFrame(
        {
            "Open": [99.0, 99.5, 101.0, 102.5],
            "High": [99.5, 100.5, 102.0, 103.0],
            "Low": [98.75, 99.25, 100.5, 102.0],
            "Close": [99.25, 100.25, 102.5, 102.75],
        },
        index=idx,
    )

    touch = _replay_touch_window_entry(
        triggers=[_trigger("Upper ref", 100.0)],
        rth_today=bars,
        completed_at=_ts(10, 5),
    )

    assert touch is not None
    assert touch["entry_time"] == _ts(9)
    assert touch["exit_time"] == _ts(10)
    assert touch["entry_price"] == 100.0
    assert touch["exit_price"] == 102.5
    assert touch["side"] == "LONG"


def test_spy_8am_setup_candle_arms_9am_entry_and_exits_9am_close():
    bars = pd.DataFrame(
        {
            "Open": [101.0, 100.75],
            "High": [101.5, 103.5],
            "Low": [99.5, 100.25],
            "Close": [100.5, 103.0],
        },
        index=[_ts(8), _ts(9)],
    )

    touch = _replay_touch_window_entry(
        triggers=[_trigger("Upper ref", 100.0)],
        rth_today=bars,
        completed_at=_ts(10, 5),
    )

    assert touch is not None
    assert touch["rule"] == "EIGHT_AM_SETUP_TOUCH"
    assert touch["setup_time"] == _ts(8)
    assert touch["entry_time"] == _ts(9)
    assert touch["exit_time"] == _ts(10)
    assert touch["entry_price"] == 100.0
    assert touch["exit_price"] == 103.0
    assert touch["side"] == "LONG"


def test_spy_replay_grades_open_above_primary_structure_as_one_hour_long():
    bars = _frame(entry_open=100.0, exit_close=102.0)

    block = _build_replay_block(
        is_replay=True,
        signal_day=_ts(8, 30).date(),
        rth_today=bars,
        decision={},
        primary_lines=[_line("UPPER", 95.0), _line("LOWER", 90.0)],
        signals=[],
        intraday_5m=bars,
    )

    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 2.0
    assert block["entry"]["side"] == "LONG"
    assert block["entry"]["rule"] == "OPEN_ZONE_CONTINUATION"
    assert block["exit"]["rule"] == "FORCED_1H"


def test_spy_replay_without_signal_or_open_zone_stays_ungraded():
    bars = _frame(entry_open=92.5, exit_close=102.0)

    block = _build_replay_block(
        is_replay=True,
        signal_day=_ts(8, 30).date(),
        rth_today=bars,
        decision={},
        primary_lines=[_line("UPPER", 95.0), _line("LOWER", 90.0)],
        signals=[],
        intraday_5m=bars,
    )

    assert block["verdictOutcome"] == "N_A"
    assert block["verdictPnl"] is None
    assert "entry" not in block
