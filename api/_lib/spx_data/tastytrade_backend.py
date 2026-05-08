"""Tastytrade backend.

Real-time, broker-quality data via Tastytrade's API + DXFeed for
quote streaming. Production-grade auth is OAuth2 with a refresh
token (the values you registered as a Tastytrade OAuth application).

Setup (env vars; never hardcode):
    TASTYTRADE_CLIENT_ID        OAuth app client id
    TASTYTRADE_CLIENT_SECRET    OAuth app client secret
    TASTYTRADE_REFRESH_TOKEN    Long-lived refresh token from the
                                initial authorization-code exchange

Install:
    pip install tastytrade

The auth flow at request time:

  1. POST /oauth/token with grant_type=refresh_token + client_id +
     client_secret + refresh_token  -> short-lived access_token
  2. Use the access_token as a Bearer header on subsequent
     /sessions, /market-data, and DXFeed streamer calls.

Cache the access_token between requests (it's typically valid for
~15 minutes); only re-issue when expired. The Vercel function
instance stays warm long enough for caching to matter.

This module is intentionally a stub for now. The shape of the
implementation is sketched in the TODOs; until they're filled in,
calls raise FetcherUnavailable and the CompositeFetcher falls back
to yfinance. /api/spx/snapshot keeps working end-to-end on yfinance
while the broker integration is wired.

Outline of the wiring (for when you implement):

    import requests

    def _exchange_refresh_token(self, client_id, client_secret, refresh_token):
        res = requests.post(
            "https://api.tastytrade.com/oauth/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
            },
            timeout=10,
        )
        res.raise_for_status()
        body = res.json()
        return body["access_token"], body.get("expires_in", 900)

    # ES bars: GET /market-data/historical?symbol=/ES&interval=1h&start=...
    # Sync quote: simultaneous /ES + /SPX last from /market-data
    # or via DXFeed websocket snapshot mode.
"""
from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Optional

from ..spx.candles import Candle

from .protocol import FetcherUnavailable, SyncQuote

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
        """Read OAuth credentials from env. Raise FetcherUnavailable if
        any required var is missing."""
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
        # type checker: we just verified these are non-None
        assert client_id and client_secret and refresh_token
        return client_id, client_secret, refresh_token

    def _ensure_access_token(self) -> str:
        """Return a valid access token, refreshing if expired.

        STUB: real implementation calls /oauth/token with the refresh
        token. Until wired, raises FetcherUnavailable so the
        CompositeFetcher falls back to yfinance.
        """
        # Verify env is present (raises FetcherUnavailable otherwise).
        self._resolve_credentials()

        # Cached token still valid?
        if self._access_token and time.time() < self._access_expires_at:
            return self._access_token

        # Wiring point — fill in once you add the http client + tested it:
        #   token, ttl = self._exchange_refresh_token(*self._resolve_credentials())
        #   self._access_token = token
        #   self._access_expires_at = time.time() + ttl - 60  # 60s safety
        #   return token
        raise FetcherUnavailable(
            "Tastytrade OAuth exchange not yet wired. "
            "See module docstring for the integration outline. "
            "Falling back to yfinance via CompositeFetcher."
        )

    # ---- ES bars ------------------------------------------------------------

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]:
        self._ensure_access_token()
        # TODO: GET /market-data/historical with symbol=/ES (continuous
        # front month), interval=1h, start/end. Convert each row to
        # _lib.spx.candles.Candle with CT-aware timestamps. Filter to
        # [start, end).
        raise FetcherUnavailable("Tastytrade ES candles not yet wired.")

    # ---- Sync quote ---------------------------------------------------------

    def fetch_sync_quote(self) -> SyncQuote:
        self._ensure_access_token()
        # TODO: simultaneous /ES + /SPX last quotes. DXFeed snapshot mode
        # is the cleanest for a tight pair; the REST /market-data fallback
        # works fine for offset derivation.
        raise FetcherUnavailable("Tastytrade sync quote not yet wired.")

    # ---- Health -------------------------------------------------------------

    def healthy(self) -> bool:
        try:
            self._ensure_access_token()
            return True
        except FetcherUnavailable:
            return False
