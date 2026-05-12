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

from datetime import date, datetime
from typing import Optional

# We don't import the schema at module top-level because the api package
# uses a flat layout under api/. Use a deferred import so callers that
# don't hit compute_snapshot can still import this module cheaply.

from .candles import Candle
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
from .constants import DEFAULT_OTM_DISTANCE, DEFAULT_SLOPE_PER_HOUR, SPX_STRIKE_INCREMENT
from .contracts import suggest_for_plays
from .offset import apply_offset_to_series
from .reentry import evaluate_reentry
from .scenario import (
    ProjectedLine,
    build_plays,
    classify,
    explain_scenario,
)
from .time_utils import (
    overnight_window,
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
# Phase-1 hardening helpers — engine-state, flip condition, decision trace,
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


def _flip_condition_for(scenario: str, projected: list[ProjectedLine]) -> str:
    """One-sentence description of what would flip the current scenario."""
    by_kind = {p.kind: p.value for p in projected}
    upper = by_kind.get("SWING_HIGH_DESC")
    lower = by_kind.get("SWING_LOW_ASC")
    high_asc = by_kind.get("PREV_RTH_HIGH_ASC")
    low_desc = by_kind.get("PREV_RTH_LOW_DESC")

    if scenario == "OUTSIDE_PLAY":
        if high_asc is not None and low_desc is not None:
            return (
                f"Re-entry into the planned envelope "
                f"({low_desc:.2f}–{high_asc:.2f}) reactivates the play."
            )
        return "Re-entry into the planned envelope reactivates the play."
    if scenario.startswith("INSIDE_"):
        if upper is not None and lower is not None:
            return (
                f"Confirmed hourly rejection at {upper:.2f} or {lower:.2f} "
                f"arms the next-candle ES entry."
            )
    if scenario.startswith("ABOVE_") and high_asc is not None:
        return f"Watch the previous RTH high ascending line at {high_asc:.2f} for sell entry or buy exit."
    if scenario.startswith("BELOW_") and low_desc is not None:
        return f"Watch the previous RTH low descending line at {low_desc:.2f} for buy entry or sell exit."
    return "Six-line ES structure pending."


def _decision_trace(
    *, as_of_iso: str, scenario: str, scenario_text: str,
    channel_reason: str, confluence_score: float, action: str,
) -> list[dict]:
    """Chronological trace of the events that produced today's verdict."""
    trace: list[dict] = []
    trace.append({"ts": as_of_iso, "event": f"Channel: {channel_reason}", "weight": "info"})
    trace.append({"ts": as_of_iso, "event": f"Scenario {scenario.replace('_', ' ').lower()}", "weight": "key"})
    trace.append({
        "ts": as_of_iso,
        "event": f"Confluence {confluence_score:.0f}/100 → {action.replace('_', ' ').lower()}",
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
    """Envelope for outside-play visualization: prev-RTH low → prev-RTH high."""
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
    """RTH-open posture from the six-line ES framework."""
    swing_high_asc = next((l for l in lines if l.kind == "SWING_HIGH_ASC"), None)
    swing_high_desc = next((l for l in lines if l.kind == "SWING_HIGH_DESC"), None)
    swing_low_asc = next((l for l in lines if l.kind == "SWING_LOW_ASC"), None)
    swing_low_desc = next((l for l in lines if l.kind == "SWING_LOW_DESC"), None)
    high_up = next((l for l in lines if l.kind == "PREV_RTH_HIGH_ASC"), None)
    low_down = next((l for l in lines if l.kind == "PREV_RTH_LOW_DESC"), None)
    if swing_high_asc is None or swing_high_desc is None or swing_low_asc is None or swing_low_desc is None:
        return None

    open_at = rth_window(session).start
    open_price = _rth_open_price(candles, session)
    high_asc_val = project_line(swing_high_asc, open_at)
    high_desc_val = project_line(swing_high_desc, open_at)
    low_asc_val = project_line(swing_low_asc, open_at)
    low_desc_val = project_line(swing_low_desc, open_at)

    if open_price is None:
        return {
            "direction": "PENDING",
            "openPrice": None,
            "referenceLine": "SWING_HIGH_DESC",
            "referenceValue": round(high_desc_val, 2),
            "continuationLine": "PREV_RTH_HIGH_ASC",
            "continuationValue": round(project_line(high_up, open_at), 2) if high_up else None,
            "note": (
                "RTH posture pending: compare the opening print to the "
                "swing high and swing low line pairs."
            ),
        }

    if open_price > high_asc_val and open_price > high_desc_val:
        cont = project_line(high_up, open_at) if high_up else None
        return {
            "direction": "BULLISH",
            "openPrice": round(open_price, 2),
            "referenceLine": "SWING_HIGH_DESC",
            "referenceValue": round(high_desc_val, 2),
            "continuationLine": "PREV_RTH_HIGH_ASC",
            "continuationValue": round(cont, 2) if cont is not None else None,
            "note": (
                "RTH opened above both swing-high lines; upside posture stays "
                "active until a qualified hourly rejection says otherwise."
            ),
        }

    if open_price < low_asc_val and open_price < low_desc_val:
        cont = project_line(low_down, open_at) if low_down else None
        return {
            "direction": "BEARISH",
            "openPrice": round(open_price, 2),
            "referenceLine": "SWING_LOW_ASC",
            "referenceValue": round(low_asc_val, 2),
            "continuationLine": "PREV_RTH_LOW_DESC",
            "continuationValue": round(cont, 2) if cont is not None else None,
            "note": (
                "RTH opened below both swing-low lines; downside posture stays "
                "active until a qualified hourly rejection says otherwise."
            ),
        }

    return {
        "direction": "PENDING",
        "openPrice": round(open_price, 2),
        "referenceLine": "SWING_HIGH_DESC",
        "referenceValue": round(high_desc_val, 2),
        "continuationLine": None,
        "continuationValue": None,
        "note": (
            "RTH opened inside the swing-line framework; wait for an hourly "
            "close rejection at one of the six ES lines."
        ),
    }


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

    # 1. Apply ES->SPX offset to the entire series.
    spx_candles = apply_offset_to_series(es_candles, es_to_spx_offset)

    # 2. Session ranges (drive direction).
    sydney = sydney_range(spx_candles, session)
    tokyo = tokyo_range(spx_candles, session)

    # 3. Direction — must come before overnight anchor extraction since
    # the anchor rule depends on direction (close vs wick).
    channel = Channel(
        direction="ASCENDING",
        reason=(
            "Six-line ES framework active: previous RTH high ascending, "
            "previous RTH low descending, and ascending/descending lines "
            "from the overnight swing-high and swing-low closes before 02:00 CT."
        ),
    )

    # 4. Overnight anchors (direction-aware) + prev-RTH refs.
    overnight_high, overnight_low = overnight_anchors(spx_candles, session)
    prev_rth = prev_rth_anchors(spx_candles, session)
    prev_rth_high = prev_rth[0] if prev_rth else None
    prev_rth_low = prev_rth[1] if prev_rth else None

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
    plays = build_plays(scenario, projected)

    # 8. Contracts.
    expiry = expiration or session
    p_contract, a_contract = suggest_for_plays(
        plays.primary,
        plays.alternate,
        expiry,
        otm_distance=otm_distance,
        increment=strike_increment,
    )

    # 9. Re-entry watch.
    ceiling_line = next((l for l in lines if l.kind == "SWING_HIGH_DESC"), None)
    floor_line = next((l for l in lines if l.kind == "SWING_LOW_ASC"), None)
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
    flip_condition = _flip_condition_for(scenario, projected)
    decision_trace = _decision_trace(
        as_of_iso=as_of_iso,
        scenario=scenario,
        scenario_text=scenario_text,
        channel_reason=channel.reason,
        confluence_score=confluence.score,
        action=confluence.action,
    )
    invalidation = _invalidation_for(plays.primary, projected)
    current_state = _engine_state_from(
        scenario,
        confluence.action,
        primary_trade=plays.primary,
        current_price=last_price,
        invalidation=invalidation,
        as_of=as_of_ct,
        session=session,
    )
    state_history = _state_history(as_of_iso=as_of_iso, current_state=current_state)
    planned_envelope = _planned_envelope_for(projected)
    score_bands = _score_bands()
    rth_bias = _rth_bias_for(lines, spx_candles, session)
    if rth_bias is not None:
        decision_trace.append({
            "ts": as_of_iso,
            "event": f"RTH bias: {rth_bias['note']}",
            "weight": "key",
        })

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
        lines=[_line_model(l, projected, last_price) for l in lines],
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
    )
    return snapshot


# ---------------------------------------------------------------------------
# Conversion helpers (internal dataclass -> pydantic model)
# ---------------------------------------------------------------------------


def _line_model(l: Line, projected: list[ProjectedLine], price: float):
    """Convert internal Line + projection into the schema's SPXLine."""
    from .schema import SPXLine
    name_map = {
        "PREV_RTH_HIGH_ASC": "Prev RTH High · Ascending",
        "PREV_RTH_LOW_DESC": "Prev RTH Low · Descending",
        "SWING_HIGH_ASC": "Overnight Swing High · Ascending",
        "SWING_HIGH_DESC": "Overnight Swing High · Descending",
        "SWING_LOW_ASC": "Overnight Swing Low · Ascending",
        "SWING_LOW_DESC": "Overnight Swing Low · Descending",
    }
    cur = next(p.value for p in projected if p.kind == l.kind)
    return SPXLine(
        kind=l.kind,
        name=name_map[l.kind],
        anchorPrice=l.anchor.price,
        anchorTime=l.anchor.time.isoformat(),
        slopePerHour=l.slope_per_hour,
        currentValue=cur,
        distanceFromPrice=cur - price,
    )


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
