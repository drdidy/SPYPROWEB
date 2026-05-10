from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

from _lib.data_sources import _build_replay_block
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
