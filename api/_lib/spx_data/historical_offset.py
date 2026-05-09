"""Historical SPX/ES offset for replay-mode snapshots.

The live `fetch_sync_quote()` path uses the most recent common 1-minute
tick between ^GSPC and ES=F to derive today's basis. For backtest /
replay days that's wrong: applying today's offset to historical ES bars
shifts the channel by however much the basis has drifted since then
(can easily be a few points week to week).

This helper computes the offset *as it stood on the chosen date* by
asking yfinance for that day's hourly ^GSPC and ES=F bars and pairing
the last common print at or before 15:00 CT (RTH close).

Why hourly: 1-minute history caps at ~7 days; hourly extends ~730 days,
which matches the SPY engine's replay window.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .protocol import FetcherUnavailable, SyncQuote

CT = ZoneInfo("America/Chicago")
ES_TICKER = "ES=F"
SPX_TICKER = "^GSPC"


def historical_offset_for_date(target: date) -> SyncQuote:
    """Last common ^GSPC + ES=F hourly print at-or-before 15:00 CT on `target`.

    Returns a SyncQuote whose `.offset` is the historical SPX_cash − ES
    spread for that day. Caller can pass `quote.offset` as
    `offset_override` to `build_snapshot_with_provenance`.

    Raises FetcherUnavailable when yfinance returns nothing usable
    (target too old, weekend with no prior session in window, etc.).
    """
    try:
        import yfinance as yf
    except ImportError as e:
        raise FetcherUnavailable(
            "yfinance not installed. `pip install yfinance` to enable historical offset."
        ) from e

    rth_close = datetime.combine(target, time(15, 0), tzinfo=CT)
    window_start = rth_close - timedelta(days=4)

    es_hist = yf.download(
        tickers=ES_TICKER,
        start=window_start.date(),
        end=(target + timedelta(days=1)).isoformat(),
        interval="1h",
        progress=False,
        auto_adjust=False,
        actions=False,
    )
    spx_hist = yf.download(
        tickers=SPX_TICKER,
        start=window_start.date(),
        end=(target + timedelta(days=1)).isoformat(),
        interval="1h",
        progress=False,
        auto_adjust=False,
        actions=False,
    )
    if es_hist is None or es_hist.empty or spx_hist is None or spx_hist.empty:
        raise FetcherUnavailable(
            f"yfinance returned no hourly bars for {target.isoformat()} window."
        )

    if hasattr(es_hist.columns, "nlevels") and es_hist.columns.nlevels > 1:
        es_hist.columns = es_hist.columns.get_level_values(0)
    if hasattr(spx_hist.columns, "nlevels") and spx_hist.columns.nlevels > 1:
        spx_hist.columns = spx_hist.columns.get_level_values(0)

    def _ct_idx(df):
        idx = df.index
        try:
            return idx.tz_convert(CT) if idx.tzinfo else idx.tz_localize("UTC").tz_convert(CT)
        except Exception:
            return idx

    es_hist.index = _ct_idx(es_hist)
    spx_hist.index = _ct_idx(spx_hist)

    es_at = es_hist[es_hist.index <= rth_close]
    spx_at = spx_hist[spx_hist.index <= rth_close]
    if es_at.empty or spx_at.empty:
        raise FetcherUnavailable(
            f"No bars at or before {rth_close.isoformat()} for {target.isoformat()}."
        )

    common = es_at.index.intersection(spx_at.index)
    if len(common) == 0:
        raise FetcherUnavailable(
            f"No common ES + ^GSPC hour at or before {rth_close.isoformat()}."
        )
    last_ts = common.max()

    es_close = float(es_at.loc[last_ts, "Close"])
    spx_close = float(spx_at.loc[last_ts, "Close"])
    return SyncQuote(
        spx_spot=spx_close,
        es_spot=es_close,
        captured_at=last_ts.to_pydatetime() if hasattr(last_ts, "to_pydatetime") else last_ts,
    )
