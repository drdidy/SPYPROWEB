"""Tastytrade stub: error contract until the real client is wired."""
import os
from unittest.mock import patch

import pytest

from _lib.spx_data.protocol import FetcherUnavailable
from _lib.spx_data.tastytrade_backend import TastytradeFetcher


def test_unavailable_when_env_missing():
    """No TASTYTRADE_USERNAME / TASTYTRADE_PASSWORD -> stand down cleanly."""
    with patch.dict(os.environ, {}, clear=True):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="env not configured"):
            f.fetch_sync_quote()
        assert f.healthy() is False


def test_unavailable_when_env_present_but_session_not_wired():
    """Env present but the wiring TODO hasn't been filled in yet."""
    with patch.dict(os.environ, {
        "TASTYTRADE_USERNAME": "user@example.com",
        "TASTYTRADE_PASSWORD": "redacted",
    }, clear=False):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="not yet wired"):
            f.fetch_sync_quote()


def test_es_bars_unavailable_until_wired():
    from datetime import datetime
    from zoneinfo import ZoneInfo
    CT = ZoneInfo("America/Chicago")
    with patch.dict(os.environ, {}, clear=True):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable):
            f.fetch_es_bars(
                datetime(2026, 5, 7, 8, tzinfo=CT),
                datetime(2026, 5, 7, 16, tzinfo=CT),
            )
