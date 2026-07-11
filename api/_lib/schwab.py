"""Charles Schwab Trader API provider.

Server-side only. Uses OAuth refresh-token credentials from environment:
SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, SCHWAB_REFRESH_TOKEN.
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

import pandas as pd

from . import prophet_core as pc

AUTH_BASE = "https://api.schwabapi.com"
MARKET_BASE = "https://api.schwabapi.com/marketdata/v1"
TOKEN_REFRESH_SAFETY_SECONDS = 60

_access_token: str | None = None
_access_expires_at = 0.0
_last_error: str | None = None
_last_error_code: str | None = None


def has_secrets() -> bool:
    client_id, client_secret, refresh_token = _credentials()
    return bool(client_id and client_secret and refresh_token)


def last_error() -> str | None:
    return _last_error


def last_error_code() -> str | None:
    return _last_error_code


def last_error_public() -> str | None:
    if not _last_error:
        return None
    if _last_error_code == "missing_credentials":
        return "Broker connection is not configured."
    if _last_error_code == "schwab_refresh_rejected":
        return "Broker authorization needs reconnection."
    if _last_error_code == "schwab_rate_limited":
        return "Broker is rate limiting requests."
    if _last_error_code == "schwab_unavailable":
        return "Broker service is temporarily unavailable."
    return "Broker connection needs attention."


def fetch_equity_quote(symbol: str = "SPY") -> float | None:
    quote = fetch_quote(symbol)
    return _extract_last_price(quote)


def fetch_quote(symbol: str) -> dict | None:
    token = _get_access_token()
    if not token:
        return None
    clean = symbol.strip().upper()
    params = urllib.parse.urlencode({"symbols": clean, "fields": "quote"})
    body = _http_get(
        f"{MARKET_BASE}/quotes?{params}",
        {"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=4.0,
    )
    if not isinstance(body, dict):
        return None
    item = body.get(clean) or body.get(clean.replace(".", "/"))
    if isinstance(item, dict):
        return item
    for value in body.values():
        if not isinstance(value, dict):
            continue
        ref = value.get("reference") if isinstance(value.get("reference"), dict) else {}
        quote = value.get("quote") if isinstance(value.get("quote"), dict) else {}
        item_symbol = str(value.get("symbol") or ref.get("symbol") or quote.get("symbol") or "").upper()
        if item_symbol == clean:
            return value
    return None


def fetch_price_history_frame(
    symbol: str = "SPY",
    *,
    period_type: str = "day",
    period: int = 10,
    frequency_type: str = "minute",
    frequency: int = 30,
    need_extended_hours: bool = True,
) -> pd.DataFrame:
    token = _get_access_token()
    if not token:
        return pd.DataFrame()
    params = urllib.parse.urlencode(
        {
            "symbol": symbol.strip().upper(),
            "periodType": period_type,
            "period": str(period),
            "frequencyType": frequency_type,
            "frequency": str(frequency),
            "needExtendedHoursData": "true" if need_extended_hours else "false",
        }
    )
    body = _http_get(
        f"{MARKET_BASE}/pricehistory?{params}",
        {"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=6.0,
    )
    candles = body.get("candles") if isinstance(body, dict) else None
    if not isinstance(candles, list) or not candles:
        return pd.DataFrame()
    rows = []
    for candle in candles:
        if not isinstance(candle, dict):
            continue
        try:
            rows.append(
                {
                    "Datetime": pd.to_datetime(int(candle["datetime"]), unit="ms", utc=True),
                    "Open": float(candle["open"]),
                    "High": float(candle["high"]),
                    "Low": float(candle["low"]),
                    "Close": float(candle["close"]),
                    "Volume": float(candle.get("volume") or 0),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows).set_index("Datetime").sort_index()
    return pc.ensure_central_index(df)


def fetch_last_and_prev(symbol: str) -> tuple[float, float]:
    df = fetch_price_history_frame(
        symbol,
        period_type="month",
        period=1,
        frequency_type="daily",
        frequency=1,
        need_extended_hours=False,
    )
    if df.empty or "Close" not in df:
        return float("nan"), float("nan")
    closes = df["Close"].dropna()
    if closes.empty:
        return float("nan"), float("nan")
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) >= 2 else float("nan")
    return last, prev


def fetch_last_close(symbol: str) -> float:
    last, _prev = fetch_last_and_prev(symbol)
    return last


def fetch_chain_snapshot(
    symbol: str = "SPY",
    underlying_price: float | None = None,
    span: int | None = 7,
    expiration_date: str | None = None,
) -> dict | None:
    token = _get_access_token()
    if not token:
        return None
    requested_symbol = symbol.strip().upper()
    for broker_symbol in _option_chain_symbol_candidates(requested_symbol):
        params = {
            "symbol": broker_symbol,
            "contractType": "ALL",
            "includeUnderlyingQuote": "true",
            "strategy": "SINGLE",
        }
        if expiration_date:
            params["fromDate"] = expiration_date
            params["toDate"] = expiration_date
        if span is not None:
            params["strikeCount"] = str(max(10, span * 2 + 1))
        body = _http_get(
            f"{MARKET_BASE}/chains?{urllib.parse.urlencode(params)}",
            {"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=7.0,
        )
        if not isinstance(body, dict):
            continue
        snapshot = _chain_to_snapshot(body, requested_symbol, underlying_price, span)
        if snapshot:
            return snapshot
    return None


def fetch_options_snapshot(underlying_price: float, span: int = 7) -> dict | None:
    return fetch_chain_snapshot("SPY", underlying_price=underlying_price, span=span)


def _option_chain_symbol_candidates(symbol: str) -> list[str]:
    clean = symbol.strip().upper()
    if clean == "SPX":
        return ["$SPX", "SPX", "$SPX.X", "SPXW"]
    return [clean]


def _get_access_token() -> str | None:
    global _access_token, _access_expires_at
    if _access_token and time.time() < _access_expires_at:
        return _access_token
    client_id, client_secret, refresh_token = _credentials()
    if not client_id or not client_secret or not refresh_token:
        _set_error("missing_credentials", "Schwab credentials are missing.")
        return None
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    data = {"grant_type": "refresh_token", "refresh_token": refresh_token}
    body = _http_post(
        f"{AUTH_BASE}/v1/oauth/token",
        data,
        {
            "Authorization": f"Basic {auth}",
            "Accept": "application/json",
        },
        timeout=6.0,
    )
    if not isinstance(body, dict):
        _access_token = None
        return None
    token = body.get("access_token")
    if not isinstance(token, str) or not token:
        _access_token = None
        return None
    try:
        expires_in = float(body.get("expires_in") or 1800)
    except (TypeError, ValueError):
        expires_in = 1800
    _access_token = token
    _access_expires_at = time.time() + expires_in - TOKEN_REFRESH_SAFETY_SECONDS
    return token


def _chain_to_snapshot(
    chain: dict,
    symbol: str,
    underlying_price: float | None,
    span: int | None,
) -> dict | None:
    now = datetime.now(tz=pc.get_central_tz())
    expirations = _expiration_keys(chain)
    if not expirations:
        return None
    nearest_key = sorted(expirations, key=lambda key: key.split(":")[0])[0]
    expiration = nearest_key.split(":")[0]
    call_map = chain.get("callExpDateMap") if isinstance(chain.get("callExpDateMap"), dict) else {}
    put_map = chain.get("putExpDateMap") if isinstance(chain.get("putExpDateMap"), dict) else {}
    calls_raw = call_map.get(nearest_key) if isinstance(call_map.get(nearest_key), dict) else {}
    puts_raw = put_map.get(nearest_key) if isinstance(put_map.get(nearest_key), dict) else {}
    strikes = sorted({_to_float(k) for k in [*calls_raw.keys(), *puts_raw.keys()] if _to_float(k) == _to_float(k)})
    if not strikes:
        return None
    resolved_underlying = underlying_price
    if resolved_underlying is None:
        resolved_underlying = _underlying_price(chain)
    atm = (
        round(resolved_underlying)
        if resolved_underlying is not None
        else round(strikes[len(strikes) // 2])
    )
    lo = atm - span if span is not None else float("-inf")
    hi = atm + span if span is not None else float("inf")
    rows_call = [
        _option_row(opt, "CALL", expiration)
        for strike, opts in calls_raw.items()
        if lo <= _to_float(strike) <= hi
        for opt in (opts if isinstance(opts, list) else [])
        if isinstance(opt, dict)
    ]
    rows_put = [
        _option_row(opt, "PUT", expiration)
        for strike, opts in puts_raw.items()
        if lo <= _to_float(strike) <= hi
        for opt in (opts if isinstance(opts, list) else [])
        if isinstance(opt, dict)
    ]
    rows_call = [r for r in rows_call if r is not None]
    rows_put = [r for r in rows_put if r is not None]
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
        "expiration": expiration,
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


def _expiration_keys(chain: dict) -> set[str]:
    keys: set[str] = set()
    for map_key in ("callExpDateMap", "putExpDateMap"):
        value = chain.get(map_key)
        if isinstance(value, dict):
            keys.update(str(k) for k in value.keys())
    return keys


def _underlying_price(chain: dict) -> float | None:
    candidates = [
        chain.get("underlyingPrice"),
        chain.get("lastPrice"),
        chain.get("mark"),
    ]
    underlying = chain.get("underlying")
    if isinstance(underlying, dict):
        candidates.extend(
            [
                underlying.get("last"),
                underlying.get("lastPrice"),
                underlying.get("mark"),
                underlying.get("markPrice"),
            ],
        )
    for value in candidates:
        price = _to_float(value)
        if price == price and price > 0:
            return price
    return None


def _option_row(opt: dict, side: str, expiration: str) -> dict | None:
    strike = _num(opt, "strikePrice")
    if strike != strike:
        return None
    return {
        "optionSymbol": opt.get("symbol"),
        "streamerSymbol": opt.get("symbol"),
        "strike": strike,
        "side": side,
        "bid": _nullable_num(opt, "bid"),
        "ask": _nullable_num(opt, "ask"),
        "mark": _nullable_num(opt, "mark", "last"),
        "iv": _nullable_num(opt, "volatility"),
        "delta": _nullable_num(opt, "delta"),
        "gamma": _nullable_num(opt, "gamma"),
        "theta": _nullable_num(opt, "theta"),
        "vega": _nullable_num(opt, "vega"),
        "rho": _nullable_num(opt, "rho"),
        "oi": _nullable_num(opt, "openInterest"),
        "volume": _nullable_num(opt, "totalVolume", "volume"),
        "expiration": expiration,
    }


def _extract_last_price(item: dict | None) -> float | None:
    if not isinstance(item, dict):
        return None
    quote = item.get("quote") if isinstance(item.get("quote"), dict) else item
    regular = item.get("regular") if isinstance(item.get("regular"), dict) else {}
    extended = item.get("extended") if isinstance(item.get("extended"), dict) else {}
    for target, keys in (
        (quote, ("lastPrice", "last", "mark", "markPrice", "regularMarketLastPrice")),
        (regular, ("regularMarketLastPrice", "closePrice")),
        (extended, ("lastPrice",)),
        (quote, ("closePrice",)),
    ):
        for key in keys:
            value = _to_float(target.get(key))
            if value == value and value > 0:
                return value
    bid = _to_float(quote.get("bidPrice") or quote.get("bid"))
    ask = _to_float(quote.get("askPrice") or quote.get("ask"))
    if bid == bid and ask == ask and bid > 0 and ask > 0:
        return round((bid + ask) / 2, 4)
    return None


def _num(item: dict, *keys: str) -> float:
    for key in keys:
        value = _to_float(item.get(key))
        if value == value and value > -900:
            return value
    return float("nan")


def _nullable_num(item: dict, *keys: str) -> float | None:
    value = _num(item, *keys)
    return value if value == value else None


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _credentials() -> tuple[str | None, str | None, str | None]:
    client_id = _clean_env("SCHWAB_CLIENT_ID") or _clean_env("SCHWAB_APP_KEY")
    client_secret = _clean_env("SCHWAB_CLIENT_SECRET") or _clean_env("SCHWAB_APP_SECRET")
    refresh_token = _clean_env("SCHWAB_REFRESH_TOKEN")
    return client_id, client_secret, refresh_token


def _clean_env(key: str) -> str | None:
    value = os.getenv(key)
    if value is None:
        return None
    clean = value.strip().strip('"').strip("'").strip()
    for prefix in (
        key,
        "SCHWAB_CLIENT_ID",
        "SCHWAB_CLIENT_SECRET",
        "SCHWAB_APP_KEY",
        "SCHWAB_APP_SECRET",
        "SCHWAB_REFRESH_TOKEN",
    ):
        marker = f"{prefix}="
        if clean.startswith(marker):
            clean = clean[len(marker):].strip().strip('"').strip("'").strip()
    return clean or None


def _set_error(code: str, message: str) -> None:
    global _last_error, _last_error_code
    _last_error_code = code
    _last_error = message


def _schwab_error_message(exc: urllib.error.HTTPError, path: str) -> tuple[str, str]:
    text = ""
    try:
        text = exc.read().decode("utf-8", errors="replace")
    except Exception:
        text = ""
    lowered = text.lower()
    if path.endswith("/oauth/token") and exc.code in (400, 401, 403):
        return "schwab_refresh_rejected", "Schwab authorization was rejected."
    if exc.code == 400 and ("invalid_grant" in lowered or "unsupported_token_type" in lowered):
        return "schwab_refresh_rejected", "Schwab refresh token was rejected."
    if exc.code in (401, 403):
        return "schwab_refresh_rejected", "Schwab authorization was rejected."
    if exc.code == 429:
        return "schwab_rate_limited", "Schwab is rate limiting requests."
    if exc.code >= 500:
        return "schwab_unavailable", "Schwab service is unavailable."
    return "schwab_http_error", f"HTTP {exc.code} from {path}"


def _http_post(url: str, data: dict, headers: dict, timeout: float = 6.0) -> dict | None:
    global _last_error, _last_error_code
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            _last_error = None
            _last_error_code = None
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        code, message = _schwab_error_message(exc, urllib.parse.urlparse(url).path)
        _set_error(code, message)
        return None
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        _set_error("schwab_network_error", exc.__class__.__name__)
        return None


def _http_get(url: str, headers: dict, timeout: float = 6.0) -> dict | None:
    global _last_error, _last_error_code
    req = urllib.request.Request(url, method="GET")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            _last_error = None
            _last_error_code = None
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        code, message = _schwab_error_message(exc, urllib.parse.urlparse(url).path)
        _set_error(code, message)
        return None
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        _set_error("schwab_network_error", exc.__class__.__name__)
        return None
