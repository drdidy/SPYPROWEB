"""Tastytrade backend: OAuth refresh + sync-quote contract.

Mocks `requests.post` and `requests.get` so tests don't hit Tastytrade.
"""
import os
import time
from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

from _lib.spx_data.protocol import FetcherUnavailable
from _lib.spx_data.tastytrade_backend import TastytradeFetcher

# Front-month /ES contract used in tests. Real code resolves this from
# /instruments/futures; tests prime the cache to avoid double-mocking.
TEST_ES_SYMBOL = "/ESM6"


def _primed(f: TastytradeFetcher) -> TastytradeFetcher:
    """Skip the futures-list lookup so per-quote tests stay focused."""
    f._es_contract_symbol = TEST_ES_SYMBOL
    f._es_contract_expires_at = time.time() + 9999
    return f


CT = ZoneInfo("America/Chicago")

VALID_ENV = {
    "TASTYTRADE_CLIENT_ID": "ci",
    "TASTYTRADE_CLIENT_SECRET": "cs",
    "TASTYTRADE_REFRESH_TOKEN": "rt",
}


def _ok_response(json_body: dict, status: int = 200) -> MagicMock:
    res = MagicMock()
    res.status_code = status
    res.json.return_value = json_body
    res.text = "{}"
    return res


def _err_response(status: int, text: str = "boom") -> MagicMock:
    res = MagicMock()
    res.status_code = status
    res.json.side_effect = ValueError("not json")
    res.text = text
    return res


# ---------------------------------------------------------------------------
# Env-var contract
# ---------------------------------------------------------------------------


def test_unavailable_when_env_missing():
    with patch.dict(os.environ, {}, clear=True):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="env not configured"):
            f.fetch_sync_quote()
        assert f.healthy() is False


def test_lists_specifically_missing_vars():
    with patch.dict(
        os.environ, {"TASTYTRADE_CLIENT_ID": "ci"}, clear=True,
    ):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable) as exc:
            f.fetch_sync_quote()
        msg = str(exc.value)
        assert "TASTYTRADE_CLIENT_SECRET" in msg
        assert "TASTYTRADE_REFRESH_TOKEN" in msg


# ---------------------------------------------------------------------------
# OAuth refresh
# ---------------------------------------------------------------------------


@patch("requests.post")
def test_oauth_refresh_caches_token(mock_post):
    mock_post.return_value = _ok_response(
        {"access_token": "abc", "expires_in": 900, "token_type": "Bearer"}
    )
    with patch.dict(os.environ, VALID_ENV, clear=False):
        f = TastytradeFetcher()
        t1 = f._ensure_access_token()
        t2 = f._ensure_access_token()
    assert t1 == "abc"
    assert t2 == "abc"
    # Second call must use the cache, not re-hit the OAuth endpoint.
    assert mock_post.call_count == 1


@patch("requests.post")
def test_oauth_refresh_unavailable_on_4xx(mock_post):
    mock_post.return_value = _err_response(401, "invalid_grant")
    with patch.dict(os.environ, VALID_ENV, clear=False):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="OAuth refresh failed: 401"):
            f._ensure_access_token()


@patch("requests.post")
def test_oauth_unavailable_on_network_error(mock_post):
    import requests as _rq
    mock_post.side_effect = _rq.ConnectTimeout("timed out")
    with patch.dict(os.environ, VALID_ENV, clear=False):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="network error"):
            f._ensure_access_token()


@patch("requests.post")
def test_oauth_unavailable_when_response_missing_token(mock_post):
    mock_post.return_value = _ok_response({"unexpected": "shape"})
    with patch.dict(os.environ, VALID_ENV, clear=False):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="missing access_token"):
            f._ensure_access_token()


# ---------------------------------------------------------------------------
# Sync quote
# ---------------------------------------------------------------------------


def _quote_body(es_last: float, spx_last: float) -> dict:
    return {
        "data": {
            "items": [
                {"symbol": TEST_ES_SYMBOL, "last": es_last, "bid": es_last - 0.25, "ask": es_last + 0.25},
                {"symbol": "SPX", "last": spx_last},
            ]
        }
    }


@patch("requests.get")
@patch("requests.post")
def test_fetch_sync_quote_returns_offset(mock_post, mock_get):
    mock_post.return_value = _ok_response(
        {"access_token": "abc", "expires_in": 900}
    )
    mock_get.return_value = _ok_response(_quote_body(es_last=5860.5, spx_last=5872.5))
    with patch.dict(os.environ, VALID_ENV, clear=False):
        quote = _primed(TastytradeFetcher()).fetch_sync_quote()
    assert quote.es_spot == 5860.5
    assert quote.spx_spot == 5872.5
    assert quote.offset == pytest.approx(12.0)
    assert quote.captured_at.tzinfo is not None  # CT-aware


@patch("requests.get")
@patch("requests.post")
def test_fetch_sync_quote_falls_back_to_mark_when_last_missing(mock_post, mock_get):
    mock_post.return_value = _ok_response({"access_token": "abc", "expires_in": 900})
    mock_get.return_value = _ok_response(
        {
            "data": {
                "items": [
                    {"symbol": TEST_ES_SYMBOL, "mark": 5860.5},
                    {"symbol": "SPX", "mark": 5872.5},
                ]
            }
        }
    )
    with patch.dict(os.environ, VALID_ENV, clear=False):
        quote = _primed(TastytradeFetcher()).fetch_sync_quote()
    assert quote.es_spot == 5860.5
    assert quote.spx_spot == 5872.5


@patch("requests.get")
@patch("requests.post")
def test_fetch_sync_quote_unavailable_when_symbol_missing(mock_post, mock_get):
    mock_post.return_value = _ok_response({"access_token": "abc", "expires_in": 900})
    # Response has /ES but not SPX.
    mock_get.return_value = _ok_response(
        {"data": {"items": [{"symbol": TEST_ES_SYMBOL, "last": 5860.5}]}}
    )
    with patch.dict(os.environ, VALID_ENV, clear=False):
        with pytest.raises(FetcherUnavailable, match="missing .* or SPX entry"):
            _primed(TastytradeFetcher()).fetch_sync_quote()


@patch("requests.get")
@patch("requests.post")
def test_fetch_sync_quote_unavailable_on_quote_5xx(mock_post, mock_get):
    mock_post.return_value = _ok_response({"access_token": "abc", "expires_in": 900})
    mock_get.return_value = _err_response(503, "service unavailable")
    with patch.dict(os.environ, VALID_ENV, clear=False):
        with pytest.raises(FetcherUnavailable, match="quote failed: 503"):
            _primed(TastytradeFetcher()).fetch_sync_quote()


# ---------------------------------------------------------------------------
# Active /ES contract resolver
# ---------------------------------------------------------------------------


@patch("requests.get")
@patch("requests.post")
def test_resolve_active_es_symbol_picks_front_month(mock_post, mock_get):
    mock_post.return_value = _ok_response({"access_token": "abc", "expires_in": 900})
    # Two live contracts; the earlier-expiring one is front month.
    mock_get.return_value = _ok_response(
        {
            "data": {
                "items": [
                    {"symbol": "/ESU6", "expires-at": "2026-09-18T20:00:00Z"},
                    {"symbol": "/ESM6", "expires-at": "2026-06-19T20:00:00Z"},
                    {"symbol": "/ESH6", "expires-at": "2026-03-20T20:00:00Z"},  # already expired
                ]
            }
        }
    )
    with patch.dict(os.environ, VALID_ENV, clear=False):
        sym = TastytradeFetcher()._resolve_active_es_symbol()
    assert sym == "/ESM6"


@patch("requests.get")
@patch("requests.post")
def test_resolve_active_es_symbol_unavailable_when_no_live_contracts(mock_post, mock_get):
    mock_post.return_value = _ok_response({"access_token": "abc", "expires_in": 900})
    mock_get.return_value = _ok_response(
        {"data": {"items": [{"symbol": "/ESH6", "expires-at": "2020-03-20T20:00:00Z"}]}}
    )
    with patch.dict(os.environ, VALID_ENV, clear=False):
        with pytest.raises(FetcherUnavailable, match="no live /ES contract"):
            TastytradeFetcher()._resolve_active_es_symbol()


# ---------------------------------------------------------------------------
# ES bars stays unimplemented (CompositeFetcher routes to yfinance)
# ---------------------------------------------------------------------------


def test_fetch_es_bars_intentionally_unavailable():
    with patch.dict(os.environ, VALID_ENV, clear=False):
        f = TastytradeFetcher()
        with pytest.raises(FetcherUnavailable, match="ES bars unavailable"):
            f.fetch_es_bars(
                datetime(2026, 5, 7, 8, tzinfo=CT),
                datetime(2026, 5, 7, 16, tzinfo=CT),
            )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@patch("requests.post")
def test_healthy_true_when_oauth_succeeds(mock_post):
    mock_post.return_value = _ok_response({"access_token": "abc", "expires_in": 900})
    with patch.dict(os.environ, VALID_ENV, clear=False):
        assert TastytradeFetcher().healthy() is True


@patch("requests.post")
def test_healthy_false_when_oauth_fails(mock_post):
    mock_post.return_value = _err_response(401)
    with patch.dict(os.environ, VALID_ENV, clear=False):
        assert TastytradeFetcher().healthy() is False
