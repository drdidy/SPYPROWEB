"""YFinanceFetcher.fetch_sync_quote: close-anchored offset algorithm.

The close-anchored algorithm is the v6 P0-4 follow-up to the user-
reported "5872.00 is wrong" SPX read. It pulls SPX daily history,
takes the most recent official close, finds the ES 1m bar at that
day's 15:00 CT cash close, and returns SyncQuote(spx_spot=spx_close,
es_spot=es_at_close, captured_at=close_ct). Every line and the
displayed price.last in the snapshot then computes as
`live_ES + close_offset`.

These tests pin the algorithm with synthetic dataframes so we don't
need yfinance over the network. Run via pytest from the repo root.
"""
from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pandas as pd

from _lib.spx_data.yfinance_backend import YFinanceFetcher

CT = ZoneInfo("America/Chicago")


def _make_yf(spx_daily_df: pd.DataFrame, es_1m_df: pd.DataFrame):
    """Build a stand-in `yf` module exposing only Ticker(...).history()."""
    yf = MagicMock()

    def ticker(symbol: str):
        t = MagicMock()
        if symbol == YFinanceFetcher.SPX_TICKER:
            t.history = MagicMock(side_effect=lambda **kw: spx_daily_df if kw.get("interval") == "1d" else es_1m_df)
        elif symbol == YFinanceFetcher.ES_TICKER:
            t.history = MagicMock(side_effect=lambda **kw: es_1m_df)
        else:
            t.history = MagicMock(return_value=pd.DataFrame())
        return t

    yf.Ticker = ticker
    return yf


def test_close_anchored_uses_last_daily_spx_close():
    # Friday 2026-05-08 official cash close at 5,945.50.
    spx_daily = pd.DataFrame(
        {"Close": [5_900.00, 5_945.50]},
        index=pd.to_datetime(["2026-05-07", "2026-05-08"]),
    )
    # ES 1m series straddling Fri 14:58 / 14:59 / 15:00 CT.
    # 14:59 CT = 19:59 UTC (CDT, May).
    es_idx = pd.to_datetime(
        [
            "2026-05-08T19:58:00Z",
            "2026-05-08T19:59:00Z",  # closest bar at-or-before 15:00 CT
            "2026-05-08T20:00:00Z",
            "2026-05-08T20:01:00Z",
        ]
    )
    es_1m = pd.DataFrame(
        {"Close": [5_916.00, 5_917.50, 5_918.00, 5_918.25]},
        index=es_idx,
    )
    fetcher = YFinanceFetcher()
    quote = fetcher._close_anchored_quote(_make_yf(spx_daily, es_1m))

    assert quote is not None
    assert quote.spx_spot == 5_945.50
    # Take the bar at 14:59 CT (the last bar at-or-before 15:00 CT).
    # Note: 19:59 UTC == 14:59 CDT (CT in May).
    assert quote.es_spot == 5_917.50
    # Offset = 5_945.50 - 5_917.50 = 28.00
    assert round(quote.offset, 2) == 28.00


def test_close_anchored_returns_none_when_spx_history_empty():
    spx_daily = pd.DataFrame()
    es_1m = pd.DataFrame(
        {"Close": [5_900.0]},
        index=pd.to_datetime(["2026-05-08T20:00:00Z"]),
    )
    fetcher = YFinanceFetcher()
    assert fetcher._close_anchored_quote(_make_yf(spx_daily, es_1m)) is None


def test_close_anchored_returns_none_when_es_1m_empty():
    spx_daily = pd.DataFrame(
        {"Close": [5_945.50]},
        index=pd.to_datetime(["2026-05-08"]),
    )
    es_1m = pd.DataFrame()
    fetcher = YFinanceFetcher()
    assert fetcher._close_anchored_quote(_make_yf(spx_daily, es_1m)) is None


def test_close_anchored_returns_none_when_no_es_bar_at_or_before_close():
    # ES bars all sit AFTER 15:00 CT — algorithm should return None
    # rather than picking a forward-dated bar.
    spx_daily = pd.DataFrame(
        {"Close": [5_945.50]},
        index=pd.to_datetime(["2026-05-08"]),
    )
    es_1m = pd.DataFrame(
        {"Close": [5_920.0, 5_921.0]},
        index=pd.to_datetime(["2026-05-08T22:00:00Z", "2026-05-08T22:01:00Z"]),
    )
    fetcher = YFinanceFetcher()
    assert fetcher._close_anchored_quote(_make_yf(spx_daily, es_1m)) is None


def test_close_anchored_records_method_on_fetcher():
    # The method label is the hook the FE provenance overlay reads
    # via _meta.offsetMethod. Set on the close-anchored success path.
    spx_daily = pd.DataFrame(
        {"Close": [5_945.50]},
        index=pd.to_datetime(["2026-05-08"]),
    )
    es_1m = pd.DataFrame(
        {"Close": [5_917.50]},
        index=pd.to_datetime(["2026-05-08T19:59:00Z"]),
    )
    fetcher = YFinanceFetcher()
    # Direct call to the public sync_quote so the side-effect that
    # sets last_offset_method runs.
    import sys
    sys.modules["yfinance"] = _make_yf(spx_daily, es_1m)
    quote = fetcher.fetch_sync_quote()
    del sys.modules["yfinance"]
    assert quote.spx_spot == 5_945.50
    assert fetcher.last_offset_method == "close_anchored"
