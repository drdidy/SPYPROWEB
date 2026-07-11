"""Schwab backend for ES/SPX market data.

Schwab's public Trader API has clear support for equity/index market data.
Futures support can vary by account/app entitlement, so this backend tries
Schwab first and raises FetcherUnavailable when /ES symbols are rejected.
The CompositeFetcher can then keep the ES engine alive with its secondary
history source.
"""
from __future__ import annotations

from datetime import datetime, date
from zoneinfo import ZoneInfo

import pandas as pd

from .. import schwab as schwab_api
from ..spx.candles import Candle
from ..spx.time_utils import to_ct
from .protocol import FetcherUnavailable, SyncQuote

CT = ZoneInfo("America/Chicago")


class SchwabFetcher:
    name = "schwab"

    def __init__(self) -> None:
        self._es_symbol: str | None = None
        self.last_offset_method: str | None = None

    def healthy(self) -> bool:
        return schwab_api.has_secrets()

    def fetch_es_bars(self, start: datetime, end: datetime) -> list[Candle]:
        errors: list[str] = []
        for symbol in self._es_candidates():
            df = schwab_api.fetch_price_history_frame(
                symbol,
                period_type="day",
                period=10,
                frequency_type="minute",
                frequency=30,
                need_extended_hours=True,
            )
            if df is None or df.empty:
                errors.append(symbol)
                continue
            hourly = (
                df.resample("60min", label="left", closed="left")
                .agg({"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"})
                .dropna(subset=["Open", "High", "Low", "Close"])
            )
            candles = _frame_to_candles(hourly, start, end)
            if candles:
                self._es_symbol = symbol
                return candles
        raise FetcherUnavailable(
            "Schwab did not return usable ES price history for candidates: "
            + ", ".join(errors or self._es_candidates())
        )

    def fetch_sync_quote(self) -> SyncQuote:
        anchored = self._close_anchored_quote()
        if anchored is not None:
            self.last_offset_method = "close_anchored"
            return anchored

        spx = _first_quote(["$SPX", "SPX", "^SPX"])
        es_symbol = self._es_symbol
        es = schwab_api.fetch_equity_quote(es_symbol) if es_symbol else None
        if es is None:
            for symbol in self._es_candidates():
                es = schwab_api.fetch_equity_quote(symbol)
                if es is not None and es > 0:
                    self._es_symbol = symbol
                    break
        if spx is None or es is None:
            raise FetcherUnavailable("Schwab did not return both SPX and ES quotes.")
        self.last_offset_method = "latest_of_each"
        return SyncQuote(spx_spot=float(spx), es_spot=float(es), captured_at=to_ct(datetime.now(CT)))

    def _es_candidates(self) -> list[str]:
        now = datetime.now(CT)
        explicit = _configured_es_symbols()
        quarters = [(3, "H"), (6, "M"), (9, "U"), (12, "Z")]
        year = now.year
        out = [*explicit]
        for add_year in range(0, 2):
            y = year + add_year
            for month, code in quarters:
                if add_year == 0 and month < now.month:
                    continue
                out.append(f"/ES{code}{str(y)[-2:]}")
                out.append(f"/ES{code}{str(y)[-1:]}")
        out.append("/ES")
        return list(dict.fromkeys(out))

    def _close_anchored_quote(self) -> SyncQuote | None:
        """Use the last cash close basis instead of mixing stale SPX with live ES.

        On holidays and overnight sessions, Schwab can return the last official
        SPX cash print while ES futures keep trading. If we subtract live ES from
        that stale cash print, the basis can appear 70+ points too wide. The
        correct planning basis is SPX cash close minus ES at that same cash
        close, then current ES can be translated by that fixed basis.
        """
        spx_daily = _first_history_frame(
            ["$SPX", "SPX", "^SPX"],
            period_type="month",
            period=1,
            frequency_type="daily",
            frequency=1,
            need_extended_hours=False,
        )
        if spx_daily is None or spx_daily.empty or "Close" not in spx_daily:
            return None
        closes = spx_daily["Close"].dropna()
        if closes.empty:
            return None
        spx_close = float(closes.iloc[-1])
        session_ts = to_ct(closes.index[-1].to_pydatetime())
        close_ct = session_ts.replace(hour=15, minute=0, second=0, microsecond=0)

        for symbol in self._es_quote_candidates():
            es_1m = schwab_api.fetch_price_history_frame(
                symbol,
                period_type="day",
                period=10,
                frequency_type="minute",
                frequency=1,
                need_extended_hours=True,
            )
            if es_1m is None or es_1m.empty or "Close" not in es_1m:
                continue
            frame = es_1m.sort_index()
            before_close = frame[frame.index < close_ct]["Close"].dropna()
            if before_close.empty:
                continue
            self._es_symbol = symbol
            return SyncQuote(
                spx_spot=spx_close,
                es_spot=float(before_close.iloc[-1]),
                captured_at=close_ct,
            )
        return None

    def _es_quote_candidates(self) -> list[str]:
        return list(dict.fromkeys(([self._es_symbol] if self._es_symbol else []) + self._es_candidates()))


def _configured_es_symbols() -> list[str]:
    """Optional broker contract override, for example SCHWAB_ES_SYMBOL=/ESM26."""
    import os

    raw = os.getenv("SCHWAB_ES_SYMBOL") or os.getenv("SCHWAB_ES_SYMBOLS")
    if not raw:
        return []
    symbols = []
    for item in raw.replace(";", ",").split(","):
        symbol = item.strip().upper()
        if not symbol:
            continue
        if not symbol.startswith("/"):
            symbol = "/" + symbol
        symbols.append(symbol)
    return symbols


def _first_history_frame(symbols: list[str], **kwargs) -> pd.DataFrame | None:
    for symbol in symbols:
        df = schwab_api.fetch_price_history_frame(symbol, **kwargs)
        if df is not None and not df.empty:
            return df
    return None


def _test_es_candidates(today: date, configured: list[str] | None = None) -> list[str]:
    quarters = [(3, "H"), (6, "M"), (9, "U"), (12, "Z")]
    out = [*(configured or [])]
    for add_year in range(0, 2):
        y = today.year + add_year
        for month, code in quarters:
            if add_year == 0 and month < today.month:
                continue
            out.append(f"/ES{code}{str(y)[-2:]}")
            out.append(f"/ES{code}{str(y)[-1:]}")
    out.append("/ES")
    return list(dict.fromkeys(out))


def _first_quote(symbols: list[str]) -> float | None:
    for symbol in symbols:
        value = schwab_api.fetch_equity_quote(symbol)
        if value is not None and value > 0:
            return value
    return None


def _frame_to_candles(df: pd.DataFrame, start: datetime, end: datetime) -> list[Candle]:
    if df is None or df.empty:
        return []
    start_ct = to_ct(start)
    end_ct = to_ct(end)
    frame = df[(df.index >= start_ct) & (df.index < end_ct)].sort_index()
    candles: list[Candle] = []
    for ts, row in frame.iterrows():
        try:
            candles.append(
                Candle(
                    t=to_ct(ts.to_pydatetime()),
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
