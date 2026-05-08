"""Tastytrade backend.

Real-time, broker-quality data via Tastytrade's API + DXFeed for
quote streaming. Meant for production once auth is wired.

Setup (env vars; never hardcode):
    TASTYTRADE_USERNAME       Account login email
    TASTYTRADE_PASSWORD       Account password (or use a refresh token)
    TASTYTRADE_ENVIRONMENT    "production" (default) or "sandbox"

Install:
    pip install tastytrade

This module is intentionally a stub. The shape of the implementation is
sketched in the TODOs; until you fill them in, calls raise
FetcherUnavailable and the CompositeFetcher falls back to yfinance.
That keeps `/spx/snapshot` working end-to-end while you wire the
broker integration on your own time.

Outline of the wiring (for when you implement):

    from tastytrade import Session, instruments, market_data

    self._session = Session(username, password, is_test=(env == "sandbox"))

    # ES bars: tastytrade provides candles via its DXFeed gateway.
    # The candle subscription is symbol-specific ("/ES" or the active
    # contract month like "/ESM6"). For 1-hour bars over a fixed
    # window you typically pull from the historical candle endpoint.

    # Sync quote: simultaneously pull ES last + SPX index quote
    # (SPX is /SPX or "SPX" depending on entitlement). Use the
    # streamer's snapshot mode for a near-instantaneous pair.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from ..spx.candles import Candle

from .protocol import FetcherUnavailable, SyncQuote


class TastytradeFetcher:
    name = "tastytrade"

    def __init__(self) -> None:
        self._session: Optional[object] = None

    # ---- Auth ---------------------------------------------------------------

    def _ensure_session(self) -> None:
        if self._session is not None:
            return
        username = os.environ.get("TASTYTRADE_USERNAME")
        password = os.environ.get("TASTYTRADE_PASSWORD")
        env = os.environ.get("TASTYTRADE_ENVIRONMENT", "production")
        if not username or not password:
            raise FetcherUnavailable(
                "Tastytrade env not configured. "
                "Set TASTYTRADE_USERNAME / TASTYTRADE_PASSWORD "
                "(see api/.env.example) and `pip install tastytrade`."
            )
        # Wiring point — uncomment + adapt once you add the dep.
        # from tastytrade import Session
        # self._session = Session(username, password, is_test=(env == "sandbox"))
        raise FetcherUnavailable(
            "Tastytrade session creation not yet wired. "
            "See module docstring for the integration outline. "
            "Falling back to yfinance via CompositeFetcher."
        )

    # ---- ES bars ------------------------------------------------------------

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]:
        self._ensure_session()
        # TODO: pull /ES (continuous front) hourly candles from the
        # tastytrade historical-candle endpoint, convert to api/spx/Candle,
        # filter to [start, end). See module docstring.
        raise FetcherUnavailable("Tastytrade ES candles not yet wired.")

    # ---- Sync quote ---------------------------------------------------------

    def fetch_sync_quote(self) -> SyncQuote:
        self._ensure_session()
        # TODO: simultaneous /ES + /SPX snapshot via DXFeed streamer.
        raise FetcherUnavailable("Tastytrade sync quote not yet wired.")

    # ---- Health -------------------------------------------------------------

    def healthy(self) -> bool:
        try:
            self._ensure_session()
            return True
        except FetcherUnavailable:
            return False
