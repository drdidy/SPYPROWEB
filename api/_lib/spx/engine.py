"""SPX engine orchestrator: ES candles + offset -> SPXSnapshot.

The engine is a pure function. Given:
  - ES hourly candles (timestamps CT-aware, or the caller treats naive as CT)
  - ES->SPX offset (float; spx = es + offset)
  - as_of (CT-aware datetime; the moment we want the snapshot for)

it returns an SPXSnapshot Pydantic model conformant with
``api/schemas/spx.py`` and the TypeScript contract in ``lib/types.ts``.

No I/O. No external deps beyond pydantic. The caller fetches ES bars
upstream (yfinance, broker, whatever) and computes the offset from a
synchronized SPX-cash / ES print pair (see ``offset.derive_offset``).
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional

# We don't import the schema at module top-level because the api package
# uses a flat layout under api/. Use a deferred import so callers that
# don't hit compute_snapshot can still import this module cheaply.

from .candles import Candle, in_window
from .channel import (
    Anchor,
    Channel,
    Line,
    SessionRange,
    build_lines,
    overnight_anchors,
    prev_rth_anchors,
    project_line,
    sydney_range,
    tokyo_range,
)
from .confluence import evaluate as evaluate_confluence
from .constants import (
    DEFAULT_OTM_DISTANCE,
    DEFAULT_SLOPE_PER_HOUR,
    ES_DEVIATION_BANDS,
    ES_DEVIATION_ENTRY_HOUR_CT,
    ES_DEVIATION_EXTENSION_END_HOUR_CT,
    ES_DEVIATION_SPACING,
    ES_DEALER_PRESSURE_SLOPE_PER_HOUR,
    ES_DEALER_PRESSURE_SPACING,
    ES_DEVIATION_WINDOW_END_HOUR_CT,
    ES_DEVIATION_WINDOW_START_HOUR_CT,
    ES_DUAL_MAP_OPPOSITE_ARM_DISTANCE,
    ES_DUAL_MAP_OPPOSITE_SLOPE_PER_HOUR,
    ES_DUAL_MAP_PRIMARY_ARM_DISTANCE,
    ES_DUAL_MAP_PRIMARY_SLOPE_PER_HOUR,
    ES_HALF_GATE_TARGET,
    ES_OPEN_BIAS_TOLERANCE,
    ES_TICK_SIZE,
    SPX_STRIKE_INCREMENT,
)
from .contracts import suggest_for_plays
from .reentry import evaluate_reentry
from .scenario import (
    ProjectedLine,
    build_fan_read,
    build_plays,
    classify,
    explain_scenario,
)
from .time_utils import (
    at_ct,
    es_trading_hours_between,
    hours_between,
    is_trading_session_date,
    next_es_candle_open,
    overnight_window,
    previous_futures_session_date,
    previous_session_date,
    rth_window,
    session_date_ct,
    to_ct,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _last_price_at(candles: list[Candle], as_of: datetime) -> tuple[float, datetime]:
    """Most recent close at or before `as_of`.

    Raises if all candles are in the future; replay/live snapshots must not
    silently look ahead.
    """
    as_of = to_ct(as_of)
    eligible = [c for c in candles if to_ct(c.t) <= as_of]
    if not eligible:
        raise ValueError(f"No ES candles at or before {as_of.isoformat()}")
    last = max(eligible, key=lambda c: to_ct(c.t))
    return last.c, to_ct(last.t)


def _last_candle_at(candles: list[Candle], as_of: datetime) -> Optional[Candle]:
    """Most recent candle at or before `as_of`; never look into the future."""
    as_of = to_ct(as_of)
    eligible = [c for c in candles if to_ct(c.t) <= as_of]
    return max(eligible, key=lambda c: to_ct(c.t)) if eligible else None


def _prev_session_close(candles: list[Candle], session_date: date) -> Optional[float]:
    """Close of the prior RTH session (last bar in the prev-RTH window)."""
    prev = previous_session_date(session_date)
    bars = [c for c in candles if rth_window(prev).contains(to_ct(c.t))]
    if not bars:
        return None
    return max(bars, key=lambda c: to_ct(c.t)).c


def _project_all(lines: list[Line], at: datetime, price: float) -> list[ProjectedLine]:
    return [ProjectedLine(kind=l.kind, value=project_line(l, at)) for l in lines]


# ---------------------------------------------------------------------------
# Phase-1 hardening helpers - engine-state, flip condition, decision trace,
# invalidation, planned envelope, and score bands. These are pure derivations
# from the existing scenario / confluence / projected-line surface so they
# stay in sync without a parallel state machine.
# ---------------------------------------------------------------------------


def _engine_state_from(
    scenario: str,
    action: str,
    *,
    primary_trade=None,
    current_price: Optional[float] = None,
    invalidation: Optional[dict] = None,
    as_of: Optional[datetime] = None,
    session: Optional[date] = None,
) -> str:
    """Project SPX scenario + confluence action onto the shared 6-state ladder."""
    if scenario == "OUTSIDE_PLAY":
        return "STAND_DOWN"
    if primary_trade is not None and current_price is not None:
        target = primary_trade.exit_price
        if primary_trade.side == "BUY" and current_price >= target:
            return "COOLDOWN"
        if primary_trade.side == "SELL" and current_price <= target:
            return "COOLDOWN"
        if invalidation is not None:
            level = float(invalidation["level"])
            offset = float(invalidation["stopOffset"])
            stop = level - offset if primary_trade.side == "BUY" else level + offset
            if primary_trade.side == "BUY" and current_price <= stop:
                return "COOLDOWN"
            if primary_trade.side == "SELL" and current_price >= stop:
                return "COOLDOWN"
        if as_of is not None and session is not None and to_ct(as_of) >= rth_window(session).end:
            return "COOLDOWN"
    if action == "TAKE":
        return "GO"
    if action == "SELECTIVE":
        return "ARMED"
    # Inside-play but score below selective threshold -> still observing.
    return "WATCH"


ES_ENTRY_SETUP_HOUR_CT = 8
ES_ENTRY_WINDOW_START_HOUR_CT = 9
ES_ENTRY_WINDOW_END_HOUR_CT = 11


def _touch_window_entry_from_lines(
    *,
    lines: list[Line],
    candles: list[Candle],
    as_of: datetime,
    session: date,
) -> Optional[dict]:
    """First completed 08:00 setup or 09/10/11 CT touch against 08:00 fan values."""
    if not lines or not candles:
        return None
    as_of_ct = to_ct(as_of)
    entry_reference = at_ct(session, time(ES_DEVIATION_ENTRY_HOUR_CT, 0))
    refs: list[dict] = []
    for line in lines:
        try:
            refs.append({
                "kind": line.kind,
                "name": _line_display_name(line.kind),
                "value": float(project_line(line, entry_reference)),
            })
        except Exception:
            continue
    if not refs:
        return None

    buckets: dict[datetime, list[Candle]] = {}
    for candle in sorted(candles, key=lambda c: to_ct(c.t)):
        ct = to_ct(candle.t).replace(minute=0, second=0, microsecond=0)
        if ct.date() != session:
            continue
        if not (ES_ENTRY_SETUP_HOUR_CT <= ct.hour <= ES_ENTRY_WINDOW_END_HOUR_CT):
            continue
        if ct + timedelta(hours=1) > as_of_ct:
            continue
        buckets.setdefault(ct, []).append(candle)

    for hour in sorted(buckets):
        group = sorted(buckets[hour], key=lambda c: to_ct(c.t))
        high = max(float(c.h) for c in group)
        low = min(float(c.l) for c in group)
        close = float(group[-1].c)
        open_price = float(group[0].o)
        candidates: list[dict] = []
        for ref in refs:
            value = ref["value"]
            if low <= value <= high:
                if close > value:
                    side = "BUY"
                elif close < value:
                    side = "SELL"
                else:
                    continue
                candidates.append({
                    **ref,
                    "side": side,
                    "distance": abs(open_price - value),
                    "close": close,
                    "hour": hour,
                })
        if candidates:
            hit = sorted(candidates, key=lambda item: item["distance"])[0]
            if hour.hour == ES_ENTRY_SETUP_HOUR_CT:
                entry_time = hour + timedelta(hours=1)
                exit_time = entry_time + timedelta(hours=1)
                exit_group = buckets.get(entry_time)
                exit_price = float(sorted(exit_group, key=lambda c: to_ct(c.t))[-1].c) if exit_group else hit["close"]
                rule = "EIGHT_AM_SETUP_TOUCH"
            else:
                entry_time = hit["hour"]
                exit_time = hit["hour"] + timedelta(hours=1)
                exit_price = hit["close"]
                rule = "ENTRY_WINDOW_TOUCH"
            return {
                "side": hit["side"],
                "lineKind": hit["kind"],
                "lineName": hit["name"],
                "entryPrice": hit["value"],
                "exitPrice": exit_price,
                "setupTime": hit["hour"],
                "entryTime": entry_time,
                "exitTime": exit_time,
                "rule": rule,
            }
    return None


def _state_from_touch_window(as_of: datetime, touch_window: Optional[dict]) -> Optional[str]:
    if touch_window is None:
        return None
    now = to_ct(as_of)
    entry_time = to_ct(touch_window["entryTime"])
    exit_time = to_ct(touch_window["exitTime"])
    if now < entry_time:
        return "ARMED"
    if now < exit_time:
        return "GO"
    return "COOLDOWN"


def _touch_window_trace(touch_window: dict) -> str:
    side = str(touch_window["side"]).lower()
    prefix = (
        "8:00 setup"
        if touch_window.get("rule") == "EIGHT_AM_SETUP_TOUCH"
        else "Touch-window"
    )
    return (
        f"{prefix} {side} triggered at {touch_window['lineName']} "
        f"({float(touch_window['entryPrice']):.2f}); hourly exit marked at "
        f"{float(touch_window['exitPrice']):.2f}."
    )


def _touch_window_flip_condition(touch_window: dict, state: str) -> str:
    side = str(touch_window["side"]).lower()
    line = str(touch_window["lineName"])
    entry = float(touch_window["entryPrice"])
    exit_time = to_ct(touch_window["exitTime"]).strftime("%H:%M CT")
    if state == "GO":
        return f"Touch-window {side} is active from {line} ({entry:.2f}); manage until the {exit_time} hourly exit."
    if state == "COOLDOWN":
        return f"Touch-window {side} completed from {line} ({entry:.2f}); stand down until the next valid setup."
    return f"Touch-window setup armed at {line} ({entry:.2f})."


def _flip_condition_for(scenario: str, projected: list[ProjectedLine]) -> str:
    """One-sentence description of what would flip the current scenario."""
    by_kind = {p.kind: p.value for p in projected}
    high_asc = by_kind.get("PREV_RTH_HIGH_ASC")
    high_desc = by_kind.get("PREV_RTH_HIGH_DESC") or by_kind.get("SWING_HIGH_DESC")
    low_desc = by_kind.get("PREV_RTH_LOW_DESC")

    if scenario == "OUTSIDE_PLAY":
        if high_desc is not None and low_desc is not None:
            return (
                f"Re-entry into the planned envelope "
                f"({low_desc:.2f}-{high_desc:.2f}) reactivates the play."
            )
        return "Re-entry into the planned envelope reactivates the play."
    if scenario.startswith("INSIDE_"):
        if high_desc is not None:
            return (
                f"Confirmed hourly close through the high-pivot control boundary at {high_desc:.2f} "
                "arms the next ES entry."
            )
    if scenario.startswith("ABOVE_") and high_asc is not None:
        return f"Watch the high-pivot upper boundary at {high_asc:.2f}; it is the support reference above the active map."
    if scenario.startswith("BELOW_") and low_desc is not None:
        return f"Watch the low-pivot lower boundary at {low_desc:.2f}; it is the support reference below the high-pivot control boundary."
    return "ES Control Map pending."

def _decision_trace(
    *, as_of_iso: str, scenario: str, scenario_text: str,
    channel_reason: str, confluence_score: float, action: str,
) -> list[dict]:
    """Chronological trace of the events that produced today's verdict."""
    trace: list[dict] = []
    trace.append({"ts": as_of_iso, "event": f"Control Map: {channel_reason}", "weight": "info"})
    trace.append({"ts": as_of_iso, "event": f"Scenario {scenario.replace('_', ' ').lower()}", "weight": "key"})
    trace.append({
        "ts": as_of_iso,
        "event": f"Confidence {confluence_score:.0f}/100 -> {action.replace('_', ' ').lower()}",
        "weight": "key" if action == "TAKE" else "info",
    })
    if scenario_text:
        trace.append({"ts": as_of_iso, "event": scenario_text, "weight": "info"})
    return trace


def _state_history(*, as_of_iso: str, current_state: str) -> list[dict]:
    """Stub: today's state ladder transitions. For now, just the current.

    Phase 2/3 may persist actual transitions per session.
    """
    return [{"ts": as_of_iso, "state": current_state}]


def _invalidation_for(
    primary_trade, projected: list[ProjectedLine],
) -> Optional[dict]:
    """Invalidation level + suggested stop offset.

    Uses the primary trade's entry rail as the "if you're wrong" reference
    when present; falls back to None when there's no qualified play.
    """
    if primary_trade is None:
        return None
    by_kind = {p.kind: p.value for p in projected}
    invalidation_value = by_kind.get(primary_trade.entry_line)
    if invalidation_value is None:
        return None
    # Stop offset: percentage of the level, floored at the configured minimum.
    stop_offset = max(round(invalidation_value * 0.005, 2), 1.0)
    return {"level": round(invalidation_value, 2), "stopOffset": stop_offset}


def _planned_envelope_for(projected: list[ProjectedLine]) -> Optional[dict]:
    """Envelope for outside-play visualization: prev-RTH low -> prev-RTH high."""
    by_kind = {p.kind: p.value for p in projected}
    low = by_kind.get("PREV_RTH_LOW_DESC")
    high = by_kind.get("PREV_RTH_HIGH_ASC")
    if low is None or high is None:
        return None
    if low > high:
        low, high = high, low
    return {"low": round(low, 2), "high": round(high, 2)}


def _score_bands() -> dict:
    """Static bands matching the confluence thresholds in constants.py."""
    from .constants import ACTION_SELECTIVE_THRESHOLD, ACTION_TAKE_THRESHOLD
    return {
        "standDown": [0.0, float(ACTION_SELECTIVE_THRESHOLD)],
        "watch": [float(ACTION_SELECTIVE_THRESHOLD), float(ACTION_TAKE_THRESHOLD)],
        "go": [float(ACTION_TAKE_THRESHOLD), 100.0],
    }


def _rth_open_price(candles: list[Candle], session: date) -> Optional[float]:
    bars = [c for c in candles if rth_window(session).contains(to_ct(c.t))]
    if not bars:
        return None
    return min(bars, key=lambda c: to_ct(c.t)).o


def _rth_bias_for(lines: list[Line], candles: list[Candle], session: date) -> Optional[dict]:
    """RTH-open posture from the high-pivot control boundary."""
    high_asc = next((l for l in lines if l.kind == "PREV_RTH_HIGH_ASC"), None)
    high_desc = next((l for l in lines if l.kind == "PREV_RTH_HIGH_DESC"), None)
    low_desc = next((l for l in lines if l.kind == "PREV_RTH_LOW_DESC"), None)
    if high_desc is None:
        return None

    open_at = rth_window(session).start
    open_price = _rth_open_price(candles, session)
    high_desc_val = project_line(high_desc, open_at)

    if open_price is None:
        return {
            "direction": "PENDING",
            "openPrice": None,
            "referenceLine": "PREV_RTH_HIGH_DESC",
            "referenceValue": round(high_desc_val, 2),
            "continuationLine": "PREV_RTH_HIGH_ASC",
            "continuationValue": round(project_line(high_asc, open_at), 2) if high_asc else None,
            "note": (
                "RTH posture pending: compare the opening print to the high-pivot control boundary."
            ),
        }

    if open_price > high_desc_val:
        cont = project_line(high_asc, open_at) if high_asc else None
        return {
            "direction": "BEARISH",
            "openPrice": round(open_price, 2),
            "referenceLine": "PREV_RTH_HIGH_DESC",
            "referenceValue": round(high_desc_val, 2),
            "continuationLine": "PREV_RTH_HIGH_ASC",
            "continuationValue": round(cont, 2) if cont is not None else None,
            "note": (
                "RTH opened above the high-pivot control boundary; watch for a push toward the upper boundary, "
                "then a return to the map for the buy/sell decision."
            ),
        }

    cont = project_line(low_desc, open_at) if low_desc else None
    return {
        "direction": "BULLISH",
        "openPrice": round(open_price, 2),
        "referenceLine": "PREV_RTH_HIGH_DESC",
        "referenceValue": round(high_desc_val, 2),
        "continuationLine": "PREV_RTH_LOW_DESC",
        "continuationValue": round(cont, 2) if cont is not None else None,
        "note": (
            "RTH opened below the high-pivot control boundary; watch for a push back into the map, "
            "or a drop first toward the low-pivot lower boundary."
        ),
    }


def _round_to_tick(value: float, tick: float = ES_TICK_SIZE) -> float:
    return round(round(float(value) / tick) * tick, 2)


def _deviation_line_value(
    anchor: Anchor,
    slope_per_hour: float,
    at: datetime,
    index: int,
    *,
    spacing: float = ES_DEVIATION_SPACING,
) -> float:
    return anchor.price + float(slope_per_hour) * es_trading_hours_between(anchor.time, at) + index * spacing


def _deviation_label(index: int) -> str:
    if index == 0:
        return "Control Line"
    side = "North Gate" if index > 0 else "South Gate"
    numerals = {
        1: "I",
        2: "II",
        3: "III",
        4: "IV",
    }
    return f"{side} {numerals.get(abs(index), abs(index))}"


def _next_candle_time(candles: list[Candle], index: int) -> datetime:
    if index + 1 < len(candles):
        return to_ct(candles[index + 1].t)
    return next_es_candle_open(to_ct(candles[index].t))


def _window_status(now: datetime, start: datetime, end: datetime) -> str:
    now = to_ct(now)
    if now < start:
        return "UPCOMING"
    if now < end:
        return "ACTIVE"
    return "CLOSED"


def _deviation_window_for(at: datetime, entry_at: datetime, window_end: datetime, extension_end: datetime) -> tuple[str, str]:
    at = to_ct(at)
    if at < entry_at:
        return "SETUP", "8-9 setup"
    if at < window_end:
        return "PRIMARY", "9-12 primary"
    if at < extension_end:
        return "EXTENSION", "12-2 extension"
    return "CLOSED", "Closed"


def _deviation_windows(now: datetime, window_start: datetime, entry_at: datetime, window_end: datetime, extension_end: datetime) -> list[dict]:
    return [
        {
            "key": "SETUP",
            "label": "8-9 setup",
            "start": window_start.isoformat(),
            "end": entry_at.isoformat(),
            "status": _window_status(now, window_start, entry_at),
            "guidance": "Map the open versus the 9 AM Control Line. Do not chase; prepare the institutional entry.",
        },
        {
            "key": "PRIMARY",
            "label": "9-12 primary entries",
            "start": entry_at.isoformat(),
            "end": window_end.isoformat(),
            "status": _window_status(now, entry_at, window_end),
            "guidance": "Best-quality window. Touch plus close through a 9 AM gate can trigger the next candle.",
        },
        {
            "key": "EXTENSION",
            "label": "12-2 extension/rejection",
            "start": window_end.isoformat(),
            "end": extension_end.isoformat(),
            "status": _window_status(now, window_end, extension_end),
            "guidance": "Track late rejection or continuation. Useful when a touch causes expansion, but label it post-window and avoid chasing after the move stretches.",
        },
    ]


def _active_deviation_window(now: datetime, windows: list[dict]) -> dict:
    for window in windows:
        if window["status"] == "ACTIVE":
            return window
    if windows and to_ct(now) < to_ct(datetime.fromisoformat(windows[0]["start"])):
        return windows[0]
    return {
        "key": "CLOSED",
        "label": "Closed",
        "start": windows[-1]["end"] if windows else to_ct(now).isoformat(),
        "end": windows[-1]["end"] if windows else to_ct(now).isoformat(),
        "status": "CLOSED",
        "guidance": "The ES entry window is closed. Use the Control Map for review or risk management, not fresh entries.",
    }


def _deviation_zone(lines: list[dict], price: float, candles: Optional[list[Candle]] = None) -> dict:
    ordered = sorted(lines, key=lambda item: float(item["currentValue"]))
    if not ordered:
        return {
            "label": "Unavailable",
            "posture": "WAIT",
            "lowerLine": None,
            "upperLine": None,
            "callEntryLine": None,
            "callEntryValue": None,
            "putEntryLine": None,
            "putEntryValue": None,
            "roomRead": None,
            "brokenGateLine": None,
            "brokenGateValue": None,
            "brokenGateRole": None,
            "brokenGateNote": None,
            "nextReference": "None",
            "distanceToNext": 0.0,
            "guidance": "The Control Map is waiting for the 9 AM reference.",
        }
    lower = None
    upper = None
    for line in ordered:
        value = float(line["currentValue"])
        if value <= price:
            lower = line
        if value > price and upper is None:
            upper = line

    nearest = min(ordered, key=lambda line: abs(float(line["currentValue"]) - price))
    if lower and upper:
        label = f"Between {lower['label']} and {upper['label']}"
        call_entry_line = str(lower["label"])
        call_entry_value = round(float(lower["currentValue"]), 2)
        put_entry_line = str(upper["label"])
        put_entry_value = round(float(upper["currentValue"]), 2)
        room_read = (
            f"Inside the {call_entry_line} to {put_entry_line} room. "
            f"Calls must prove support at {call_entry_line}; puts must prove resistance at {put_entry_line}."
        )
    elif upper:
        label = f"Below {upper['label']}"
        call_entry_line = None
        call_entry_value = None
        put_entry_line = str(upper["label"])
        put_entry_value = round(float(upper["currentValue"]), 2)
        room_read = (
            f"Below {put_entry_line}. First useful read is a reclaim or rejection at that gate."
        )
    else:
        label = f"Above {lower['label'] if lower else ordered[-1]['label']}"
        call_entry_line = str(lower["label"]) if lower else str(ordered[-1]["label"])
        call_entry_value = round(float(lower["currentValue"] if lower else ordered[-1]["currentValue"]), 2)
        put_entry_line = None
        put_entry_value = None
        room_read = (
            f"Above {call_entry_line}. First useful read is a hold or failed retest at that gate."
        )

    nearest_value = float(nearest["currentValue"])
    distance = round(nearest_value - price, 2)
    if nearest["isMain"]:
        posture = "AT_MAIN"
        guidance = "Control Line room. Let the next gate reclaim or rejection resolve direction."
    elif int(nearest["index"]) > 0:
        posture = "UPPER_DEVIATION"
        guidance = "North gate room. Reclaim from below favors continuation; rejection from below can become a sell next candle."
    else:
        posture = "LOWER_DEVIATION"
        guidance = "South gate room. Reclaim from above favors bounce; loss from above can become a sell continuation."

    broken = _broken_deviation_gate(ordered, candles or [])
    if broken and broken["role"] == "RESISTANCE":
        guidance = (
            f"{broken['lineLabel']} was lost on an hourly close and now becomes resistance. "
            "Stay patient until price retests or reclaims it."
        )
    elif broken and broken["role"] == "SUPPORT":
        guidance = (
            f"{broken['lineLabel']} was reclaimed on an hourly close and now becomes support. "
            "Stay patient until price retests or loses it."
        )

    return {
        "label": label,
        "posture": posture,
        "lowerLine": str(lower["label"]) if lower else None,
        "upperLine": str(upper["label"]) if upper else None,
        "callEntryLine": call_entry_line,
        "callEntryValue": call_entry_value,
        "putEntryLine": put_entry_line,
        "putEntryValue": put_entry_value,
        "roomRead": room_read,
        "brokenGateLine": str(broken["lineLabel"]) if broken else None,
        "brokenGateValue": round(float(broken["lineValue"]), 2) if broken else None,
        "brokenGateRole": str(broken["role"]) if broken else None,
        "brokenGateNote": str(broken["note"]) if broken else None,
        "nextReference": str(nearest["label"]),
        "distanceToNext": distance,
        "guidance": guidance,
    }


def _broken_deviation_gate(lines: list[dict], candles: list[Candle]) -> Optional[dict]:
    if len(candles) < 2:
        return None
    completed = sorted(candles, key=lambda c: to_ct(c.t))[-2:]
    previous = completed[0]
    latest = completed[1]
    previous_close = float(previous.c)
    latest_close = float(latest.c)
    candidates: list[dict] = []
    for line in lines:
        value = float(line["currentValue"])
        if previous_close > value and latest_close < value:
            candidates.append({
                "lineLabel": str(line["label"]),
                "lineValue": value,
                "role": "RESISTANCE",
                "distance": abs(latest_close - value),
                "note": (
                    f"{str(line['label'])} was broken from above. Treat it as resistance until reclaimed."
                ),
            })
        elif previous_close < value and latest_close > value:
            candidates.append({
                "lineLabel": str(line["label"]),
                "lineValue": value,
                "role": "SUPPORT",
                "distance": abs(latest_close - value),
                "note": (
                    f"{str(line['label'])} was reclaimed from below. Treat it as support until lost."
                ),
            })
    if not candidates:
        return None
    return min(candidates, key=lambda item: item["distance"])


def _deviation_hour_label(hour: int) -> str:
    return f"{hour:02d}:00"


def _deviation_hourly_closes(candles: list[Candle], as_of: datetime, window_start: datetime, extension_end: datetime) -> list[dict]:
    by_hour: dict[int, Candle] = {}
    as_of_ct = to_ct(as_of)
    for candle in sorted(candles, key=lambda c: to_ct(c.t)):
        candle_time = to_ct(candle.t)
        if candle_time > as_of_ct:
            continue
        if not (window_start <= candle_time <= extension_end):
            continue
        if not (8 <= candle_time.hour <= 14):
            continue
        by_hour[candle_time.hour] = candle
    return [
        {
            "hour": hour,
            "label": _deviation_hour_label(hour),
            "time": to_ct(candle.t).isoformat(),
            "close": round(float(candle.c), 2),
        }
        for hour, candle in sorted(by_hour.items())
    ]


def _deviation_fan_for(
    *,
    anchor: Optional[Anchor],
    candles: list[Candle],
    as_of: datetime,
    session: date,
    price: float,
    slope_per_hour: float,
    control_mode: str = "normal",
    spacing: float = ES_DEVIATION_SPACING,
) -> Optional[dict]:
    """ES control grid from the previous-RTH pivot before 14:00 CT.

    Normal mode draws the 9 AM Control Line from the prior high pivot with a
    descending slope. Dealer-pressure mode draws it from the prior low pivot
    with an ascending slope.
    """
    if anchor is None:
        return None

    as_of_ct = to_ct(as_of)
    effective_slope = (
        abs(float(slope_per_hour))
        if control_mode == "dealer_pressure"
        else -abs(float(slope_per_hour))
    )
    open_at = rth_window(session).start
    window_start = at_ct(session, time(ES_DEVIATION_WINDOW_START_HOUR_CT, 0))
    entry_at = at_ct(session, time(ES_DEVIATION_ENTRY_HOUR_CT, 0))
    window_end = at_ct(session, time(ES_DEVIATION_WINDOW_END_HOUR_CT, 0))
    extension_end = at_ct(session, time(ES_DEVIATION_EXTENSION_END_HOUR_CT, 0))
    open_price = _rth_open_price(candles, session)
    main_open = _round_to_tick(_deviation_line_value(anchor, effective_slope, open_at, 0, spacing=spacing))
    main_entry = _round_to_tick(_deviation_line_value(anchor, effective_slope, entry_at, 0, spacing=spacing))

    lines: list[dict] = []
    for index in range(-ES_DEVIATION_BANDS, ES_DEVIATION_BANDS + 1):
        entry_value = _round_to_tick(_deviation_line_value(anchor, effective_slope, entry_at, index, spacing=spacing))
        open_value = _round_to_tick(_deviation_line_value(anchor, effective_slope, open_at, index, spacing=spacing))
        lines.append({
            "index": index,
            "label": _deviation_label(index),
            "value": entry_value,
            "currentValue": entry_value,
            "openValue": open_value,
            "distanceFromPrice": round(entry_value - price, 2),
            "isMain": index == 0,
        })

    cash_session_open = is_trading_session_date(session)
    entry_windows = _deviation_windows(as_of_ct, window_start, entry_at, window_end, extension_end)
    if not cash_session_open:
        entry_windows = [
            {**window, "status": "CLOSED", "guidance": "Cash market closed. ES futures are live; use the map for context, not a fresh RTH entry."}
            for window in entry_windows
        ]
        active_window = {
            "key": "CLOSED",
            "label": "Cash market closed",
            "start": window_start.isoformat(),
            "end": extension_end.isoformat(),
            "status": "CLOSED",
            "guidance": "ES futures are live, but the normal cash-entry window is closed today.",
        }
    else:
        active_window = _active_deviation_window(as_of_ct, entry_windows)
    hourly_closes = _deviation_hourly_closes(candles, as_of_ct, window_start, extension_end)
    session_bars = [
        candle for candle in sorted(candles, key=lambda c: to_ct(c.t))
        if window_start <= to_ct(candle.t) < extension_end and to_ct(candle.t) <= as_of_ct
    ]
    nearest = min(lines, key=lambda line: abs(float(line["distanceFromPrice"])))
    zone = _deviation_zone(lines, price, session_bars)

    if not cash_session_open:
        open_bias = {
            "direction": "PENDING",
            "openPrice": None,
            "mainValue": main_entry,
            "distanceFromMain": None,
            "note": "Cash market closed today; keep the live ES futures map, but do not force a normal RTH open bias.",
        }
    elif open_price is None:
        open_bias = {
            "direction": "PENDING",
            "openPrice": None,
            "mainValue": main_entry,
            "distanceFromMain": None,
            "note": "Opening bias pending: compare the RTH open against the 9 AM Control Line.",
        }
    else:
        distance = round(open_price - main_entry, 2)
        if distance > ES_OPEN_BIAS_TOLERANCE:
            direction = "BULLISH"
            note = (
                "RTH opened above the Control Line; the Control Map marks a bullish day bias "
                "until price loses a gate on a closing basis."
            )
        elif distance < -ES_OPEN_BIAS_TOLERANCE:
            direction = "BEARISH"
            note = (
                "RTH opened below the Control Line; the Control Map marks a bearish day bias "
                "until price reclaims a gate on a closing basis."
            )
        else:
            direction = "NEUTRAL"
            note = (
                "RTH opened on the Control Line; treat the first gate close as the bias resolver."
            )
        open_bias = {
            "direction": direction,
            "openPrice": round(open_price, 2),
            "mainValue": main_entry,
            "distanceFromMain": distance,
            "note": note,
        }

    signals: list[dict] = []
    for candle_index, candle in enumerate(session_bars):
        candle_time = to_ct(candle.t)
        candidates: list[dict] = []
        for line in lines:
            line_value = _round_to_tick(
                _deviation_line_value(
                    anchor,
                    effective_slope,
                    candle_time,
                    int(line["index"]),
                    spacing=spacing,
                )
            )
            if float(candle.l) <= line_value <= float(candle.h):
                if float(candle.c) > line_value:
                    side = "BUY"
                elif float(candle.c) < line_value:
                    side = "SELL"
                else:
                    continue
                candidates.append({
                    "side": side,
                    "windowKey": _deviation_window_for(candle_time, entry_at, window_end, extension_end)[0],
                    "windowLabel": _deviation_window_for(candle_time, entry_at, window_end, extension_end)[1],
                    "lineIndex": int(line["index"]),
                    "lineLabel": str(line["label"]),
                    "lineValue": line_value,
                    "candleTime": candle_time.isoformat(),
                    "nextCandleTime": _next_candle_time(session_bars, candle_index).isoformat(),
                    "close": round(float(candle.c), 2),
                    "distance": abs(float(candle.c) - line_value),
                })
        if not candidates:
            continue
        signal = min(candidates, key=lambda item: item["distance"])
        relation = "above" if signal["side"] == "BUY" else "below"
        prefix = (
            "Primary entry"
            if signal["windowKey"] == "PRIMARY"
            else "Post-window rejection/continuation"
            if signal["windowKey"] == "EXTENSION"
            else "Setup warning"
        )
        signal["note"] = (
            f"{prefix}: ES touched {signal['lineLabel']} "
            f"and closed {relation} it. {signal['side']} next candle is the read."
        )
        signal.pop("distance", None)
        signals.append(signal)

    return {
        "anchor": {"price": round(anchor.price, 2), "time": anchor.time.isoformat()},
        "slopePerHour": effective_slope,
        "spacing": spacing,
        "windowStart": window_start.isoformat(),
        "entryReferenceTime": entry_at.isoformat(),
        "windowEnd": window_end.isoformat(),
        "extensionEnd": extension_end.isoformat(),
        "entryMain": main_entry,
        "currentMain": main_entry,
        "openMain": main_open,
        "openBias": open_bias,
        "zone": zone,
        "activeWindow": active_window,
        "entryWindows": entry_windows,
        "hourlyCloses": hourly_closes,
        "nearestLine": nearest,
        "lines": lines,
        "recentSignals": signals[-5:],
    }


def _control_plan_line_value(anchor: Anchor, signed_slope: float, at: datetime) -> float:
    return _round_to_tick(
        anchor.price + float(signed_slope) * es_trading_hours_between(anchor.time, at)
    )


def _control_plan_map(
    *,
    id: str,
    label: str,
    direction: str,
    anchor: Optional[Anchor],
    signed_slope: float,
    arm_distance: float,
    reference_at: datetime,
    price_for_distance: Optional[float],
) -> Optional[dict]:
    if anchor is None:
        return None
    control_value = _control_plan_line_value(anchor, signed_slope, reference_at)
    distance = (
        round(float(price_for_distance) - control_value, 2)
        if price_for_distance is not None
        else None
    )
    status = (
        "PENDING"
        if distance is None
        else "ARMED"
        if abs(distance) <= arm_distance
        else "DISTANT"
    )
    return {
        "id": id,
        "label": label,
        "direction": direction,
        "anchor": {"price": round(anchor.price, 2), "time": anchor.time.isoformat()},
        "slopePerHour": signed_slope,
        "controlValue": control_value,
        "armDistance": float(arm_distance),
        "distanceFromOpen": distance,
        "status": status,
    }


def _control_plan_signal_bars(
    candles: list[Candle],
    *,
    as_of: datetime,
    session: date,
) -> list[dict]:
    as_of_ct = to_ct(as_of)
    buckets: dict[datetime, list[Candle]] = {}
    for candle in sorted(candles, key=lambda c: to_ct(c.t)):
        candle_time = to_ct(candle.t).replace(minute=0, second=0, microsecond=0)
        if candle_time.date() != session:
            continue
        if candle_time.hour not in (8, 9, 10):
            continue
        if candle_time + timedelta(hours=1) > as_of_ct:
            continue
        buckets.setdefault(candle_time, []).append(candle)

    bars: list[dict] = []
    for hour, group in sorted(buckets.items()):
        ordered = sorted(group, key=lambda c: to_ct(c.t))
        bars.append({
            "time": hour,
            "open": float(ordered[0].o),
            "high": max(float(c.h) for c in ordered),
            "low": min(float(c.l) for c in ordered),
            "close": float(ordered[-1].c),
        })
    return bars


def _control_plan_setup_status(side: str, line_value: float, target_distance: float, price: float) -> str:
    halfway = target_distance * 0.5
    if side == "BUY" and price > line_value + halfway:
        return "CHASING"
    if side == "SELL" and price < line_value - halfway:
        return "CHASING"
    return "WATCHING"


def _control_plan_setup(
    *,
    side: str,
    map_info: dict,
    entry_line: str,
    line_label: str,
    price: float,
    status: Optional[str] = None,
) -> dict:
    target_distance = float(ES_HALF_GATE_TARGET)
    line_value = float(map_info["controlValue"])
    is_buy = side == "BUY"
    target = line_value + target_distance if is_buy else line_value - target_distance
    setup_status = status or _control_plan_setup_status(side, line_value, target_distance, price)
    contract_type = "CALL" if is_buy else "PUT"
    thesis = (
        f"Support hold at {line_label}; first objective is Half-Gate."
        if is_buy
        else f"Resistance hold at {line_label}; first objective is Half-Gate."
    )
    return {
        "side": side,
        "contractType": contract_type,
        "mapId": map_info["id"],
        "mapLabel": map_info["label"],
        "entryLine": entry_line,
        "entryLineLabel": line_label,
        "lineValue": round(line_value, 2),
        "entryPrice": round(line_value, 2),
        "targetPrice": round(target, 2),
        "targetDistance": target_distance,
        "status": setup_status,
        "thesis": thesis,
    }


def _control_plan_signal(
    *,
    bar: dict,
    map_info: dict,
    entry_line: str,
    line_label: str,
    price: float,
) -> Optional[dict]:
    line_value = float(map_info["controlValue"])
    tolerance = ES_TICK_SIZE / 2
    buy_hit = (
        float(bar["open"]) > line_value + tolerance
        and float(bar["low"]) <= line_value
        and float(bar["close"]) > line_value + tolerance
    )
    sell_hit = (
        float(bar["open"]) < line_value - tolerance
        and float(bar["high"]) >= line_value
        and float(bar["close"]) < line_value - tolerance
    )
    if not buy_hit and not sell_hit:
        return None
    side = "BUY" if buy_hit else "SELL"
    setup = _control_plan_setup(
        side=side,
        map_info=map_info,
        entry_line=entry_line,
        line_label=line_label,
        price=price,
        status=_control_plan_setup_status(side, line_value, float(ES_HALF_GATE_TARGET), price),
    )
    signal_time = to_ct(bar["time"])
    entry_time = next_es_candle_open(signal_time)
    setup.update({
        "signalTime": signal_time.isoformat(),
        "entryTime": entry_time.isoformat(),
        "signalOpen": round(float(bar["open"]), 2),
        "signalHigh": round(float(bar["high"]), 2),
        "signalLow": round(float(bar["low"]), 2),
        "signalClose": round(float(bar["close"]), 2),
        "note": (
            f"{signal_time.strftime('%H:%M')} CT candle touched {line_label} "
            f"from {'above' if side == 'BUY' else 'below'} and closed "
            f"{'above' if side == 'BUY' else 'below'} it. {side} at the next hourly open."
        ),
    })
    return setup


def _control_trade_plan_for(
    *,
    descending_anchor: Optional[Anchor],
    ascending_anchor: Optional[Anchor],
    candles: list[Candle],
    as_of: datetime,
    session: date,
    price: float,
) -> Optional[dict]:
    reference_at = at_ct(session, time(ES_DEVIATION_WINDOW_START_HOUR_CT, 0))
    window_end = at_ct(session, time(11, 0))
    open_price = _rth_open_price(candles, session)
    if open_price is None:
        latest_before_ref = _last_candle_at(candles, reference_at)
        open_price = float(latest_before_ref.c) if latest_before_ref is not None else None

    primary_map = _control_plan_map(
        id="DESCENDING_CLOSE",
        label="Primary descending map",
        direction="DESCENDING",
        anchor=descending_anchor,
        signed_slope=-abs(float(ES_DUAL_MAP_PRIMARY_SLOPE_PER_HOUR)),
        arm_distance=float(ES_DUAL_MAP_PRIMARY_ARM_DISTANCE),
        reference_at=reference_at,
        price_for_distance=open_price,
    )
    opposite_map = _control_plan_map(
        id="ASCENDING_LOW",
        label="Opposite ascending map",
        direction="ASCENDING",
        anchor=ascending_anchor,
        signed_slope=abs(float(ES_DUAL_MAP_OPPOSITE_SLOPE_PER_HOUR)),
        arm_distance=float(ES_DUAL_MAP_OPPOSITE_ARM_DISTANCE),
        reference_at=reference_at,
        price_for_distance=open_price,
    )
    if primary_map is None or opposite_map is None:
        return None

    cash_session_open = is_trading_session_date(session)
    selected_map = primary_map if primary_map["status"] == "ARMED" else opposite_map
    entry_line = (
        "PREV_RTH_HIGH_DESC"
        if selected_map["id"] == "DESCENDING_CLOSE"
        else "PREV_RTH_LOW_ASC"
    )
    entry_label = "Control Line"
    setups = [
        _control_plan_setup(
            side="BUY",
            map_info=selected_map,
            entry_line=entry_line,
            line_label=entry_label,
            price=price,
        ),
        _control_plan_setup(
            side="SELL",
            map_info=selected_map,
            entry_line=entry_line,
            line_label=entry_label,
            price=price,
        ),
    ]

    signals: list[dict] = []
    if cash_session_open:
        for bar in _control_plan_signal_bars(candles, as_of=as_of, session=session):
            signal = _control_plan_signal(
                bar=bar,
                map_info=selected_map,
                entry_line=entry_line,
                line_label=entry_label,
                price=price,
            )
            if signal is not None:
                signals.append(signal)

    active_trade = signals[0] if signals else None
    as_of_ct = to_ct(as_of)
    if not cash_session_open:
        status = "NO_CASH_SESSION"
        label = "Cash session closed"
        guidance = "ES futures may move, but the normal RTH entry model is inactive."
    elif as_of_ct >= at_ct(session, time(12, 0)):
        status = "CLOSED"
        label = "Entry window closed"
        guidance = "No new ES entries after the morning window. Use the plan only for replay."
    elif active_trade is not None:
        status = "TRIGGERED"
        label = f"{active_trade['side']} next hourly open"
        guidance = active_trade["note"]
    elif selected_map["status"] == "ARMED":
        status = "ARMED"
        label = "Waiting for clean hourly touch"
        guidance = "First clean 8, 9, or 10 AM candle touch controls the next hourly entry."
    else:
        status = "WAITING"
        label = "Control map waiting"
        guidance = "Primary map is distant; opposite map is the backup only if it gives the first clean touch."

    return {
        "status": status,
        "label": label,
        "entryReferenceTime": reference_at.isoformat(),
        "signalWindowStart": reference_at.isoformat(),
        "signalWindowEnd": window_end.isoformat(),
        "targetDistance": float(ES_HALF_GATE_TARGET),
        "primaryMap": primary_map,
        "oppositeMap": opposite_map,
        "activeTrade": active_trade,
        "setups": setups,
        "signals": signals[-5:],
        "guidance": guidance,
    }


def _state_from_control_trade_plan(plan: dict) -> str:
    status = str(plan.get("status") or "WAITING")
    if status == "TRIGGERED":
        return "GO"
    if status == "ARMED":
        return "ARMED"
    if status == "CLOSED":
        return "COOLDOWN"
    if status == "NO_CASH_SESSION":
        return "STAND_DOWN"
    return "WAIT"


def _prev_rth_high_pivot_anchor(candles: list[Candle], session: date) -> Optional[Anchor]:
    """Highest prior-RTH 11 AM-3 PM close for the ES Control Line.

    The close, not the wick, is the current calibrated anchor. Shortened
    sessions fall back to the best available RTH close so the next session
    still has a stable map.
    """
    prev, bars = _previous_rth_high_pivot_bars(candles, session)
    if prev is None:
        return None
    high_bar = max(bars, key=lambda candle: float(candle.c))
    return Anchor(price=float(high_bar.c), time=to_ct(high_bar.t))


def _prev_rth_low_pivot_anchor(candles: list[Candle], session: date) -> Optional[Anchor]:
    """Lowest prior-RTH 11 AM-3 PM wick for the opposite ES map."""
    prev, bars = _previous_rth_low_pivot_bars(candles, session)
    if prev is None:
        return None
    low_bar = min(bars, key=lambda candle: float(candle.l))
    return Anchor(price=float(low_bar.l), time=to_ct(low_bar.t))


def _previous_rth_high_pivot_bars(candles: list[Candle], session: date) -> tuple[Optional[date], list[Candle]]:
    cursor = previous_futures_session_date(session)
    for _ in range(7):
        bars = in_window(candles, rth_window(cursor))
        candidates = _control_high_candidate_bars(bars)
        if candidates:
            return cursor, candidates
        cursor = previous_futures_session_date(cursor)
    return None, []


def _previous_rth_low_pivot_bars(candles: list[Candle], session: date) -> tuple[Optional[date], list[Candle]]:
    cursor = previous_futures_session_date(session)
    for _ in range(7):
        bars = in_window(candles, rth_window(cursor))
        candidates = _control_window_candidate_bars(bars)
        if candidates:
            return cursor, candidates
        cursor = previous_futures_session_date(cursor)
    return None, []


def _control_high_candidate_bars(bars: list[Candle]) -> list[Candle]:
    return _control_window_candidate_bars(bars)


def _control_window_candidate_bars(bars: list[Candle]) -> list[Candle]:
    control_window = [
        candle for candle in bars
        if time(11, 0) <= to_ct(candle.t).time() < time(15, 0)
    ]
    if len(control_window) >= 2:
        return control_window
    pre_close = [candle for candle in bars if to_ct(candle.t).time() < time(15, 0)]
    return pre_close or control_window or bars


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_snapshot(
    es_candles: list[Candle],
    es_to_spx_offset: float,
    as_of: datetime,
    *,
    slope_per_hour: float = DEFAULT_SLOPE_PER_HOUR,
    otm_distance: float = DEFAULT_OTM_DISTANCE,
    strike_increment: int = SPX_STRIKE_INCREMENT,
    expiration: Optional[date] = None,
    control_mode: str = "normal",
):
    """Build an SPXSnapshot from ES bars.

    Returns the Pydantic SPXSnapshot from ``api/schemas/spx.py``. The
    return is JSON-serializable via ``.model_dump(by_alias=True)`` to
    match the TypeScript camelCase contract.
    """
    from .schema import (
        SPXAnchor,
        SPXChannel,
        SPXConfluence as SPXConfluenceModel,
        SPXConfluenceFactor,
        SPXContractSuggestion,
        SPXContracts,
        SPXDecisionTraceEntry,
        SPXFanRead,
        SPXInvalidation,
        SPXLine,
        SPXOvernight,
        SPXOvernightWindow,
        SPXPlannedEnvelope,
        SPXPlays,
        SPXPrice,
        SPXReentryWatch,
        SPXRthBias,
        SPXScoreBands,
        SPXSessionRange as SPXSessionRangeModel,
        SPXSessions,
        SPXSnapshot,
        SPXStateHistoryEntry,
        SPXTrade,
    )

    if not es_candles:
        raise ValueError("compute_snapshot requires at least one ES candle")

    as_of_ct = to_ct(as_of)
    session = session_date_ct(as_of_ct)

    # 1. ES structure is computed in native ES coordinates.
    #
    # The `es_to_spx_offset` argument is retained for API compatibility and
    # quote diagnostics, but it must not be applied to the six structure lines.
    # Applying basis here makes the ES chart disagree with TradingView/native
    # ES even if the frontend later tries to subtract it back out.
    spx_candles = es_candles

    # 2. Session ranges (drive direction).
    sydney = sydney_range(spx_candles, session)
    tokyo = tokyo_range(spx_candles, session)

    # 3. Canonical ES structure. Sydney/Tokyo ranges are diagnostics only.
    channel = Channel(
        direction="ASCENDING",
        reason=(
            "ES Control Map active: high-pivot and low-pivot references are projected "
            "from prior-session anchors. "
            "A higher overnight pivot adds a minor ascending watch line."
        ),
    )

    # 4. Overnight anchors (diagnostic) + prev-RTH refs. During shortened
    # holiday sessions the app can move to the next planning session before
    # that session's overnight tape has printed. In that case, keep the
    # Control Map alive by falling back to the prior futures session pivots.
    prev_rth = prev_rth_anchors(spx_candles, session)
    pivot_high = _prev_rth_high_pivot_anchor(spx_candles, session)
    pivot_low = _prev_rth_low_pivot_anchor(spx_candles, session)
    if prev_rth is None and pivot_high is not None and pivot_low is not None:
        prev_rth = (pivot_high, pivot_low)
    prev_rth_high = prev_rth[0] if prev_rth else None
    prev_rth_low = prev_rth[1] if prev_rth else None
    try:
        overnight_high, overnight_low = overnight_anchors(spx_candles, session)
    except ValueError:
        if prev_rth_high is not None and prev_rth_low is not None:
            overnight_high, overnight_low = prev_rth_high, prev_rth_low
        else:
            last = _last_candle_at(spx_candles, as_of_ct)
            fallback = Anchor(price=float(last.c), time=to_ct(last.t))
            overnight_high, overnight_low = fallback, fallback

    # 5. Lines.
    lines = build_lines(
        direction=channel.direction,
        overnight_high=overnight_high,
        overnight_low=overnight_low,
        prev_rth_high=prev_rth_high,
        prev_rth_low=prev_rth_low,
        slope_per_hour=slope_per_hour,
    )

    # 6. Price + projection.
    last_price, last_time = _last_price_at(spx_candles, as_of_ct)
    projected = _project_all(lines, as_of_ct, last_price)

    # 7. Scenario + plays.
    scenario = classify(channel.direction, last_price, projected)
    scenario_text = explain_scenario(scenario, last_price, projected)
    fan_read = build_fan_read(last_price, projected)
    plays = build_plays(scenario, projected)

    # 8. Contracts.
    expiry = expiration or session
    dte_days = (expiry - session).days
    dte_label = "0DTE" if dte_days <= 0 else f"{dte_days}DTE"
    p_contract, a_contract = suggest_for_plays(
        plays.primary,
        plays.alternate,
        expiry,
        otm_distance=otm_distance,
        increment=strike_increment,
        dte_label=dte_label,
    )

    # 9. Re-entry watch.
    ceiling_line = next((l for l in lines if l.kind == "PREV_RTH_HIGH_DESC"), None)
    floor_line = next((l for l in lines if l.kind == "PREV_RTH_LOW_DESC"), None)
    reentry = evaluate_reentry(
        scenario,
        _last_candle_at(spx_candles, as_of_ct),
        ceiling_line,
        floor_line,
    )

    # 10. Confluence.
    confluence = evaluate_confluence(
        candles=spx_candles,
        session_date=session,
        channel=channel,
        sydney=sydney,
        tokyo=tokyo,
        scenario=scenario,
        ceiling=ceiling_line,
        floor=floor_line,
    )

    # 10. Price change vs prev close.
    prev_close = _prev_session_close(spx_candles, session)
    change = last_price - prev_close if prev_close is not None else 0.0
    change_pct = (change / prev_close * 100) if prev_close else 0.0

    # ---- Phase-1 hardening derivations ----
    as_of_iso = as_of_ct.isoformat()
    touch_window = _touch_window_entry_from_lines(
        lines=lines,
        candles=spx_candles,
        as_of=as_of_ct,
        session=session,
    )
    touch_state = _state_from_touch_window(as_of_ct, touch_window)
    flip_condition = (
        _touch_window_flip_condition(touch_window, touch_state)
        if touch_window is not None and touch_state is not None
        else _flip_condition_for(scenario, projected)
    )
    decision_trace = _decision_trace(
        as_of_iso=as_of_iso,
        scenario=scenario,
        scenario_text=scenario_text,
        channel_reason=channel.reason,
        confluence_score=confluence.score,
        action=confluence.action,
    )
    invalidation = _invalidation_for(plays.primary, projected)
    current_state = touch_state or _engine_state_from(
        scenario,
        confluence.action,
        primary_trade=plays.primary,
        current_price=last_price,
        invalidation=invalidation,
        as_of=as_of_ct,
        session=session,
    )
    planned_envelope = _planned_envelope_for(projected)
    score_bands = _score_bands()
    rth_bias = _rth_bias_for(lines, spx_candles, session)
    control_mode = "dealer_pressure" if control_mode == "dealer_pressure" else "normal"
    control_slope = (
        ES_DEALER_PRESSURE_SLOPE_PER_HOUR
        if control_mode == "dealer_pressure"
        else slope_per_hour
    )
    control_spacing = (
        ES_DEALER_PRESSURE_SPACING
        if control_mode == "dealer_pressure"
        else ES_DEVIATION_SPACING
    )
    deviation_anchor = (
        (_prev_rth_low_pivot_anchor(spx_candles, session) or prev_rth_low)
        if control_mode == "dealer_pressure"
        else (_prev_rth_high_pivot_anchor(spx_candles, session) or prev_rth_high)
    )
    descending_deviation_fan = _deviation_fan_for(
        anchor=deviation_anchor,
        candles=spx_candles,
        as_of=as_of_ct,
        session=session,
        price=last_price,
        slope_per_hour=control_slope,
        control_mode=control_mode,
        spacing=control_spacing,
    )
    control_trade_plan = _control_trade_plan_for(
        descending_anchor=_prev_rth_high_pivot_anchor(spx_candles, session) or prev_rth_high,
        ascending_anchor=_prev_rth_low_pivot_anchor(spx_candles, session) or prev_rth_low,
        candles=spx_candles,
        as_of=as_of_ct,
        session=session,
        price=last_price,
    )
    if control_trade_plan is not None:
        current_state = _state_from_control_trade_plan(control_trade_plan)
        decision_trace.append({
            "ts": as_of_iso,
            "event": f"Half-Gate plan: {control_trade_plan['guidance']}",
            "weight": "key",
        })
    state_history = _state_history(as_of_iso=as_of_iso, current_state=current_state)

    # ---- Build the Pydantic model (camelCase aliases) ----

    overnight_w = overnight_window(session)
    snapshot = SPXSnapshot(
        symbol="SPX",
        asOf=as_of_ct.isoformat(),
        sessionDateCT=session.isoformat(),
        overnight=SPXOvernight(
            window=SPXOvernightWindow(
                start=overnight_w.start.isoformat(),
                end=overnight_w.end.isoformat(),
            ),
            high=SPXAnchor(price=overnight_high.price, time=overnight_high.time.isoformat()),
            low=SPXAnchor(price=overnight_low.price, time=overnight_low.time.isoformat()),
        ),
        sessions=SPXSessions(
            sydney=_session_range_model(sydney) or _empty_session_range(),
            tokyo=_session_range_model(tokyo) or _empty_session_range(),
        ),
        channel=SPXChannel(
            direction=channel.direction,
            reason=channel.reason,
            noChannelReason=channel.no_channel_reason,
        ),
        fanRead=SPXFanRead(
            zone=fan_read.zone,
            label=fan_read.label,
            summary=fan_read.summary,
            primaryReference=fan_read.primary_reference,
            secondaryReference=fan_read.secondary_reference,
        ),
        lines=[_line_model(l, projected, last_price, session) for l in lines],
        price=SPXPrice(last=last_price, change=change, changePct=change_pct),
        scenario=scenario,
        scenarioExplanation=scenario_text,
        plays=SPXPlays(
            primary=_trade_model(plays.primary),
            alternate=_trade_model(plays.alternate),
        ),
        contracts=SPXContracts(
            forPrimary=_contract_model(p_contract),
            forAlternate=_contract_model(a_contract),
        ),
        reentryWatch=SPXReentryWatch(
            active=reentry.active, side=reentry.side, detail=reentry.detail,
        ),
        confluence=SPXConfluenceModel(
            factors=[SPXConfluenceFactor(
                key=f.key, label=f.label, value=f.value, weight=f.weight,
                contribution=f.contribution, note=f.note,
            ) for f in confluence.factors],
            score=confluence.score,
            action=confluence.action,
        ),
        currentState=current_state,
        flipCondition=flip_condition,
        stateHistory=[
            SPXStateHistoryEntry(ts=e["ts"], state=e["state"])
            for e in state_history
        ],
        decisionTrace=[
            SPXDecisionTraceEntry(
                ts=e["ts"], event=e["event"], weight=e.get("weight"),
            )
            for e in decision_trace
        ],
        invalidation=(
            SPXInvalidation(level=invalidation["level"], stopOffset=invalidation["stopOffset"])
            if invalidation else None
        ),
        plannedEnvelope=(
            SPXPlannedEnvelope(low=planned_envelope["low"], high=planned_envelope["high"])
            if planned_envelope else None
        ),
        scoreBands=SPXScoreBands(
            standDown=score_bands["standDown"],
            watch=score_bands["watch"],
            go=score_bands["go"],
        ),
        rthBias=(
            SPXRthBias(
                direction=rth_bias["direction"],
                openPrice=rth_bias["openPrice"],
                referenceLine=rth_bias["referenceLine"],
                referenceValue=rth_bias["referenceValue"],
                continuationLine=rth_bias["continuationLine"],
                continuationValue=rth_bias["continuationValue"],
                note=rth_bias["note"],
            )
            if rth_bias else None
        ),
        descendingDeviationFan=descending_deviation_fan,
        controlTradePlan=control_trade_plan,
    )
    return snapshot


# ---------------------------------------------------------------------------
# Conversion helpers (internal dataclass -> pydantic model)
# ---------------------------------------------------------------------------


def _line_model(l: Line, projected: list[ProjectedLine], price: float, session: date):
    """Convert internal Line + projection into the schema's SPXLine."""
    from .schema import SPXLine
    cur = next(p.value for p in projected if p.kind == l.kind)
    entry_reference = at_ct(session, time(ES_DEVIATION_ENTRY_HOUR_CT, 0))
    entry_value = project_line(l, entry_reference)
    return SPXLine(
        kind=l.kind,
        name=_line_display_name(l.kind),
        anchorPrice=l.anchor.price,
        anchorTime=l.anchor.time.isoformat(),
        slopePerHour=l.slope_per_hour,
        currentValue=cur,
        entryValue=entry_value,
        entryReferenceTime=entry_reference.isoformat(),
        distanceFromPrice=entry_value - price,
    )


def _line_display_name(kind: str) -> str:
    name_map = {
        "PREV_RTH_HIGH_ASC": "High-pivot upper boundary",
        "PREV_RTH_HIGH_DESC": "High-pivot control boundary",
        "PREV_RTH_LOW_ASC": "Low-pivot upper boundary",
        "PREV_RTH_LOW_DESC": "Low-pivot lower boundary",
        "SWING_HIGH_ASC": "Overnight Higher Pivot - Minor Ascending",
        "SWING_HIGH_DESC": "Overnight Swing High - Descending",
        "SWING_LOW_ASC": "Overnight Swing Low - Ascending",
        "SWING_LOW_DESC": "Overnight Swing Low - Descending",
    }
    return name_map.get(kind, kind)


def _session_range_model(r: Optional[SessionRange]):
    if r is None:
        return None
    from .schema import SPXSessionRange
    return SPXSessionRange(
        high=r.high, low=r.low,
        highTime=r.high_time.isoformat(),
        lowTime=r.low_time.isoformat(),
    )


def _empty_session_range():
    """Pydantic requires non-Optional sessions; emit an empty placeholder."""
    from .schema import SPXSessionRange
    return SPXSessionRange(
        high=0.0, low=0.0,
        highTime="1970-01-01T00:00:00", lowTime="1970-01-01T00:00:00",
    )


def _trade_model(t):
    if t is None:
        return None
    from .schema import SPXTrade
    return SPXTrade(
        side=t.side,
        entryLine=t.entry_line, entryPrice=t.entry_price,
        exitLine=t.exit_line, exitPrice=t.exit_price,
    )


def _contract_model(c):
    if c is None:
        return None
    from .schema import SPXContractSuggestion
    return SPXContractSuggestion(
        type=c.type, strike=c.strike,
        expiration=c.expiration.isoformat(),
        dteLabel=c.dte_label,
        distanceFromSpot=c.distance_from_entry,
    )
