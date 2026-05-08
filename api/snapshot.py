"""GET /api/snapshot — current SPY Prophet state for the dashboard.

Tries live data via `_lib.data_sources.build_live_snapshot` (yfinance-backed)
and falls back to the design-bundle seed if anything goes wrong. The
`source` field on the response tells the frontend which path served it:
`live`, `degraded` (seed-with-error), or `seed` (forced).
"""
from __future__ import annotations

import json
import sys
from datetime import date
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Ensure api/ is on sys.path so `from _lib...` works in Vercel's bundler.
_API_ROOT = Path(__file__).resolve().parent
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib import data_sources  # noqa: E402


def _parse_replay_date(path: str) -> date | None:
    """Pull ?date=YYYY-MM-DD off the request path (replay/backtest mode)."""
    try:
        qs = parse_qs(urlparse(path).query)
        raw = (qs.get("date") or [None])[0]
        if not raw:
            return None
        return date.fromisoformat(raw)
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        replay_date = _parse_replay_date(self.path)
        try:
            payload = data_sources.build_snapshot_with_fallback(replay_date=replay_date)
            status = 200
        except Exception as exc:  # pragma: no cover - last-resort safety
            payload = {"error": str(exc), "source": "error"}
            status = 500

        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        # Replay responses don't change once the day is closed, but live ones do.
        if replay_date is None:
            self.send_header("Cache-Control", "public, max-age=15, stale-while-revalidate=60")
        else:
            self.send_header("Cache-Control", "public, max-age=300, stale-while-revalidate=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
