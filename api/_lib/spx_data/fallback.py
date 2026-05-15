"""Composite fetcher: try a primary, fall back to a secondary.

Production wiring:
    primary   = TastytradeFetcher()  # real-time, broker-quality
    secondary = YFinanceFetcher()    # delayed, free, no auth

If the primary raises FetcherUnavailable (or any exception) the
secondary takes the request. Failure of the secondary propagates.

The fallback is per-call, not sticky. A transient broker hiccup
doesn't pin the system to yfinance for the rest of the day.

When bars fall back to the secondary source, the composite still tries
to use the primary quote to refresh the latest ES print. A live quote
cannot reconstruct a missing historical OHLC candle, but it can safely
update or append the current hour's close so the engine and UI do not
anchor to a stale Yahoo print.

The composite tracks which backend served each call type so the
snapshot endpoint can surface provenance and applied offset for
operator visibility (debugging "why are these entries off").
"""
from __future__ import annotations

import logging
from datetime import datetime
from math import isfinite
from numbers import Real
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
            filled = self._fill_latest_es_bar_from_primary_quote(bars)
            self.last_bars_source = (
                f"{self.secondary.name}+{self.primary.name}_quote"
                if filled is not bars
                else self.secondary.name
            )
            return filled

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

    def _fill_latest_es_bar_from_primary_quote(
        self,
        bars: list[Candle],
    ) -> list[Candle]:
        """Refresh the live hour with the primary ES quote when possible.

        This intentionally only touches the latest/current hour. A quote
        is a point-in-time print, not a historical candle replay, so using
        it to backfill older Yahoo gaps would create fake OHLC history.
        """
        try:
            quote = self.primary.fetch_sync_quote()
        except Exception as e:  # noqa: BLE001
            self.last_quote_error = f"{self.primary.name}: {type(e).__name__}: {e}"
            return bars

        es = quote.es_spot
        if not isinstance(es, Real) or not isfinite(float(es)) or es <= 0:
            return bars

        self.last_quote_source = self.primary.name
        self.last_quote_error = None
        self.last_offset_method = getattr(self.primary, "last_offset_method", None)

        hour = quote.captured_at.replace(minute=0, second=0, microsecond=0)
        if not bars:
            return [Candle(t=hour, o=es, h=es, l=es, c=es, v=0.0)]

        last = bars[-1]
        last_hour = last.t.replace(minute=0, second=0, microsecond=0)
        if last_hour == hour:
            patched = Candle(
                t=last.t,
                o=last.o if isfinite(last.o) and last.o > 0 else es,
                h=max(last.h, es) if isfinite(last.h) and last.h > 0 else es,
                l=min(last.l, es) if isfinite(last.l) and last.l > 0 else es,
                c=es,
                v=last.v,
            )
            return [*bars[:-1], patched]
        if last_hour < hour:
            return [*bars, Candle(t=hour, o=es, h=es, l=es, c=es, v=0.0)]
        return bars
