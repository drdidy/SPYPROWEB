"""Minimal REST-only Tastytrade options provider for Vercel serverless.

The Streamlit-side provider in spyprost/tastytrade_provider.py uses the
DXLink streamer for live bid/ask/greeks. Streaming has the wrong shape
for serverless (long-lived websockets, cold-start budget), so this port
only uses the REST option-chain endpoint. It returns enough data for the
Options Cockpit and Order Flow surfaces:

  - strike ladder near ATM (bid / ask / IV / delta / gamma / OI / volume)
  - nearest-DTE expiration date
  - aggregate call/put open-interest totals

All three secrets are required:
  TASTYTRADE_CLIENT_ID / TASTYTRADE_CLIENT_SECRET / TASTYTRADE_REFRESH_TOKEN

If any secret is missing or the API call fails, every public function
returns None and the snapshot's `options` field stays empty.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

from . import prophet_core as pc

TASTYTRADE_API_VERSION = "20251101"
ENV = os.getenv("TASTYTRADE_ENV", "production")
BASE = "https://api.tastytrade.com" if ENV == "production" else "https://api.cert.tastytrade.com"


def _has_secrets() -> bool:
    return all(os.getenv(k) for k in ("TASTYTRADE_CLIENT_ID", "TASTYTRADE_CLIENT_SECRET", "TASTYTRADE_REFRESH_TOKEN"))


def _http_post(url: str, data: dict, headers: dict, timeout: float = 6.0) -> dict | None:
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


def _http_get(url: str, headers: dict, timeout: float = 6.0) -> dict | None:
    req = urllib.request.Request(url, method="GET")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


@pc.ttl_cache(ttl_seconds=600.0, maxsize=1)
def _get_access_token() -> str | None:
    """Exchange the long-lived refresh token for a short-lived access token.
    10-minute TTL is well within Tastytrade's access-token expiry."""
    if not _has_secrets():
        return None
    headers = {"Accept": "application/json"}
    if ENV == "production":
        headers["Accept-Version"] = TASTYTRADE_API_VERSION
    payload = {
        "grant_type": "refresh_token",
        "client_id": os.environ["TASTYTRADE_CLIENT_ID"],
        "client_secret": os.environ["TASTYTRADE_CLIENT_SECRET"],
        "refresh_token": os.environ["TASTYTRADE_REFRESH_TOKEN"],
    }
    data = _http_post(f"{BASE}/oauth/token", payload, headers)
    if not data:
        return None
    return data.get("access_token")


@pc.ttl_cache(ttl_seconds=120.0, maxsize=4)
def _fetch_nested_chain(symbol: str = "SPY") -> dict | None:
    token = _get_access_token()
    if not token:
        return None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if ENV == "production":
        headers["Accept-Version"] = TASTYTRADE_API_VERSION
    return _http_get(f"{BASE}/option-chains/{symbol}/nested", headers)


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _flatten_expirations(chain: dict) -> list[dict]:
    """Tastytrade nests expirations one level deep; flatten to a list."""
    items = chain.get("data", {}).get("items", []) if isinstance(chain, dict) else []
    out: list[dict] = []
    for it in items:
        if it.get("expiration-date"):
            out.append(it)
        for cand in it.get("expirations", []) or []:
            if cand.get("expiration-date"):
                out.append(cand)
    return out


def _nearest_expiration(expirations: list[dict], now_ct: datetime) -> dict | None:
    today = now_ct.date()
    candidates = []
    for exp in expirations:
        try:
            d = datetime.strptime(exp["expiration-date"], "%Y-%m-%d").date()
        except (ValueError, KeyError):
            continue
        if d < today:
            continue
        candidates.append((d, exp))
    if not candidates:
        return None
    candidates.sort(key=lambda row: row[0])
    return candidates[0][1]


def _row_from_strike(strike: dict, side: str) -> dict | None:
    """Pull a single side (call/put) row from a 'strikes' entry. Returns
    None if the side isn't priced."""
    if not isinstance(strike, dict):
        return None
    bid = _safe_float(strike.get(f"{side}-bid"))
    ask = _safe_float(strike.get(f"{side}-ask"))
    if all(v != v for v in (bid, ask)):  # both nan
        return None
    return {
        "optionSymbol": strike.get(f"{side}-streamer-symbol") or strike.get(f"{side}-symbol"),
        "strike": _safe_float(strike.get("strike-price")),
        "side": "CALL" if side == "call" else "PUT",
        "bid": bid,
        "ask": ask,
        "mark": _safe_float(strike.get(f"{side}-mark") or strike.get(f"{side}-last")),
        "iv": _safe_float(strike.get(f"{side}-iv") or strike.get("iv") or strike.get("implied-volatility")),
        "delta": _safe_float(strike.get(f"{side}-delta") or strike.get("delta")),
        "gamma": _safe_float(strike.get(f"{side}-gamma") or strike.get("gamma")),
        "theta": _safe_float(strike.get(f"{side}-theta") or strike.get("theta")),
        "vega": _safe_float(strike.get(f"{side}-vega") or strike.get("vega")),
        "rho": _safe_float(strike.get(f"{side}-rho") or strike.get("rho")),
        "oi": _safe_float(strike.get(f"{side}-open-interest") or strike.get("open-interest")),
        "volume": _safe_float(strike.get(f"{side}-volume") or strike.get("volume")),
    }


def fetch_chain_snapshot(
    symbol: str = "SPY",
    underlying_price: float | None = None,
    span: int | None = 7,
) -> dict | None:
    """Return a dict with strike ladder + summary fields.

    Provider-neutral callers use this to enrich option-chain Greeks.
    When `underlying_price` is None or `span` is None, the nearest
    expiration's full strike list is returned.
    """
    if not _has_secrets():
        return None
    chain = _fetch_nested_chain(symbol)
    if not chain:
        return None
    now = datetime.now(tz=pc.get_central_tz())
    expirations = _flatten_expirations(chain)
    nearest = _nearest_expiration(expirations, now)
    if nearest is None:
        return None

    strikes_list = nearest.get("strikes") or []
    atm = round(underlying_price) if underlying_price is not None else _infer_atm(strikes_list)
    lo = atm - span if span is not None and atm is not None else float("-inf")
    hi = atm + span if span is not None and atm is not None else float("inf")
    rows_call: list[dict] = []
    rows_put: list[dict] = []

    for s in strikes_list:
        try:
            sp = float(s.get("strike-price"))
        except (TypeError, ValueError):
            continue
        if sp < lo or sp > hi:
            continue
        c = _row_from_strike(s, "call")
        p = _row_from_strike(s, "put")
        if c is not None:
            c["expiration"] = nearest.get("expiration-date")
            rows_call.append(c)
        if p is not None:
            p["expiration"] = nearest.get("expiration-date")
            rows_put.append(p)

    rows_call.sort(key=lambda r: r["strike"])
    rows_put.sort(key=lambda r: r["strike"])

    if not rows_call and not rows_put:
        return None

    total_call_oi = sum(r.get("oi") or 0 for r in rows_call if r.get("oi") == r.get("oi"))
    total_put_oi = sum(r.get("oi") or 0 for r in rows_put if r.get("oi") == r.get("oi"))
    total_call_vol = sum(r.get("volume") or 0 for r in rows_call if r.get("volume") == r.get("volume"))
    total_put_vol = sum(r.get("volume") or 0 for r in rows_put if r.get("volume") == r.get("volume"))

    return {
        "ticker": symbol.upper(),
        "expiration": nearest.get("expiration-date"),
        "atm": atm,
        "calls": rows_call,
        "puts": rows_put,
        "totals": {
            "callOi": int(total_call_oi),
            "putOi": int(total_put_oi),
            "callVol": int(total_call_vol),
            "putVol": int(total_put_vol),
            "pcr": (total_put_oi / total_call_oi) if total_call_oi else None,
        },
    }


def fetch_options_snapshot(underlying_price: float, span: int = 7) -> dict | None:
    """Backward-compatible SPY options snapshot used by the SPY engine."""
    return fetch_chain_snapshot("SPY", underlying_price=underlying_price, span=span)


def _infer_atm(strikes: list[dict]) -> int | None:
    """Infer a useful center when no underlying price is supplied.

    The broker chain can be requested by the Options tab without a
    live spot. Use the highest combined-volume strike as the center
    when possible, otherwise the median strike.
    """
    parsed = []
    for s in strikes:
        try:
            sp = float(s.get("strike-price"))
        except (TypeError, ValueError):
            continue
        vol = _safe_float(s.get("call-volume")) + _safe_float(s.get("put-volume"))
        if vol != vol:
            vol = 0.0
        parsed.append((sp, vol))
    if not parsed:
        return None
    best = max(parsed, key=lambda row: row[1])
    if best[1] > 0:
        return round(best[0])
    parsed.sort(key=lambda row: row[0])
    return round(parsed[len(parsed) // 2][0])
