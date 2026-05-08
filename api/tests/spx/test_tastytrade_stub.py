"""Tastytrade stub: OAuth env-var contract until the real client is wired."""
import os
from unittest.mock import patch

import pytest

from _lib.spx_data.protocol import FetcherUnavailable
from _lib.spx_data.tastytrade_backend import TastytradeFetcher


def test_unavailable_when_env_missing():
    """No CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN -> stand down cleanly."""
    with patch.dict(os.environ, {}, clear=True):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="env not configured"):
            f.fetch_sync_quote()
        assert f.healthy() is False


def test_lists_specifically_missing_vars():
    """Error message names which env-vars are missing so ops debugging
    is fast in Vercel logs."""
    with patch.dict(
        os.environ,
        {"TASTYTRADE_CLIENT_ID": "ci"},  # client_secret + refresh_token missing
        clear=True,
    ):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable) as exc:
            f.fetch_sync_quote()
        msg = str(exc.value)
        assert "TASTYTRADE_CLIENT_SECRET" in msg
        assert "TASTYTRADE_REFRESH_TOKEN" in msg


def test_unavailable_when_env_present_but_oauth_not_wired():
    """All three env vars set, but the OAuth exchange itself is still a TODO.
    Real client lands in a follow-up; until then we raise cleanly."""
    with patch.dict(
        os.environ,
        {
            "TASTYTRADE_CLIENT_ID": "ci",
            "TASTYTRADE_CLIENT_SECRET": "cs",
            "TASTYTRADE_REFRESH_TOKEN": "rt",
        },
        clear=False,
    ):
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
