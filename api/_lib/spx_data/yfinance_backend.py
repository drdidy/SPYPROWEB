"""yfinance backend.

Free, no-auth source backed by Yahoo Finance. Useful as:
  - dev / staging fallback when the broker is unreachable
  - historical research and backtests (years of ES daily/hourly without
    burning broker rate limits)

Limitations to know:
  - 15-min delay on indices, varies for futures
  - Continuous front-month roll causes occasional discontinuities
  - Yahoo can break their endpoints; yfinance breaks with them
  - Some hours have gaps especially around CME maintenance

The engine treats this as just another Fetcher; trust comes from the
data, not the source.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..spx.candles import Candle

from .protocol import FetcherUnavailable, SyncQuote

CT = ZoneInfo("America/Chicago")


class YFinanceFetcher:
    name = "yfinance"

    ES_TICKER = "ES=F"   # E-mini S&P 500 continuous front month
    SPX_TICKER = "^GSPC"  # S&P 500 cash index

    # ---- ES bars ------------------------------------------------------------

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]:
        try:
            import yfinance as yf  # local import so module imports cheaply
        except ImportError as e:
            raise FetcherUnavailable(
                "yfinance not installed. `pip install yfinance` to enable this backend."
            ) from e

        start_ct = _to_ct(start)
        end_ct = _to_ct(end)
        # yfinance's `start`/`end` are date-grain; pad by a day either side
        # then filter to the requested window precisely.
        df = yf.download(
            self.ES_TICKER,
            start=(start_ct - timedelta(days=1)).date(),
            end=(end_ct + timedelta(days=1)).date(),
            interval="1h",
            progress=False,
            auto_adjust=False,
            actions=False,
        )
        if df is None or df.empty:
            return []

        # yfinance can return a MultiIndex on columns when ticker count > 1;
        # we passed a single ticker, but be defensive in case yfinance changes.
        if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
            df.columns = df.columns.get_level_values(0)

        candles: list[Candle] = []
        for ts, row in df.iterrows():
            try:
                ct_ts = _ts_to_ct(ts)
            except Exception:
                continue
            if ct_ts < start_ct or ct_ts >= end_ct:
                continue
            try:
                candles.append(
                    Candle(
                        t=ct_ts,
                        o=float(row["Open"]),
                        h=float(row["High"]),
                        l=float(row["Low"]),
                        c=float(row["Close"]),
                        v=float(row.get("Volume", 0) or 0),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return candles

    # ---- Sync quote ---------------------------------------------------------

    def fetch_sync_quote(self) -> SyncQuote:
        """Pull the latest 1m bar for ES and SPX and use closes as the spot pair.

        Not perfectly synchronous (the bars may close a few seconds apart) but
        fine for offset derivation — the basis drifts over hours, not seconds.
        """
        try:
            import yfinance as yf
        except ImportError as e:
            raise FetcherUnavailable(
                "yfinance not installed. `pip install yfinance` to enable this backend."
            ) from e

        es_hist = yf.Ticker(self.ES_TICKER).history(period="1d", interval="1m")
        spx_hist = yf.Ticker(self.SPX_TICKER).history(period="1d", interval="1m")
        if es_hist.empty or spx_hist.empty:
            raise FetcherUnavailable(
                "yfinance returned no recent quotes for ES or SPX (market closed?)"
            )
        es_last = float(es_hist["Close"].iloc[-1])
        spx_last = float(spx_hist["Close"].iloc[-1])
        captured = _ts_to_ct(es_hist.index[-1])
        return SyncQuote(spx_spot=spx_last, es_spot=es_last, captured_at=captured)

    # ---- Health -------------------------------------------------------------

    def healthy(self) -> bool:
        try:
            self.fetch_sync_quote()
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_ct(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=CT)
    return dt.astimezone(CT)


def _ts_to_ct(ts) -> datetime:
    """Convert a pandas Timestamp / datetime to CT-aware datetime."""
    # pandas.Timestamp has tz_localize / tz_convert. Naive plain datetimes do not.
    if hasattr(ts, "tz_convert"):
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        return ts.tz_convert("America/Chicago").to_pydatetime()
    return _to_ct(ts)
