"""GET /api/spy/flow — Unusual Whales options flow + GEX for SPY.

Reads UNUSUAL_WHALES_API_KEY from env. If missing or the upstream
fails, returns 200 with `available: false` so the frontend can degrade
gracefully without a 5xx.
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib import unusual_whales  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 — Vercel contract
        flow = unusual_whales.fetch_flow_summary("SPY")
        gex = unusual_whales.fetch_gex_summary("SPY")
        body = json.dumps(
            {
                "available": bool(flow or gex),
                "flow": flow,
                "gex": gex,
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=30, stale-while-revalidate=120")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
