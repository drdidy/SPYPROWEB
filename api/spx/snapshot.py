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
from _lib.spx_data.historical_offset import historical_offset_for_date  # noqa: E402
from _lib.spx.time_utils import hours_between  # noqa: E402

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
    always reads N_A and the dashboard renders "no graded sessions".

    Grading rule for SPX (v9 — corrected per trader's strategy):
      channel.direction != NONE
        → Engine projected a ceiling and a floor; both rails reach
          09:00 CT. The trade IS the rail tag — when ES tags either
          rail at/around 09:00 and moves away, the engine took the
          play implied by the channel direction (long off the floor
          for ASCENDING, short off the ceiling for DESCENDING).
          Compare the day's net open→close to that implied side.
      channel.direction == NONE
        → No channel rails were projected, so there is no rail to
          tag. N_A is the honest read.

    The previous rule also required `action in (TAKE, SELECTIVE)` —
    a confluence-score gate. That gate is meant to filter
    low-conviction sessions for *display* purposes ("stand down,
    don't take this one"), but it shouldn't suppress *grading* of
    what would have happened if the user had taken the rail tag
    anyway. Dropped — grading is about what the rails actually did.

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
    channel = (payload.get("channel") or {})
    meta = payload.get("_meta") or {}
    # `action` retained in the payload contract for the dashboard
    # display ("TAKE" / "SELECTIVE" / "STAND_DOWN") but is no
    # longer a grading input — see docstring above.
    _action = confluence.get("action")
    direction = channel.get("direction")
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

    has_channel = direction in ("ASCENDING", "DESCENDING")
    if not has_channel:
        block["verdictOutcome"] = "N_A"
        return block

    replay_result = _grade_replay_from_rail_tag(payload, replay_date, offset)
    if replay_result is None:
        block["verdictOutcome"] = "N_A"
        return block

    block["verdictOutcome"] = replay_result["outcome"]
    block["verdictPnl"] = replay_result["pnl"]
    return block


def _grade_replay_from_rail_tag(payload: dict, replay_date: date, offset: float) -> dict | None:
    plays = payload.get("plays") or {}
    candidates = [
        trade
        for trade in (plays.get("primary"), plays.get("alternate"))
        if isinstance(trade, dict)
    ]
    if not candidates:
        return None

    lines = {line.get("kind"): line for line in payload.get("lines") or []}
    valid_trades: list[dict] = []
    for trade in candidates:
        side = trade.get("side")
        entry_line = trade.get("entryLine")
        entry_payload = lines.get(entry_line)
        if side in ("BUY", "SELL") and entry_payload:
            valid_trades.append({
                "side": side,
                "entryLine": entry_line,
                "entryPayload": entry_payload,
            })
    if not valid_trades:
        return None

    bars = _spx_session_intraday(replay_date, offset)
    if not bars:
        return None

    entry_price = None
    exit_after = None
    close_price = None
    side = None
    for bar in bars:
        close_price = float(bar["close"])
        t = bar["time"]

        if entry_price is None:
            for trade in valid_trades:
                entry_value = _project_payload_line(trade["entryPayload"], t)
                if entry_value is None:
                    continue
                if float(bar["low"]) <= entry_value <= float(bar["high"]):
                    entry_price = entry_value
                    exit_after = t + timedelta(hours=1)
                    side = trade["side"]
                    break
            if entry_price is None:
                continue

        if exit_after is not None and t >= exit_after:
            pnl = float(bar["close"]) - entry_price if side == "BUY" else entry_price - float(bar["close"])
            outcome = "WIN" if pnl > 0 else ("LOSS" if pnl < 0 else "PUSH")
            return {"outcome": outcome, "pnl": round(pnl, 2)}

    if entry_price is None or close_price is None or side is None:
        return None
    pnl = close_price - entry_price if side == "BUY" else entry_price - close_price
    outcome = "WIN" if pnl > 0 else ("LOSS" if pnl < 0 else "PUSH")
    return {"outcome": outcome, "pnl": round(pnl, 2)}


def _project_payload_line(line: dict, at: datetime) -> float | None:
    try:
        anchor_time = datetime.fromisoformat(str(line["anchorTime"]))
        return float(line["anchorPrice"]) + float(line["slopePerHour"]) * hours_between(anchor_time, at)
    except Exception:
        return None


def _spx_session_ohlc(d: date, offset: float) -> dict | None:
    """Day's open/close in SPX-equivalent points for `d`.

    Tries ES=F first (the engine's data source) + the supplied offset,
    then ^GSPC, then SPY*10 — each fallback narrows but maintains
    direction. Returns {open, close} in SPX-equivalent points, or None
    if every source fails.

    Single-day yfinance downloads are flaky, so we widen the window
    to ±3 calendar days and pick the bar matching `d`.
    """
    # 1) ES=F + offset — preferred, matches what the engine sees.
    es = _yf_daily_ohlc("ES=F", d)
    if es is not None:
        return {"open": es["open"] + offset, "close": es["close"] + offset}

    # 2) ^GSPC cash index — direct SPX value.
    gspc = _yf_daily_ohlc("^GSPC", d)
    if gspc is not None:
        return gspc

    # 3) SPY × 10 — closest cash proxy when both above fail.
    spy = _yf_daily_ohlc("SPY", d)
    if spy is not None:
        return {"open": spy["open"] * 10, "close": spy["close"] * 10}

    return None


def _spx_session_intraday(d: date, offset: float) -> list[dict]:
    """RTH intraday bars in SPX-equivalent points for replay grading."""
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
                "open": float(row["Open"]) + offset,
                "high": float(row["High"]) + offset,
                "low": float(row["Low"]) + offset,
                "close": float(row["Close"]) + offset,
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
