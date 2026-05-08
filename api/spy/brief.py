"""GET /api/spy/brief — plain-English daily read for the Daily Brief page.

Pulls the live snapshot (the same one the dashboard reads), distills
the structurally important facts (decision, anchors, lines, market
context, options flow / gamma), and asks OpenAI to render a short
three-paragraph brief.

If OPENAI_API_KEY is missing or the upstream call fails, returns a
fallback brief stitched directly from the engine's own narrative
(decision rationale + bias explanation). The frontend treats both
shapes identically.

Cache: 10 minutes per call so a page refresh doesn't spawn a new
OpenAI call. The snapshot itself is already cached upstream.
"""
from __future__ import annotations

import json
import sys
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib import data_sources, openai_client  # noqa: E402

BRIEF_TTL_SECONDS = 600.0

_cache: dict[str, object] = {"value": None, "expires_at": 0.0}
_cache_lock = Lock()


SYSTEM_PROMPT = """You are the daily-brief writer for a SPY trader's
decision workspace. You receive a JSON snapshot of today's structural
read and produce a plain-English brief in three short paragraphs.

Voice: clear, calm, conversational, no jargon-for-jargon's-sake.
Mention concrete numbers (price, levels, distances) where the snapshot
provides them. Never invent facts not in the snapshot. Never give
trading advice or predict outcomes — describe what the read says and
what would change it.

Format: three paragraphs separated by a blank line. No headings, no
bullets, no markdown. Around 90-130 words total."""


def _facts_from_snapshot(snap: dict) -> dict:
    """Pluck the structurally meaningful fields from the full snapshot
    so we don't burn tokens on chart candles, signal arrays, etc."""
    decision = snap.get("decision") or {}
    bias = snap.get("bias") or {}
    quote = snap.get("quote") or {}
    pivots = snap.get("pivots") or {}
    market_context = snap.get("marketContext") or {}
    flow = snap.get("flow") or {}
    gex = snap.get("gex") or {}
    options = snap.get("options") or {}

    def _round(v: object, dp: int = 2) -> object:
        try:
            return round(float(v), dp)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return v

    return {
        "asOf": snap.get("asOf"),
        "verdict": decision.get("verb"),
        "bias": decision.get("bias"),
        "biasScore": bias.get("score"),
        "biasNote": bias.get("note"),
        "rationale": decision.get("rationale"),
        "why": decision.get("why"),
        "window": decision.get("window"),
        "spy": {
            "last": _round(quote.get("last")),
            "chg": _round(quote.get("chg")),
            "chgPct": _round(quote.get("chgPct"), 3),
            "open": _round(quote.get("open")),
            "high": _round(quote.get("high")),
            "low": _round(quote.get("low")),
            "prevClose": _round(quote.get("prevClose")),
        },
        "pivots": {
            "high": pivots.get("high"),
            "low": pivots.get("low"),
            "structureDay": pivots.get("structureDay"),
        },
        "context": snap.get("context"),
        "marketContextSummary": market_context.get("summary") if isinstance(market_context, dict) else None,
        "flow": {
            "lean": flow.get("lean"),
            "bullishCount": flow.get("bullishCount"),
            "bearishCount": flow.get("bearishCount"),
            "premiumNet": flow.get("premiumNet"),
        }
        if flow
        else None,
        "gex": {
            "regime": gex.get("regime"),
            "totalGEX": gex.get("totalGEX"),
            "flipPoint": gex.get("flipPoint"),
        }
        if gex
        else None,
        "options": {
            "expiration": options.get("expiration"),
            "atm": options.get("atm"),
        }
        if options
        else None,
    }


def _engine_fallback_brief(facts: dict) -> str:
    """Stitch a brief from engine fields directly when OpenAI is
    unavailable. Honest, deterministic, no synthesis."""
    parts: list[str] = []
    spy = facts.get("spy") or {}
    last = spy.get("last")
    if last is not None:
        parts.append(
            f"SPY {last}. {facts.get('rationale') or facts.get('why') or 'Engine read pending.'}"
        )
    elif facts.get("rationale"):
        parts.append(str(facts["rationale"]))
    if facts.get("why"):
        parts.append(str(facts["why"]))
    flow = facts.get("flow")
    gex = facts.get("gex")
    if flow or gex:
        bits: list[str] = []
        if flow:
            bits.append(
                f"Options flow leans {str(flow.get('lean', 'balanced')).lower()} "
                f"({flow.get('bullishCount', 0)} bull / {flow.get('bearishCount', 0)} bear)."
            )
        if gex and gex.get("regime"):
            flip = gex.get("flipPoint")
            bits.append(
                f"Dealer gamma is {str(gex['regime']).lower()}"
                + (f", flip near {flip:.2f}." if isinstance(flip, (int, float)) else ".")
            )
        parts.append(" ".join(bits))
    return "\n\n".join(p for p in parts if p) or "Engine is initializing today's read."


def _build_brief() -> dict:
    """Build the brief payload. Always returns a usable string in
    `brief`; `source` indicates whether OpenAI generated it or we
    used the engine-fallback path."""
    snap = data_sources.build_snapshot_with_fallback()
    facts = _facts_from_snapshot(snap)
    facts_json = json.dumps(facts, default=str, sort_keys=True)

    brief: str | None = None
    source = "engine"
    if openai_client.has_key():
        brief = openai_client.chat(
            system=SYSTEM_PROMPT,
            user=f"Snapshot facts (JSON):\n{facts_json}\n\nWrite the brief.",
        )
        if brief:
            source = "openai"

    if not brief:
        brief = _engine_fallback_brief(facts)

    return {
        "brief": brief,
        "source": source,
        "asOf": facts.get("asOf"),
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
    def do_GET(self) -> None:  # noqa: N802 — Vercel contract
        try:
            payload = _cached_brief()
            status = 200
        except Exception as exc:  # pragma: no cover — last-resort safety
            payload = {
                "brief": "Daily brief unavailable right now.",
                "source": "error",
                "error": str(exc)[:200],
            }
            status = 200  # frontend renders the message either way

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
