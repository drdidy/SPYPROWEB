"""SPX Prophet data layer.

Pluggable backends that produce ES candles and SPX/ES sync quotes.
Outputs feed into ``spx.compute_snapshot``.

Quick start:

    from data import build_default_fetcher, build_snapshot_from_fetcher
    from datetime import datetime
    from zoneinfo import ZoneInfo

    fetcher = build_default_fetcher()    # tastytrade -> yfinance fallback
    snap = build_snapshot_from_fetcher(
        fetcher,
        as_of=datetime.now(ZoneInfo("America/Chicago")),
    )

    json_payload = snap.model_dump(by_alias=True)

Adjacent integrations the engine can grow into (not in this module —
each gets its own subpackage when wired):

    intel/unusual_whales      Options flow / GEX / dark pools.
                              Feeds confluence factors 4 + 5 once you
                              specify them, and the OptionsIntel panel
                              on the SPY dashboard.
    brief/openai              Daily-brief generation (the workspace's
                              morning narration). Reads the snapshot
                              and writes plain-English summary.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from ..spx import compute_snapshot

from .fallback import CompositeFetcher
from .protocol import Fetcher, FetcherUnavailable, SyncQuote
from .tastytrade_backend import TastytradeFetcher
from .yfinance_backend import YFinanceFetcher

__all__ = [
    "CompositeFetcher",
    "Fetcher",
    "FetcherUnavailable",
    "SyncQuote",
    "TastytradeFetcher",
    "YFinanceFetcher",
    "build_default_fetcher",
    "build_snapshot_from_fetcher",
]


def build_default_fetcher() -> Fetcher:
    """Tastytrade primary, yfinance secondary.

    Tastytrade falls back gracefully (raises FetcherUnavailable) when
    env vars aren't configured, so this is safe to call on a fresh
    checkout — yfinance will serve every request until you wire the
    broker.
    """
    return CompositeFetcher(primary=TastytradeFetcher(), secondary=YFinanceFetcher())


def build_snapshot_from_fetcher(
    fetcher: Fetcher,
    as_of: datetime,
    *,
    lookback_hours: int = 36,
    **engine_kwargs,
):
    """Pull bars + offset and compute a snapshot in one call."""
    start = as_of - timedelta(hours=lookback_hours)
    bars = fetcher.fetch_es_bars(start, as_of)
    if not bars:
        raise RuntimeError(
            f"{fetcher.name} returned no ES bars in [{start}, {as_of}]"
        )
    quote = fetcher.fetch_sync_quote()
    return compute_snapshot(bars, quote.offset, as_of, **engine_kwargs)
