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
    payload["replay"] = _build_spx_replay_block(payload, replay_date)
    return payload


def _build_spx_replay_block(payload: dict, replay_date: date | None) -> dict:
    """Replay block + verdictOutcome / verdictPnl for SPX.

    The FE track-record component grades each replayed session by
    reading verdictOutcome (WIN/LOSS/PUSH/N_A). Without scoring it
    always reads N_A and the dashboard renders "no graded sessions"
    for every day.

    Grading rule for SPX:
      action == TAKE | SELECTIVE  AND  channel.direction != NONE
        → engine bet on the channel direction this session.
        → Compare day's net open→close to the implied side.
      action == STAND_DOWN  OR  channel.direction == NONE
        → N/A.

    `as_of` for replay is pinned to 09:00 CT in this snapshot path, so
    the SPXSnapshot's price.change is the overnight gap, not the full
    day's move. We fetch a daily ^GSPC bar separately to grade the
    actual session.
    """
    block: dict = {
        "isReplay": replay_date is not None,
        "date": replay_date.isoformat() if replay_date else None,
        "session": None,
        "verdictOutcome": None,
        "verdictPnl": None,
    }
    if replay_date is None:
        return block

    confluence = (payload.get("confluence") or {})
    channel = (payload.get("channel") or {})
    action = confluence.get("action")
    direction = channel.get("direction")

    # Fetch the actual day's open/close. Best-effort: failure leaves
    # session/outcome unset and the FE falls back to a soft recap.
    day = _spx_session_ohlc(replay_date)
    if day is not None:
        block["session"] = {
            "open": round(day["open"], 2),
            "close": round(day["close"], 2),
            "netPts": round(day["close"] - day["open"], 2),
        }

    is_directional = action in ("TAKE", "SELECTIVE")
    has_channel = direction in ("ASCENDING", "DESCENDING")
    if is_directional and has_channel and day is not None:
        net = day["close"] - day["open"]
        bullish_bet = direction == "ASCENDING"
        if bullish_bet:
            block["verdictOutcome"] = (
                "WIN" if net > 0 else ("LOSS" if net < 0 else "PUSH")
            )
            block["verdictPnl"] = round(net, 2)
        else:
            block["verdictOutcome"] = (
                "WIN" if net < 0 else ("LOSS" if net > 0 else "PUSH")
            )
            block["verdictPnl"] = round(-net, 2)
    else:
        block["verdictOutcome"] = "N_A"
    return block


def _spx_session_ohlc(d: date) -> dict | None:
    """Return {open, close} for ^GSPC on `d`. None on any failure."""
    try:
        import yfinance as yf  # type: ignore[import-not-found]
    except Exception:
        return None
    try:
        from datetime import timedelta as _td

        start = d.isoformat()
        end = (d + _td(days=1)).isoformat()
        df = yf.download(
            tickers="^GSPC",
            start=start,
            end=end,
            interval="1d",
            progress=False,
            auto_adjust=False,
            actions=False,
            prepost=False,
        )
        if df is None or df.empty:
            return None
        if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
            df.columns = df.columns.get_level_values(0)
        row = df.iloc[0]
        return {"open": float(row["Open"]), "close": float(row["Close"])}
    except Exception:
        return None


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
