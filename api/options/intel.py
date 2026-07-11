"""GET /api/options/intel - broker-backed options execution bundle.

The endpoint returns tradable option-chain data for the launch
execution lens. Premium flow/GEX integrations stay out of the critical
path until they are available as reliable add-ons.
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

from _lib import options_chains  # noqa: E402


def _symbols_from_path(path: str) -> tuple[str, ...]:
    parsed = urlparse(path)
    qs = parse_qs(parsed.query)
    raw = qs.get("symbols", ["SPY,SPX"])[0]
    symbols = [part.strip().upper() for part in raw.split(",") if part.strip()]
    allowed = [s for s in symbols if s in options_chains.SUPPORTED_SYMBOLS]
    return tuple(dict.fromkeys(allowed or ["SPY", "SPX"]))


def _date_from_path(path: str) -> str | None:
    qs = parse_qs(urlparse(path).query)
    raw = (qs.get("date") or [None])[0]
    if raw and len(raw) == 10:
        return raw
    return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - Vercel contract
        body = json.dumps(
            options_chains.fetch_options_bundle(
                _symbols_from_path(self.path),
                effective_date=_date_from_path(self.path),
            )
        ).encode(
            "utf-8",
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, max-age=20, stale-while-revalidate=120")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
