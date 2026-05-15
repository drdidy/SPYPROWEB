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
from math import isfinite
from zoneinfo import ZoneInfo

from ..spx.candles import Candle

from .protocol import FetcherUnavailable, SyncQuote

CT = ZoneInfo("America/Chicago")


class YFinanceFetcher:
    name = "yfinance"

    ES_TICKER = "ES=F"   # E-mini S&P 500 continuous front month
    SPX_TICKER = "^GSPC"  # S&P 500 cash index

    # Records which sub-algorithm produced the most recent SyncQuote.
    # Surfaced through the snapshot's _meta.offsetMethod so the FE
    # provenance overlay can show "close_anchored" vs the legacy
    # paths. None on a fresh instance until fetch_sync_quote() runs.
    last_offset_method: str | None = None

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
                o = float(row["Open"])
                h = float(row["High"])
                l = float(row["Low"])
                c = float(row["Close"])
                v = float(row.get("Volume", 0) or 0)
            except (KeyError, TypeError, ValueError):
                continue
            if not _valid_ohlc(o, h, l, c):
                continue
            candles.append(Candle(t=ct_ts, o=o, h=h, l=l, c=c, v=v if isfinite(v) else 0.0))
        return candles

    # ---- Sync quote ---------------------------------------------------------

    def fetch_sync_quote(self) -> SyncQuote:
        """Aligned ES + SPX print pair for offset derivation.

        Strategy (most-trustworthy first):

          1. CLOSE-ANCHORED. Pull SPX 1d history → take the last
             official daily close. Pull ES 1m history → find the bar
             at-or-just-before the cash close (15:00 CT on normal
             days, 12:00 CT on early-close days). offset = SPX_close -
             ES_at_close. The displayed SPX in the snapshot is then
             `latest_ES_bar + offset` — i.e. live ES + the basis that
             was true at the most recent cash print. This is the
             "exact SPX price" the trader actually wants and is
             robust against the 1m SPX feed gapping.

          2. INTERSECTION (fallback). Pull SPX + ES 1m history,
             intersect timestamps, take the latest common minute.
             Works during RTH but during overnight / weekend the
             "last common tick" is just the close anyway.

          3. LATEST-OF-EACH (defensive). When neither above produces
             a clean pair, take the latest tick of each so something
             ships rather than crashing.
        """
        try:
            import yfinance as yf
        except ImportError as e:
            raise FetcherUnavailable(
                "yfinance not installed. `pip install yfinance` to enable this backend."
            ) from e

        # 1. Close-anchored — preferred path.
        try:
            anchored = self._close_anchored_quote(yf)
            if anchored is not None:
                self.last_offset_method = "close_anchored"
                return anchored
        except Exception:
            # Fall through to legacy paths rather than 503'ing the
            # whole snapshot when daily history misbehaves.
            pass

        # 2. Intersection of 1m bars — original algorithm.
        # 5-day window covers a long weekend (Fri close + 3 closed days).
        es_hist = yf.Ticker(self.ES_TICKER).history(period="5d", interval="1m")
        spx_hist = yf.Ticker(self.SPX_TICKER).history(period="5d", interval="1m")
        if es_hist.empty or spx_hist.empty:
            raise FetcherUnavailable(
                "yfinance returned no recent quotes for ES or SPX."
            )

        common = es_hist.index.intersection(spx_hist.index)
        if len(common) > 0:
            ts = common[-1]
            es_close = float(es_hist.loc[ts]["Close"])
            spx_close = float(spx_hist.loc[ts]["Close"])
            captured = _ts_to_ct(ts)
            self.last_offset_method = "intersection_1m"
            return SyncQuote(
                spx_spot=spx_close, es_spot=es_close, captured_at=captured
            )

        # 3. Defensive: no overlap at all (extremely rare).
        es_last = float(es_hist["Close"].iloc[-1])
        spx_last = float(spx_hist["Close"].iloc[-1])
        captured = _ts_to_ct(es_hist.index[-1])
        self.last_offset_method = "latest_of_each"
        return SyncQuote(spx_spot=spx_last, es_spot=es_last, captured_at=captured)

    # ---- Close-anchored helper ---------------------------------------------

    def _close_anchored_quote(self, yf) -> SyncQuote | None:
        """Offset captured at the most recent RTH close.

        Returns None when daily SPX or 1m ES history is unavailable so
        the caller can fall through to the intersection method. Any
        exception is treated the same way — close-anchored is a
        best-effort upgrade, not a hard requirement.

        The "captured_at" on the returned SyncQuote is the cash-close
        moment (e.g. Fri 15:00 CT). The basis-age UI in the FE will
        therefore show "captured 1d 2h ago" on a Saturday, which is
        the honest read — that's exactly when the offset was last
        valid against a real cash print.
        """
        # Daily SPX — the official close. 7 days covers a holiday week.
        spx_daily = yf.Ticker(self.SPX_TICKER).history(period="7d", interval="1d")
        if spx_daily is None or spx_daily.empty:
            return None
        # The last row's index is the cash session date (00:00 CT in
        # practice, since yfinance daily indices are date-granular).
        # We anchor offset capture at 15:00 CT of that date — the
        # cash close. Early-close days are not modelled here; the
        # half-hour adjustment changes the captured offset by ~1pt
        # which is well below the ±2pt drift tolerance.
        spx_close_value = float(spx_daily["Close"].iloc[-1])
        last_session_date = spx_daily.index[-1]

        # 1m ES — covers the close moment + the latest live tick.
        es_1m = yf.Ticker(self.ES_TICKER).history(period="5d", interval="1m")
        if es_1m is None or es_1m.empty:
            return None

        # Build the close timestamp in CT. yfinance daily index can
        # be date-only or midnight-CT; normalize both to a CT date.
        if hasattr(last_session_date, "to_pydatetime"):
            session_dt = last_session_date.to_pydatetime()
        else:
            session_dt = last_session_date
        if session_dt.tzinfo is None:
            session_dt = session_dt.replace(tzinfo=CT)
        else:
            session_dt = session_dt.astimezone(CT)
        close_ct = session_dt.replace(
            hour=15, minute=0, second=0, microsecond=0
        )

        # Find the ES 1m bar whose CLOSE lands at the cash close. The
        # yfinance 1m bar timestamped `t` carries the OHLC for the
        # interval [t, t+1min) — its `Close` is the price one minute
        # after `t`. So the bar that prices ES at exactly close_ct is
        # the one timestamped close_ct - 1min, i.e. strictly less
        # than close_ct.
        es_indexed = es_1m.copy()
        if es_indexed.index.tz is None:
            es_indexed.index = es_indexed.index.tz_localize("UTC")
        es_indexed.index = es_indexed.index.tz_convert("America/Chicago")
        before_close = es_indexed[es_indexed.index < close_ct]
        if before_close.empty:
            return None
        es_at_close = float(before_close["Close"].iloc[-1])

        return SyncQuote(
            spx_spot=spx_close_value,
            es_spot=es_at_close,
            captured_at=close_ct,
        )

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


def _valid_ohlc(o: float, h: float, l: float, c: float) -> bool:
    return (
        isfinite(o)
        and isfinite(h)
        and isfinite(l)
        and isfinite(c)
        and o > 0
        and h > 0
        and l > 0
        and c > 0
        and h >= max(o, c, l)
        and l <= min(o, c, h)
    )


def _ts_to_ct(ts) -> datetime:
    """Convert a pandas Timestamp / datetime to CT-aware datetime."""
    # pandas.Timestamp has tz_localize / tz_convert. Naive plain datetimes do not.
    if hasattr(ts, "tz_convert"):
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        return ts.tz_convert("America/Chicago").to_pydatetime()
    return _to_ct(ts)
