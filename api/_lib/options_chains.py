"""Broker-backed option-chain bundle for the execution lens.

This module intentionally returns tradable chain data only. Flow, dark
pool, and GEX integrations are future premium add-ons, not launch
dependencies.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from . import schwab, tastytrade

CT = ZoneInfo("America/Chicago")

# Keep the launch surface intentionally bounded to liquid, high-confidence
# names the Stocks Engine already supports. Symbols outside this set fail
# closed instead of receiving a guessed contract ticket.
SUPPORTED_SYMBOLS = {
    "SPY",
    "SPX",
    "QQQ",
    "JNJ",
    "LLY",
    "PFE",
    "MRK",
    "ABBV",
    "GILD",
    "TMO",
    "ABT",
    "ISRG",
    "JPM",
    "GS",
    "BAC",
    "MS",
    "C",
    "BLK",
    "AXP",
    "SCHW",
    "COF",
    "USB",
    "CME",
    "SPGI",
    "MCO",
    "COP",
    "SLB",
    "OXY",
    "HAL",
    "MPC",
    "LNG",
    "AAPL",
    "MSFT",
    "GOOGL",
    "GOOG",
    "AMZN",
    "NVDA",
    "AVGO",
    "ORCL",
    "QCOM",
    "INTU",
    "CSCO",
    "IBM",
    "TXN",
    "AMAT",
    "PANW",
    "WMT",
    "KO",
    "PEP",
    "MO",
    "KMB",
    "PM",
    "MDLZ",
    "GIS",
    "KHC",
    "KR",
    "HSY",
    "SYY",
    "PLTR",
    "SMCI",
    "ARM",
    "RDDT",
    "HOOD",
    "RIVN",
    "SOFI",
    "MARA",
    "RIOT",
}
OPTIONS_SESSION_START = time(8, 30)
OPTIONS_SESSION_END = time(15, 15)
NYSE_HOLIDAYS_2026 = {
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-04-03",
    "2026-05-25",
    "2026-06-19",
    "2026-07-03",
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
}


def _is_trading_date(d) -> bool:
    return d.weekday() < 5 and d.isoformat() not in NYSE_HOLIDAYS_2026


def _previous_weekday(d):
    d = d - timedelta(days=1)
    while not _is_trading_date(d):
        d = d - timedelta(days=1)
    return d


def _next_weekday(d):
    d = d + timedelta(days=1)
    while not _is_trading_date(d):
        d = d + timedelta(days=1)
    return d


def effective_options_date(now: datetime | None = None) -> str:
    now_ct = (now or datetime.now(CT)).astimezone(CT)
    today = now_ct.date()
    if not _is_trading_date(today):
        return _previous_weekday(today).isoformat()
    if now_ct.time() >= OPTIONS_SESSION_START:
        return today.isoformat()
    return _previous_weekday(today).isoformat()


def effective_chain_date(now: datetime | None = None) -> str:
    now_ct = (now or datetime.now(CT)).astimezone(CT)
    today = now_ct.date()
    if not _is_trading_date(today):
        return _next_weekday(today).isoformat()
    if now_ct.time() > OPTIONS_SESSION_END:
        return _next_weekday(today).isoformat()
    return today.isoformat()


def fetch_symbol_options_intel(ticker: str, session_date: str | None = None) -> dict:
    symbol = ticker.upper().strip()
    session = session_date or effective_options_date()
    chain_date = effective_chain_date()
    # SPX tickets need enough OTM strikes to satisfy configurable debit budgets.
    # Equities and ETFs are mostly weekly expiries, so they should ask for the
    # nearest available expiration instead of forcing the next trading date.
    strike_spans = (160, 120, 80, 50, 24) if symbol == "SPX" else (40, 24)
    expiration_candidates = (chain_date, None) if symbol == "SPX" else (None,)
    chain = None
    if schwab.has_secrets():
        for strike_span in strike_spans:
            for expiration_date in expiration_candidates:
                chain = schwab.fetch_chain_snapshot(
                    symbol,
                    underlying_price=None,
                    span=strike_span,
                    expiration_date=expiration_date,
                )
                if chain:
                    break
            if chain:
                break
    else:
        # Force the provider diagnostic into the standard public wording.
        schwab.fetch_chain_snapshot(symbol, underlying_price=None, span=1, expiration_date=None)
    if chain:
        _enrich_missing_greeks_from_secondary(symbol, chain)
        chain["sessionDate"] = session
        chain["chainDate"] = chain.get("expiration") or chain_date
    return {
        "ticker": symbol,
        "sessionDate": session,
        "chainDate": chain.get("chainDate") if chain else chain_date,
        "available": bool(chain),
        "diagnostic": None if chain else (schwab.last_error_public() or "Broker did not return an options chain."),
        "diagnosticCode": None if chain else schwab.last_error_code(),
        "flow": None,
        "gex": None,
        "flowAlerts": [],
        "darkPool": None,
        "chain": chain,
        "greekCoverage": _greek_coverage(chain),
        "greeks": [],
    }


GREEK_FIELDS = ("iv", "delta", "gamma", "theta", "vega", "rho")


def _enrich_missing_greeks_from_secondary(symbol: str, chain: dict) -> None:
    """Fill missing Greeks from the secondary broker without replacing chain data.

    Schwab remains the tradable chain source for bid/ask/mark, OI, volume, and
    expiration selection. If Schwab returns placeholder or missing Greeks, the
    app can use the existing Tastytrade connection as an enrichment source for
    the same expiration and strike.
    """
    if not isinstance(chain, dict) or not _chain_needs_greek_enrichment(chain):
        return
    secondary = tastytrade.fetch_chain_snapshot(
        symbol,
        underlying_price=chain.get("atm"),
        span=None,
    )
    if not secondary or secondary.get("expiration") != chain.get("expiration"):
        return

    secondary_rows = _rows_by_side_and_strike(secondary)
    for row in _chain_rows(chain):
        match = secondary_rows.get(_row_key(row))
        if not match:
            continue
        for field in GREEK_FIELDS:
            if _usable_number(row.get(field)):
                continue
            value = match.get(field)
            if _usable_number(value):
                row[field] = float(value)


def _chain_needs_greek_enrichment(chain: dict) -> bool:
    return any(
        any(not _usable_number(row.get(field)) for field in GREEK_FIELDS)
        for row in _chain_rows(chain)
    )


def _chain_rows(chain: dict) -> list[dict]:
    rows: list[dict] = []
    for side in ("calls", "puts"):
        side_rows = chain.get(side)
        if isinstance(side_rows, list):
            rows.extend(row for row in side_rows if isinstance(row, dict))
    return rows


def _rows_by_side_and_strike(chain: dict) -> dict[tuple[str, float], dict]:
    return {
        key: row
        for row in _chain_rows(chain)
        if (key := _row_key(row)) is not None
    }


def _row_key(row: dict) -> tuple[str, float] | None:
    side = str(row.get("side") or "").upper()
    try:
        strike = round(float(row.get("strike")), 4)
    except (TypeError, ValueError):
        return None
    if side not in {"CALL", "PUT"}:
        return None
    return side, strike


def _usable_number(value) -> bool:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return False
    return parsed == parsed and parsed > -900


def _greek_coverage(chain: dict | None) -> dict:
    if not isinstance(chain, dict):
        return {"totalRows": 0, "deltaRows": 0, "gammaRows": 0, "ivRows": 0, "ready": False}
    rows = _chain_rows(chain)
    total = len(rows)
    delta_rows = sum(1 for row in rows if _usable_number(row.get("delta")))
    gamma_rows = sum(1 for row in rows if _usable_number(row.get("gamma")))
    iv_rows = sum(1 for row in rows if _usable_number(row.get("iv")))
    return {
        "totalRows": total,
        "deltaRows": delta_rows,
        "gammaRows": gamma_rows,
        "ivRows": iv_rows,
        "ready": total > 0 and delta_rows > 0 and gamma_rows > 0,
    }


def fetch_options_bundle(
    tickers: tuple[str, ...] = ("SPY", "SPX"),
    effective_date: str | None = None,
) -> dict:
    clean = tuple(
        dict.fromkeys(
            t.upper().strip()
            for t in tickers
            if t and t.upper().strip() in SUPPORTED_SYMBOLS
        )
    ) or ("SPY", "SPX")
    session_date = effective_date or effective_options_date()
    chain_date = effective_chain_date()
    today_ct = datetime.now(CT).date().isoformat()
    symbols = {
        ticker: fetch_symbol_options_intel(ticker, session_date)
        for ticker in clean
    }
    return {
        "available": any(v.get("available") for v in symbols.values()),
        "asOf": datetime.now(timezone.utc).isoformat(),
        "sessionDate": session_date,
        "chainDate": chain_date,
        "isHistoricalSession": session_date != today_ct,
        "symbols": symbols,
        "premiumSignals": {
            "flow": "future",
            "gex": "future",
        },
    }
