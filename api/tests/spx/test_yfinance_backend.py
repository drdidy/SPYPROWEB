"""YFinanceFetcher with mocked yfinance — no network calls in CI."""
from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from _lib.spx_data.protocol import FetcherUnavailable
from _lib.spx_data.yfinance_backend import YFinanceFetcher


CT = ZoneInfo("America/Chicago")


def _hourly_df(rows):
    """Build a yfinance-shaped DataFrame from (utc_iso, o, h, l, c, v) rows."""
    idx = pd.DatetimeIndex([pd.Timestamp(t, tz="UTC") for t, *_ in rows])
    return pd.DataFrame(
        {
            "Open":   [r[1] for r in rows],
            "High":   [r[2] for r in rows],
            "Low":    [r[3] for r in rows],
            "Close":  [r[4] for r in rows],
            "Volume": [r[5] for r in rows],
        },
        index=idx,
    )


@patch("yfinance.download")
def test_fetch_es_bars_filters_to_window_and_converts_to_ct(mock_download):
    # Three UTC bars: one before window, one inside, one after.
    df = _hourly_df([
        ("2026-05-07 12:00", 5840, 5841, 5839, 5840, 1000),  # 07:00 CT (before)
        ("2026-05-07 14:00", 5860, 5862, 5858, 5861, 1000),  # 09:00 CT (inside)
        ("2026-05-07 22:00", 5880, 5881, 5879, 5880, 1000),  # 17:00 CT (inside)
        ("2026-05-08 02:00", 5870, 5871, 5869, 5870, 1000),  # 21:00 CT (after window end)
    ])
    mock_download.return_value = df

    fetcher = YFinanceFetcher()
    start = datetime(2026, 5, 7, 8, 0, tzinfo=CT)
    end = datetime(2026, 5, 7, 18, 0, tzinfo=CT)
    bars = fetcher.fetch_es_bars(start, end)

    closes = [b.c for b in bars]
    assert closes == [5861.0, 5880.0]
    # All returned bars must be CT-aware.
    assert all(b.t.tzinfo is not None for b in bars)


@patch("yfinance.download")
def test_fetch_es_bars_empty_returns_empty_list(mock_download):
    mock_download.return_value = pd.DataFrame()
    bars = YFinanceFetcher().fetch_es_bars(
        datetime(2026, 5, 7, 8, 0, tzinfo=CT),
        datetime(2026, 5, 7, 16, 0, tzinfo=CT),
    )
    assert bars == []


@patch("yfinance.Ticker")
def test_fetch_sync_quote_uses_latest_1m_close(mock_ticker_cls):
    es_df = pd.DataFrame(
        {"Close": [5860.5]},
        index=pd.DatetimeIndex([pd.Timestamp("2026-05-07 14:30", tz="UTC")]),
    )
    spx_df = pd.DataFrame(
        {"Close": [5872.5]},
        index=pd.DatetimeIndex([pd.Timestamp("2026-05-07 14:30", tz="UTC")]),
    )

    def _factory(symbol):
        m = MagicMock()
        m.history.return_value = es_df if symbol == "ES=F" else spx_df
        return m

    mock_ticker_cls.side_effect = _factory

    quote = YFinanceFetcher().fetch_sync_quote()
    assert quote.spx_spot == 5872.5
    assert quote.es_spot == 5860.5
    assert quote.offset == 12.0
    assert quote.captured_at.tzinfo is not None


@patch("yfinance.Ticker")
def test_fetch_sync_quote_raises_unavailable_on_empty(mock_ticker_cls):
    empty_df = pd.DataFrame({"Close": []})
    m = MagicMock()
    m.history.return_value = empty_df
    mock_ticker_cls.return_value = m

    with pytest.raises(FetcherUnavailable):
        YFinanceFetcher().fetch_sync_quote()


@patch("yfinance.Ticker")
def test_healthy_false_when_quote_fails(mock_ticker_cls):
    empty_df = pd.DataFrame({"Close": []})
    m = MagicMock()
    m.history.return_value = empty_df
    mock_ticker_cls.return_value = m

    assert YFinanceFetcher().healthy() is False
