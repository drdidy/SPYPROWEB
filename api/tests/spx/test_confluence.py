"""Confluence factors + score + action gate."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from _lib.spx.channel import (
    Channel,
    SessionRange,
    determine_channel,
    overnight_anchors,
    sydney_range,
    tokyo_range,
    build_lines,
)
from _lib.spx.confluence import evaluate
from _lib.spx.offset import apply_offset_to_series


CT = ZoneInfo("America/Chicago")


def test_score_in_range_and_action_take(es_candles_ascending_inside, es_offset, session_date):
    spx = apply_offset_to_series(es_candles_ascending_inside, es_offset)
    syd = sydney_range(spx, session_date)
    tky = tokyo_range(spx, session_date)
    ch = determine_channel(syd, tky)
    high, low = overnight_anchors(spx, session_date)
    lines = build_lines(direction=ch.direction, overnight_high=high, overnight_low=low,
                       prev_rth_high=None, prev_rth_low=None)
    ceiling = next((l for l in lines if l.kind == "CHANNEL_CEILING"), None)
    floor = next((l for l in lines if l.kind == "CHANNEL_FLOOR"), None)

    res = evaluate(
        candles=spx, session_date=session_date, channel=ch,
        sydney=syd, tokyo=tky, scenario="INSIDE_ASCENDING",
        ceiling=ceiling, floor=floor,
    )
    assert 0 <= res.score <= 100
    # Two TBD slots have weight 0; max score from the three live factors is
    # 0.30*0.95 + 0.30*0.95 + 0.40*0.95 = 0.95 -> 95. Min on a clean read
    # is ~50. Score should not be below the SELECTIVE threshold.
    assert res.score >= 50.0
    assert res.action in ("TAKE", "SELECTIVE")


def test_outside_play_forces_stand_down(es_candles_ascending_inside, es_offset, session_date):
    spx = apply_offset_to_series(es_candles_ascending_inside, es_offset)
    syd = sydney_range(spx, session_date)
    tky = tokyo_range(spx, session_date)
    ch = determine_channel(syd, tky)
    high, low = overnight_anchors(spx, session_date)
    lines = build_lines(direction=ch.direction, overnight_high=high, overnight_low=low,
                       prev_rth_high=None, prev_rth_low=None)

    res = evaluate(
        candles=spx, session_date=session_date, channel=ch,
        sydney=syd, tokyo=tky, scenario="OUTSIDE_PLAY",
        ceiling=lines[1] if len(lines) > 1 else None,
        floor=lines[0] if lines else None,
    )
    assert res.action == "STAND_DOWN"


def test_factors_contain_all_five_slots(es_candles_ascending_inside, es_offset, session_date):
    spx = apply_offset_to_series(es_candles_ascending_inside, es_offset)
    syd = sydney_range(spx, session_date)
    tky = tokyo_range(spx, session_date)
    ch = determine_channel(syd, tky)
    high, low = overnight_anchors(spx, session_date)
    lines = build_lines(direction=ch.direction, overnight_high=high, overnight_low=low,
                       prev_rth_high=None, prev_rth_low=None)
    ceiling = next((l for l in lines if l.kind == "CHANNEL_CEILING"), None)
    floor = next((l for l in lines if l.kind == "CHANNEL_FLOOR"), None)

    res = evaluate(
        candles=spx, session_date=session_date, channel=ch,
        sydney=syd, tokyo=tky, scenario="INSIDE_ASCENDING",
        ceiling=ceiling, floor=floor,
    )
    keys = [f.key for f in res.factors]
    assert keys == ["asian", "london", "reaction", "factor4_tbd", "factor5_tbd"]


def test_placeholder_factors_contribute_zero(es_candles_ascending_inside, es_offset, session_date):
    spx = apply_offset_to_series(es_candles_ascending_inside, es_offset)
    syd = sydney_range(spx, session_date)
    tky = tokyo_range(spx, session_date)
    ch = determine_channel(syd, tky)
    high, low = overnight_anchors(spx, session_date)
    lines = build_lines(direction=ch.direction, overnight_high=high, overnight_low=low,
                       prev_rth_high=None, prev_rth_low=None)
    ceiling = next((l for l in lines if l.kind == "CHANNEL_CEILING"), None)
    floor = next((l for l in lines if l.kind == "CHANNEL_FLOOR"), None)

    res = evaluate(
        candles=spx, session_date=session_date, channel=ch,
        sydney=syd, tokyo=tky, scenario="INSIDE_ASCENDING",
        ceiling=ceiling, floor=floor,
    )
    placeholders = [f for f in res.factors if f.key.startswith("factor")]
    assert all(f.contribution == 0.0 for f in placeholders)
    assert all(f.weight == 0.0 for f in placeholders)
