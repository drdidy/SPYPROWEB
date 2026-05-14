"""GET /api/spx/snapshot — current ES Channel state for the dashboard.

Pulls ES hourly bars + an SPX/ES sync quote, keeps structure in native
ES coordinates, and runs the Channel engine. Returns the camelCase JSON shape defined
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
from datetime import date, datetime, timedelta
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
from _lib.spx.time_utils import hours_between  # noqa: E402

CT = ZoneInfo("America/Chicago")
SNAPSHOT_TTL = float(os.environ.get("SPX_SNAPSHOT_TTL", "30"))
ES_TICK_SIZE = 0.25
ES_TOUCH_TOLERANCE = ES_TICK_SIZE / 2


def _resolve_offset_override() -> float | None:
    """Read SPX_ES_OFFSET_OVERRIDE env var.

    When yfinance's ES=F is showing a different contract than the
    broker's /ES (typical: ~80-100pt drift from back-month / back-
    adjusted continuous), the auto-computed offset (yfinance SPX -
    yfinance ES) doesn't match the broker spread. Setting this env
    var is retained as diagnostic metadata only. ES structure lines
    are native and do not apply the basis offset.
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
    if replay_date is None:
        as_of = datetime.now(CT)
    else:
        # Replay mode: pin "now" to 09:00 CT — the moment the first
        # RTH hour begins and the framework becomes the trader's
        # review point. Channel rails + prev-RTH lines project
        # to that time, scenario classifies the morning state, and
        # the playback panel handles "what happened next" forward
        # from there. Using 15:00 (RTH close) instead would project
        # lines to end-of-day — correct math but useless for the
        # entry decision.
        as_of = datetime(
            replay_date.year, replay_date.month, replay_date.day, 9, 0, tzinfo=CT
        )
    snap, meta = build_snapshot_with_provenance(
        fetcher,
        as_of,
        offset_override=offset_override,
    )
    payload = snap.model_dump(by_alias=True)
    payload["_meta"] = _public_meta(meta)
    payload["replay"] = _build_spx_replay_block(payload, replay_date)
    return payload


def _public_meta(meta: dict) -> dict:
    """Return user-safe metadata without broker/provider names.

    Internal fetchers can keep their concrete names for diagnostics. The public
    app/API should only describe roles, because provider implementation is not
    part of the user-facing product contract.
    """
    clean = dict(meta)

    def role(value: object) -> object:
        if not isinstance(value, str):
            return value
        text = value
        replacements = {
            "tastytrade_quote": "primary_quote",
            "tastytrade": "primary",
            "yfinance": "fallback",
            "yahoo": "fallback",
        }
        lowered = text.lower()
        for needle, replacement in replacements.items():
            lowered = lowered.replace(needle, replacement)
        return lowered

    for key in ("fetcher", "barsSource", "quoteSource", "offsetMethod"):
        if key in clean:
            clean[key] = role(clean[key])

    if clean.get("barsError"):
        clean["barsError"] = "Primary bars unavailable; fallback bars are serving this snapshot."
    if clean.get("quoteError"):
        clean["quoteError"] = "Primary quote unavailable; fallback quote logic was used."
    return clean


def _build_spx_replay_block(payload: dict, replay_date: date | None) -> dict:
    """Replay block + verdictOutcome / verdictPnl for SPX.

    The FE track-record component grades each replayed session by
    reading verdictOutcome (WIN/LOSS/PUSH/N_A). Without scoring it
    always reads N_A and the dashboard renders "no graded sessions".

    Grading rule for SPX/ES (v11 - Pivot Fan 09:00-11:00 framework):
      - Every ES structure line is projected to its 08:00 CT operating
        point. Replay grading evaluates the real Pivot Fan line set, not
        the old primary/alternate play proxy.
      - Only the 09:00, 10:00, and 11:00 CT hourly candles are eligible.
      - BUY trigger: price is above the line, drops into it on a
        bearish hourly candle, and closes back above the line.
      - SELL trigger: price is below the line, rises into it on a
        bullish hourly candle, and closes back below the line.
      - Entry is the 08:00 operating level; exit is that hourly
        candle close. If no qualified rejection occurs, N_A is the
        honest grade — do not mark a loss just because price touched.

    The previous rule used `plays.primary` / `plays.alternate` only.
    That dropped valid touches from the Pivot Fan framework, especially
    the previous-RTH continuation references. The replay score must
    grade what the framework actually offered through the 09:00-11:00
    institutional window.

    Critical detail: the engine plots lines from ES=F bars + an
    offset (SPX_equiv = ES + offset). Grading must walk the same
    data path — using SPX cash (^GSPC) directly would let a small
    offset error mark a real ES tag as a miss. We grade against
    ES=F's day-net (open→close) and apply the snapshot's actual
    appliedOffset for the displayed open/close levels. The day-net
    in points is identical whether viewed in ES or SPX (offset is
    a constant), so the WIN/LOSS classification is unaffected by
    the offset; the offset only matters for the displayed numbers.
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
    meta = payload.get("_meta") or {}
    # `action` retained in the payload contract for the dashboard
    # display ("TAKE" / "SELECTIVE" / "STAND_DOWN") but is no
    # longer a grading input — see docstring above.
    _action = confluence.get("action")
    applied_offset = meta.get("appliedOffset")
    offset = float(applied_offset) if isinstance(applied_offset, (int, float)) else 0.0

    # Fetch the actual day's open/close. Best-effort with multiple
    # fallbacks so a yfinance hiccup doesn't strand grading.
    day = _spx_session_ohlc(replay_date, offset)
    if day is not None:
        block["session"] = {
            "open": round(day["open"], 2),
            "close": round(day["close"], 2),
            "netPts": round(day["close"] - day["open"], 2),
        }

    replay_result = _grade_replay_from_rail_tag(payload, replay_date, offset)
    if replay_result is None:
        block["verdictOutcome"] = "N_A"
        return block

    block["verdictOutcome"] = replay_result["outcome"]
    block["verdictPnl"] = replay_result["pnl"]
    return block


def _grade_replay_from_rail_tag(payload: dict, replay_date: date, offset: float) -> dict | None:
    line_payloads = [
        line
        for line in (payload.get("lines") or [])
        if isinstance(line, dict) and line.get("kind")
    ]
    if not line_payloads:
        return None
    bars = _spx_session_intraday(replay_date, offset)
    if not bars:
        return None
    hourly = _hourly_replay_bars(bars)
    if not hourly:
        return None

    for bar in hourly:
        t = bar["time"]
        if not (9 <= t.hour <= 11):
            continue

        triggers: list[dict] = []
        for line in line_payloads:
            entry_value = _entry_value_for_payload_line(line, t)
            if entry_value is None:
                continue
            side = _qualified_rejection_side(bar, entry_value, str(line.get("kind") or ""))
            if side is None:
                continue
            triggers.append({
                "side": side,
                "entry": entry_value,
                "distance": abs(float(bar["open"]) - entry_value),
            })
        if not triggers:
            continue

        trigger = sorted(triggers, key=lambda item: item["distance"])[0]
        entry_price = float(trigger["entry"])
        close_price = float(bar["close"])
        side = trigger["side"]
        pnl = close_price - entry_price if side == "BUY" else entry_price - close_price
        outcome = "WIN" if pnl > 0 else ("LOSS" if pnl < 0 else "PUSH")
        return {"outcome": outcome, "pnl": round(pnl, 2)}

    return None


def _qualified_rejection_side(bar: dict, line_value: float, line_kind: str = "") -> str | None:
    high = float(bar["high"])
    low = float(bar["low"])
    close = float(bar["close"])
    touched = (low - ES_TOUCH_TOLERANCE) <= line_value <= (high + ES_TOUCH_TOLERANCE)
    if not touched:
        return None
    # A 09/10/11 CT touch is a graded event. Direction is determined by
    # the resolution of that hourly candle: close above the touched line
    # is a buy/reclaim; close below it is a sell/rejection.
    if close > line_value:
        return "BUY"
    if close < line_value:
        return "SELL"
    return None


def _hourly_replay_bars(bars: list[dict]) -> list[dict]:
    buckets: dict[datetime, list[dict]] = {}
    for bar in bars:
        t = bar["time"]
        if not isinstance(t, datetime):
            continue
        hour = t.astimezone(CT).replace(minute=0, second=0, microsecond=0)
        buckets.setdefault(hour, []).append(bar)

    hourly: list[dict] = []
    for hour in sorted(buckets):
        group = sorted(buckets[hour], key=lambda item: item["time"])
        hourly.append({
            "time": hour,
            "open": float(group[0]["open"]),
            "high": max(float(item["high"]) for item in group),
            "low": min(float(item["low"]) for item in group),
            "close": float(group[-1]["close"]),
        })
    return hourly


def _entry_value_for_payload_line(line: dict, at: datetime) -> float | None:
    value = line.get("entryValue")
    if isinstance(value, (int, float)):
        return float(value)
    return _project_payload_line(line, at)


def _project_payload_line(line: dict, at: datetime) -> float | None:
    try:
        anchor_time = datetime.fromisoformat(str(line["anchorTime"]))
        return float(line["anchorPrice"]) + float(line["slopePerHour"]) * hours_between(anchor_time, at)
    except Exception:
        return None


def _spx_session_ohlc(d: date, offset: float) -> dict | None:
    """Day's open/close in native ES points for `d`.

    Tries ES=F only, because replay grading must remain in the same
    coordinate system as the six ES structure lines. Returns None if
    the native ES bar is unavailable.

    Single-day yfinance downloads are flaky, so we widen the window
    to ±3 calendar days and pick the bar matching `d`.
    """
    # ES=F only - matches what the engine sees.
    es = _yf_daily_ohlc("ES=F", d)
    if es is not None:
        return {"open": es["open"], "close": es["close"]}

    return None


def _spx_session_intraday(d: date, offset: float) -> list[dict]:
    """RTH intraday bars in native ES points for replay grading."""
    try:
        import yfinance as yf  # type: ignore[import-not-found]
    except Exception:
        return []
    try:
        start = d.isoformat()
        end = (d + timedelta(days=1)).isoformat()
        df = yf.download(
            tickers="ES=F",
            start=start,
            end=end,
            interval="5m",
            progress=False,
            auto_adjust=False,
            actions=False,
            prepost=False,
        )
        if df is None or df.empty:
            return []
        if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
            df.columns = df.columns.get_level_values(0)
        out: list[dict] = []
        for ts, row in df.iterrows():
            t = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts
            if t.tzinfo is None:
                t = t.replace(tzinfo=CT)
            else:
                t = t.astimezone(CT)
            if t.date() != d:
                continue
            if not (8 <= t.hour <= 15):
                continue
            out.append({
                "time": t,
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
            })
        return out
    except Exception:
        return []


def _yf_daily_ohlc(ticker: str, d: date) -> dict | None:
    """Fetch a single day's open/close. None on failure or no bar for d."""
    try:
        import yfinance as yf  # type: ignore[import-not-found]
    except Exception:
        return None
    try:
        from datetime import timedelta as _td

        # Wider window: yfinance 1-day single-date queries return
        # empty too often. Pull ±3 days and pick the bar matching d.
        start = (d - _td(days=3)).isoformat()
        end = (d + _td(days=4)).isoformat()
        df = yf.download(
            tickers=ticker,
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
        target = d.isoformat()
        for ts, row in df.iterrows():
            iso = ts.date().isoformat() if hasattr(ts, "date") else str(ts)[:10]
            if iso == target:
                return {"open": float(row["Open"]), "close": float(row["Close"])}
        # No exact match for d (likely a non-trading day passed in).
        return None
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
        except ValueError as e:
            # Engine raised on a missing-data invariant. The two
            # known cases:
            #   - "No ES candles in overnight window" — the lookback
            #     window didn't cover the prior session's overnight
            #     bars (e.g. on a Saturday probe with a too-short
            #     lookback), or the data feed gapped overnight.
            # Treat the same as no_bars: 503 so the FE renders a
            # graceful empty state rather than a hard error.
            payload = {
                "error": str(e),
                "kind": "no_bars",
                "subkind": "missing_overnight_bars",
            }
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
