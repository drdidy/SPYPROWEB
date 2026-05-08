"""GET /api/replay/intraday — 5-minute RTH bars for SPY + ES on a given date.

Powers the synced playback animation on /replay. yfinance's 5m bars
are available going back ~60 days (the same window already used for
hourly), so we share the 60-day cap for replay-mode intraday data.

Response shape:
    {
      "date": "YYYY-MM-DD",
      "spy": [{"t": "<iso CT>", "o": .., "h": .., "l": .., "c": ..}, ...],
      "es":  [{"t": "<iso CT>", "o": .., "h": .., "l": .., "c": ..}, ...],
      "error": "..."  (only when both feeds came up empty)
    }

The arrays may be empty if the date is too old or no bars are
available. The frontend renders an empty-state in that case.
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, time, timedelta
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

CT = ZoneInfo("America/Chicago")


def _parse_date(path: str) -> date | None:
    try:
        qs = parse_qs(urlparse(path).query)
        raw = (qs.get("date") or [None])[0]
        if not raw:
            return None
        return date.fromisoformat(raw)
    except Exception:
        return None


def _fetch_intraday_5m(symbol: str, day: date) -> list[dict]:
    """Pull 5m bars for `day`'s RTH session in CT."""
    try:
        import yfinance as yf
    except Exception:
        return []

    start_dt = datetime.combine(day - timedelta(days=1), time(0, 0), tzinfo=CT)
    end_dt = datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=CT)
    try:
        df = yf.download(
            tickers=symbol,
            start=start_dt.date(),
            end=end_dt.date(),
            interval="5m",
            progress=False,
            auto_adjust=False,
            actions=False,
            prepost=False,
        )
    except Exception:
        return []
    if df is None or df.empty:
        return []

    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = df.columns.get_level_values(0)

    # RTH window in CT: 08:30 - 15:00 inclusive.
    rth_start = datetime.combine(day, time(8, 30), tzinfo=CT)
    rth_end = datetime.combine(day, time(15, 0), tzinfo=CT)

    rows: list[dict] = []
    for ts, row in df.iterrows():
        try:
            ct_ts = ts.tz_convert(CT) if ts.tzinfo else ts.tz_localize("UTC").tz_convert(CT)
        except Exception:
            continue
        if ct_ts < rth_start or ct_ts > rth_end:
            continue
        try:
            rows.append({
                "t": ct_ts.isoformat(),
                "o": float(row["Open"]),
                "h": float(row["High"]),
                "l": float(row["Low"]),
                "c": float(row["Close"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    rows.sort(key=lambda r: r["t"])
    return rows


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        target = _parse_date(self.path)
        if target is None:
            payload = {"error": "missing or invalid ?date=YYYY-MM-DD"}
            body = json.dumps(payload).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        spy = _fetch_intraday_5m("SPY", target)
        es = _fetch_intraday_5m("ES=F", target)

        payload: dict = {
            "date": target.isoformat(),
            "spy": spy,
            "es": es,
        }
        if not spy and not es:
            payload["error"] = (
                "no 5m bars for that date (yfinance caps 5m history at ~60 days)"
            )

        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        # Historical 5m data is stable; cache long.
        self.send_header(
            "Cache-Control",
            "public, max-age=600, stale-while-revalidate=86400",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
