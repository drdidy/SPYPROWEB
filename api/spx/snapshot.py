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
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock
from zoneinfo import ZoneInfo

# Ensure api/ is on sys.path so `_lib...` works in Vercel's bundler.
_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib.spx_data import build_default_fetcher, build_snapshot_with_provenance  # noqa: E402

CT = ZoneInfo("America/Chicago")
SNAPSHOT_TTL = float(os.environ.get("SPX_SNAPSHOT_TTL", "30"))


# ---------------------------------------------------------------------------
# Module-level cache. Vercel keeps function instances warm between
# invocations within the same region, so this cache survives across
# requests and saves yfinance/Tastytrade round-trips.
# ---------------------------------------------------------------------------

_cache: dict[str, object] = {"value": None, "expires_at": 0.0}
_cache_lock = Lock()


def _build_payload() -> dict:
    fetcher = build_default_fetcher()
    snap, meta = build_snapshot_with_provenance(fetcher, datetime.now(CT))
    payload = snap.model_dump(by_alias=True)
    # Operator-visible provenance: which backend served bars + quote,
    # the captured ES->SPX offset, and any primary-fetcher error that
    # forced a fallback. The frontend reads _meta.appliedOffset and
    # _meta.barsSource into the SPX page diagnostic strip.
    payload["_meta"] = meta
    return payload


def _cached_payload() -> dict:
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
        try:
            payload = _cached_payload()
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
