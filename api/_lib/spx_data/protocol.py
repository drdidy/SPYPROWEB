"""Data fetcher protocol.

Implementations live next door (yfinance_backend, tastytrade_backend).
The engine in api/spx/ never imports these — it takes Candles + an
offset and computes a snapshot. The data layer feeds the engine.

Contract:
    fetch_es_bars(start, end) -> list[Candle]
        Hourly ES bars whose open timestamp falls within [start, end).
        CT-aware datetimes. Empty list is acceptable; caller decides
        whether that's an error.

    fetch_sync_quote() -> SyncQuote
        SPX cash + ES futures spot prints captured at (close to) the
        same instant. .offset is the value we feed to the engine to
        translate ES -> SPX.

    healthy() -> bool
        Quick liveness check. Used by CompositeFetcher to decide
        whether to fall back.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, runtime_checkable

from ..spx.candles import Candle


class FetcherUnavailable(RuntimeError):
    """Raised when a backend can't serve the request right now.

    Distinct from generic exceptions so CompositeFetcher can fail over
    cleanly without swallowing real bugs.
    """


@dataclass(frozen=True)
class SyncQuote:
    """Synchronized SPX-cash + ES-futures spot prices."""

    spx_spot: float
    es_spot: float
    captured_at: datetime  # CT-aware

    @property
    def offset(self) -> float:
        """SPX = ES + offset. Feeds spx.compute_snapshot()."""
        return self.spx_spot - self.es_spot


@runtime_checkable
class Fetcher(Protocol):
    """The minimum a backend must provide to feed the SPX engine."""

    name: str

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]: ...

    def fetch_sync_quote(self) -> SyncQuote: ...

    def healthy(self) -> bool: ...
