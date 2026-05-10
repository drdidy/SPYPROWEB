"""Unusual Whales REST provider.

The public functions in this module are intentionally defensive:
missing credentials, unavailable endpoints, or schema drift return
None/empty sections instead of synthetic values. The Options tab can
then show exactly what is available without inventing market data.

Provides:
  - fetch_flow_summary(ticker)
  - fetch_gex_summary(ticker)
  - fetch_options_bundle(tickers)
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, time, timedelta, timezone
import urllib.error
import urllib.parse
import urllib.request
from typing import Any
from zoneinfo import ZoneInfo

from . import prophet_core as pc
from . import tastytrade

BASE = "https://api.unusualwhales.com/api"
CT = ZoneInfo("America/Chicago")
OPTIONS_SESSION_START = time(8, 30)
OPTIONS_SESSION_END = time(15, 15)


def _has_key() -> bool:
    return bool(os.environ.get("UNUSUAL_WHALES_API_KEY"))


def _http_get(path: str, params: dict | None = None, timeout: float = 6.0) -> Any:
    if not _has_key():
        return None
    url = f"{BASE}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {os.environ['UNUSUAL_WHALES_API_KEY']}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


def _first_response(candidates: list[tuple[str, dict | None]]) -> Any:
    for path, params in candidates:
        raw = _http_get(path, params)
        if raw:
            return raw
    return None


def _previous_weekday(d: date) -> date:
    d = d - timedelta(days=1)
    while d.weekday() >= 5:
        d = d - timedelta(days=1)
    return d


def effective_options_date(now: datetime | None = None) -> str:
    """Date used for session-scoped options intelligence.

    During an open weekday session we request today's data. Before the
    open, after the close, and on weekends, the freshest honest read is
    the most recent completed weekday. This keeps Sunday from rendering
    partial/empty current-day flow as if it were real.
    """
    now_ct = (now or datetime.now(CT)).astimezone(CT)
    today = now_ct.date()
    if today.weekday() >= 5:
        d = today
        while d.weekday() >= 5:
            d = d - timedelta(days=1)
        return d.isoformat()
    if OPTIONS_SESSION_START <= now_ct.time() <= OPTIONS_SESSION_END:
        return today.isoformat()
    return _previous_weekday(today).isoformat()


def _date_params(effective_date: str | None, extra: dict | None = None) -> dict:
    params = dict(extra or {})
    if effective_date:
        # UW historical endpoints use `date`. Keep this exact; some
        # endpoints reject unknown query names with 422.
        params.setdefault("date", effective_date)
    return params


def _row_date(row: dict) -> str | None:
    raw = _text(row, "executed_at", "timestamp", "created_at", "time", "ts", "date")
    if not raw:
        return None
    if len(raw) >= 10 and raw[4:5] == "-" and raw[7:8] == "-":
        return raw[:10]
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(CT).date().isoformat()
    except (TypeError, ValueError):
        return None


def _filter_rows_for_date(rows: list[dict], effective_date: str | None) -> list[dict]:
    if not effective_date:
        return rows
    dated = [r for r in rows if _row_date(r) == effective_date]
    # If the endpoint returns rows without timestamps, keep them rather
    # than discarding useful chain/Greek payloads. If it returns dated
    # rows from the wrong session, render no-read instead of stale data.
    undated = [r for r in rows if _row_date(r) is None]
    return dated if dated else undated


def _data(raw: Any) -> Any:
    if isinstance(raw, dict) and "data" in raw:
        return raw.get("data")
    return raw


def _rows(raw: Any) -> list[dict]:
    data = _data(raw)
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        for key in ("items", "rows", "contracts", "chains", "results", "data"):
            maybe = data.get(key)
            if isinstance(maybe, list):
                return [r for r in maybe if isinstance(r, dict)]
    return []


def _num(row: dict, *keys: str) -> float | None:
    for key in keys:
        val = row.get(key)
        if val is None or val == "":
            continue
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return None


def _clean_num(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None


def _int(row: dict, *keys: str) -> int:
    val = _num(row, *keys)
    return int(val) if val is not None else 0


def _text(row: dict, *keys: str) -> str | None:
    for key in keys:
        val = row.get(key)
        if val is not None and val != "":
            return str(val)
    return None


def _side(row: dict) -> str:
    raw = (_text(row, "side", "type", "option_type", "contract_type", "call_put", "put_call") or "").upper()
    if raw in ("C", "CALL", "CALLS"):
        return "CALL"
    if raw in ("P", "PUT", "PUTS"):
        return "PUT"
    symbol = (_text(row, "option_symbol", "optionSymbol", "symbol", "ticker") or "").upper()
    if "C" in symbol[-9:]:
        return "CALL"
    if "P" in symbol[-9:]:
        return "PUT"
    return "UNKNOWN"


def _parse_osi_symbol(symbol: str | None) -> dict:
    if not symbol or len(symbol) < 15:
        return {}
    tail = symbol[-15:]
    yymmdd = tail[:6]
    cp = tail[6:7]
    strike_raw = tail[7:]
    try:
        expiry = f"20{yymmdd[:2]}-{yymmdd[2:4]}-{yymmdd[4:6]}"
        strike = int(strike_raw) / 1000
    except (TypeError, ValueError):
        return {}
    return {
        "expiration": expiry,
        "side": "CALL" if cp == "C" else "PUT" if cp == "P" else "UNKNOWN",
        "strike": strike,
    }


def _normalize_contract(row: dict) -> dict:
    parsed = _parse_osi_symbol(_text(row, "option_symbol", "optionSymbol", "contract", "symbol"))
    return {
        "optionSymbol": _text(row, "option_symbol", "optionSymbol", "contract", "symbol"),
        "expiration": _text(row, "expiration", "expiry", "expiry_date", "expiration_date") or parsed.get("expiration"),
        "dte": _num(row, "dte", "days_to_expiration"),
        "strike": _num(row, "strike", "strike_price") or parsed.get("strike"),
        "side": _side(row) if _side(row) != "UNKNOWN" else parsed.get("side", "UNKNOWN"),
        "bid": _num(row, "bid"),
        "ask": _num(row, "ask"),
        "mark": _num(row, "mark", "mid", "price", "last"),
        "iv": _num(row, "iv", "implied_volatility"),
        "delta": _num(row, "delta"),
        "gamma": _num(row, "gamma"),
        "theta": _num(row, "theta"),
        "vega": _num(row, "vega"),
        "rho": _num(row, "rho"),
        "oi": _int(row, "open_interest", "oi"),
        "volume": _int(row, "volume", "vol"),
    }


def _broker_contract(row: dict) -> dict:
    return {
        "optionSymbol": _text(row, "optionSymbol", "option_symbol"),
        "expiration": _text(row, "expiration"),
        "dte": _clean_num(row.get("dte")),
        "strike": _clean_num(row.get("strike")),
        "side": _text(row, "side") or "UNKNOWN",
        "bid": _clean_num(row.get("bid")),
        "ask": _clean_num(row.get("ask")),
        "mark": _clean_num(row.get("mark")),
        "iv": _clean_num(row.get("iv")),
        "delta": _clean_num(row.get("delta")),
        "gamma": _clean_num(row.get("gamma")),
        "theta": _clean_num(row.get("theta")),
        "vega": _clean_num(row.get("vega")),
        "rho": _clean_num(row.get("rho")),
        "oi": int(_clean_num(row.get("oi")) or 0),
        "volume": int(_clean_num(row.get("volume")) or 0),
    }


def _chain_from_broker(ticker: str, session_date: str, require_expiration: str | None = None) -> dict | None:
    chain = tastytrade.fetch_chain_snapshot(ticker, underlying_price=None, span=None)
    if not chain:
        return None
    expiration = chain.get("expiration")
    if require_expiration and expiration != require_expiration:
        return None
    calls = [_broker_contract(c) for c in chain.get("calls") or []]
    puts = [_broker_contract(p) for p in chain.get("puts") or []]
    calls = [c for c in calls if c["strike"] is not None and c["side"] == "CALL"]
    puts = [p for p in puts if p["strike"] is not None and p["side"] == "PUT"]
    if not calls and not puts:
        return None
    call_oi = sum(int(c.get("oi") or 0) for c in calls)
    put_oi = sum(int(c.get("oi") or 0) for c in puts)
    call_vol = sum(int(c.get("volume") or 0) for c in calls)
    put_vol = sum(int(c.get("volume") or 0) for c in puts)
    return {
        "ticker": ticker.upper(),
        "sessionDate": session_date,
        "expiration": expiration,
        "calls": sorted(calls, key=lambda c: c["strike"] or 0),
        "puts": sorted(puts, key=lambda c: c["strike"] or 0),
        "totals": {
            "callOi": call_oi,
            "putOi": put_oi,
            "callVol": call_vol,
            "putVol": put_vol,
            "pcr": round(put_vol / call_vol, 2) if call_vol > 0 else None,
        },
    }


def _has_contract_greeks(chain: dict | None) -> bool:
    if not chain:
        return False
    for row in (chain.get("calls") or []) + (chain.get("puts") or []):
        if row.get("delta") is not None or row.get("gamma") is not None:
            return True
    return False


def _merge_chain_greeks(base: dict, greek_chain: dict) -> dict:
    if base.get("expiration") != greek_chain.get("expiration"):
        return base
    greek_by_key = {
        (row.get("side"), row.get("strike")): row
        for row in (greek_chain.get("calls") or []) + (greek_chain.get("puts") or [])
    }
    for side_key, rows_key in (("CALL", "calls"), ("PUT", "puts")):
        for row in base.get(rows_key) or []:
            match = greek_by_key.get((side_key, row.get("strike")))
            if not match:
                continue
            for field in ("bid", "ask", "mark", "iv", "delta", "gamma", "theta", "vega", "rho", "oi", "volume"):
                if row.get(field) is None or field in ("delta", "gamma", "theta", "vega", "rho"):
                    val = match.get(field)
                    if val is not None:
                        row[field] = val
    return base


def _gex_total(row: dict) -> float | None:
    call = _num(row, "call_gamma", "call_gex", "callGamma", "callGex")
    put = _num(row, "put_gamma", "put_gex", "putGamma", "putGex")
    direct = _num(row, "gex", "total_gex", "total_gamma", "net_gex", "netGamma")
    if direct is not None:
        return direct
    if call is None and put is None:
        return None
    return (call or 0.0) + (put or 0.0)


def _gex_strike_rows(raw: Any, effective_date: str) -> list[dict]:
    out = []
    for row in _filter_rows_for_date(_rows(raw), effective_date):
        total = _gex_total(row)
        strike = _num(row, "strike", "price")
        if total is None or strike is None:
            continue
        out.append(
            {
                "strike": strike,
                "callGEX": _num(row, "call_gex", "call_gamma"),
                "putGEX": _num(row, "put_gex", "put_gamma"),
                "netGEX": round(total, 2),
            }
        )
    return sorted(out, key=lambda r: r["strike"])


def _gamma_flip(strike_rows: list[dict]) -> float | None:
    prev: dict | None = None
    for row in strike_rows:
        if prev is not None:
            a = float(prev.get("netGEX") or 0)
            b = float(row.get("netGEX") or 0)
            if a == 0:
                return float(prev["strike"])
            if (a < 0 <= b) or (a > 0 >= b):
                return float(row["strike"])
        prev = row
    return None


def _flow_lean(items: list[dict], ticker: str) -> dict | None:
    if not items:
        return None
    bullish = 0
    bearish = 0
    premium_net = 0.0
    top_prints: list[dict] = []
    for r in items:
        side_field = (_text(r, "side", "trade_side", "sentiment") or "").upper()
        opt_type = (_text(r, "type", "option_type", "contract_type") or "").upper()
        prem = _num(r, "premium", "notional", "total_premium", "value") or 0.0
        is_buy = side_field in ("ASK", "BUY", "BULLISH")
        if opt_type == "CALL":
            if is_buy:
                bullish += 1
                premium_net += prem
            else:
                bearish += 1
                premium_net -= prem
        elif opt_type == "PUT":
            if is_buy:
                bearish += 1
                premium_net -= prem
            else:
                bullish += 1
                premium_net += prem
        if prem > 0 and len(top_prints) < 5:
            top_prints.append(
                {
                    "strike": _num(r, "strike", "strike_price"),
                    "side": opt_type or side_field or "?",
                    "premium": round(prem, 0),
                    "ts": _text(r, "executed_at", "timestamp", "created_at", "time", "ts"),
                }
            )

    if bullish == 0 and bearish == 0:
        lean = "BALANCED"
    else:
        ratio = bullish / max(1, bullish + bearish)
        lean = "BULLISH" if ratio > 0.6 else "BEARISH" if ratio < 0.4 else "BALANCED"

    return {
        "ticker": ticker,
        "bullishCount": bullish,
        "bearishCount": bearish,
        "premiumNet": round(premium_net, 0),
        "lean": lean,
        "topPrints": top_prints,
    }


@pc.ttl_cache(ttl_seconds=60.0, maxsize=16)
def fetch_flow_summary(ticker: str = "SPY", effective_date: str | None = None) -> dict | None:
    """Recent options flow rolled into a directional lean."""
    session_date = effective_date or effective_options_date()
    raw = _first_response(
        [
            (f"/stock/{ticker}/flow-recent", _date_params(session_date, {"limit": 50})),
            (f"/stock/{ticker}/flow-alerts", _date_params(session_date, {"limit": 50})),
        ]
    )
    flow = _flow_lean(_filter_rows_for_date(_rows(raw), session_date), ticker.upper())
    if flow:
        flow["sessionDate"] = session_date
    return flow


@pc.ttl_cache(ttl_seconds=120.0, maxsize=16)
def fetch_gex_summary(ticker: str = "SPY", effective_date: str | None = None) -> dict | None:
    """Dealer gamma exposure summary."""
    session_date = effective_date or effective_options_date()
    raw = _first_response(
        [
            (f"/stock/{ticker}/greek-exposure", _date_params(session_date)),
        ]
    )
    if not raw:
        return None
    rows = _filter_rows_for_date(_rows(raw), session_date)
    if not rows:
        return None
    latest = rows[0]
    gex_f = _gex_total(latest)
    if gex_f is None:
        return None
    strike_raw = _first_response(
        [
            (f"/stock/{ticker}/greek-exposure/strike", _date_params(session_date)),
        ]
    )
    strike_levels = _gex_strike_rows(strike_raw, session_date)
    flip = _gamma_flip(strike_levels)
    if gex_f > 0:
        regime = "POSITIVE"
    elif gex_f < 0:
        regime = "NEGATIVE"
    else:
        regime = "FLAT"
    return {
        "ticker": ticker.upper(),
        "sessionDate": session_date,
        "totalGEX": round(gex_f, 2),
        "regime": regime,
        "flipPoint": flip,
        "strikeLevels": strike_levels[:80],
    }


@pc.ttl_cache(ttl_seconds=60.0, maxsize=16)
def fetch_flow_alerts(ticker: str = "SPY", effective_date: str | None = None) -> list[dict]:
    session_date = effective_date or effective_options_date()
    raw = _first_response(
        [
            (f"/stock/{ticker}/flow-alerts", _date_params(session_date, {"limit": 20})),
            (f"/stock/{ticker}/flow-recent", _date_params(session_date, {"limit": 20})),
        ]
    )
    alerts = []
    for r in _filter_rows_for_date(_rows(raw), session_date)[:20]:
        alerts.append(
            {
                "ticker": ticker.upper(),
                "sessionDate": session_date,
                "optionSymbol": _text(r, "option_symbol", "optionSymbol", "contract", "symbol"),
                "side": _side(r),
                "strike": _num(r, "strike", "strike_price"),
                "expiration": _text(r, "expiration", "expiry", "expiry_date", "expiration_date"),
                "premium": _num(r, "premium", "notional", "total_premium", "value"),
                "volume": _num(r, "volume", "vol", "size"),
                "sentiment": _text(r, "sentiment", "side", "trade_side"),
                "ts": _text(r, "executed_at", "timestamp", "created_at", "time", "ts"),
            }
        )
    return alerts


@pc.ttl_cache(ttl_seconds=120.0, maxsize=16)
def fetch_darkpool_summary(ticker: str = "SPY", effective_date: str | None = None) -> dict | None:
    session_date = effective_date or effective_options_date()
    raw = _first_response(
        [
            (f"/darkpool/{ticker}", _date_params(session_date, {"limit": 50})),
            (f"/darkpool/{ticker}/recent", _date_params(session_date, {"limit": 50})),
            (f"/stock/{ticker}/darkpool", _date_params(session_date, {"limit": 50})),
        ]
    )
    rows = _filter_rows_for_date(_rows(raw), session_date)
    if not rows:
        return None
    total_premium = 0.0
    total_volume = 0.0
    weighted_notional = 0.0
    top_prints: list[dict] = []
    for r in rows:
        price = _num(r, "price", "executed_price", "last")
        volume = _num(r, "volume", "size", "shares") or 0.0
        premium = _num(r, "premium", "notional", "value", "amount")
        if premium is None and price is not None:
            premium = price * volume
        premium = premium or 0.0
        total_volume += volume
        total_premium += premium
        if price is not None and volume > 0:
            weighted_notional += price * volume
        if len(top_prints) < 8:
            top_prints.append(
                {
                    "price": price,
                    "volume": volume or None,
                    "premium": round(premium, 0) if premium else None,
                    "ts": _text(r, "executed_at", "timestamp", "created_at", "time", "ts"),
                }
            )
    avg_price = weighted_notional / total_volume if total_volume > 0 else None
    return {
        "ticker": ticker.upper(),
        "sessionDate": session_date,
        "count": len(rows),
        "totalPremium": round(total_premium, 0),
        "totalVolume": round(total_volume, 0),
        "avgPrice": round(avg_price, 2) if avg_price is not None else None,
        "topPrints": top_prints,
    }


@pc.ttl_cache(ttl_seconds=120.0, maxsize=16)
def fetch_option_chain(ticker: str = "SPY", effective_date: str | None = None) -> dict | None:
    session_date = effective_date or effective_options_date()
    raw = _first_response(
        [
            (f"/stock/{ticker}/option-contracts", {"limit": 500}),
            (f"/stock/{ticker}/option-chains", _date_params(session_date)),
        ]
    )
    contracts = [_normalize_contract(r) for r in _rows(raw)]
    contracts = [c for c in contracts if c["strike"] is not None and c["side"] in ("CALL", "PUT")]
    if not contracts:
        return _chain_from_broker(ticker, session_date, require_expiration=None if session_date == datetime.now(CT).date().isoformat() else session_date)
    expirations = [c["expiration"] for c in contracts if c["expiration"]]
    expiration = sorted(expirations)[0] if expirations else None
    if expiration:
        active = [c for c in contracts if c["expiration"] == expiration]
        if active:
            contracts = active
    calls = sorted([c for c in contracts if c["side"] == "CALL"], key=lambda c: c["strike"] or 0)
    puts = sorted([c for c in contracts if c["side"] == "PUT"], key=lambda c: c["strike"] or 0)
    call_oi = sum(int(c.get("oi") or 0) for c in calls)
    put_oi = sum(int(c.get("oi") or 0) for c in puts)
    call_vol = sum(int(c.get("volume") or 0) for c in calls)
    put_vol = sum(int(c.get("volume") or 0) for c in puts)
    out = {
        "ticker": ticker.upper(),
        "sessionDate": session_date,
        "expiration": expiration,
        "calls": calls,
        "puts": puts,
        "totals": {
            "callOi": call_oi,
            "putOi": put_oi,
            "callVol": call_vol,
            "putVol": put_vol,
            "pcr": round(put_vol / call_vol, 2) if call_vol > 0 else None,
        },
    }
    if not _has_contract_greeks(out):
        broker = _chain_from_broker(ticker, session_date, require_expiration=expiration)
        if broker and _has_contract_greeks(broker):
            out = _merge_chain_greeks(out, broker)
    return out


@pc.ttl_cache(ttl_seconds=120.0, maxsize=16)
def fetch_greeks(ticker: str = "SPY", effective_date: str | None = None) -> list[dict]:
    session_date = effective_date or effective_options_date()
    chain = fetch_option_chain(ticker, session_date)
    expiry = chain.get("expiration") if chain else None
    if not expiry:
        return []
    raw = _first_response(
        [
            (f"/stock/{ticker}/greeks", _date_params(session_date, {"expiry": expiry})),
        ]
    )
    out = []
    for r in _filter_rows_for_date(_rows(raw), session_date)[:50]:
        strike = _num(r, "strike", "strike_price")
        expiration = _text(r, "expiration", "expiry", "expiry_date", "expiration_date") or expiry
        pairs = [
            (
                "CALL",
                {
                    "optionSymbol": _text(r, "call_option_symbol"),
                    "delta": _num(r, "call_delta"),
                    "gamma": _num(r, "call_gamma"),
                    "theta": _num(r, "call_theta"),
                    "vega": _num(r, "call_vega"),
                    "rho": _num(r, "call_rho"),
                    "iv": _num(r, "call_volatility"),
                },
            ),
            (
                "PUT",
                {
                    "optionSymbol": _text(r, "put_option_symbol"),
                    "delta": _num(r, "put_delta"),
                    "gamma": _num(r, "put_gamma"),
                    "theta": _num(r, "put_theta"),
                    "vega": _num(r, "put_vega"),
                    "rho": _num(r, "put_rho"),
                    "iv": _num(r, "put_volatility"),
                },
            ),
        ]
        for side, vals in pairs:
            if vals["delta"] is None and vals["gamma"] is None and vals["iv"] is None:
                continue
            out.append(
                {
                    "sessionDate": session_date,
                    "strike": strike,
                    "expiration": expiration,
                    "side": side,
                    **vals,
                }
            )
    if out:
        return out
    # Contract Greeks are present in the broker chain even when UW's
    # /greeks endpoint is unavailable for the selected expiry.
    broker = _chain_from_broker(ticker, session_date, require_expiration=expiry)
    if not broker:
        return []
    rows = []
    for row in (broker.get("calls") or []) + (broker.get("puts") or []):
        if row.get("delta") is None and row.get("gamma") is None and row.get("iv") is None:
            continue
        rows.append(
            {
                "sessionDate": session_date,
                "strike": row.get("strike"),
                "expiration": expiry,
                "side": row.get("side"),
                "optionSymbol": row.get("optionSymbol"),
                "delta": row.get("delta"),
                "gamma": row.get("gamma"),
                "theta": row.get("theta"),
                "vega": row.get("vega"),
                "rho": row.get("rho"),
                "iv": row.get("iv"),
                "gex": None,
            }
        )
    return rows


def fetch_symbol_options_intel(ticker: str, effective_date: str | None = None) -> dict:
    symbol = ticker.upper()
    session_date = effective_date or effective_options_date()
    flow = fetch_flow_summary(symbol, session_date)
    gex = fetch_gex_summary(symbol, session_date)
    alerts = fetch_flow_alerts(symbol, session_date)
    darkpool = fetch_darkpool_summary(symbol, session_date)
    chain = fetch_option_chain(symbol, session_date)
    greeks = fetch_greeks(symbol, session_date) if chain else []
    return {
        "ticker": symbol,
        "sessionDate": session_date,
        "available": bool(flow or gex or alerts or darkpool or chain or greeks),
        "flow": flow,
        "gex": gex,
        "flowAlerts": alerts,
        "darkPool": darkpool,
        "chain": chain,
        "greeks": greeks,
    }


@pc.ttl_cache(ttl_seconds=45.0, maxsize=8)
def fetch_options_bundle(tickers: tuple[str, ...] = ("SPY", "SPX"), effective_date: str | None = None) -> dict:
    clean = tuple(dict.fromkeys(t.upper().strip() for t in tickers if t and t.strip()))
    session_date = effective_date or effective_options_date()
    today_ct = datetime.now(CT).date().isoformat()
    symbols = {ticker: fetch_symbol_options_intel(ticker, session_date) for ticker in clean}
    return {
        "available": any(v.get("available") for v in symbols.values()),
        "asOf": datetime.now(timezone.utc).isoformat(),
        "sessionDate": session_date,
        "isHistoricalSession": session_date != today_ct,
        "symbols": symbols,
    }
