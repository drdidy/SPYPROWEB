"""GET /api/options/intel - options intelligence bundle.

The endpoint aggregates Unusual Whales sections for the Options tab.
It returns 200 with `available: false` when upstream data is absent so
the app can render an honest empty state instead of a server error.
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from _lib import unusual_whales  # noqa: E402


def _symbols_from_path(path: str) -> tuple[str, ...]:
    parsed = urlparse(path)
    qs = parse_qs(parsed.query)
    raw = qs.get("symbols", ["SPY,SPX"])[0]
    symbols = [part.strip().upper() for part in raw.split(",") if part.strip()]
    allowed = [s for s in symbols if s in {"SPY", "SPX"}]
    return tuple(dict.fromkeys(allowed or ["SPY", "SPX"]))


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - Vercel contract
        body = json.dumps(unusual_whales.fetch_options_bundle(_symbols_from_path(self.path))).encode(
            "utf-8"
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=20, stale-while-revalidate=120")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
