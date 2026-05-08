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
        SPXLine,
        SPXOvernight,
        SPXOvernightWindow,
        SPXPlays,
        SPXPrice,
        SPXReentryWatch,
        SPXSessionRange as SPXSessionRangeModel,
        SPXSessions,
        SPXSnapshot,
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
