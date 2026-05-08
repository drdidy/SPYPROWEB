"""Tastytrade backend.

Real-time, broker-quality market data via Tastytrade's REST API.
Production-grade auth is OAuth2 with a refresh token (the values you
registered as a Tastytrade OAuth application).

Setup (env vars; never hardcode):
    TASTYTRADE_CLIENT_ID        OAuth app client id
    TASTYTRADE_CLIENT_SECRET    OAuth app client secret
    TASTYTRADE_REFRESH_TOKEN    Long-lived refresh token from the
                                initial authorization-code exchange

The auth flow at request time:
  1. POST /oauth/token with grant_type=refresh_token + client_id +
     client_secret + refresh_token -> short-lived access_token
  2. Use the access_token as a Bearer header on subsequent
     /market-data calls. Token cached between requests
     (Vercel function instance stays warm).

Currently-implemented:
  fetch_sync_quote()  ->  /ES + SPX last via GET /market-data/by-type.
                          Real-time, broker-quality offset derivation.

Not implemented (intentionally falls through to yfinance):
  fetch_es_bars()     ->  Tastytrade serves intraday futures candles
                          via DXFeed streaming, which doesn't fit a
                          single-shot Vercel function. yfinance bars
                          are accurate enough for hourly methodology
                          (closes are what the engine consumes).
                          The CompositeFetcher serves bars from
                          yfinance whenever this raises.
"""
from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Optional

import requests

from ..spx.candles import Candle

from .protocol import FetcherUnavailable, SyncQuote
from ..spx.time_utils import to_ct

API_URL = "https://api.tastyworks.com"
OAUTH_PATH = "/oauth/token"
QUOTE_PATH = "/market-data/by-type"

# Symbols (Tastytrade convention).
ES_FUTURES_SYMBOL = "/ES"   # continuous front month
SPX_INDEX_SYMBOL = "SPX"

# Network timeouts (seconds). Vercel functions have 10s default for the
# whole request; keep individual calls well under that.
OAUTH_TIMEOUT = 6
QUOTE_TIMEOUT = 4

# Safety margin so we refresh slightly before expiry rather than racing it.
TOKEN_REFRESH_SAFETY_SECONDS = 60

REQUIRED_ENV_VARS = (
    "TASTYTRADE_CLIENT_ID",
    "TASTYTRADE_CLIENT_SECRET",
    "TASTYTRADE_REFRESH_TOKEN",
)


class TastytradeFetcher:
    name = "tastytrade"

    def __init__(self) -> None:
        self._access_token: Optional[str] = None
        self._access_expires_at: float = 0.0

    # ---- Auth ---------------------------------------------------------------

    def _resolve_credentials(self) -> tuple[str, str, str]:
        client_id = os.environ.get("TASTYTRADE_CLIENT_ID")
        client_secret = os.environ.get("TASTYTRADE_CLIENT_SECRET")
        refresh_token = os.environ.get("TASTYTRADE_REFRESH_TOKEN")
        missing = [
            name
            for name, value in zip(
                REQUIRED_ENV_VARS, (client_id, client_secret, refresh_token)
            )
            if not value
        ]
        if missing:
            raise FetcherUnavailable(
                "Tastytrade env not configured. Missing: "
                + ", ".join(missing)
                + " (see api/.env.example)."
            )
        assert client_id and client_secret and refresh_token
        return client_id, client_secret, refresh_token

    def _ensure_access_token(self) -> str:
        """Return a valid access token, refreshing via OAuth when expired."""
        if self._access_token and time.time() < self._access_expires_at:
            return self._access_token

        client_id, client_secret, refresh_token = self._resolve_credentials()

        try:
            res = requests.post(
                f"{API_URL}{OAUTH_PATH}",
                data={
                    "grant_type": "refresh_token",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                },
                timeout=OAUTH_TIMEOUT,
            )
        except requests.RequestException as e:
            raise FetcherUnavailable(
                f"Tastytrade OAuth network error: {type(e).__name__}: {e}"
            ) from e

        if res.status_code != 200:
            raise FetcherUnavailable(
                f"Tastytrade OAuth refresh failed: {res.status_code} "
                f"{res.text[:200]}"
            )

        try:
            body = res.json()
        except ValueError as e:
            raise FetcherUnavailable(
                f"Tastytrade OAuth response not JSON: {res.text[:200]}"
            ) from e

        token = body.get("access_token")
        if not token:
            raise FetcherUnavailable(
                f"Tastytrade OAuth response missing access_token: "
                f"{list(body.keys())}"
            )

        # Default 15min if expires_in absent. Refresh slightly early.
        expires_in = float(body.get("expires_in", 900))
        self._access_token = token
        self._access_expires_at = time.time() + expires_in - TOKEN_REFRESH_SAFETY_SECONDS
        return token

    def _auth_headers(self) -> dict[str, str]:
        token = self._ensure_access_token()
        return {"Authorization": f"Bearer {token}"}

    # ---- Sync quote ---------------------------------------------------------

    def fetch_sync_quote(self) -> SyncQuote:
        """Pull /ES (futures front month) + SPX (cash index) last prints
        via GET /market-data/by-type.

        Returns a SyncQuote with .offset = spx - es ready to feed the
        engine.
        """
        try:
            res = requests.get(
                f"{API_URL}{QUOTE_PATH}",
                params={"futures": ES_FUTURES_SYMBOL, "indices": SPX_INDEX_SYMBOL},
                headers=self._auth_headers(),
                timeout=QUOTE_TIMEOUT,
            )
        except requests.RequestException as e:
            raise FetcherUnavailable(
                f"Tastytrade quote network error: {type(e).__name__}: {e}"
            ) from e

        if res.status_code != 200:
            raise FetcherUnavailable(
                f"Tastytrade quote failed: {res.status_code} {res.text[:200]}"
            )

        try:
            body = res.json()
        except ValueError as e:
            raise FetcherUnavailable(
                f"Tastytrade quote response not JSON: {res.text[:200]}"
            ) from e

        es_quote = _find_quote(body, ES_FUTURES_SYMBOL)
        spx_quote = _find_quote(body, SPX_INDEX_SYMBOL)
        if es_quote is None or spx_quote is None:
            raise FetcherUnavailable(
                "Tastytrade quote response missing /ES or SPX entry. "
                f"Got symbols: {_extracted_symbols(body)}"
            )

        es_last = _extract_last_price(es_quote)
        spx_last = _extract_last_price(spx_quote)
        if es_last is None or spx_last is None:
            raise FetcherUnavailable(
                "Tastytrade quote response missing last/mark price."
            )

        return SyncQuote(
            spx_spot=spx_last,
            es_spot=es_last,
            captured_at=to_ct(datetime.utcnow()),
        )

    # ---- ES bars (intentionally unimplemented; see module docstring) --------

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]:
        # Tastytrade's hourly futures candles arrive via DXFeed streaming,
        # not REST — and DXFeed websockets don't fit a single-shot Vercel
        # function lifecycle. Raise so the CompositeFetcher routes bars
        # through yfinance. Sync quotes still come from Tastytrade.
        raise FetcherUnavailable(
            "Tastytrade ES bars unavailable via REST; "
            "yfinance fallback serves bars."
        )

    # ---- Health -------------------------------------------------------------

    def healthy(self) -> bool:
        """A successful access-token exchange is sufficient to call us
        healthy. Quote-endpoint round-trip is exercised on the next
        fetch_sync_quote() call."""
        try:
            self._ensure_access_token()
            return True
        except FetcherUnavailable:
            return False


# ---------------------------------------------------------------------------
# Response parsing helpers — defensive against Tastytrade's response shape
# evolving. The library returns the quote list under
#   {"data": {"items": [{ symbol, last, bid, ask, ... }, ...]}}
# We tolerate slight variations.
# ---------------------------------------------------------------------------


def _items(body: dict) -> list[dict]:
    """Extract the list of quote items from a Tastytrade response."""
    if not isinstance(body, dict):
        return []
    data = body.get("data")
    if isinstance(data, dict):
        items = data.get("items")
        if isinstance(items, list):
            return [i for i in items if isinstance(i, dict)]
        # single-symbol responses sometimes nest the quote directly
        if "symbol" in data:
            return [data]
    if isinstance(data, list):
        return [i for i in data if isinstance(i, dict)]
    return []


def _find_quote(body: dict, symbol: str) -> Optional[dict]:
    for item in _items(body):
        if item.get("symbol") == symbol:
            return item
    return None


def _extracted_symbols(body: dict) -> list[str]:
    return [item.get("symbol", "?") for item in _items(body)]


def _extract_last_price(quote: dict) -> Optional[float]:
    """Pull the most recent traded price from a Tastytrade quote dict.

    Tastytrade fields we accept (in order of preference):
        last        traded last price
        mark        mid quote
        close       prior close
        bid + ask   midpoint as last resort
    """
    for key in ("last", "mark", "close"):
        v = quote.get(key)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
    bid = quote.get("bid")
    ask = quote.get("ask")
    if bid is not None and ask is not None:
        try:
            return (float(bid) + float(ask)) / 2.0
        except (TypeError, ValueError):
            return None
    return None
