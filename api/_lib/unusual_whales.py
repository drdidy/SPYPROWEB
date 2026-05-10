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
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from . import prophet_core as pc

BASE = "https://api.unusualwhales.com/api"


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


def _normalize_contract(row: dict) -> dict:
    return {
        "optionSymbol": _text(row, "option_symbol", "optionSymbol", "contract", "symbol"),
        "expiration": _text(row, "expiration", "expiry", "expiry_date", "expiration_date"),
        "dte": _num(row, "dte", "days_to_expiration"),
        "strike": _num(row, "strike", "strike_price"),
        "side": _side(row),
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


@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_flow_summary(ticker: str = "SPY") -> dict | None:
    """Recent options flow rolled into a directional lean."""
    raw = _first_response(
        [
            (f"/stock/{ticker}/flow-recent", {"limit": 50}),
            (f"/stock/{ticker}/flow-alerts", {"limit": 50}),
        ]
    )
    return _flow_lean(_rows(raw), ticker.upper())


@pc.ttl_cache(ttl_seconds=120.0, maxsize=8)
def fetch_gex_summary(ticker: str = "SPY") -> dict | None:
    """Dealer gamma exposure summary."""
    raw = _first_response(
        [
            (f"/stock/{ticker}/greek-exposure", None),
            (f"/stock/{ticker}/greeks", None),
        ]
    )
    if not raw:
        return None
    data = _data(raw)
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        return None
    gex = _num(data, "gex", "total_gex", "total_gamma", "gamma_exposure", "dealer_gamma")
    flip = _num(data, "flip_point", "zero_gamma", "zero_gamma_price", "gamma_flip")
    gex_f = gex if gex is not None else 0.0
    if gex_f > 0:
        regime = "POSITIVE"
    elif gex_f < 0:
        regime = "NEGATIVE"
    else:
        regime = "FLAT"
    return {
        "ticker": ticker.upper(),
        "totalGEX": round(gex_f, 2),
        "regime": regime,
        "flipPoint": flip,
    }


@pc.ttl_cache(ttl_seconds=60.0, maxsize=8)
def fetch_flow_alerts(ticker: str = "SPY") -> list[dict]:
    raw = _first_response(
        [
            (f"/stock/{ticker}/flow-alerts", {"limit": 20}),
            (f"/stock/{ticker}/flow-recent", {"limit": 20}),
        ]
    )
    alerts = []
    for r in _rows(raw)[:20]:
        alerts.append(
            {
                "ticker": ticker.upper(),
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


@pc.ttl_cache(ttl_seconds=120.0, maxsize=8)
def fetch_darkpool_summary(ticker: str = "SPY") -> dict | None:
    raw = _first_response(
        [
            (f"/darkpool/{ticker}", {"limit": 50}),
            (f"/darkpool/{ticker}/recent", {"limit": 50}),
            (f"/stock/{ticker}/darkpool", {"limit": 50}),
        ]
    )
    rows = _rows(raw)
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
        "count": len(rows),
        "totalPremium": round(total_premium, 0),
        "totalVolume": round(total_volume, 0),
        "avgPrice": round(avg_price, 2) if avg_price is not None else None,
        "topPrints": top_prints,
    }


@pc.ttl_cache(ttl_seconds=120.0, maxsize=8)
def fetch_option_chain(ticker: str = "SPY") -> dict | None:
    raw = _first_response(
        [
            (f"/stock/{ticker}/option-chains", None),
            (f"/stock/{ticker}/option-chain", None),
            (f"/stock/{ticker}/options", None),
        ]
    )
    contracts = [_normalize_contract(r) for r in _rows(raw)]
    contracts = [c for c in contracts if c["strike"] is not None and c["side"] in ("CALL", "PUT")]
    if not contracts:
        return None
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
    return {
        "ticker": ticker.upper(),
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


@pc.ttl_cache(ttl_seconds=120.0, maxsize=8)
def fetch_greeks(ticker: str = "SPY") -> list[dict]:
    raw = _first_response(
        [
            (f"/stock/{ticker}/greeks", {"limit": 50}),
            (f"/stock/{ticker}/greek-exposure", {"limit": 50}),
        ]
    )
    out = []
    for r in _rows(raw)[:50]:
        out.append(
            {
                "strike": _num(r, "strike", "strike_price"),
                "expiration": _text(r, "expiration", "expiry", "expiry_date", "expiration_date"),
                "side": _side(r),
                "delta": _num(r, "delta"),
                "gamma": _num(r, "gamma"),
                "theta": _num(r, "theta"),
                "vega": _num(r, "vega"),
                "iv": _num(r, "iv", "implied_volatility"),
                "gex": _num(r, "gex", "gamma_exposure", "total_gamma"),
            }
        )
    return out


def fetch_symbol_options_intel(ticker: str) -> dict:
    symbol = ticker.upper()
    flow = fetch_flow_summary(symbol)
    gex = fetch_gex_summary(symbol)
    alerts = fetch_flow_alerts(symbol)
    darkpool = fetch_darkpool_summary(symbol)
    chain = fetch_option_chain(symbol)
    greeks = fetch_greeks(symbol)
    return {
        "ticker": symbol,
        "available": bool(flow or gex or alerts or darkpool or chain or greeks),
        "flow": flow,
        "gex": gex,
        "flowAlerts": alerts,
        "darkPool": darkpool,
        "chain": chain,
        "greeks": greeks,
    }


@pc.ttl_cache(ttl_seconds=45.0, maxsize=4)
def fetch_options_bundle(tickers: tuple[str, ...] = ("SPY", "SPX")) -> dict:
    clean = tuple(dict.fromkeys(t.upper().strip() for t in tickers if t and t.strip()))
    symbols = {ticker: fetch_symbol_options_intel(ticker) for ticker in clean}
    return {
        "available": any(v.get("available") for v in symbols.values()),
        "asOf": datetime.now(timezone.utc).isoformat(),
        "symbols": symbols,
    }
