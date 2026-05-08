"""Composite fetcher: try a primary, fall back to a secondary.

Production wiring:
    primary   = TastytradeFetcher()  # real-time, broker-quality
    secondary = YFinanceFetcher()    # delayed, free, no auth

If the primary raises FetcherUnavailable (or any exception) the
secondary takes the request. Failure of the secondary propagates.

The fallback is per-call, not sticky — a transient broker hiccup
doesn't pin the system to yfinance for the rest of the day.
"""
from __future__ import annotations

import logging
from datetime import datetime

from ..spx.candles import Candle

from .protocol import Fetcher, SyncQuote

log = logging.getLogger(__name__)


class CompositeFetcher:
    def __init__(self, primary: Fetcher, secondary: Fetcher) -> None:
        self.primary = primary
        self.secondary = secondary
        self.name = f"{primary.name}->{secondary.name}"

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]:
        try:
            return self.primary.fetch_es_bars(start, end)
        except Exception as e:  # noqa: BLE001 — broad on purpose; we log and fall back
            log.warning(
                "%s.fetch_es_bars failed: %s; falling back to %s",
                self.primary.name, e, self.secondary.name,
            )
            return self.secondary.fetch_es_bars(start, end)

    def fetch_sync_quote(self) -> SyncQuote:
        try:
            return self.primary.fetch_sync_quote()
        except Exception as e:  # noqa: BLE001
            log.warning(
                "%s.fetch_sync_quote failed: %s; falling back to %s",
                self.primary.name, e, self.secondary.name,
            )
            return self.secondary.fetch_sync_quote()

    def healthy(self) -> bool:
        return self.primary.healthy() or self.secondary.healthy()
