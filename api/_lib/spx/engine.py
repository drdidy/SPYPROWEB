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
    determine_channel,
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

    Falls back to the very last candle if everything is in the future.
    """
    as_of = to_ct(as_of)
    eligible = [c for c in candles if to_ct(c.t) <= as_of]
    last = max(eligible, key=lambda c: to_ct(c.t)) if eligible else max(candles, key=lambda c: to_ct(c.t))
    return last.c, to_ct(last.t)


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


def _engine_state_from(scenario: str, action: str) -> str:
    """Project SPX scenario + confluence action onto the shared 6-state ladder."""
    if scenario == "OUTSIDE_PLAY":
        return "STAND_DOWN"
    if action == "TAKE":
        return "GO"
    if action == "SELECTIVE":
        return "ARMED"
    # Inside-play but score below selective threshold -> still observing.
    return "WATCH"


def _flip_condition_for(scenario: str, projected: list[ProjectedLine]) -> str:
    """One-sentence description of what would flip the current scenario."""
    by_kind = {p.kind: p.value for p in projected}
    ceiling = by_kind.get("CHANNEL_CEILING")
    floor = by_kind.get("CHANNEL_FLOOR")
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
        if ceiling is not None and floor is not None:
            return (
                f"Confirmed close above {ceiling:.2f} or below {floor:.2f} "
                f"breaks the channel and flips the read."
            )
    if scenario.startswith("ABOVE_") and ceiling is not None:
        return f"Confirmed close back below {ceiling:.2f} drops price into the channel."
    if scenario.startswith("BELOW_") and floor is not None:
        return f"Confirmed close back above {floor:.2f} lifts price into the channel."
    return "Channel state pending."


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

    Uses the primary trade's exit line as the "if you're wrong" reference
    when present; falls back to None when there's no qualified play.
    """
    if primary_trade is None:
        return None
    by_kind = {p.kind: p.value for p in projected}
    exit_value = by_kind.get(primary_trade.exit_line)
    if exit_value is None:
        return None
    # Stop offset: 0.5% of the level, floored at 1.0pt — matches the
    # engine's slope magnitude class without committing to a number
    # that might mislead users.
    stop_offset = max(round(exit_value * 0.005, 2), 1.0)
    return {"level": round(exit_value, 2), "stopOffset": stop_offset}


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
    channel = determine_channel(sydney, tokyo)

    # 4. Overnight anchors (direction-aware) + prev-RTH refs.
    overnight_high, overnight_low = overnight_anchors(
        spx_candles, session, direction=channel.direction
    )
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
    ceiling_line = next((l for l in lines if l.kind == "CHANNEL_CEILING"), None)
    floor_line = next((l for l in lines if l.kind == "CHANNEL_FLOOR"), None)
    reentry = evaluate_reentry(scenario, spx_candles[-1] if spx_candles else None, ceiling_line, floor_line)

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
    current_state = _engine_state_from(scenario, confluence.action)
    flip_condition = _flip_condition_for(scenario, projected)
    decision_trace = _decision_trace(
        as_of_iso=as_of_iso,
        scenario=scenario,
        scenario_text=scenario_text,
        channel_reason=channel.reason,
        confluence_score=confluence.score,
        action=confluence.action,
    )
    state_history = _state_history(as_of_iso=as_of_iso, current_state=current_state)
    invalidation = _invalidation_for(plays.primary, projected)
    planned_envelope = _planned_envelope_for(projected)
    score_bands = _score_bands()

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
    )
    return snapshot


# ---------------------------------------------------------------------------
# Conversion helpers (internal dataclass -> pydantic model)
# ---------------------------------------------------------------------------


def _line_model(l: Line, projected: list[ProjectedLine], price: float):
    """Convert internal Line + projection into the schema's SPXLine."""
    from .schema import SPXLine
    name_map = {
        "CHANNEL_CEILING": "Channel Ceiling",
        "CHANNEL_FLOOR": "Channel Floor",
        "PREV_RTH_HIGH_ASC": "Prev RTH High · Ascending",
        "PREV_RTH_LOW_DESC": "Prev RTH Low · Descending",
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
