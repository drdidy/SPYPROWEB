"""build_snapshot_from_fetcher: ties bars + offset + engine in one call."""
from datetime import datetime, timedelta
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from _lib.spx_data import build_snapshot_from_fetcher
from _lib.spx_data.protocol import SyncQuote


CT = ZoneInfo("America/Chicago")


def test_build_snapshot_pulls_bars_and_offset_then_runs_engine(
    es_candles_ascending_inside, es_offset, as_of
):
    """Fetcher mock returns the test fixture; engine produces a real SPXSnapshot."""
    fetcher = MagicMock()
    fetcher.name = "test"
    fetcher.fetch_es_bars.return_value = es_candles_ascending_inside
    fetcher.fetch_sync_quote.return_value = SyncQuote(
        spx_spot=5872.0, es_spot=5872.0 - es_offset,
        captured_at=as_of,
    )

    snap = build_snapshot_from_fetcher(fetcher, as_of)

    assert snap.symbol == "SPX"
    assert snap.channel.direction == "ASCENDING"
    assert snap.scenario == "ABOVE_DESCENDING"
    # The fetcher was asked for the lookback window.
    fetcher.fetch_es_bars.assert_called_once()
    start_arg, end_arg = fetcher.fetch_es_bars.call_args.args
    assert end_arg == as_of
    assert start_arg == as_of - timedelta(hours=120)


def test_build_snapshot_raises_when_fetcher_returns_no_bars(as_of):
    fetcher = MagicMock()
    fetcher.name = "empty"
    fetcher.fetch_es_bars.return_value = []
    with pytest.raises(RuntimeError, match="no ES bars"):
        build_snapshot_from_fetcher(fetcher, as_of)
