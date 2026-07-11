"""GET /api/spy/flow - parked premium pressure endpoint.

The launch options surface is broker-chain based. Flow/GEX can return
later as a premium overlay without blocking the main trading workflow.
"""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - Vercel contract
        body = json.dumps(
            {
                "available": False,
                "flow": None,
                "gex": None,
                "status": "future_overlay",
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
