"""SPY Prophet trading engine.

Ported from drdidy/SPYPROST/app.py. Numerically equivalent to the
Streamlit version. No Streamlit, Plotly, yfinance, or other UI
dependencies. Pure trading logic: pivots, lines, signals, bias,
strikes, decision quality.

Functions intentionally not ported in this module (they're presentation
or external-data orchestration and belong in separate modules):
  - Plotly chart builders (build_prophet_chart, build_structure_*_chart)
  - Streamlit UI helpers (render_*, inject_global_css, ui_icon)
  - Morning briefing / OpenAI / news / economic calendar
  - Journal, replay outcomes, options cockpit (Tastytrade quotes)
  - External level scoring beyond premium flow direction/strike candidates

Caching: @st.cache_data is replaced with a small TTL cache decorator
(`ttl_cache`). Apply it to data-fetcher modules built on top of this
engine; the engine itself is pure and does not need caching.
"""
from __future__ import annotations

import json
import math
import os
import threading
import time as _time_module
from dataclasses import asdict, dataclass, replace
from datetime import date, datetime, time
from functools import wraps
from typing import Any, Callable, Optional

import pandas as pd

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover - Python <3.9 fallback
    ZoneInfo = None  # type: ignore
    ZoneInfoNotFoundError = Exception  # type: ignore


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SYMBOL = "SPY"
VIX_SYMBOL = "^VIX"
CENTRAL_TZ_NAME = "America/Chicago"
CENTRAL_TZ_ALIASES = (CENTRAL_TZ_NAME, "US/Central")
DEFAULT_SLOPE_PER_HOUR = 0.20
TP1_TARGET_FRACTION = 0.50
TP2_TARGET_FRACTION = 0.75
STRUCTURE_CALIBRATION_KEYS = ("SPYPROPHET_STRUCTURE_CALIBRATION", "SPYPROPHET_SLOPE_PER_HOUR")
TARGET_OTM_STRIKE_DISTANCE = 2.0
FLOW_STRIKE_MAX_OTM_DISTANCE = 3.0
SPY_STRIKE_INCREMENT = 1
EXPECTED_OHLCV_COLUMNS = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]
RTH_SESSION_START = time(8, 30)
RTH_SESSION_END = time(15, 0)
PROJECTION_SESSION_START = time(3, 0)
PROJECTION_SESSION_END = time(18, 0)
NEXT_SESSION_PREVIEW_START = time(17, 0)


# ---------------------------------------------------------------------------
# TTL cache (drop-in replacement for @st.cache_data on data fetchers)
# ---------------------------------------------------------------------------

def ttl_cache(ttl_seconds: float, maxsize: int = 128) -> Callable:
    """Tiny thread-safe TTL cache.

    Use to wrap pure data fetchers that previously used @st.cache_data.
    Keys are built from positional + keyword args (must be hashable).
    Recommended TTLs match the Streamlit version:
      - SPY hourly OHLC: 60s
      - Options chain: 120s
      - News / RSS: 900s (15min)
      - Economic calendar: 1800s
    """
    def decorator(fn: Callable) -> Callable:
        store: dict[tuple, tuple[float, Any]] = {}
        order: list[tuple] = []
        lock = threading.Lock()

        @wraps(fn)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            key = (args, tuple(sorted(kwargs.items())))
            now = _time_module.monotonic()
            with lock:
                if key in store:
                    expires, value = store[key]
                    if now < expires:
                        return value
                    store.pop(key, None)
                    if key in order:
                        order.remove(key)
            value = fn(*args, **kwargs)
            with lock:
                store[key] = (now + ttl_seconds, value)
                order.append(key)
                while len(order) > maxsize:
                    drop = order.pop(0)
                    store.pop(drop, None)
            return value

        def cache_clear() -> None:
            with lock:
                store.clear()
                order.clear()

        wrapped.cache_clear = cache_clear  # type: ignore[attr-defined]
        return wrapped
    return decorator


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Pivot:
    name: str
    price: float
    timestamp: pd.Timestamp | None
    source: str
    candle_color: str
    fallback_used: bool


@dataclass(frozen=True)
class SecondaryPivot:
    name: str
    price: float
    timestamp: pd.Timestamp | None
    direction: str
    source: str


@dataclass(frozen=True)
class SourceStatus:
    name: str
    status: str
    detail: str
    as_of: pd.Timestamp | None = None
    url: str | None = None


@dataclass(frozen=True)
class OptionsIntelligence:
    status: SourceStatus
    put_call_open_interest_ratio: float
    put_call_volume_ratio: float
    max_pain: float
    call_wall: float
    put_wall: float
    high_open_interest: list[dict]
    selected_quotes: list[dict] | None = None
    unusual_whales: dict | None = None


@dataclass(frozen=True)
class DynamicLine:
    name: str
    anchor_price: float
    anchor_time: pd.Timestamp | None
    slope_per_hour: float
    direction: str
    zone_type: str
    source: str
    is_primary: bool
    description: str

    def hours_since(self, dt: datetime | pd.Timestamp) -> float:
        if self.anchor_time is None or pd.isna(self.anchor_price):
            return float("nan")
        ct = get_central_tz()
        cur = pd.Timestamp(dt)
        anc = pd.Timestamp(self.anchor_time)
        cur = cur.tz_localize(ct) if cur.tzinfo is None else cur.tz_convert(ct)
        anc = anc.tz_localize(ct) if anc.tzinfo is None else anc.tz_convert(ct)
        return market_hours_between(anc, cur)

    def raw_value_at(self, dt: datetime | pd.Timestamp) -> float:
        hours = self.hours_since(dt)
        if pd.isna(hours) or pd.isna(self.anchor_price):
            return float("nan")
        if self.direction == "ascending":
            return float(self.anchor_price + (self.slope_per_hour * hours))
        if self.direction == "descending":
            return float(self.anchor_price - (self.slope_per_hour * hours))
        return float("nan")

    def value_at(self, dt: datetime | pd.Timestamp) -> float:
        return self.raw_value_at(dt)

    def tradable_value_at(self, dt: datetime | pd.Timestamp) -> float:
        raw = self.raw_value_at(dt)
        if pd.isna(raw):
            return float("nan")
        return round(raw, 2)

    def distance_from_price(self, price: float, dt: datetime | pd.Timestamp, use_tradable_value: bool = True) -> float:
        if price is None or pd.isna(price):
            return float("nan")
        line_val = self.tradable_value_at(dt) if use_tradable_value else self.raw_value_at(dt)
        if pd.isna(line_val):
            return float("nan")
        return float(price - line_val)

    def abs_distance_from_price(self, price: float, dt: datetime | pd.Timestamp, use_tradable_value: bool = True) -> float:
        dist = self.distance_from_price(price, dt, use_tradable_value)
        return float(abs(dist)) if not pd.isna(dist) else float("nan")

    def percent_distance_from_price(self, price: float, dt: datetime | pd.Timestamp, use_tradable_value: bool = True) -> float:
        if price is None or pd.isna(price) or price == 0:
            return float("nan")
        abs_dist = self.abs_distance_from_price(price, dt, use_tradable_value)
        return float((abs_dist / price) * 100) if not pd.isna(abs_dist) else float("nan")


@dataclass(frozen=True)
class BiasState:
    bias: str
    current_price: float
    current_time: pd.Timestamp
    watched_call_lines: list[str]
    watched_put_lines: list[str]
    primary_line: str | None
    final_take_profit_line: str | None
    strength_score: float
    explanation: str
    ua_value: float
    ud_value: float
    la_value: float
    ld_value: float


@dataclass(frozen=True)
class SelectedStrikes:
    underlying_price: float
    call_strike: int
    put_strike: int
    expiration_date: object
    dte_label: str
    warning: str | None


@dataclass(frozen=True)
class TradeSignal:
    signal_id: str
    signal_type: str
    status: str
    line_name: str
    line_value_at_rejection: float
    rejection_time: pd.Timestamp
    rejection_open: float
    rejection_high: float
    rejection_low: float
    rejection_close: float
    entry_time: pd.Timestamp | None
    entry_price: float
    stop_price: float
    target_line_name: str | None
    target_price: float
    risk: float
    reward: float
    rr_ratio: float
    breakeven_rule: str
    explanation: str


@dataclass(frozen=True)
class SignalQuality:
    signal_id: str
    grade: str
    score: float
    close_distance: float
    close_distance_pct_of_candle: float
    wick_penetration: float
    wick_rejection_ratio: float
    body_position_score: float
    risk_reward_score: float
    target_quality: str
    warnings: list[str]
    strengths: list[str]
    action_label: str
    explanation: str


@dataclass(frozen=True)
class RiskGuardrailState:
    signal_id: str | None
    chase_status: str
    chase_distance: float
    chase_warning: str | None
    retest_status: str
    retest_line_name: str | None
    structure_status: str
    structure_warning: str | None
    daily_action: str
    explanation: str


@dataclass(frozen=True)
class DecisionState:
    latest_signal: TradeSignal | None
    signal_quality: SignalQuality | None
    guardrail_state: RiskGuardrailState
    final_decision: str
    final_explanation: str


# ---------------------------------------------------------------------------
# Time / timezone helpers
# ---------------------------------------------------------------------------

def get_central_tz():
    if ZoneInfo is not None:
        for tz_name in CENTRAL_TZ_ALIASES:
            try:
                return ZoneInfo(tz_name)
            except ZoneInfoNotFoundError:
                continue
    import pytz
    return pytz.timezone(CENTRAL_TZ_NAME)


def market_hours_between(start_dt: datetime | pd.Timestamp, end_dt: datetime | pd.Timestamp) -> float:
    ct = get_central_tz()
    start = pd.Timestamp(start_dt)
    end = pd.Timestamp(end_dt)
    start = start.tz_localize(ct) if start.tzinfo is None else start.tz_convert(ct)
    end = end.tz_localize(ct) if end.tzinfo is None else end.tz_convert(ct)
    if end == start:
        return 0.0
    sign = 1.0
    if end < start:
        start, end = end, start
        sign = -1.0

    total_seconds = 0.0
    day = start.date()
    last_day = end.date()
    while day <= last_day:
        if pd.Timestamp(day).weekday() < 5:
            session_start = pd.Timestamp(day, tz=ct) + pd.Timedelta(
                hours=PROJECTION_SESSION_START.hour, minutes=PROJECTION_SESSION_START.minute
            )
            session_end = pd.Timestamp(day, tz=ct) + pd.Timedelta(
                hours=PROJECTION_SESSION_END.hour, minutes=PROJECTION_SESSION_END.minute
            )
            left = max(start, session_start)
            right = min(end, session_end)
            if right > left:
                total_seconds += (right - left).total_seconds()
        day = (pd.Timestamp(day) + pd.Timedelta(days=1)).date()
    return sign * total_seconds / 3600.0


# ---------------------------------------------------------------------------
# Format / display helpers (declared before functions that consume them)
# ---------------------------------------------------------------------------

def fmt_nan(value: Any, fallback: str = "-") -> Any:
    if value is None:
        return fallback
    try:
        if pd.isna(value) is True:
            return fallback
    except Exception:
        pass
    return value


def fmt_price(value: Any, digits: int = 2) -> str:
    v = fmt_nan(value, None)
    return "-" if v is None else f"{float(v):.{digits}f}"


def fmt_float(value: Any, digits: int = 2) -> str:
    v = fmt_nan(value, None)
    return "-" if v is None else f"{float(v):.{digits}f}"


def fmt_pct(value: Any, digits: int = 1) -> str:
    v = fmt_nan(value, None)
    return "-" if v is None else f"{float(v):.{digits}f}%"


def fmt_money_short(value: Any) -> str:
    v = fmt_nan(value, None)
    if v is None:
        return "-"
    amount = float(v)
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    if amount >= 1_000_000_000:
        return f"{sign}${amount / 1_000_000_000:.1f}B"
    if amount >= 1_000_000:
        return f"{sign}${amount / 1_000_000:.1f}M"
    if amount >= 1_000:
        return f"{sign}${amount / 1_000:.0f}K"
    return f"{sign}${amount:.0f}"


def fmt_time(value: Any) -> str:
    if value is None:
        return "-"
    ts = pd.Timestamp(value)
    ts = ts.tz_localize(get_central_tz()) if ts.tzinfo is None else ts.tz_convert(get_central_tz())
    return ts.strftime("%Y-%m-%d %H:%M %Z")


def fmt_clock_time(value: Any) -> str:
    if value is None:
        return "-"
    ts = pd.Timestamp(value)
    ts = ts.tz_localize(get_central_tz()) if ts.tzinfo is None else ts.tz_convert(get_central_tz())
    return ts.strftime("%I:%M %p %Z").lstrip("0")


def safe_to_dict(obj: Any) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        d = dict(obj)
    elif hasattr(obj, "__dataclass_fields__"):
        d = asdict(obj)
    else:
        d = {"value": str(obj)}
    for k in list(d.keys()):
        if any(x in str(k).lower() for x in ["client_secret", "refresh_token", "access_token", "account"]):
            d[k] = "[REDACTED]"
    return d


def safe_json(obj: Any) -> str:
    return json.dumps(safe_to_dict(obj), default=str)


def _humanize(value: str | None) -> str:
    if value is None:
        return "-"
    return str(value).replace("_", " ")


def display_state_label(value: str | None) -> str:
    text = _humanize(value)
    labels = {
        "CONNECTED": "Connected",
        "ALIGNED": "Supports",
        "OPPOSES": "Cautions",
        "RISK": "Risk",
        "NEUTRAL": "Neutral",
        "WAIT": "Wait",
        "WATCH CALL": "Watch call",
        "WATCH PUT": "Watch put",
        "WAIT FOR CONFIRMATION": "Wait for confirmation",
        "WAIT FOR RETEST": "Wait for retest",
        "TRADE ALLOWED": "Trade allowed",
        "NO TRADE": "No trade",
        "REGULAR SESSION": "Session watch",
        "YFINANCE FALLBACK": "Delayed quotes",
        "TASTYTRADE LIVE": "Tastytrade live",
        "YFINANCE DELAYED": "Delayed quotes",
        "UNAVAILABLE": "Needs data",
        "NOT USED": "Not used",
    }
    return labels.get(text.upper(), text.title() if text == text.upper() else text)


def display_line_name(name: str | None) -> str:
    if not name:
        return "-"
    normalized = str(name).strip().upper().replace(" ", "_")
    primary = {
        "UA": "Upper Ascending Trigger",
        "UD": "Upper Descending Trigger",
        "LA": "Lower Ascending Trigger",
        "LD": "Lower Descending Trigger",
    }
    if normalized in primary:
        return primary[normalized]
    if normalized.startswith("S_ASC"):
        return "Lower Target"
    if normalized.startswith("S_DESC"):
        return "Upper Target"
    return _humanize(name)


def display_line_description(name: str | None) -> str:
    descriptions = {
        "UA": "Ascending structure from the high pivot; entry trigger only in bearish structure",
        "UD": "Primary descending trigger from the high pivot",
        "LA": "Ascending structure from the low pivot; entry trigger only in bearish structure",
        "LD": "Primary descending trigger from the low pivot",
    }
    if not name:
        return "-"
    normalized = str(name).strip().upper().replace(" ", "_")
    if normalized in descriptions:
        return descriptions[normalized]
    if normalized.startswith("S_ASC") or normalized.startswith("S_DESC"):
        return "Target-only structure"
    return _humanize(name)


def display_anchor_source(line: DynamicLine | None) -> str:
    if line is None:
        return "-"
    if line.source == "PRIMARY_HIGH":
        source_name = "High pivot"
    elif line.source == "PRIMARY_LOW":
        source_name = "Low pivot"
    else:
        source_name = _humanize(line.source)
    return f"{source_name} {fmt_price(line.anchor_price)}"


def display_line_list(names: list[str] | tuple[str, ...] | None) -> str:
    return ", ".join(display_line_name(name) for name in names or []) or "-"


def compact_line_name(name: str | None) -> str:
    if not name:
        return "Pending"
    labels = {"UA": "Upper Ascending", "UD": "Upper Descending", "LA": "Lower Ascending", "LD": "Lower Descending"}
    normalized = str(name).strip().upper().replace(" ", "_")
    return labels.get(normalized, display_line_name(name))


def rth_session_window_label() -> str:
    def compact(value: time) -> str:
        template = "%I:00" if value.minute == 0 else "%I:%M"
        return value.strftime(template).lstrip("0")
    return f"{compact(RTH_SESSION_START)}-{compact(RTH_SESSION_END)} CT"


def next_hourly_checkpoint(value: Any) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    ts = ts.tz_localize(get_central_tz()) if ts.tzinfo is None else ts.tz_convert(get_central_tz())
    floor = ts.replace(minute=0, second=0, microsecond=0, nanosecond=0)
    return floor if ts == floor else floor + pd.Timedelta(hours=1)


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------

def _finite_float(value: Any, default: float = float("nan")) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return out


def _strike_key(value: Any) -> float | None:
    strike = _finite_float(value)
    return None if pd.isna(strike) else float(strike)


def _price_float(value: Any) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return float("nan")
    return out if math.isfinite(out) else float("nan")


# ---------------------------------------------------------------------------
# Configuration / secrets (env-only; Streamlit secrets dropped by design)
# ---------------------------------------------------------------------------

def get_secret_or_env(name: str, default: str = "") -> str:
    env_value = os.getenv(name, "").strip()
    return env_value if env_value else default.strip()


def get_structure_calibration(default: float = DEFAULT_SLOPE_PER_HOUR) -> float:
    for key in STRUCTURE_CALIBRATION_KEYS:
        raw = get_secret_or_env(key)
        if not raw:
            continue
        try:
            value = float(raw)
        except Exception:
            continue
        if 0.001 <= value <= 1.0:
            return value
    return float(default)


# ---------------------------------------------------------------------------
# OHLC frame normalization
# ---------------------------------------------------------------------------

def normalize_yfinance_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    normalized = df.copy()
    if isinstance(normalized.columns, pd.MultiIndex):
        normalized.columns = normalized.columns.get_level_values(0)
    normalized.columns = [str(c).strip() for c in normalized.columns]
    lower_map = {c.lower(): c for c in normalized.columns}
    for expected in EXPECTED_OHLCV_COLUMNS:
        match = lower_map.get(expected.lower())
        if match and match != expected:
            normalized = normalized.rename(columns={match: expected})
    return normalized.sort_index()


def ensure_central_index(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    out = df.copy()
    if not isinstance(out.index, pd.DatetimeIndex):
        out.index = pd.to_datetime(out.index, errors="coerce")
    out = out[~out.index.isna()]
    if out.empty:
        return pd.DataFrame()
    idx = out.index
    out.index = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
    out.index = out.index.tz_convert(get_central_tz())
    return out.sort_index()


def filter_rth_session(df: pd.DataFrame, trading_day: date) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    session = df[df.index.date == trading_day].sort_index()
    rth = session.between_time(RTH_SESSION_START, RTH_SESSION_END, inclusive="both")
    diffs = session.index.to_series().diff().dropna()
    if not diffs.empty and diffs.median() >= pd.Timedelta(minutes=30):
        rth = rth[rth.index.time < RTH_SESSION_END]
    return rth


def get_available_trading_days(df: pd.DataFrame) -> list[date]:
    if df is None or df.empty:
        return []
    return sorted(set(df.index.date))


# ---------------------------------------------------------------------------
# Pivots
# ---------------------------------------------------------------------------

def candle_color(row: pd.Series) -> str:
    open_key = next((k for k in row.index if str(k).lower() == "open"), None)
    close_key = next((k for k in row.index if str(k).lower() == "close"), None)
    if open_key is None or close_key is None:
        return "doji"
    o, c = float(row[open_key]), float(row[close_key])
    return "green" if c > o else "red" if c < o else "doji"


def _empty_pivot(name: str) -> Pivot:
    return Pivot(name=name, price=float("nan"), timestamp=None, source="empty_rth", candle_color="none", fallback_used=True)


def get_hourly_candle_close_time(df: pd.DataFrame, candle_time: pd.Timestamp) -> pd.Timestamp:
    idx = df.sort_index().index
    pos = idx.get_loc(candle_time)
    if isinstance(pos, slice):
        pos = pos.start
    elif not isinstance(pos, int):
        pos = int(pos[0])
    if pos + 1 < len(idx):
        return pd.Timestamp(idx[pos + 1])
    ts = pd.Timestamp(candle_time)
    ct = get_central_tz()
    ts = ts.tz_localize(ct) if ts.tzinfo is None else ts.tz_convert(ct)
    rth_close = pd.Timestamp(ts.date(), tz=ct) + pd.Timedelta(hours=15)
    if ts >= rth_close:
        return ts
    return min(ts + pd.Timedelta(hours=1), rth_close)


def normalize_tradingview_anchor_time(value: Any) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    ct = get_central_tz()
    ts = ts.tz_localize(ct) if ts.tzinfo is None else ts.tz_convert(ct)
    if ts.minute == 30:
        # Yahoo's 60m RTH bars often arrive on half-hour timestamps; the
        # strategy is calibrated to whole-hour TradingView anchors, so keep
        # the final partial RTH bar attached to 2 PM and roll others forward.
        final_rth_bar = pd.Timestamp(ts.date(), tz=ct) + pd.Timedelta(hours=14, minutes=30)
        if ts >= final_rth_bar:
            return ts - pd.Timedelta(minutes=30)
        return ts + pd.Timedelta(minutes=30)
    return ts


def get_tradingview_anchor_time(candle_time: pd.Timestamp) -> pd.Timestamp:
    ts = pd.Timestamp(candle_time)
    ct = get_central_tz()
    ts = ts.tz_localize(ct) if ts.tzinfo is None else ts.tz_convert(ct)
    if ts.time() == RTH_SESSION_START:
        return pd.Timestamp(ts.date(), tz=ct) + pd.Timedelta(hours=9)
    return normalize_tradingview_anchor_time(ts)


def find_high_pivot(rth_df: pd.DataFrame) -> Pivot:
    if rth_df is None or rth_df.empty:
        return _empty_pivot("HIGH_PIVOT")
    df = rth_df.sort_index()
    high_ts = df["High"].idxmax()
    anchor_ts = get_tradingview_anchor_time(high_ts)
    return Pivot("HIGH_PIVOT", float(df.loc[high_ts, "High"]), anchor_ts, "session_high", candle_color(df.loc[high_ts]), False)


def find_low_pivot(rth_df: pd.DataFrame) -> Pivot:
    if rth_df is None or rth_df.empty:
        return _empty_pivot("LOW_PIVOT")
    df = rth_df.sort_index()
    low_ts = df["Low"].idxmin()
    anchor_ts = get_tradingview_anchor_time(low_ts)
    return Pivot("LOW_PIVOT", float(df.loc[low_ts, "Low"]), anchor_ts, "session_low", candle_color(df.loc[low_ts]), False)


def find_primary_pivots(rth_df: pd.DataFrame) -> dict:
    return {"high": find_high_pivot(rth_df), "low": find_low_pivot(rth_df)}


def find_secondary_pivots(rth_df: pd.DataFrame) -> list[SecondaryPivot]:
    if rth_df is None or rth_df.empty:
        return []
    df = rth_df.sort_index()
    out: list[SecondaryPivot] = []
    for i in range(len(df) - 1):
        cur_color, nxt_color = candle_color(df.iloc[i]), candle_color(df.iloc[i + 1])
        anchor_ts = get_tradingview_anchor_time(df.index[i])
        if cur_color == "red" and nxt_color == "green":
            out.append(SecondaryPivot("SECONDARY_DESCENDING", float(df.iloc[i]["Low"]), anchor_ts, "descending", "secondary_transition"))
        elif cur_color == "green" and nxt_color == "red":
            out.append(SecondaryPivot("SECONDARY_ASCENDING", float(df.iloc[i]["High"]), anchor_ts, "ascending", "secondary_transition"))
    return out


# ---------------------------------------------------------------------------
# Lines
# ---------------------------------------------------------------------------

def calculate_slope_from_observed(anchor_price: float, observed_value: float, elapsed_hours: float, direction: str) -> float:
    if any(pd.isna(v) for v in [anchor_price, observed_value, elapsed_hours]) or elapsed_hours <= 0:
        return float("nan")
    if direction == "descending":
        return float((anchor_price - observed_value) / elapsed_hours)
    if direction == "ascending":
        return float((observed_value - anchor_price) / elapsed_hours)
    return float("nan")


def build_primary_lines(high_pivot: Pivot, low_pivot: Pivot, slope_per_hour: float = DEFAULT_SLOPE_PER_HOUR) -> list[DynamicLine]:
    return [
        DynamicLine("UA", high_pivot.price, high_pivot.timestamp, slope_per_hour, "ascending", "PUT_ZONE", "PRIMARY_HIGH", True, "Upper ascending structure from high pivot"),
        DynamicLine("UD", high_pivot.price, high_pivot.timestamp, slope_per_hour, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "Upper descending structure from high pivot"),
        DynamicLine("LA", low_pivot.price, low_pivot.timestamp, slope_per_hour, "ascending", "PUT_ZONE", "PRIMARY_LOW", True, "Lower ascending structure from low pivot"),
        DynamicLine("LD", low_pivot.price, low_pivot.timestamp, slope_per_hour, "descending", "CALL_ZONE", "PRIMARY_LOW", True, "Lower descending structure from low pivot"),
    ]


def build_secondary_lines(secondary_pivots: list[SecondaryPivot], slope_per_hour: float = DEFAULT_SLOPE_PER_HOUR) -> list[DynamicLine]:
    lines: list[DynamicLine] = []
    asc_i, desc_i = 1, 1
    for p in secondary_pivots:
        if p.direction == "ascending":
            name = f"S_ASC_{asc_i:03d}"
            asc_i += 1
        else:
            name = f"S_DESC_{desc_i:03d}"
            desc_i += 1
        lines.append(DynamicLine(name, p.price, p.timestamp, slope_per_hour, p.direction, "TARGET_ONLY", "SECONDARY", False, "Secondary target/reference line"))
    return lines


def project_lines(lines: list[DynamicLine], current_dt: datetime, current_price: float | None) -> pd.DataFrame:
    records = []
    for line in lines:
        raw = line.raw_value_at(current_dt)
        tradable = line.tradable_value_at(current_dt)
        dist = line.distance_from_price(current_price, current_dt, use_tradable_value=True) if current_price is not None else float("nan")
        records.append({
            "name": line.name,
            "level": display_line_name(line.name),
            "role": display_line_description(line.name),
            "raw_projected_value": raw,
            "tradable_value": tradable,
            "distance": dist,
            "abs_distance": abs(dist) if not pd.isna(dist) else float("nan"),
            "percent_distance": (abs(dist) / current_price * 100) if (current_price not in [None, 0] and not pd.isna(dist)) else float("nan"),
            "direction": line.direction,
            "zone_type": line.zone_type,
            "source": line.source,
            "is_primary": line.is_primary,
            "anchor_price": line.anchor_price,
            "anchor_time": line.anchor_time,
            "slope_per_hour": line.slope_per_hour,
            "description": line.description,
        })
    return pd.DataFrame(records)


def build_pivot_source_table(rth_df: pd.DataFrame) -> pd.DataFrame:
    if rth_df is None or rth_df.empty:
        return pd.DataFrame()
    df = rth_df.sort_index()
    rows = []
    for label, price_col, idx in [
        ("High Pivot", "High", df["High"].idxmax()),
        ("Low Pivot", "Low", df["Low"].idxmin()),
    ]:
        candle = df.loc[idx]
        close_time = get_hourly_candle_close_time(df, idx)
        rows.append({
            "Pivot": label,
            "Source": "Yahoo SPY 60m RTH",
            "Candle Starts": idx,
            "Candle Closes": close_time,
            "Pivot Price": float(candle[price_col]),
            "Open": float(candle["Open"]),
            "High": float(candle["High"]),
            "Low": float(candle["Low"]),
            "Close": float(candle["Close"]),
        })
    return pd.DataFrame(rows)


def zone_side_label(zone_type: str | None) -> str:
    if zone_type == "CALL_ZONE":
        return "Primary Descending Trigger"
    if zone_type == "PUT_ZONE":
        return "Bearish Ascending Trigger"
    return "Target"


def build_structure_projection_table(
    primary_lines: list[DynamicLine],
    current_dt: datetime,
    current_price: float | None,
    structure_day: date | None,
    signal_day: date | None,
) -> pd.DataFrame:
    rows = []
    for line in primary_lines or []:
        if line.source == "PRIMARY_HIGH":
            pivot_name = "High Pivot"
        elif line.source == "PRIMARY_LOW":
            pivot_name = "Low Pivot"
        else:
            pivot_name = _humanize(line.source)
        tradable = line.tradable_value_at(current_dt)
        distance = line.distance_from_price(current_price, current_dt) if current_price is not None else float("nan")
        hours = line.hours_since(current_dt)
        rows.append({
            "Trigger": display_line_name(line.name),
            "Type": zone_side_label(line.zone_type),
            "Based On": pivot_name,
            "Yahoo Structure Day": structure_day,
            "Signal Day": signal_day,
            "Pivot Price": line.anchor_price,
            "Anchor Candle": line.anchor_time,
            "Projection Time": pd.Timestamp(current_dt),
            "Projection Method": "Protected TradingView active-hours calibration" if not pd.isna(hours) and not pd.isna(line.anchor_price) else "-",
            "Active Chart Hours Since Anchor": hours,
            "Projected SPY Level": tradable,
            "Current SPY": current_price,
            "Distance From SPY": distance,
        })
    return pd.DataFrame(rows)


def get_line_by_name(lines: list[DynamicLine], name: str) -> DynamicLine | None:
    for line in lines:
        if line.name == name:
            return line
    return None


def get_lines_by_zone(lines: list[DynamicLine], zone_type: str) -> list[DynamicLine]:
    return [line for line in lines if line.zone_type == zone_type]


def line_is_descending_entry(line: DynamicLine | None) -> bool:
    if line is None or not line.is_primary:
        return False
    name = str(line.name or "").upper()
    return name in {"UD", "LD"} or str(line.direction or "").lower() == "descending"


def line_is_ascending_entry(line: DynamicLine | None) -> bool:
    if line is None or not line.is_primary:
        return False
    name = str(line.name or "").upper()
    return name in {"UA", "LA"} or str(line.direction or "").lower() == "ascending"


def structure_trigger_regime(lines: list[DynamicLine], current_price: float | None, current_dt: datetime) -> str:
    price = _price_float(current_price)
    if pd.isna(price):
        return "UNKNOWN"
    ua = get_line_by_name(lines or [], "UA")
    ud = get_line_by_name(lines or [], "UD")
    ua_v = ua.tradable_value_at(current_dt) if ua else float("nan")
    ud_v = ud.tradable_value_at(current_dt) if ud else float("nan")
    if pd.isna(ua_v) or pd.isna(ud_v):
        return "UNKNOWN"
    top, bot = max(float(ua_v), float(ud_v)), min(float(ua_v), float(ud_v))
    if price > top:
        return "BULLISH"
    if price < bot:
        return "BEARISH"
    return "NEUTRAL"


def line_is_active_entry(line: DynamicLine | None, lines: list[DynamicLine], current_price: float | None, current_dt: datetime) -> bool:
    if line_is_descending_entry(line):
        return True
    if line_is_ascending_entry(line):
        return structure_trigger_regime(lines, current_price, current_dt) == "BEARISH"
    return False


def active_entry_lines(lines: list[DynamicLine], current_price: float | None, current_dt: datetime) -> list[DynamicLine]:
    return [line for line in lines or [] if line_is_active_entry(line, lines or [], current_price, current_dt)]


def active_entry_rule_for_line(line: DynamicLine | None, lines: list[DynamicLine], current_price: float | None, current_dt: datetime) -> str:
    if line_is_descending_entry(line):
        return "Primary trigger. Above-touch/close-above supports calls; below-touch/close-below supports puts."
    if line_is_ascending_entry(line) and line_is_active_entry(line, lines, current_price, current_dt):
        return "Bearish-structure trigger. Use the touch side and candle close to choose call or put."
    return "Context line until structure turns bearish; do not use as a bullish-market entry."


def get_closest_primary_line(lines: list[DynamicLine], current_dt: datetime, current_price: float) -> DynamicLine | None:
    if current_price is None or pd.isna(current_price):
        return None
    eligible_names = {line.name for line in active_entry_lines(lines, current_price, current_dt)}
    candidates: list[tuple[float, DynamicLine]] = []
    for line in lines:
        if not line.is_primary:
            continue
        if line.name not in eligible_names:
            continue
        v = line.tradable_value_at(current_dt)
        if pd.isna(v):
            continue
        candidates.append((abs(current_price - v), line))
    return min(candidates, key=lambda x: x[0])[1] if candidates else None


def get_primary_anchor_summary(primary_lines: list[DynamicLine] | None) -> dict:
    lines = primary_lines or []
    high_line = get_line_by_name(lines, "UA") or get_line_by_name(lines, "UD")
    low_line = get_line_by_name(lines, "LA") or get_line_by_name(lines, "LD")
    return {
        "high_time": high_line.anchor_time if high_line else None,
        "high_price": high_line.anchor_price if high_line else float("nan"),
        "low_time": low_line.anchor_time if low_line else None,
        "low_price": low_line.anchor_price if low_line else float("nan"),
    }


# ---------------------------------------------------------------------------
# Bias / Strikes
# ---------------------------------------------------------------------------

def calculate_bias_strength(current_price: float, ua_value: float, ud_value: float, bias: str) -> float:
    vals = [current_price, ua_value, ud_value]
    if any(v is None or pd.isna(v) for v in vals):
        return 0.0
    top, bot = max(ua_value, ud_value), min(ua_value, ud_value)
    width = max(top - bot, 0.01)
    if bias == "BULLISH":
        score = min(100.0, ((current_price - top) / width) * 100)
    elif bias == "BEARISH":
        score = min(100.0, ((bot - current_price) / width) * 100)
    elif bias in {"NEUTRAL", "REGULAR_SESSION"}:
        center = (top + bot) / 2
        dist = abs(current_price - center)
        score = max(0.0, 100.0 - (dist / (width / 2)) * 100)
        if bias == "REGULAR_SESSION":
            score = min(score, 70.0)
    else:
        score = 0.0
    return float(max(0.0, min(100.0, score)))


def determine_preopen_bias(lines: list[DynamicLine], current_price: float, current_dt: datetime) -> BiasState:
    ct = get_central_tz()
    now = pd.Timestamp(current_dt)
    now = now.tz_localize(ct) if now.tzinfo is None else now.tz_convert(ct)
    ua = get_line_by_name(lines, "UA")
    ud = get_line_by_name(lines, "UD")
    la = get_line_by_name(lines, "LA")
    ld = get_line_by_name(lines, "LD")
    ua_v = ua.tradable_value_at(now) if ua else float("nan")
    ud_v = ud.tradable_value_at(now) if ud else float("nan")
    la_v = la.tradable_value_at(now) if la else float("nan")
    ld_v = ld.tradable_value_at(now) if ld else float("nan")

    if ua is None or ud is None or pd.isna(ua_v) or pd.isna(ud_v):
        return BiasState(
            "UNKNOWN", current_price, now, [], [], None, None, 0.0,
            "Missing upper trade structure; cannot determine bias safely.",
            ua_v, ud_v, la_v, ld_v,
        )

    preopen = now.time() < time(9, 0)
    top, bot = max(ua_v, ud_v), min(ua_v, ud_v)

    ordered_lines = [line for line in [ua, ud, la, ld] if line is not None]
    active_names = {line.name for line in active_entry_lines(ordered_lines, current_price, now)}
    line_values = [(line.name, line.tradable_value_at(now)) for line in ordered_lines]
    watched_call = [name for name, value in line_values if not pd.isna(value) and current_price > value]
    watched_put = [name for name, value in line_values if not pd.isna(value) and current_price < value]
    watched_call = [name for name in watched_call if name in active_names]
    watched_put = [name for name in watched_put if name in active_names]
    nearest = min(
        [(abs(current_price - value), name, value) for name, value in line_values if name in active_names and not pd.isna(value)],
        default=(float("nan"), None, float("nan")),
        key=lambda row: row[0],
    )
    primary = nearest[1]
    target_candidates = [(abs(value - current_price), name, value) for name, value in line_values if name != primary and not pd.isna(value)]
    if current_price > nearest[2]:
        directional_targets = [row for row in target_candidates if row[2] > current_price]
    else:
        directional_targets = [row for row in target_candidates if row[2] < current_price]
    tp = min(directional_targets or target_candidates, default=(float("nan"), None, float("nan")), key=lambda row: row[0])[1]

    if current_price > top:
        bias = "BULLISH" if preopen else "REGULAR_SESSION"
        expl = (
            "SPY is above upper structure. Descending lines are the active entry triggers; "
            "ascending lines stay context until structure turns bearish."
            if preopen
            else "SPY is above upper structure. Descending triggers control entries; use the candle close side for calls or puts."
        )
    elif bot <= current_price <= top:
        bias = "NEUTRAL" if preopen else "REGULAR_SESSION"
        expl = (
            "SPY is inside the upper channel. Descending triggers remain primary; wait for a touch and close on the correct side."
            if preopen
            else "SPY is inside the upper channel. Descending triggers remain primary until structure turns bearish."
        )
    else:
        bias = "BEARISH" if preopen else "REGULAR_SESSION"
        expl = (
            "SPY is below upper structure. Descending triggers remain active, and ascending lines are also valid bearish-market triggers."
            if preopen
            else "SPY is below upper structure. Descending and ascending triggers are active; direction comes from the touch side and candle close."
        )

    score = calculate_bias_strength(current_price, ua_v, ud_v, bias)
    return BiasState(bias, current_price, now, watched_call, watched_put, primary, tp, score, expl, ua_v, ud_v, la_v, ld_v)


def select_0dte_strikes(current_price: float, current_dt: datetime) -> SelectedStrikes:
    now = pd.Timestamp(current_dt)
    now = now.tz_localize(get_central_tz()) if now.tzinfo is None else now.tz_convert(get_central_tz())
    if current_price is None or pd.isna(current_price):
        return SelectedStrikes(float("nan"), 0, 0, now.date(), "Same-day", "Invalid underlying price.")
    target_call = current_price + TARGET_OTM_STRIKE_DISTANCE
    target_put = current_price - TARGET_OTM_STRIKE_DISTANCE
    call_strike = int(math.floor(target_call / SPY_STRIKE_INCREMENT + 0.5) * SPY_STRIKE_INCREMENT)
    put_strike = int(math.floor(target_put / SPY_STRIKE_INCREMENT + 0.5) * SPY_STRIKE_INCREMENT)
    if call_strike <= current_price:
        call_strike = int(math.ceil(current_price / SPY_STRIKE_INCREMENT) * SPY_STRIKE_INCREMENT)
        if call_strike <= current_price:
            call_strike += SPY_STRIKE_INCREMENT
    if put_strike >= current_price:
        put_strike = int(math.floor(current_price / SPY_STRIKE_INCREMENT) * SPY_STRIKE_INCREMENT)
        if put_strike >= current_price:
            put_strike -= SPY_STRIKE_INCREMENT
    return SelectedStrikes(float(current_price), call_strike, put_strike, now.date(), "Same-day", None)


def get_contract_watch_price(current_price: float, current_dt: datetime, active_signal: Any = None, all_lines: Any = None) -> float:
    if active_signal is None:
        return current_price
    if active_signal.entry_price is not None and not pd.isna(active_signal.entry_price):
        return float(active_signal.entry_price)
    line = get_line_by_name(all_lines or [], active_signal.line_name)
    if line is not None:
        line_value = line.tradable_value_at(current_dt)
        if line_value is not None and not pd.isna(line_value):
            return float(line_value)
    if active_signal.line_value_at_rejection is not None and not pd.isna(active_signal.line_value_at_rejection):
        return float(active_signal.line_value_at_rejection)
    return current_price


def select_watch_contracts(current_price: float, current_dt: datetime, active_signal: Any = None, all_lines: Any = None) -> SelectedStrikes:
    reference_price = get_contract_watch_price(current_price, current_dt, active_signal, all_lines)
    return select_0dte_strikes(reference_price, current_dt)


def get_watch_option_type(active_signal: Any = None, bias_state: Any = None) -> str | None:
    if active_signal and active_signal.signal_type in {"CALL", "PUT"}:
        return active_signal.signal_type
    if bias_state:
        has_call = bool(bias_state.watched_call_lines)
        has_put = bool(bias_state.watched_put_lines)
        if has_call and not has_put:
            return "CALL"
        if has_put and not has_call:
            return "PUT"
    return None


def format_watch_contract(selected_strikes: SelectedStrikes | None, active_signal: Any = None, bias_state: Any = None) -> str:
    if selected_strikes is None or selected_strikes.warning:
        return "Contract gated"
    watch_type = get_watch_option_type(active_signal, bias_state)
    if watch_type == "CALL":
        return f"WATCH CALL {selected_strikes.call_strike}"
    if watch_type == "PUT":
        return f"WATCH PUT {selected_strikes.put_strike}"
    return f"CALL {selected_strikes.call_strike} / PUT {selected_strikes.put_strike}"


def format_watch_contract_short(selected_strikes: SelectedStrikes | None, active_signal: Any = None, bias_state: Any = None) -> str:
    if selected_strikes is None or selected_strikes.warning:
        return "CONTRACT<br>GATED"
    watch_type = get_watch_option_type(active_signal, bias_state)
    if watch_type == "CALL":
        return f"CALL<br>{selected_strikes.call_strike}"
    if watch_type == "PUT":
        return f"PUT<br>{selected_strikes.put_strike}"
    return f"C {selected_strikes.call_strike}<br>P {selected_strikes.put_strike}"


# ---------------------------------------------------------------------------
# Premium flow (UnusualWhales-shaped payload, no HTTP)
# ---------------------------------------------------------------------------

def premium_flow_payload(options_intel: OptionsIntelligence | None) -> dict:
    whales = getattr(options_intel, "unusual_whales", None) or {}
    return whales if isinstance(whales, dict) else {}


def premium_flow_direction(options_intel: OptionsIntelligence | None) -> dict:
    whales = premium_flow_payload(options_intel)
    flow = whales.get("flow_alerts") or {}
    recent_flow = whales.get("recent_flow") or {}
    contract_liquidity = whales.get("contract_liquidity") or {}
    tide = whales.get("market_tide") or {}
    net_premium = whales.get("net_premium_ticks") or {}
    volume = whales.get("options_volume") or {}
    gex = whales.get("gex") or {}
    greeks = whales.get("greeks") or {}
    whale_targets = whales.get("whale_targets") or {}
    score = 0
    reasons: list[str] = []

    bias = str(flow.get("flow_bias") or "")
    if "bull" in bias.lower():
        score += 2
        reasons.append("Same-day SPY flow leans call-side")
    elif "bear" in bias.lower():
        score -= 2
        reasons.append("Same-day SPY flow leans put-side")
    elif bias:
        reasons.append("Same-day SPY flow is mixed")

    recent_tone = str(recent_flow.get("tone") or "")
    recent_pressure = _finite_float(recent_flow.get("net_pressure"))
    if "call" in recent_tone.lower() or (not pd.isna(recent_pressure) and recent_pressure > 150000):
        score += 1
        reasons.append("recent SPY tape is call-led")
    elif "put" in recent_tone.lower() or (not pd.isna(recent_pressure) and recent_pressure < -150000):
        score -= 1
        reasons.append("recent SPY tape is put-led")

    tide_tone = str(tide.get("tone") or "")
    if "risk-on" in tide_tone.lower():
        score += 1
        reasons.append("market tide is risk-on")
    elif "risk-off" in tide_tone.lower():
        score -= 1
        reasons.append("market tide is risk-off")

    premium_tone = str(net_premium.get("tone") or "")
    if "call premium" in premium_tone.lower():
        score += 1
        reasons.append("net premium is building toward calls")
    elif "put premium" in premium_tone.lower():
        score -= 1
        reasons.append("net premium is building toward puts")

    pc_ratio = _finite_float(volume.get("put_call_volume_ratio"))
    if not pd.isna(pc_ratio):
        if pc_ratio >= 1.25:
            score -= 1
            reasons.append(f"volume put/call is elevated at {fmt_float(pc_ratio)}")
        elif pc_ratio <= 0.80:
            score += 1
            reasons.append(f"volume put/call is call-heavy at {fmt_float(pc_ratio)}")

    if isinstance(contract_liquidity, dict):
        call_liq = _finite_float(contract_liquidity.get("call_volume"), 0.0) + _finite_float(contract_liquidity.get("call_open_interest"), 0.0)
        put_liq = _finite_float(contract_liquidity.get("put_volume"), 0.0) + _finite_float(contract_liquidity.get("put_open_interest"), 0.0)
        if call_liq > put_liq * 1.25 and call_liq > 0:
            score += 1
            reasons.append("nearby contract liquidity favors calls")
        elif put_liq > call_liq * 1.25 and put_liq > 0:
            score -= 1
            reasons.append("nearby contract liquidity favors puts")

    if isinstance(whale_targets, dict):
        target_side = str(whale_targets.get("side") or "").upper()
        if target_side == "CALL":
            score += 1
            reasons.append("high-premium whale targets lean calls")
        elif target_side == "PUT":
            score -= 1
            reasons.append("high-premium whale targets lean puts")

    net_gex = _finite_float(gex.get("net_gex"))
    net_dex = _finite_float(gex.get("net_dex"))
    gamma_note = ""
    if not pd.isna(net_gex):
        gamma_note = "positive gamma may dampen moves" if net_gex > 0 else "negative gamma can amplify breaks" if net_gex < 0 else "gamma is balanced"
        reasons.append(gamma_note)
    if not pd.isna(net_dex) and abs(net_dex) > 0:
        reasons.append("dealer delta leans call-side" if net_dex > 0 else "dealer delta leans put-side")

    nearest_greeks = greeks.get("nearest") if isinstance(greeks, dict) else None
    if isinstance(nearest_greeks, dict):
        strike = nearest_greeks.get("strike")
        if strike is not None:
            reasons.append(f"near-strike Greeks available around {fmt_price(strike, 0)}")

    if score >= 2:
        side = "CALL"
        label = "Call pressure"
    elif score <= -2:
        side = "PUT"
        label = "Put pressure"
    elif whales:
        side = "MIXED"
        label = "Mixed pressure"
    else:
        side = None
        label = "Flow assessment pending"

    return {
        "side": side,
        "label": label,
        "score": score,
        "reasons": reasons[:4],
        "flow_bias": bias or None,
        "tide": tide_tone or None,
        "recent_tone": recent_tone or None,
        "premium_tone": premium_tone or None,
        "gamma_note": gamma_note or None,
        "whale_target_tone": whale_targets.get("tone") if isinstance(whale_targets, dict) else None,
    }


def premium_flow_alignment(options_intel: OptionsIntelligence | None, watch_side: str | None = None) -> dict:
    read = premium_flow_direction(options_intel)
    side = read.get("side")
    if not side:
        return {"state": "unavailable", "title": "Flow pending", "copy": "Flow context is pending. Structure confirmation remains primary.", **read}
    if not watch_side or side == "MIXED":
        title = str(read.get("label") or "Mixed pressure")
        copy = "; ".join(read.get("reasons") or ["Flow is available, but not directional enough to overrule structure."])
        return {"state": "neutral", "title": title, "copy": copy, **read}
    aligned = side == watch_side
    if aligned:
        title = f"Supports {display_state_label(watch_side).lower()} setup"
        copy = "Flow agrees with the current structure watch. Still wait for SPY Prophet confirmation at the line."
        state = "aligned"
    else:
        title = f"Caution for {display_state_label(watch_side).lower()} setup"
        copy = "Flow leans the other way, so require a cleaner rejection or wait."
        state = "opposes"
    reason_text = "; ".join(read.get("reasons") or [])
    if reason_text:
        copy = f"{copy} {reason_text}."
    return {"state": state, "title": title, "copy": copy, **read}


def alignment_state_for_side(direction: str | None, watch_side: str | None) -> str:
    direction = str(direction or "").upper()
    watch_side = str(watch_side or "").upper()
    if direction not in {"CALL", "PUT"}:
        return "neutral"
    if watch_side not in {"CALL", "PUT"}:
        return "neutral"
    return "aligned" if direction == watch_side else "opposes"


def alignment_title(state: str, label: str, direction: str | None = None, watch_side: str | None = None) -> str:
    setup_side = watch_side or direction
    if state == "aligned":
        return f"Supports {display_state_label(setup_side).lower()} setup" if setup_side else "Supports setup"
    if state == "opposes":
        return f"Caution for {display_state_label(watch_side).lower()} setup" if watch_side else "Caution for setup"
    if state == "risk":
        return "Timing Risk"
    return label


def premium_flow_strike_candidates(options_intel: OptionsIntelligence | None, option_type: str, reference_price: float) -> list[tuple[float, float]]:
    whales = premium_flow_payload(options_intel)
    flow = whales.get("flow_alerts") or {}
    recent_flow = whales.get("recent_flow") or {}
    contract_liquidity = whales.get("contract_liquidity") or {}
    if reference_price is None or pd.isna(reference_price):
        return []
    option_type = str(option_type).upper()
    candidates: list[tuple[float, float]] = []
    if isinstance(flow, dict):
        for row in flow.get("largest_alerts") or []:
            if not isinstance(row, dict) or str(row.get("type") or "").upper() != option_type:
                continue
            strike = _strike_key(row.get("strike"))
            if strike is not None:
                candidates.append((strike, _finite_float(row.get("premium"), 0.0)))
        for row in flow.get("key_strikes") or []:
            if not isinstance(row, dict):
                continue
            strike = _strike_key(row.get("strike"))
            if strike is None:
                continue
            call_premium = _finite_float(row.get("call_premium"), 0.0)
            put_premium = _finite_float(row.get("put_premium"), 0.0)
            if option_type == "CALL" and call_premium >= put_premium and call_premium > 0:
                candidates.append((strike, call_premium))
            if option_type == "PUT" and put_premium > call_premium and put_premium > 0:
                candidates.append((strike, put_premium))
    if isinstance(recent_flow, dict):
        for row in recent_flow.get("top_strikes") or []:
            if not isinstance(row, dict):
                continue
            strike = _strike_key(row.get("strike"))
            if strike is None:
                continue
            call_premium = _finite_float(row.get("call_premium"), 0.0)
            put_premium = _finite_float(row.get("put_premium"), 0.0)
            if option_type == "CALL" and call_premium >= put_premium and call_premium > 0:
                candidates.append((strike, call_premium))
            if option_type == "PUT" and put_premium > call_premium and put_premium > 0:
                candidates.append((strike, put_premium))
    if isinstance(contract_liquidity, dict):
        key = "top_calls" if option_type == "CALL" else "top_puts"
        for row in contract_liquidity.get(key) or []:
            if not isinstance(row, dict):
                continue
            strike = _strike_key(row.get("strike"))
            if strike is None:
                continue
            liquidity = _finite_float(row.get("liquidity_score"), 0.0)
            if liquidity > 0:
                candidates.append((strike, liquidity))

    valid = []
    for strike, premium in candidates:
        distance = strike - float(reference_price) if option_type == "CALL" else float(reference_price) - strike
        if 0 < distance <= FLOW_STRIKE_MAX_OTM_DISTANCE:
            valid.append((strike, premium))
    return sorted(valid, key=lambda item: (abs(abs(item[0] - float(reference_price)) - TARGET_OTM_STRIKE_DISTANCE), -item[1]))


def select_flow_aware_watch_contracts(
    current_price: float,
    current_dt: datetime,
    active_signal: Any = None,
    all_lines: Any = None,
    options_intel: OptionsIntelligence | None = None,
) -> SelectedStrikes:
    base = select_watch_contracts(current_price, current_dt, active_signal, all_lines)
    if base.warning:
        return base
    reference_price = base.underlying_price
    call_candidates = premium_flow_strike_candidates(options_intel, "CALL", reference_price)
    put_candidates = premium_flow_strike_candidates(options_intel, "PUT", reference_price)
    call_strike = int(round(call_candidates[0][0])) if call_candidates else base.call_strike
    put_strike = int(round(put_candidates[0][0])) if put_candidates else base.put_strike
    if call_strike == base.call_strike and put_strike == base.put_strike:
        return base
    return replace(base, call_strike=call_strike, put_strike=put_strike)


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

def is_call_rejection(candle_row: pd.Series, line: DynamicLine, candle_time: pd.Timestamp) -> bool:
    lv = line.tradable_value_at(candle_time)
    if pd.isna(lv):
        return False
    o, h, l, c = candle_row["Open"], candle_row["High"], candle_row["Low"], candle_row["Close"]
    return (o > lv) and (l <= lv) and (c > lv)


def is_put_rejection(candle_row: pd.Series, line: DynamicLine, candle_time: pd.Timestamp) -> bool:
    lv = line.tradable_value_at(candle_time)
    if pd.isna(lv):
        return False
    o, h, l, c = candle_row["Open"], candle_row["High"], candle_row["Low"], candle_row["Close"]
    return (o < lv) and (h >= lv) and (c < lv)


def find_target_for_signal(
    signal_type: str,
    rejected_line_name: str,
    reference_price: float,
    reference_time: pd.Timestamp,
    all_lines: list[DynamicLine],
) -> tuple[str | None, float]:
    candidates: list[tuple[float, str, float]] = []
    for line in all_lines:
        if line.name == rejected_line_name:
            continue
        v = line.tradable_value_at(reference_time)
        if pd.isna(v):
            continue
        if signal_type == "CALL" and v > reference_price:
            candidates.append((v - reference_price, line.name, v))
        if signal_type == "PUT" and v < reference_price:
            candidates.append((reference_price - v, line.name, v))
    if not candidates:
        return None, float("nan")
    _, n, v = min(candidates, key=lambda x: x[0])
    return n, float(v)


def calculate_signal_risk_reward(signal_type: str, entry_price: float, stop_price: float, target_price: float) -> tuple[float, float, float]:
    if any(pd.isna(v) for v in [entry_price, stop_price, target_price]):
        return float("nan"), float("nan"), float("nan")
    if signal_type == "CALL":
        risk, reward = entry_price - stop_price, target_price - entry_price
    else:
        risk, reward = stop_price - entry_price, entry_price - target_price
    rr = reward / risk if risk > 0 and not pd.isna(reward) else float("nan")
    return float(risk), float(reward), float(rr)


def build_trade_signal_from_rejection(
    signal_type: str,
    line: DynamicLine,
    rejection_row: pd.Series,
    rejection_time: pd.Timestamp,
    next_row: pd.Series | None,
    next_time: pd.Timestamp | None,
    all_lines: list[DynamicLine],
) -> TradeSignal:
    confirmed = next_row is not None and next_time is not None
    status = "CONFIRMED" if confirmed else "PENDING_CONFIRMATION"
    entry_time = next_time if confirmed else None
    entry_price = float(next_row["Open"]) if confirmed else float("nan")
    stop_price = float(rejection_row["Low"] - 0.50) if signal_type == "CALL" else float(rejection_row["High"] + 0.50)
    ref_time = entry_time if confirmed else rejection_time
    ref_price = entry_price if confirmed else float(rejection_row["Close"])
    target_name, target_price = find_target_for_signal(signal_type, line.name, ref_price, ref_time, all_lines)
    risk, reward, rr = calculate_signal_risk_reward(signal_type, entry_price, stop_price, target_price)
    lv = line.tradable_value_at(rejection_time)
    sid = f"{signal_type}_{line.name}_{rejection_time.isoformat()}"
    rule = "touched from above and closed above" if signal_type == "CALL" else "touched from below and closed below"
    expl = (
        f"{signal_type} setup at {display_line_name(line.name)}; candle {rule} and "
        f"{'confirmed by next open' if confirmed else 'awaiting next candle confirmation'}"
    )
    if target_name is None:
        expl += "; no structural target found in trade direction"
    return TradeSignal(
        sid, signal_type, status, line.name, float(lv),
        rejection_time,
        float(rejection_row["Open"]), float(rejection_row["High"]), float(rejection_row["Low"]), float(rejection_row["Close"]),
        entry_time, entry_price, stop_price, target_name, target_price, risk, reward, rr,
        "Move to breakeven after +$0.50 favorable SPY move.",
        expl,
    )


def detect_rejection_signals(
    candles_df: pd.DataFrame,
    primary_lines: list[DynamicLine],
    secondary_lines: list[DynamicLine],
) -> list[TradeSignal]:
    if candles_df is None or candles_df.empty:
        return []
    df = candles_df.sort_index()
    all_lines = primary_lines + secondary_lines
    out: list[TradeSignal] = []
    seen: set[str] = set()
    for i in range(len(df)):
        row = df.iloc[i]
        ts = df.index[i]
        next_row = df.iloc[i + 1] if i + 1 < len(df) else None
        next_ts = df.index[i + 1] if i + 1 < len(df) else None
        active_names = {line.name for line in active_entry_lines(primary_lines, float(row["Close"]), ts)}
        for line in primary_lines:
            if not line.is_primary:
                continue
            if line.name not in active_names:
                continue
            sig: TradeSignal | None = None
            if is_call_rejection(row, line, ts):
                sig = build_trade_signal_from_rejection("CALL", line, row, ts, next_row, next_ts, all_lines)
            elif is_put_rejection(row, line, ts):
                sig = build_trade_signal_from_rejection("PUT", line, row, ts, next_row, next_ts, all_lines)
            if sig and sig.signal_id not in seen:
                seen.add(sig.signal_id)
                out.append(sig)
    return out


# ---------------------------------------------------------------------------
# Decision quality
# ---------------------------------------------------------------------------

def calculate_close_distance(signal: TradeSignal) -> float:
    return abs(signal.rejection_close - signal.line_value_at_rejection) if signal else float("nan")


def calculate_wick_rejection_metrics(signal: TradeSignal) -> dict:
    rng = round(signal.rejection_high - signal.rejection_low, 10)
    if rng <= 0:
        return {"candle_range": rng, "wick_penetration": 0.0, "wick_rejection_ratio": 0.0, "body_position_score": 0.0}
    if signal.signal_type == "CALL":
        wick_pen = round(max(0.0, signal.line_value_at_rejection - signal.rejection_low), 10)
        rej_dist = round(signal.rejection_close - signal.rejection_low, 10)
    else:
        wick_pen = round(max(0.0, signal.rejection_high - signal.line_value_at_rejection), 10)
        rej_dist = round(signal.rejection_high - signal.rejection_close, 10)
    ratio = rej_dist / rng
    return {"candle_range": rng, "wick_penetration": wick_pen, "wick_rejection_ratio": ratio, "body_position_score": ratio}


def score_signal_quality(signal: TradeSignal) -> SignalQuality:
    score = 100.0
    warnings: list[str] = []
    strengths: list[str] = []
    target_quality = "VALID_TARGET"
    close_distance = calculate_close_distance(signal)
    candle_range = signal.rejection_high - signal.rejection_low
    close_pct = (close_distance / candle_range * 100) if candle_range > 0 else float("nan")
    if close_distance > 1.0:
        score -= 45
        warnings.append("CLOSE_TOO_FAR_FROM_LINE")
    elif close_distance > 0.5:
        score -= 30
    elif close_distance > 0.25:
        score -= 15
    elif close_distance > 0.1:
        score -= 5
    m = calculate_wick_rejection_metrics(signal)
    ratio = m["wick_rejection_ratio"]
    if m["candle_range"] <= 0:
        score -= 20
        warnings.append("INVALID_CANDLE_RANGE")
    elif ratio >= 0.60:
        strengths.append("STRONG_WICK_REJECTION")
    elif ratio >= 0.40:
        score -= 5
    elif ratio >= 0.20:
        score -= 15
        warnings.append("WEAK_REJECTION")
    else:
        score -= 30
        warnings.append("VERY_WEAK_REJECTION")
    if pd.isna(signal.rr_ratio):
        score -= 15
        warnings.append("NO_RR_AVAILABLE")
    elif signal.rr_ratio < 1.0:
        score -= 30
        warnings.append("POOR_RISK_REWARD")
    elif signal.rr_ratio < 1.5:
        score -= 15
    elif signal.rr_ratio < 2.0:
        score -= 5
    else:
        strengths.append("GOOD_RISK_REWARD")
    if signal.target_line_name is None or pd.isna(signal.target_price):
        target_quality = "NO_TARGET"
        score -= 25
        warnings.append("NO_STRUCTURAL_TARGET")
    else:
        gap = (signal.target_price - signal.entry_price) if signal.signal_type == "CALL" else (signal.entry_price - signal.target_price)
        if not pd.isna(gap) and gap < 0.50:
            score -= 20
            warnings.append("TARGET_TOO_CLOSE")
    if signal.status == "PENDING_CONFIRMATION":
        score -= 10
        warnings.append("WAIT_FOR_NEXT_CANDLE_OPEN")
    score = max(0.0, min(100.0, score))
    if score >= 90:
        grade = "A+"
    elif score >= 80:
        grade = "A"
    elif score >= 70:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "NO_TRADE"
    if signal.status == "PENDING_CONFIRMATION":
        action = "WAIT_FOR_CONFIRMATION"
    elif grade in {"A+", "A"}:
        action = "TRADE_ALLOWED"
    elif grade == "B":
        action = "SELECTIVE_TRADE"
    elif grade == "C":
        action = "WAIT_FOR_RETEST"
    elif grade == "D":
        action = "AVOID"
    else:
        action = "NO_TRADE"
    explanation = (
        f"Grade {grade}, score {score:.1f}. "
        f"Warnings: {', '.join(warnings) if warnings else 'none'}. "
        f"Strengths: {', '.join(strengths) if strengths else 'none'}."
    )
    return SignalQuality(
        signal.signal_id, grade, score, close_distance, close_pct,
        m["wick_penetration"], ratio, m["body_position_score"],
        signal.rr_ratio if not pd.isna(signal.rr_ratio) else float("nan"),
        target_quality, warnings, strengths, action, explanation,
    )


def evaluate_chase_status(signal: Any, current_price: float, max_chase_distance: float = 0.30) -> dict:
    if signal is None:
        return {"chase_status": "NO_SIGNAL", "chase_distance": float("nan"), "chase_warning": None, "explanation": "No signal"}
    if signal.status == "PENDING_CONFIRMATION":
        return {"chase_status": "OK", "chase_distance": float("nan"), "chase_warning": None, "explanation": "Confirmation pending"}
    d = (current_price - signal.entry_price) if signal.signal_type == "CALL" else (signal.entry_price - current_price)
    if d > max_chase_distance:
        return {"chase_status": "MISSED_ENTRY", "chase_distance": d, "chase_warning": "MISSED ENTRY. Do not chase. Wait for retest.", "explanation": "Moved too far"}
    return {"chase_status": "OK", "chase_distance": d, "chase_warning": None, "explanation": "Within chase limits"}


def evaluate_retest_status(signal: Any, current_price: float, current_dt: Any, rejected_line: DynamicLine | None, tolerance: float = 0.10) -> dict:
    if signal is None or signal.status != "CONFIRMED" or rejected_line is None:
        return {"retest_status": "NONE", "retest_line_name": None, "explanation": "Retest requires confirmed signal and rejected line."}
    lv = rejected_line.tradable_value_at(current_dt)
    if pd.isna(lv):
        return {"retest_status": "NONE", "retest_line_name": rejected_line.name, "explanation": "Line value unavailable."}
    if abs(current_price - lv) <= tolerance:
        return {"retest_status": "WATCHING_RETEST", "retest_line_name": rejected_line.name, "explanation": "Price is near rejected line; monitoring retest."}
    if signal.signal_type == "CALL":
        status = "RETEST_CONFIRMED" if current_price > lv else "RETEST_FAILED"
    else:
        status = "RETEST_CONFIRMED" if current_price < lv else "RETEST_FAILED"
    return {"retest_status": status, "retest_line_name": rejected_line.name, "explanation": "Current-price retest heuristic (close confirmation to be added later)."}


def evaluate_structure_status(signal: Any, latest_candle_row: Any, rejected_line: DynamicLine | None, latest_time: Any) -> dict:
    if signal is None or latest_candle_row is None or rejected_line is None:
        return {"structure_status": "UNKNOWN", "structure_warning": None}
    lv = rejected_line.tradable_value_at(latest_time)
    if pd.isna(lv):
        return {"structure_status": "UNKNOWN", "structure_warning": None}
    c = latest_candle_row["Close"]
    if signal.signal_type == "CALL":
        return {
            "structure_status": "INTACT" if c >= lv else "BROKEN",
            "structure_warning": None if c >= lv else "CALL structure failed. Price closed below rejected support.",
        }
    return {
        "structure_status": "INTACT" if c <= lv else "BROKEN",
        "structure_warning": None if c <= lv else "PUT structure failed. Price closed above rejected resistance.",
    }


def evaluate_daily_risk(
    signals_today: list[TradeSignal],
    qualities_today: list[SignalQuality] | None = None,
    max_signals_per_day: int = 3,
    min_grade_to_trade: str = "B",
) -> dict:
    confirmed = [s for s in signals_today if s.status == "CONFIRMED"]
    if len(confirmed) >= max_signals_per_day:
        return {"daily_action": "STOP_TRADING", "explanation": "Maximum daily signal count reached."}
    if qualities_today:
        g = qualities_today[-1].grade
        if g in {"C", "D", "NO_TRADE"}:
            return {"daily_action": "NO_TRADE", "explanation": "Latest signal quality is below trade threshold."}
        if g in {"A+", "A", "B"}:
            return {
                "daily_action": "TRADE_ALLOWED" if g in {"A+", "A"} else "SELECTIVE_TRADE",
                "explanation": "Daily risk allows qualified setup.",
            }
    return {"daily_action": "WAIT", "explanation": "No qualifying quality context yet."}


def build_decision_state(
    latest_signal: TradeSignal | None,
    all_lines: list[DynamicLine],
    current_price: float,
    current_dt: Any,
    latest_candle_row: Any,
    signals_today: list[TradeSignal] | None = None,
) -> DecisionState:
    if latest_signal is None:
        guard = RiskGuardrailState(None, "NO_SIGNAL", float("nan"), None, "NONE", None, "UNKNOWN", None, "WAIT", "No confirmed/pending rejection yet.")
        return DecisionState(None, None, guard, "WAIT", "No confirmed/pending rejection yet.")
    quality = score_signal_quality(latest_signal)
    line = get_line_by_name(all_lines, latest_signal.line_name)
    chase = evaluate_chase_status(latest_signal, current_price)
    ret = evaluate_retest_status(latest_signal, current_price, current_dt, line)
    struct = evaluate_structure_status(latest_signal, latest_candle_row, line, current_dt)
    daily = evaluate_daily_risk(signals_today or [latest_signal], [quality])
    guard = RiskGuardrailState(
        latest_signal.signal_id,
        chase["chase_status"], chase["chase_distance"], chase["chase_warning"],
        ret["retest_status"], ret["retest_line_name"],
        struct["structure_status"], struct["structure_warning"],
        daily["daily_action"],
        f"{chase['explanation']} | {ret.get('explanation', '')} | {daily['explanation']}",
    )
    if latest_signal.status == "PENDING_CONFIRMATION":
        final = "WAIT_FOR_CONFIRMATION"
    elif struct["structure_status"] == "BROKEN":
        final = "NO_TRADE"
    elif chase["chase_status"] == "MISSED_ENTRY":
        final = "WAIT_FOR_RETEST"
    elif daily["daily_action"] == "STOP_TRADING":
        final = "STOP_TRADING"
    elif quality.grade in {"A+", "A"}:
        final = "TRADE_ALLOWED"
    elif quality.grade == "B":
        final = "SELECTIVE_TRADE"
    elif quality.grade == "C":
        final = "WAIT_FOR_RETEST"
    else:
        final = "NO_TRADE"
    return DecisionState(latest_signal, quality, guard, final, f"{quality.explanation} Trade gate: {final}.")


def build_wait_discipline_items(
    decision_state: DecisionState | None = None,
    latest_signal: TradeSignal | None = None,
    closest_line: DynamicLine | None = None,
    selected_strikes: SelectedStrikes | None = None,
    now_ct: Any = None,
) -> list[dict]:
    now = pd.Timestamp(now_ct) if now_ct is not None else pd.Timestamp.now(tz=get_central_tz())
    now = now.tz_localize(get_central_tz()) if now.tzinfo is None else now.tz_convert(get_central_tz())
    if latest_signal and latest_signal.status == "PENDING_CONFIRMATION":
        checkpoint = pd.Timestamp(latest_signal.rejection_time) + pd.Timedelta(hours=1)
        candle_value = f"Open {fmt_clock_time(checkpoint)}"
        candle_copy = "Entry is locked until the next hourly candle opens."
    elif latest_signal:
        candle_value = "Confirmed"
        candle_copy = "Manage the confirmed setup; avoid adding after the chase guard fails."
    else:
        candle_value = f"Next {fmt_clock_time(next_hourly_checkpoint(now))}"
        trigger = display_line_name(closest_line.name) if closest_line else "primary structure"
        candle_copy = f"Need an hourly rejection at {trigger} before any entry."

    guardrail = decision_state.guardrail_state if decision_state else None
    chase_status = str(guardrail.chase_status if guardrail else "NO_SIGNAL").upper()
    if chase_status == "MISSED_ENTRY":
        chase_value = "Retest only"
        chase_copy = "Price moved too far from entry; the first trade is gone."
    elif latest_signal and latest_signal.status == "PENDING_CONFIRMATION":
        chase_value = "No early entry"
        chase_copy = "Let confirmation print before pricing the contract."
    else:
        chase_value = "Max $0.30"
        chase_copy = "After confirmation, avoid entries beyond the chase limit."

    watch_type = get_watch_option_type(latest_signal, None)
    if watch_type == "CALL":
        contract_value = "Call OTM"
        contract_copy = f"Strike stays about ${TARGET_OTM_STRIKE_DISTANCE:.0f} above the entry reference."
    elif watch_type == "PUT":
        contract_value = "Put OTM"
        contract_copy = f"Strike stays about ${TARGET_OTM_STRIKE_DISTANCE:.0f} below the entry reference."
    elif selected_strikes:
        contract_value = "Two-sided OTM"
        contract_copy = "Keep the call above and put below the trigger reference."
    else:
        contract_value = "No contract"
        contract_copy = "Contracts appear after SPY and structure data are ready."

    return [
        {"label": "Candle Gate", "value": candle_value, "copy": candle_copy},
        {"label": "Chase Guard", "value": chase_value, "copy": chase_copy},
        {"label": "Contract Guard", "value": contract_value, "copy": contract_copy},
    ]


__all__ = [
    # constants
    "SYMBOL", "VIX_SYMBOL", "CENTRAL_TZ_NAME", "CENTRAL_TZ_ALIASES",
    "DEFAULT_SLOPE_PER_HOUR", "TP1_TARGET_FRACTION", "TP2_TARGET_FRACTION",
    "STRUCTURE_CALIBRATION_KEYS", "TARGET_OTM_STRIKE_DISTANCE",
    "FLOW_STRIKE_MAX_OTM_DISTANCE", "SPY_STRIKE_INCREMENT",
    "EXPECTED_OHLCV_COLUMNS", "RTH_SESSION_START", "RTH_SESSION_END",
    "PROJECTION_SESSION_START", "PROJECTION_SESSION_END", "NEXT_SESSION_PREVIEW_START",
    # cache
    "ttl_cache",
    # dataclasses
    "Pivot", "SecondaryPivot", "SourceStatus", "OptionsIntelligence",
    "DynamicLine", "BiasState", "SelectedStrikes", "TradeSignal",
    "SignalQuality", "RiskGuardrailState", "DecisionState",
    # time / config
    "get_central_tz", "market_hours_between", "get_secret_or_env", "get_structure_calibration",
    # format / display
    "fmt_nan", "fmt_price", "fmt_float", "fmt_pct", "fmt_money_short",
    "fmt_time", "fmt_clock_time", "safe_to_dict", "safe_json",
    "display_state_label", "display_line_name", "display_line_description",
    "display_anchor_source", "display_line_list", "compact_line_name",
    "rth_session_window_label", "next_hourly_checkpoint",
    # frame helpers
    "normalize_yfinance_frame", "ensure_central_index", "filter_rth_session",
    "get_available_trading_days",
    # pivots
    "candle_color", "normalize_tradingview_anchor_time", "get_tradingview_anchor_time",
    "find_high_pivot", "find_low_pivot", "find_primary_pivots", "find_secondary_pivots",
    "get_hourly_candle_close_time",
    # lines
    "calculate_slope_from_observed", "build_primary_lines", "build_secondary_lines",
    "project_lines", "build_pivot_source_table", "zone_side_label",
    "build_structure_projection_table", "get_line_by_name", "get_lines_by_zone",
    "line_is_descending_entry", "line_is_ascending_entry", "structure_trigger_regime",
    "line_is_active_entry", "active_entry_lines", "active_entry_rule_for_line",
    "get_closest_primary_line", "get_primary_anchor_summary",
    # bias / strikes
    "calculate_bias_strength", "determine_preopen_bias", "select_0dte_strikes",
    "get_contract_watch_price", "select_watch_contracts", "get_watch_option_type",
    "format_watch_contract", "format_watch_contract_short",
    # premium flow
    "premium_flow_payload", "premium_flow_direction", "premium_flow_alignment",
    "alignment_state_for_side", "alignment_title", "premium_flow_strike_candidates",
    "select_flow_aware_watch_contracts",
    # signals
    "is_call_rejection", "is_put_rejection", "find_target_for_signal",
    "calculate_signal_risk_reward", "build_trade_signal_from_rejection",
    "detect_rejection_signals",
    # decision quality
    "calculate_close_distance", "calculate_wick_rejection_metrics",
    "score_signal_quality", "evaluate_chase_status", "evaluate_retest_status",
    "evaluate_structure_status", "evaluate_daily_risk", "build_decision_state",
    "build_wait_discipline_items",
]
