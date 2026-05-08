"""Unusual Whales REST provider.

Lightweight client for the public REST endpoints we need for SPY
options intelligence. Not the streaming feed — like the Tastytrade
provider, we only use REST so it fits the Vercel function model.

Provides:
  - fetch_flow_summary(ticker)  recent options flow rolled up into a
                                bullish/bearish lean + a few highlight
                                rows.
  - fetch_gex(ticker)           dealer gamma exposure summary.

If UNUSUAL_WHALES_API_KEY is missing or any call fails, the public
functions return None and the snapshot's UW-derived fields stay
empty. The OptionsIntel panel keeps its Tastytrade-derived numbers
either way; UW just enriches the narrative line.
"""
from __future__ import annotations

import json
import os
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


@pc.ttl_cache(ttl_seconds=60.0, maxsize=4)
def fetch_flow_summary(ticker: str = "SPY") -> dict | None:
    """Recent options flow rolled into a directional lean.

    Returns:
        {
          "ticker": "SPY",
          "bullishCount": int,
          "bearishCount": int,
          "premiumNet": float,        # USD; positive = net call buying
          "lean": "BULLISH"|"BEARISH"|"BALANCED",
          "topPrints": [{strike, side, premium, ts}, ...]
        }
    """
    raw = _http_get(f"/stock/{ticker}/flow-recent", {"limit": 50})
    if not raw:
        return None
    items: list[dict] = raw.get("data") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return None
    bullish = 0
    bearish = 0
    premium_net = 0.0
    top_prints: list[dict] = []
    for r in items:
        side_field = (r.get("side") or r.get("trade_side") or "").upper()
        opt_type = (r.get("type") or r.get("option_type") or "").upper()
        prem = float(r.get("premium") or r.get("notional") or 0)
        # Heuristic: ASK = aggressive buyer; BID = aggressive seller.
        # Calls bought-on-ask = bullish, puts bought-on-ask = bearish, etc.
        is_buy = side_field in ("ASK", "BUY")
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
                    "strike": r.get("strike"),
                    "side": opt_type or side_field or "?",
                    "premium": prem,
                    "ts": r.get("executed_at") or r.get("ts"),
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


@pc.ttl_cache(ttl_seconds=120.0, maxsize=4)
def fetch_gex_summary(ticker: str = "SPY") -> dict | None:
    """Dealer gamma exposure summary.

    Returns:
        {
          "ticker": "SPY",
          "totalGEX": float,        # absolute gamma exposure
          "regime": "POSITIVE"|"NEGATIVE"|"FLAT",
          "flipPoint": float | None # zero-gamma price level
        }
    """
    raw = _http_get(f"/stock/{ticker}/greek-exposure")
    if not raw:
        return None
    data = raw.get("data") if isinstance(raw, dict) else raw
    if not isinstance(data, dict):
        return None
    gex = data.get("gex") or data.get("total_gamma") or data.get("gamma_exposure")
    flip = data.get("flip_point") or data.get("zero_gamma")
    try:
        gex_f = float(gex) if gex is not None else 0.0
    except (TypeError, ValueError):
        gex_f = 0.0
    try:
        flip_f = float(flip) if flip is not None else None
    except (TypeError, ValueError):
        flip_f = None
    if gex_f > 0:
        regime = "POSITIVE"
    elif gex_f < 0:
        regime = "NEGATIVE"
    else:
        regime = "FLAT"
    return {
        "ticker": ticker,
        "totalGEX": round(gex_f, 2),
        "regime": regime,
        "flipPoint": flip_f,
    }
