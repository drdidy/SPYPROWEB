"""Composite fetcher: try a primary, fall back to a secondary.

Production wiring:
    primary   = TastytradeFetcher()  # real-time, broker-quality
    secondary = YFinanceFetcher()    # delayed, free, no auth

If the primary raises FetcherUnavailable (or any exception) the
secondary takes the request. Failure of the secondary propagates.

The fallback is per-call, not sticky. A transient broker hiccup
doesn't pin the system to yfinance for the rest of the day.

The composite tracks which backend served each call type so the
snapshot endpoint can surface provenance and applied offset for
operator visibility (debugging "why are these entries off").
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from ..spx.candles import Candle

from .protocol import Fetcher, SyncQuote

log = logging.getLogger(__name__)


class CompositeFetcher:
    def __init__(self, primary: Fetcher, secondary: Fetcher) -> None:
        self.primary = primary
        self.secondary = secondary
        self.name = f"{primary.name}->{secondary.name}"
        # Provenance: who served each call most recently.
        self.last_bars_source: Optional[str] = None
        self.last_quote_source: Optional[str] = None
        self.last_bars_error: Optional[str] = None
        self.last_quote_error: Optional[str] = None
        # Mirrored from whichever backend served fetch_sync_quote.
        self.last_offset_method: Optional[str] = None

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]:
        try:
            bars = self.primary.fetch_es_bars(start, end)
            self.last_bars_source = self.primary.name
            self.last_bars_error = None
            return bars
        except Exception as e:  # noqa: BLE001
            self.last_bars_error = f"{self.primary.name}: {type(e).__name__}: {e}"
            log.warning(
                "%s.fetch_es_bars failed: %s; falling back to %s",
                self.primary.name, e, self.secondary.name,
            )
            bars = self.secondary.fetch_es_bars(start, end)
            self.last_bars_source = self.secondary.name
            return bars

    def fetch_sync_quote(self) -> SyncQuote:
        try:
            q = self.primary.fetch_sync_quote()
            self.last_quote_source = self.primary.name
            self.last_quote_error = None
            # Surface the underlying sub-algorithm (yfinance reports
            # close_anchored / intersection_1m / latest_of_each on
            # `last_offset_method`). The composite mirrors it onto
            # itself so build_snapshot_with_provenance can read one
            # field regardless of which backend won.
            self.last_offset_method = getattr(
                self.primary, "last_offset_method", None,
            )
            return q
        except Exception as e:  # noqa: BLE001
            self.last_quote_error = f"{self.primary.name}: {type(e).__name__}: {e}"
            log.warning(
                "%s.fetch_sync_quote failed: %s; falling back to %s",
                self.primary.name, e, self.secondary.name,
            )
            q = self.secondary.fetch_sync_quote()
            self.last_quote_source = self.secondary.name
            self.last_offset_method = getattr(
                self.secondary, "last_offset_method", None,
            )
            return q

    def healthy(self) -> bool:
        return self.primary.healthy() or self.secondary.healthy()
