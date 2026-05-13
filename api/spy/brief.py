"""GET /api/spy/brief - plain-English pre-open market plan.

The Daily Brief is the synthesis layer. It gathers:
  - SPY snapshot data and app structure lines
  - ES channel snapshot data
  - options intelligence from Unusual Whales
  - market context from the existing market-data pipeline

DeepSeek receives a compact JSON dossier and drafts the brief. OpenAI
reviews/polishes the draft when available, or serves as fallback if
DeepSeek is unavailable. If both providers fail, the endpoint returns a
deterministic engine-written fallback from the same dossier. No synthetic
market values are invented in any path.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock
from zoneinfo import ZoneInfo

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib import ai_router, data_sources, unusual_whales  # noqa: E402
from _lib.spx_data import build_default_fetcher, build_snapshot_with_provenance  # noqa: E402

CT = ZoneInfo("America/Chicago")
BRIEF_TTL_SECONDS = 600.0

_cache: dict[str, object] = {"value": None, "expires_at": 0.0}
_cache_lock = Lock()


SYSTEM_PROMPT = """You write the Daily Brief for a SPY/SPX options
decision-support app. The user reads this before the cash open to plan
the day.

You receive a compact JSON dossier from the app. It contains market
data, SPY premarket-anchor structure, ES overnight-channel structure,
options flow, dark-pool, GEX, and option-chain summaries. Use only the
facts provided. Do not invent news, prices, entries, probabilities, or
levels. If a section is unavailable, say that quietly and work with
the structure that is present.

Write in simple trader language. No hype. No guarantees. Make it
practical: what the tape is saying, which side has the cleaner setup,
which lines matter first, what confirms the idea, what invalidates it,
and when to stand down.

Format exactly six short labeled paragraphs:
Market read:
SPY plan:
ES plan:
Options pressure:
What changes the plan:
Opening checklist:

Keep the total around 220-320 words. No markdown bullets."""


REVIEW_PROMPT = """You are the final reviewer for the SPY Prophet Daily
Brief. Preserve the six labeled paragraphs exactly. Use only facts already
present in the draft and dossier. Improve clarity for a novice trader, remove
hype, remove guarantees, and avoid exposing proprietary rule mechanics beyond
the labels and levels already present. Do not add new prices, trades, news, or
probabilities."""


def _round(v: object, dp: int = 2) -> object:
    try:
        return round(float(v), dp)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return v


def _money(v: object) -> object:
    try:
        return round(float(v), 0)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return v


def _top_lines(snap: dict, limit: int = 8) -> list[dict]:
    rows = []
    for row in snap.get("triggers") or []:
        if not isinstance(row, dict):
            continue
        rows.append(
            {
                "line": row.get("line"),
                "kind": row.get("kind"),
                "level": _round(row.get("level")),
                "distance": _round(row.get("dist")),
                "status": row.get("status"),
                "biasContribution": row.get("bias"),
            }
        )
    rows.sort(key=lambda r: abs(float(r["distance"])) if isinstance(r.get("distance"), (int, float)) else 9999)
    return rows[:limit]


def _signals(snap: dict, limit: int = 5) -> list[dict]:
    out = []
    for signal in snap.get("signals") or []:
        if not isinstance(signal, dict):
            continue
        out.append(
            {
                "type": signal.get("signalType") or signal.get("signal_type"),
                "status": signal.get("status"),
                "entry": _round(signal.get("entryPrice") or signal.get("entry_price")),
                "stop": _round(signal.get("stopPrice") or signal.get("stop_price")),
                "target": _round(signal.get("targetPrice") or signal.get("target_price")),
                "line": signal.get("rejectedLineName") or signal.get("rejected_line_name"),
                "time": signal.get("rejectionTime") or signal.get("rejection_time"),
            }
        )
    return out[:limit]


def _spy_facts(snap: dict) -> dict:
    decision = snap.get("decision") or {}
    bias = snap.get("bias") or {}
    quote = snap.get("quote") or {}
    pivots = snap.get("pivots") or {}
    market_context = snap.get("marketContext") or {}
    context = snap.get("context") or {}
    anchor = snap.get("anchor") or {}
    return {
        "asOf": snap.get("asOf"),
        "state": snap.get("currentState"),
        "verdict": decision.get("verb"),
        "conviction": decision.get("conviction"),
        "rationale": decision.get("rationale") or decision.get("why"),
        "window": decision.get("window"),
        "flipCondition": snap.get("flipCondition"),
        "price": {
            "last": _round(quote.get("last")),
            "change": _round(quote.get("chg")),
            "changePct": _round(quote.get("chgPct"), 3),
            "open": _round(quote.get("open")),
            "high": _round(quote.get("high")),
            "low": _round(quote.get("low")),
            "prevClose": _round(quote.get("prevClose")),
        },
        "bias": {
            "label": bias.get("label"),
            "score": bias.get("score"),
            "note": bias.get("note"),
        },
        "context": {
            "vix": _round(context.get("vix")),
            "vvix": _round(context.get("vvix")),
            "dxy": _round(context.get("dxy")),
            "summary": market_context.get("summary") if isinstance(market_context, dict) else None,
        },
        "pivots": {
            "high": pivots.get("high"),
            "low": pivots.get("low"),
            "structureDay": pivots.get("structureDay"),
            "signalDay": pivots.get("signalDay"),
        },
        "anchor": {
            "primary": anchor.get("primary"),
            "secondary": anchor.get("secondary"),
        }
        if isinstance(anchor, dict)
        else None,
        "watchLines": _top_lines(snap),
        "signals": _signals(snap),
        "decisionTrace": snap.get("decisionTrace") or [],
        "invalidation": snap.get("invalidation"),
    }


def _resolve_offset_override() -> float | None:
    raw = os.environ.get("SPX_ES_OFFSET_OVERRIDE")
    if not raw:
        return None
    try:
        return float(raw.strip())
    except (TypeError, ValueError):
        return None


def _trade_summary(trade: dict | None) -> dict | None:
    if not isinstance(trade, dict):
        return None
    return {
        "side": trade.get("side"),
        "entryLine": trade.get("entryLine"),
        "entryPrice": _round(trade.get("entryPrice")),
        "exitLine": trade.get("exitLine"),
        "exitPrice": _round(trade.get("exitPrice")),
    }


def _spx_facts() -> dict:
    try:
        fetcher = build_default_fetcher()
        snap, meta = build_snapshot_with_provenance(
            fetcher,
            datetime.now(CT),
            offset_override=_resolve_offset_override(),
        )
        payload = snap.model_dump(by_alias=True)
    except Exception as exc:
        return {"available": False, "error": str(exc)[:180]}

    lines = []
    for line in payload.get("lines") or []:
        if not isinstance(line, dict):
            continue
        lines.append(
            {
                "kind": line.get("kind"),
                "name": line.get("name"),
                "currentValue": _round(line.get("currentValue")),
                "distanceFromPrice": _round(line.get("distanceFromPrice")),
            }
        )
    lines.sort(key=lambda r: abs(float(r["distanceFromPrice"])) if isinstance(r.get("distanceFromPrice"), (int, float)) else 9999)

    plays = payload.get("plays") or {}
    confluence = payload.get("confluence") or {}
    return {
        "available": True,
        "asOf": payload.get("asOf"),
        "state": payload.get("currentState"),
        "sessionDateCT": payload.get("sessionDateCT"),
        "price": payload.get("price"),
        "channel": payload.get("channel"),
        "scenario": payload.get("scenario"),
        "scenarioExplanation": payload.get("scenarioExplanation"),
        "primaryPlay": _trade_summary(plays.get("primary")),
        "alternatePlay": _trade_summary(plays.get("alternate")),
        "reentryWatch": payload.get("reentryWatch"),
        "invalidation": payload.get("invalidation"),
        "confluence": {
            "score": confluence.get("score"),
            "action": confluence.get("action"),
            "factors": confluence.get("factors"),
        },
        "watchLines": lines[:8],
        "contracts": payload.get("contracts"),
        "meta": {
            "barsCount": meta.get("barsCount"),
            "offsetSource": meta.get("offsetSource"),
            "offsetMethod": meta.get("offsetMethod"),
        },
    }


def _contract_summary(contract: dict) -> dict:
    return {
        "strike": _round(contract.get("strike")),
        "side": contract.get("side"),
        "volume": contract.get("volume"),
        "oi": contract.get("oi"),
        "iv": _round(contract.get("iv"), 4),
        "delta": _round(contract.get("delta"), 4),
        "gamma": _round(contract.get("gamma"), 6),
    }


def _chain_summary(chain: dict | None) -> dict | None:
    if not isinstance(chain, dict):
        return None
    calls = [c for c in chain.get("calls") or [] if isinstance(c, dict)]
    puts = [p for p in chain.get("puts") or [] if isinstance(p, dict)]
    top_calls = sorted(calls, key=lambda c: int(c.get("volume") or 0), reverse=True)[:5]
    top_puts = sorted(puts, key=lambda p: int(p.get("volume") or 0), reverse=True)[:5]
    return {
        "expiration": chain.get("expiration"),
        "totals": chain.get("totals"),
        "topCallsByVolume": [_contract_summary(c) for c in top_calls],
        "topPutsByVolume": [_contract_summary(p) for p in top_puts],
    }


def _options_symbol_summary(symbol: dict) -> dict:
    dark = symbol.get("darkPool") if isinstance(symbol.get("darkPool"), dict) else None
    flow = symbol.get("flow") if isinstance(symbol.get("flow"), dict) else None
    gex = symbol.get("gex") if isinstance(symbol.get("gex"), dict) else None
    return {
        "available": bool(symbol.get("available")),
        "flow": {
            "lean": flow.get("lean"),
            "bullishCount": flow.get("bullishCount"),
            "bearishCount": flow.get("bearishCount"),
            "premiumNet": _money(flow.get("premiumNet")),
            "topPrints": flow.get("topPrints"),
        }
        if flow
        else None,
        "gex": {
            "regime": gex.get("regime"),
            "totalGEX": _round(gex.get("totalGEX")),
            "flipPoint": _round(gex.get("flipPoint")),
        }
        if gex
        else None,
        "darkPool": {
            "count": dark.get("count"),
            "totalPremium": _money(dark.get("totalPremium")),
            "totalVolume": _round(dark.get("totalVolume")),
            "avgPrice": _round(dark.get("avgPrice")),
            "topPrints": dark.get("topPrints"),
        }
        if dark
        else None,
        "chain": _chain_summary(symbol.get("chain")),
        "flowAlerts": (symbol.get("flowAlerts") or [])[:8],
    }


def _options_facts() -> dict:
    bundle = unusual_whales.fetch_options_bundle(("SPY", "SPX"))
    symbols = bundle.get("symbols") if isinstance(bundle, dict) else {}
    return {
        "available": bool(bundle.get("available")) if isinstance(bundle, dict) else False,
        "asOf": bundle.get("asOf") if isinstance(bundle, dict) else None,
        "SPY": _options_symbol_summary(symbols.get("SPY") or {}) if isinstance(symbols, dict) else {},
        "SPX": _options_symbol_summary(symbols.get("SPX") or {}) if isinstance(symbols, dict) else {},
    }


def _brief_dossier() -> dict:
    spy_snapshot = data_sources.build_snapshot_with_fallback()
    return {
        "generatedAt": datetime.now(CT).isoformat(),
        "purpose": "pre-open planning brief for SPY/SPX options trading",
        "dataPolicy": "use provided values only; no synthetic market values",
        "SPY": _spy_facts(spy_snapshot),
        "ES": _spx_facts(),
        "options": _options_facts(),
    }


def _engine_fallback_brief(dossier: dict) -> str:
    spy = dossier.get("SPY") or {}
    es = dossier.get("ES") or {}
    opts = dossier.get("options") or {}
    spy_price = (spy.get("price") or {}).get("last")
    spy_state = spy.get("state") or "WAIT"
    spy_reason = spy.get("rationale") or "SPY structure is still resolving."
    es_state = es.get("state") if es.get("available") else "unavailable"
    es_scenario = es.get("scenario") if es.get("available") else None
    spy_opts = opts.get("SPY") or {}
    flow = spy_opts.get("flow") or {}
    gex = spy_opts.get("gex") or {}
    first_lines = spy.get("watchLines") or []
    first_line = first_lines[0] if first_lines else {}

    return "\n\n".join(
        [
            f"Market read: SPY is at {spy_price if spy_price is not None else 'an unavailable last price'} with the engine state at {spy_state}. {spy_reason}",
            f"SPY plan: The first structural line to watch is {first_line.get('line', 'not resolved')} near {first_line.get('level', 'n/a')}. Confirmation should come from the app trigger and next-bar logic, not from chasing a move before the line is tested.",
            f"ES plan: ES channel state is {es_state}"
            + (f" with scenario {es_scenario}." if es_scenario else ".")
            + " Use the ES rails as context for whether SPY structure is supported or fighting the overnight channel.",
            f"Options pressure: SPY flow reads {flow.get('lean', 'unavailable')}; dealer gamma reads {gex.get('regime', 'unavailable')}. Treat missing options sections as no-read, not as neutral.",
            f"What changes the plan: Respect the engine invalidation and flip condition: {spy.get('flipCondition') or 'no flip condition resolved yet'}. If price breaks structure instead of rejecting it, stand down and wait for a fresh setup.",
            "Opening checklist: Mark the nearest SPY line, check whether ES is aligned or conflicting, confirm options pressure is not fighting the setup, wait for touch/rejection/close/next-bar confirmation, and keep risk defined before entry.",
        ]
    )


def _build_brief() -> dict:
    dossier = _brief_dossier()
    dossier_json = json.dumps(dossier, default=str, sort_keys=True)
    review_context = {
        "policy": dossier.get("dataPolicy"),
        "SPY": {
            "state": (dossier.get("SPY") or {}).get("state"),
            "verdict": (dossier.get("SPY") or {}).get("verdict"),
            "price": (dossier.get("SPY") or {}).get("price"),
            "watchLines": ((dossier.get("SPY") or {}).get("watchLines") or [])[:4],
            "signals": ((dossier.get("SPY") or {}).get("signals") or [])[:3],
        },
        "ES": {
            "state": (dossier.get("ES") or {}).get("state"),
            "scenario": (dossier.get("ES") or {}).get("scenario"),
            "price": (dossier.get("ES") or {}).get("price"),
            "watchLines": ((dossier.get("ES") or {}).get("watchLines") or [])[:4],
        },
        "optionsAvailable": (dossier.get("options") or {}).get("available"),
    }
    review_json = json.dumps(review_context, default=str, sort_keys=True)

    brief: str | None = None
    source = "engine"
    draft_provider = None
    review_provider = None
    ai_result = ai_router.daily_brief(
        system=SYSTEM_PROMPT,
        user=f"App dossier JSON:\n{dossier_json}\n\nWrite the Daily Brief.",
        review_system=REVIEW_PROMPT,
        review_user_prefix=(
            "Compact app facts follow. Check that the draft only uses these facts, "
            "then return the final brief text only.\n"
            f"{review_json}"
        ),
        max_tokens=950,
        timeout=14.0,
    )
    if ai_result is not None:
        brief = ai_result.text
        source = ai_result.source
        draft_provider = ai_result.draft_provider
        review_provider = ai_result.review_provider

    if not brief:
        brief = _engine_fallback_brief(dossier)

    return {
        "brief": brief,
        "source": source,
        "providers": {
            "draft": draft_provider,
            "review": review_provider,
            "deepseekConfigured": ai_router.has_deepseek_key(),
            "openaiConfigured": ai_router.has_openai_key(),
        },
        "asOf": dossier.get("generatedAt"),
        "dossier": {
            "SPY": dossier.get("SPY"),
            "ES": dossier.get("ES"),
            "options": dossier.get("options"),
        },
    }


def _cached_brief() -> dict:
    now = time.monotonic()
    cached = _cache.get("value")
    if cached is not None and now < float(_cache["expires_at"]):
        return cached  # type: ignore[return-value]
    with _cache_lock:
        now = time.monotonic()
        cached = _cache.get("value")
        if cached is not None and now < float(_cache["expires_at"]):
            return cached  # type: ignore[return-value]
        payload = _build_brief()
        _cache["value"] = payload
        _cache["expires_at"] = now + BRIEF_TTL_SECONDS
        return payload


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - Vercel contract
        try:
            payload = _cached_brief()
            status = 200
        except Exception as exc:  # pragma: no cover - last-resort safety
            payload = {
                "brief": "Daily brief unavailable right now.",
                "source": "error",
                "error": str(exc)[:200],
            }
            status = 200

        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header(
            "Cache-Control",
            f"public, max-age={int(BRIEF_TTL_SECONDS)}, stale-while-revalidate=300",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
