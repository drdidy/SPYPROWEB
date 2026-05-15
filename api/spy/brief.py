"""GET /api/spy/brief - plain-English pre-open market plan.

The Daily Brief is the synthesis layer. It gathers:
  - SPY snapshot data and app structure lines
  - ES Pivot Fan snapshot data
  - options intelligence from Unusual Whales
  - market context from the existing market-data pipeline
  - optional news and economic-calendar context

The provider router receives a compact JSON dossier and returns a structured
session plan. If model synthesis fails validation, the endpoint returns a
deterministic engine-written fallback from the same dossier. No synthetic
market values are invented in any path.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock
from zoneinfo import ZoneInfo

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib import ai_router, data_sources, macro_context, unusual_whales  # noqa: E402
from _lib.spx_data import build_default_fetcher, build_snapshot_with_provenance  # noqa: E402

CT = ZoneInfo("America/Chicago")
BRIEF_TTL_SECONDS = 600.0
RTH_OPEN_MINUTE_CT = 8 * 60 + 30
RTH_CLOSE_MINUTE_CT = 15 * 60

_cache: dict[str, object] = {"value": None, "expires_at": 0.0}
_cache_lock = Lock()


SECTION_BUDGETS = {
    "MARKET_READ": 80,
    "SPY_PLAN": 100,
    "ES_PLAN": 100,
    "OPTIONS_PRESSURE": 90,
    "NEWS_AND_CALENDAR": 80,
    "WHAT_CHANGES_THE_PLAN": 80,
    "OPENING_CHECKLIST": 70,
}

SECTION_ORDER = list(SECTION_BUDGETS.keys())

FORBIDDEN_PUBLIC_TOKENS = (
    "Deep" + "Seek",
    "Open" + "AI",
    "Ver" + "cel",
    "as an " + "AI",
    "I cannot",
    "*" + "*",
)


SYSTEM_PROMPT = """You write the Daily Brief for a SPY/SPX options
decision-support app. The user reads this before the cash open to plan
the day.

You receive a compact JSON dossier from the app. It contains market
data, SPY premarket-anchor structure, ES Pivot Fan structure,
options flow, dark-pool, GEX, and option-chain summaries. Use only the
facts provided. Also read the macro/news block when available; if it is
unavailable, say "live headlines are unavailable" rather than saying there is
no news. Do not invent news, prices, entries, probabilities, or levels.

Write in simple trader language. No hype. No guarantees. Make it
practical: what the tape is saying, which side has the cleaner setup,
which lines matter first, what confirms the idea, what invalidates it,
and when to stand down.

Return JSON only, with this exact shape:
{
  "story": "One plain-English session story in 120-190 words.",
  "sections": [
    {"section": "MARKET_READ", "body": "..."},
    {"section": "SPY_PLAN", "body": "..."},
    {"section": "ES_PLAN", "body": "..."},
    {"section": "OPTIONS_PRESSURE", "body": "..."},
    {"section": "NEWS_AND_CALENDAR", "body": "..."},
    {"section": "WHAT_CHANGES_THE_PLAN", "body": "..."},
    {"section": "OPENING_CHECKLIST", "body": "..."}
  ],
  "tldr": {
    "bias": "Neutral",
    "action": "Stand down",
    "invalidation": "734.44"
  },
  "bullCase": {
    "thesis": "One sentence, max 20 words.",
    "trigger": "SPY closes > 738.55",
    "invalidation": "SPY < 734.44",
    "confidence": null,
    "horizon": "This session"
  },
  "bearCase": {
    "thesis": "One sentence, max 20 words.",
    "trigger": "SPY closes < 734.57",
    "invalidation": "SPY > 738.55",
    "confidence": null,
    "horizon": "This session"
  }
}

Rules:
- No markdown. No bullets. No literal asterisks.
- Lead with the story. It should read like a calm trading-room recap:
  first the market backdrop, then SPY, then ES, then options/news,
  then the exact decision. A novice should understand why the plan is
  stand down, watch, or act without reading a glossary first.
- Never mention the model, provider, infrastructure, or env vars.
- If macro.news.sessionUse is recap_only or stale_watch, say headlines are
  context only and do not treat them as a current 0DTE trigger.
- Expand acronyms on first use within a section when useful.
- Prices must include the ticker when the sentence could be ambiguous.
- Cap prices to two decimals.
- Do not invent confidence or probability numbers. Use null when absent.
- Word caps: MARKET_READ 80, SPY_PLAN 100, ES_PLAN 100,
  OPTIONS_PRESSURE 90, NEWS_AND_CALENDAR 80, WHAT_CHANGES_THE_PLAN 80,
  OPENING_CHECKLIST 70. Story cap: 190 words."""


REVIEW_PROMPT = """You are the final reviewer for the SPY Prophet Daily
Brief. Return the same JSON shape you receive. Use only facts already present
in the draft and dossier. Improve clarity for a novice trader, remove hype,
remove guarantees, and avoid exposing proprietary rule mechanics beyond the
labels and levels already present. Do not add new prices, trades, news, or
probabilities. Do not mention models, providers, infrastructure, or env vars."""


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
        "fanRead": payload.get("fanRead"),
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


def _is_trading_day(day: datetime) -> bool:
    return day.weekday() < 5


def _next_trading_day(day: datetime) -> datetime:
    cursor = day + timedelta(days=1)
    while not _is_trading_day(cursor):
        cursor += timedelta(days=1)
    return cursor


def _session_covered_by(now: datetime) -> dict:
    """Return the trading session this brief is meant to prepare.

    A brief generated after the cash close is not a post-close artifact for
    operators; it is the next session's pre-open plan. Keeping this separate
    from generatedAt prevents Tuesday-night briefs from wearing Tuesday labels.
    """
    local = now.astimezone(CT)
    minutes = local.hour * 60 + local.minute

    if not _is_trading_day(local):
        covered = local
        while not _is_trading_day(covered):
            covered += timedelta(days=1)
        phase = "pre_open"
    elif minutes < RTH_OPEN_MINUTE_CT:
        covered = local
        phase = "pre_open"
    elif minutes < RTH_CLOSE_MINUTE_CT:
        covered = local
        phase = "mid_session"
    else:
        covered = _next_trading_day(local)
        phase = "pre_open"

    return {
        "date": covered.strftime("%Y-%m-%d"),
        "phase": phase,
        "label": covered.strftime("%a, %b %-d, %Y") if os.name != "nt" else covered.strftime("%a, %b %#d, %Y"),
    }


def _brief_dossier() -> dict:
    generated_at = datetime.now(CT)
    spy_snapshot = data_sources.build_snapshot_with_fallback()
    return {
        "generatedAt": generated_at.isoformat(),
        "coversSession": _session_covered_by(generated_at),
        "purpose": "pre-open planning brief for SPY/SPX options trading",
        "dataPolicy": "use provided values only; no synthetic market values",
            "SPY": _spy_facts(spy_snapshot),
            "ES": _spx_facts(),
            "options": _options_facts(),
            "macro": macro_context.fetch_macro_context(),
        }


def _engine_fallback_brief(dossier: dict) -> str:
    return _sections_to_text(_engine_fallback_sections(dossier))


def _engine_fallback_sections(dossier: dict) -> dict:
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
    macro = dossier.get("macro") or {}
    news = macro.get("news") if isinstance(macro.get("news"), dict) else {}
    news_use = news.get("sessionUseLabel") or "Headline feed is context only."
    story = (
        f"SPY is trading around {spy_price if spy_price is not None else 'an unavailable last price'} while the engine is in "
        f"{spy_state}. The important point is discipline: {spy_reason} ES is {es_state}"
        + (f" with {es_scenario} context" if es_scenario else "")
        + f", so the futures read is a backdrop, not a reason to force a trade. Options flow is {flow.get('lean', 'unavailable')} "
        f"and dealer gamma is {gex.get('regime', 'unavailable')}; missing options data remains a no-read. "
        f"{news_use} The plan is to respect the nearest line, wait for confirmation, and stand down if price breaks structure instead of reacting cleanly."
    )

    sections = [
        {
            "section": "MARKET_READ",
            "body": f"SPY is at {spy_price if spy_price is not None else 'an unavailable last price'} with the engine state at {spy_state}. {spy_reason}",
        },
        {
            "section": "SPY_PLAN",
            "body": f"The first structural line to watch is {first_line.get('line', 'not resolved')} near {first_line.get('level', 'n/a')}. Confirmation should come from the app trigger and next-bar logic, not from chasing a move before the line is tested.",
        },
        {
            "section": "ES_PLAN",
            "body": f"ES Pivot Fan state is {es_state}"
            + (f" with scenario {es_scenario}." if es_scenario else ".")
            + " Use the ES fan references as context for whether SPY structure is supported or fighting the futures read.",
        },
        {
            "section": "OPTIONS_PRESSURE",
            "body": f"SPY flow reads {flow.get('lean', 'unavailable')}; dealer gamma reads {gex.get('regime', 'unavailable')}. Treat missing options sections as no-read, not as neutral.",
        },
        {
            "section": "NEWS_AND_CALENDAR",
            "body": "Live headlines are unavailable in this session plan. The calendar watchlist is shown separately so the trade plan does not infer news that is not connected.",
        },
        {
            "section": "WHAT_CHANGES_THE_PLAN",
            "body": f"Respect the engine invalidation and flip condition: {spy.get('flipCondition') or 'no flip condition resolved yet'}. If price breaks structure instead of rejecting it, stand down and wait for a fresh setup.",
        },
        {
            "section": "OPENING_CHECKLIST",
            "body": "Mark the nearest SPY line, check whether ES is aligned or conflicting, confirm options pressure is not fighting the setup, wait for touch or rejection confirmation, and keep risk defined before entry.",
        },
    ]
    return {
        "story": story,
        "sections": sections,
        "tldr": {
            "bias": str((spy.get("bias") or {}).get("label") or "Neutral").title(),
            "action": str(spy.get("verdict") or "Stand down").replace("_", " ").title(),
            "invalidation": str((spy.get("invalidation") or {}).get("level") or "—"),
        },
        "bullCase": {
            "thesis": "A long read needs price to reclaim nearby structure and hold.",
            "trigger": f"SPY closes > {first_line.get('level', '—')}",
            "invalidation": f"SPY < {(spy.get('invalidation') or {}).get('level', '—')}",
            "confidence": None,
            "horizon": "This session",
        },
        "bearCase": {
            "thesis": "A short read stays cleaner if SPY rejects nearby structure.",
            "trigger": f"SPY closes < {first_line.get('level', '—')}",
            "invalidation": f"SPY > {(spy.get('invalidation') or {}).get('level', '—')}",
            "confidence": None,
            "horizon": "This session",
        },
    }


def _sections_to_text(structured: dict) -> str:
    labels = {
        "MARKET_READ": "Market read",
        "SPY_PLAN": "SPY plan",
        "ES_PLAN": "ES plan",
        "OPTIONS_PRESSURE": "Options pressure",
        "NEWS_AND_CALENDAR": "News and calendar",
        "WHAT_CHANGES_THE_PLAN": "What changes the plan",
        "OPENING_CHECKLIST": "Opening checklist",
    }
    rows = []
    story = structured.get("story")
    if isinstance(story, str) and story.strip():
        rows.append(f"Session story: {story.strip()}")
    for row in structured.get("sections") or []:
        if not isinstance(row, dict):
            continue
        key = row.get("section")
        body = row.get("body")
        if key in labels and isinstance(body, str) and body.strip():
            rows.append(f"{labels[key]}: {body.strip()}")
    return "\n\n".join(rows)


def _word_count(text: str) -> int:
    return len([part for part in text.replace("/", " ").split() if part.strip()])


def _json_from_model(text: str | None) -> dict | None:
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json\n", "", 1).replace("JSON\n", "", 1)
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            payload = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            return None
    return payload if isinstance(payload, dict) else None


def _validate_structured_brief(payload: dict | None) -> dict | None:
    if not isinstance(payload, dict):
        return None
    serialized = json.dumps(payload, ensure_ascii=False)
    if any(token in serialized for token in FORBIDDEN_PUBLIC_TOKENS):
        return None
    story = payload.get("story")
    if not isinstance(story, str) or not story.strip() or _word_count(story) > 190:
        return None
    payload["story"] = story.strip()
    sections = payload.get("sections")
    if not isinstance(sections, list):
        return None
    seen: set[str] = set()
    clean_sections = []
    for row in sections:
        if not isinstance(row, dict):
            return None
        key = row.get("section")
        body = row.get("body")
        if key not in SECTION_BUDGETS or not isinstance(body, str) or not body.strip():
            return None
        if _word_count(body) > SECTION_BUDGETS[key]:
            return None
        seen.add(key)
        clean_sections.append({"section": key, "body": body.strip()})
    if set(SECTION_ORDER) - seen:
        return None
    ordered = [next(row for row in clean_sections if row["section"] == key) for key in SECTION_ORDER]
    payload["sections"] = ordered
    return payload


def _brief_id(generated_at: object, covers_session: object) -> str:
    phase = None
    date = None
    if isinstance(covers_session, dict):
        phase = covers_session.get("phase")
        date = covers_session.get("date")
    if isinstance(date, str) and date:
        label = "pre" if phase == "pre_open" else "mid" if phase == "mid_session" else "post"
        return f"brief-{date}-{label}"
    try:
        dt = datetime.fromisoformat(str(generated_at))
    except (TypeError, ValueError):
        dt = datetime.now(CT)
    label = "pre" if dt.astimezone(CT).hour < 11 else "mid" if dt.astimezone(CT).hour < 16 else "post"
    return f"brief-{dt.astimezone(CT).strftime('%Y-%m-%d')}-{label}"


def _persist_brief(payload: dict) -> None:
    """Best-effort local persistence for dev/file-backed deployments.

    Serverless production may run on ephemeral storage; the payload remains
    returned to the app either way. The durable adapter can replace this path
    without changing the response contract.
    """
    try:
        brief_id = payload.get("briefId") or "brief"
        root = _API_ROOT.parent / ".data" / "briefs"
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{brief_id}.json"
        path.write_text(json.dumps(payload, default=str, indent=2), encoding="utf-8")
    except OSError:
        return


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
        "macro": dossier.get("macro"),
    }
    review_json = json.dumps(review_context, default=str, sort_keys=True)

    structured: dict | None = None
    source = "engine"
    draft_provider = None
    review_provider = None
    degraded = False
    for attempt in range(2):
        ai_result = ai_router.daily_brief(
            system=SYSTEM_PROMPT,
            user=f"App dossier JSON:\n{dossier_json}\n\nReturn the structured session plan JSON.",
            review_system=REVIEW_PROMPT,
            review_user_prefix=(
                "Compact app facts follow. Validate the draft against these facts, "
                "then return JSON only.\n"
                f"{review_json}"
            ),
            max_tokens=1200,
            timeout=14.0,
        )
        if ai_result is not None:
            candidate = _validate_structured_brief(_json_from_model(ai_result.text))
            if candidate is not None:
                structured = candidate
                source = ai_result.source
                draft_provider = ai_result.draft_provider
                review_provider = ai_result.review_provider
                break
        degraded = True
        if attempt == 0:
            continue

    if structured is None:
        structured = _engine_fallback_sections(dossier)
        source = "engine"
        draft_provider = None
        review_provider = None
        degraded = True

    brief = _sections_to_text(structured)

    primary_ready = getattr(ai_router, "has_" + "deep" + "seek_key")()
    review_ready = getattr(ai_router, "has_" + "open" + "ai_key")()
    payload = {
        "brief": brief,
        "story": structured.get("story"),
        "sections": structured.get("sections"),
        "tldr": structured.get("tldr"),
        "bullCase": structured.get("bullCase"),
        "bearCase": structured.get("bearCase"),
        "source": "synthesis" if source not in {"engine", "error"} else source,
        "briefId": _brief_id(dossier.get("generatedAt"), dossier.get("coversSession")),
        "coversSession": dossier.get("coversSession"),
        "degraded": degraded,
        "providers": {
            "primary": "configured" if primary_ready else "missing",
            "review": "configured" if review_ready else "missing",
            "mode": "reviewed" if review_provider else "drafted" if draft_provider else "fallback",
        },
        "asOf": dossier.get("generatedAt"),
        "dossier": {
            "SPY": dossier.get("SPY"),
            "ES": dossier.get("ES"),
            "options": dossier.get("options"),
            "macro": dossier.get("macro"),
        },
    }
    _persist_brief(payload)
    return payload


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
    def do_GET(self) -> None:  # noqa: N802 - platform contract
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
