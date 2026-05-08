"""GET /api/spx/health — liveness + active fetcher state.

Distinct from /api/health (the Next.js + SPY app's health) so the SPX
engine can report on its own fetcher chain independently.
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib.spx_data import build_default_fetcher  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 — Vercel contract
        fetcher = build_default_fetcher()
        body = json.dumps(
            {
                "ok": True,
                "service": "spx-channel",
                "fetcher": fetcher.name,
                "fetcher_healthy": fetcher.healthy(),
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
