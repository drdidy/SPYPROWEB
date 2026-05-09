"""GET /api/spx/snapshot — current SPX Channel state for the dashboard.

Pulls ES hourly bars + an SPX/ES sync quote, applies the offset, and
runs the SPX Channel engine. Returns the camelCase JSON shape defined
by ``api/_lib/spx/schema.py`` (mirrored on the web side as the
SPXSnapshot TypeScript interface).

A small in-process cache (default 30s) prevents concurrent requests
from hammering the upstream broker / yfinance.

Secrets read from environment variables (see api/.env.example):
    TASTYTRADE_USERNAME / _PASSWORD / _ENVIRONMENT
The yfinance backend has no auth requirement and serves as fallback
whenever Tastytrade isn't reachable or wired.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

# Ensure api/ is on sys.path so `_lib...` works in Vercel's bundler.
_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib.spx_data import build_default_fetcher, build_snapshot_with_provenance  # noqa: E402
from _lib.spx_data.historical_offset import historical_offset_for_date  # noqa: E402

CT = ZoneInfo("America/Chicago")
SNAPSHOT_TTL = float(os.environ.get("SPX_SNAPSHOT_TTL", "30"))


def _resolve_offset_override() -> float | None:
    """Read SPX_ES_OFFSET_OVERRIDE env var.

    When yfinance's ES=F is showing a different contract than the
    broker's /ES (typical: ~80-100pt drift from back-month / back-
    adjusted continuous), the auto-computed offset (yfinance SPX -
    yfinance ES) doesn't match the broker spread. Setting this env
    var to the broker's actual SPX_cash - /ES_active spread (e.g.
    "28.5") forces the engine to apply that value instead of the
    computed one, producing broker-aligned channel entries.
    """
    raw = os.environ.get("SPX_ES_OFFSET_OVERRIDE")
    if not raw:
        return None
    try:
        return float(raw.strip())
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Module-level cache. Vercel keeps function instances warm between
# invocations within the same region, so this cache survives across
# requests and saves yfinance/Tastytrade round-trips.
# ---------------------------------------------------------------------------

_cache: dict[str, object] = {"value": None, "expires_at": 0.0}
_cache_lock = Lock()


def _build_payload(replay_date: date | None = None) -> dict:
    fetcher = build_default_fetcher()
    env_override = _resolve_offset_override()
    offset_override = env_override
    used_historical_offset = False
    if replay_date is None:
        as_of = datetime.now(CT)
    else:
        # Replay mode: pin "now" to 09:00 CT — the moment the first
        # RTH hour closes and the framework becomes the trader's
        # entry reference. Channel rails + prev-RTH lines project
        # to that time, scenario classifies the morning state, and
        # the playback panel handles "what happened next" forward
        # from there. Using 15:00 (RTH close) instead would project
        # lines to end-of-day — correct math but useless for the
        # entry decision.
        as_of = datetime(
            replay_date.year, replay_date.month, replay_date.day, 9, 0, tzinfo=CT
        )
        if env_override is None:
            try:
                hist_quote = historical_offset_for_date(replay_date)
                offset_override = hist_quote.offset
                used_historical_offset = True
            except Exception:
                # Couldn't derive historical offset; fall through to the
                # live offset. The frontend's _meta surface still shows
                # which offset was actually applied.
                offset_override = None
    snap, meta = build_snapshot_with_provenance(
        fetcher,
        as_of,
        offset_override=offset_override,
    )
    payload = snap.model_dump(by_alias=True)
    payload["_meta"] = meta
    if used_historical_offset:
        # Distinguish historical-replay offset from a real env override.
        meta["offsetSource"] = "historical_replay"
    payload["replay"] = {
        "isReplay": replay_date is not None,
        "date": replay_date.isoformat() if replay_date else None,
    }
    return payload


def _parse_replay_date(path: str) -> date | None:
    try:
        qs = parse_qs(urlparse(path).query)
        raw = (qs.get("date") or [None])[0]
        if not raw:
            return None
        return date.fromisoformat(raw)
    except Exception:
        return None


def _cached_payload(replay_date: date | None = None) -> dict:
    # Replay payloads bypass the live cache (the date itself becomes
    # the cache key and historical data is stable).
    if replay_date is not None:
        return _build_payload(replay_date=replay_date)
    now = time.monotonic()
    cached = _cache.get("value")
    if cached is not None and now < float(_cache["expires_at"]):
        return cached  # type: ignore[return-value]
    with _cache_lock:
        now = time.monotonic()
        cached = _cache.get("value")
        if cached is not None and now < float(_cache["expires_at"]):
            return cached  # type: ignore[return-value]
        payload = _build_payload()
        _cache["value"] = payload
        _cache["expires_at"] = now + SNAPSHOT_TTL
        return payload


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 — Vercel contract
        replay_date = _parse_replay_date(self.path)
        try:
            payload = _cached_payload(replay_date=replay_date)
            status = 200
        except RuntimeError as e:
            # Fetcher returned no bars (e.g. weekend, broker out, both
            # backends down). 503 so the frontend can fall back to mock.
            payload = {"error": str(e), "kind": "no_bars"}
            status = 503
        except Exception as e:
            payload = {
                "error": str(e),
                "kind": "engine_error",
                "trace": traceback.format_exc().splitlines()[-3:],
            }
            status = 500

        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header(
            "Cache-Control",
            f"public, max-age={int(SNAPSHOT_TTL)}, stale-while-revalidate=120",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
