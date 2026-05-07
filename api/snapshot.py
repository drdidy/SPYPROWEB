"""GET /api/snapshot — current SPY Prophet state for the dashboard.

v1 returns a seeded snapshot mirroring the design bundle's fixtures so
the UI renders before live-data fetchers are wired. A `source` field
tells the frontend whether this is `seed`, `live`, or `degraded`.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Ensure api/ is on sys.path so `from _lib...` works in Vercel's bundler.
_API_ROOT = Path(__file__).resolve().parent
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib import seed_snapshot  # noqa: E402


def build_payload() -> dict:
    # Live fetchers land in a follow-up commit; for now always seed.
    return seed_snapshot.build()


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        try:
            payload = build_payload()
            status = 200
        except Exception as exc:  # pragma: no cover - safety net
            payload = {"error": str(exc), "source": "error"}
            status = 500

        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=15, stale-while-revalidate=60")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
