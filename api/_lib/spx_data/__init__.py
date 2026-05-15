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
    lookback_hours: int = 120,
    **engine_kwargs,
):
    """Pull bars + offset and compute a snapshot in one call.

    See `build_snapshot_with_provenance` for why the default is
    120 hours rather than 36.
    """
    start = as_of - timedelta(hours=lookback_hours)
    bars = fetcher.fetch_es_bars(start, as_of)
    if not bars:
        raise RuntimeError(
            f"{fetcher.name} returned no ES bars in [{start}, {as_of}]"
        )
    quote = fetcher.fetch_sync_quote()
    return compute_snapshot(bars, 0.0, as_of, **engine_kwargs)


def build_snapshot_with_provenance(
    fetcher: Fetcher,
    as_of: datetime,
    *,
    lookback_hours: int = 120,
    offset_override: float | None = None,
    **engine_kwargs,
):
    """Like build_snapshot_from_fetcher but returns (snapshot, meta).

    `lookback_hours` defaults to 120 (5 days). The overnight-window
    anchor lookup needs ES bars 15:00 prev-day → 02:00 today CT,
    which on a Saturday probe is ~50 hours back from `as_of`. The
    legacy 36h default left those bars outside the fetch range and
    `overnight_anchors` raised ValueError → API returned 500. 120h
    comfortably covers Monday-morning probes too (Mon 03:00 CT
    looking back to Thu 15:00 = 84h).

    `offset_override` (when not None) replaces the offset derived from
    the sync quote. Use this when yfinance's ES=F is showing a
    different contract than the broker's /ES — set it to the actual
    broker spread (SPX_cash - /ES_active) and the engine will produce
    broker-aligned entries even with yfinance bars.

    The meta dict surfaces which backend served bars, which served the
    SPX/ES sync quote, the offset that was actually applied (computed
    or override), and any errors encountered.
    """
    start = as_of - timedelta(hours=lookback_hours)
    bars = fetcher.fetch_es_bars(start, as_of)
    bars_count = len(bars)
    if not bars:
        raise RuntimeError(
            f"{fetcher.name} returned no ES bars in [{start}, {as_of}]"
        )
    quote = fetcher.fetch_sync_quote()
    computed_offset = quote.offset
    requested_offset = offset_override if offset_override is not None else computed_offset
    # ES structure is native. Keep the computed/requested basis in metadata for
    # transparency, but do not feed it into the native ES structure engine.
    applied_offset = 0.0
    snap = compute_snapshot(bars, applied_offset, as_of, **engine_kwargs)
    meta = {
        "fetcher": fetcher.name,
        "barsSource": getattr(fetcher, "last_bars_source", fetcher.name),
        "quoteSource": getattr(fetcher, "last_quote_source", fetcher.name),
        "barsError": getattr(fetcher, "last_bars_error", None),
        "quoteError": getattr(fetcher, "last_quote_error", None),
        "barsCount": bars_count,
        "lookbackHours": lookback_hours,
        "appliedOffset": round(applied_offset, 4),
        "computedOffset": round(computed_offset, 4),
        "requestedOffset": round(requested_offset, 4),
        "offsetSource": "native_es",
        # Sub-algorithm that produced the offset when offsetSource is
        # "computed". One of: "close_anchored" (preferred — daily SPX
        # close + ES at cash close), "intersection_1m" (last common
        # ES + SPX 1m tick), "latest_of_each" (defensive). Useful in
        # the FE debug overlay to confirm the live SPX is anchored
        # to the trader's expected basis source.
        "offsetMethod": getattr(fetcher, "last_offset_method", None),
        "spxSpot": round(quote.spx_spot, 2),
        "esSpot": round(quote.es_spot, 2),
        "quoteCapturedAt": quote.captured_at.isoformat(),
        "asOf": as_of.isoformat(),
    }
    return snap, meta
