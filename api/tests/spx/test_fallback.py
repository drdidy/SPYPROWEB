"""CompositeFetcher: primary -> secondary fallback contract."""
from datetime import datetime
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from _lib.spx_data.fallback import CompositeFetcher
from _lib.spx_data.protocol import FetcherUnavailable, SyncQuote
from _lib.spx.candles import Candle


CT = ZoneInfo("America/Chicago")


def _make_fetcher(name: str, *, healthy: bool = True):
    f = MagicMock()
    f.name = name
    f.healthy.return_value = healthy
    return f


def test_primary_success_returns_primary_data():
    primary = _make_fetcher("primary")
    primary_bars = [Candle(t=datetime(2026, 5, 7, 9, tzinfo=CT), o=1, h=2, l=0, c=1)]
    primary.fetch_es_bars.return_value = primary_bars
    secondary = _make_fetcher("secondary")

    composite = CompositeFetcher(primary, secondary)
    bars = composite.fetch_es_bars(
        datetime(2026, 5, 7, 8, tzinfo=CT),
        datetime(2026, 5, 7, 16, tzinfo=CT),
    )

    assert bars is primary_bars
    secondary.fetch_es_bars.assert_not_called()


def test_primary_failure_falls_through_to_secondary():
    primary = _make_fetcher("primary")
    primary.fetch_es_bars.side_effect = FetcherUnavailable("auth missing")
    secondary = _make_fetcher("secondary")
    secondary_bars = [Candle(t=datetime(2026, 5, 7, 9, tzinfo=CT), o=1, h=2, l=0, c=1)]
    secondary.fetch_es_bars.return_value = secondary_bars

    composite = CompositeFetcher(primary, secondary)
    bars = composite.fetch_es_bars(
        datetime(2026, 5, 7, 8, tzinfo=CT),
        datetime(2026, 5, 7, 16, tzinfo=CT),
    )

    assert bars is secondary_bars
    secondary.fetch_es_bars.assert_called_once()


def test_secondary_failure_propagates():
    primary = _make_fetcher("primary")
    primary.fetch_es_bars.side_effect = FetcherUnavailable("primary down")
    secondary = _make_fetcher("secondary")
    secondary.fetch_es_bars.side_effect = RuntimeError("secondary down too")

    composite = CompositeFetcher(primary, secondary)
    with pytest.raises(RuntimeError):
        composite.fetch_es_bars(
            datetime(2026, 5, 7, 8, tzinfo=CT),
            datetime(2026, 5, 7, 16, tzinfo=CT),
        )


def test_sync_quote_falls_back():
    primary = _make_fetcher("primary")
    primary.fetch_sync_quote.side_effect = FetcherUnavailable("no")
    secondary = _make_fetcher("secondary")
    expected = SyncQuote(
        spx_spot=5872.5, es_spot=5860.5,
        captured_at=datetime(2026, 5, 7, 9, 0, tzinfo=CT),
    )
    secondary.fetch_sync_quote.return_value = expected

    quote = CompositeFetcher(primary, secondary).fetch_sync_quote()
    assert quote is expected


def test_healthy_true_if_either_healthy():
    primary = _make_fetcher("primary", healthy=False)
    secondary = _make_fetcher("secondary", healthy=True)
    assert CompositeFetcher(primary, secondary).healthy() is True


def test_healthy_false_only_when_both_unhealthy():
    primary = _make_fetcher("primary", healthy=False)
    secondary = _make_fetcher("secondary", healthy=False)
    assert CompositeFetcher(primary, secondary).healthy() is False
