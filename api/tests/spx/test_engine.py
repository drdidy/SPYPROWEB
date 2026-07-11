"""End-to-end: ES candles + offset -> SPXSnapshot."""
from datetime import date

import pytest

from _lib.spx import compute_snapshot


def test_snapshot_basic_shape(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.symbol == "SPX"
    assert snap.session_date_ct == "2026-05-08"
    # Four major fan lines are active; the minor overnight-higher-pivot watch
    # appears only when overnight context clears the prior control pivot.
    assert snap.channel.direction == "ASCENDING"
    assert len(snap.lines) == 4
    kinds = {l.kind for l in snap.lines}
    assert kinds == {
        "PREV_RTH_HIGH_ASC",
        "PREV_RTH_HIGH_DESC",
        "PREV_RTH_LOW_ASC",
        "PREV_RTH_LOW_DESC",
    }
    assert snap.rth_bias is not None
    assert snap.rth_bias.reference_line == "PREV_RTH_HIGH_DESC"
    assert snap.descending_deviation_fan is not None
    assert snap.descending_deviation_fan.spacing == pytest.approx(34.0)
    assert snap.descending_deviation_fan.entry_reference_time.endswith("09:00:00-05:00")
    assert snap.descending_deviation_fan.window_end.endswith("12:00:00-05:00")
    assert snap.descending_deviation_fan.extension_end.endswith("14:00:00-05:00")
    assert snap.descending_deviation_fan.active_window.key == "PRIMARY"
    assert len(snap.descending_deviation_fan.entry_windows) == 3
    assert snap.descending_deviation_fan.hourly_closes
    assert {item.hour for item in snap.descending_deviation_fan.hourly_closes} >= {8, 9}
    assert snap.descending_deviation_fan.zone.label.startswith("Between")
    assert snap.descending_deviation_fan.open_bias.direction == "BULLISH"
    assert snap.descending_deviation_fan.nearest_line.label == "Control Line"
    assert snap.control_trade_plan is not None
    assert snap.control_trade_plan.primary_map.id == "DESCENDING_CLOSE"
    assert snap.control_trade_plan.target_distance == pytest.approx(17.0)
    assert snap.fan_read is not None
    assert snap.fan_read.zone == "BELOW_BOTH_CEILINGS"


def test_snapshot_inside_ascending_with_plays(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.scenario == "ABOVE_DESCENDING"
    assert snap.plays.primary is not None
    assert snap.plays.alternate is not None
    assert snap.plays.primary.side == "SELL"
    assert snap.plays.primary.entry_line == "PREV_RTH_LOW_ASC"
    assert snap.plays.primary.exit_line == "PREV_RTH_HIGH_DESC"
    assert snap.plays.alternate.side == "BUY"


def test_snapshot_invalidation_uses_entry_rail(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.plays.primary is not None
    assert snap.invalidation is not None
    assert snap.invalidation.level == pytest.approx(snap.plays.primary.entry_price)


def test_snapshot_contracts_match_play_sides(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.contracts.for_primary is not None
    assert snap.contracts.for_alternate is not None
    assert snap.contracts.for_primary.type == "PUT"   # primary is SELL
    assert snap.contracts.for_alternate.type == "CALL"  # alternate is BUY
    # SPX 5pt board.
    assert snap.contracts.for_primary.strike % 5 == 0
    assert snap.contracts.for_alternate.strike % 5 == 0


def test_snapshot_contracts_label_next_trading_expiry(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of, expiration=date(2026, 5, 11))

    assert snap.contracts.for_primary is not None
    assert snap.contracts.for_primary.expiration == "2026-05-11"
    assert snap.contracts.for_primary.dte_label == "3DTE"


def test_snapshot_confluence_action_present(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    assert snap.confluence.action in ("TAKE", "SELECTIVE", "STAND_DOWN")
    assert 0 <= snap.confluence.score <= 100
    assert len(snap.confluence.factors) == 3


def test_snapshot_live_state_uses_completed_9am_fan_touch(
    es_candles_ascending_inside,
    es_offset,
):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from _lib.spx.candles import Candle

    ct = ZoneInfo("America/Chicago")
    session = datetime(2026, 5, 8, tzinfo=ct)
    candles = [
        *es_candles_ascending_inside,
        Candle(
            t=session.replace(hour=9),
            o=5885.00,
            h=5886.00,
            l=5883.50,
            c=5885.50,
        ),
    ]

    snap = compute_snapshot(candles, es_offset, session.replace(hour=10, minute=7))

    assert snap.current_state == "COOLDOWN"
    assert snap.flip_condition is not None
    assert "Touch-window buy completed" in snap.flip_condition
    assert any("Touch-window buy triggered" in event.event for event in snap.decision_trace)


def test_snapshot_8am_setup_candle_arms_9am_entry(
    es_candles_ascending_inside,
    es_offset,
):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from _lib.spx.candles import Candle

    ct = ZoneInfo("America/Chicago")
    session = datetime(2026, 5, 8, tzinfo=ct)
    candles = [
        *es_candles_ascending_inside,
        Candle(
            t=session.replace(hour=8),
            o=5885.00,
            h=5886.00,
            l=5883.50,
            c=5884.50,
        ),
        Candle(
            t=session.replace(hour=9),
            o=5884.75,
            h=5891.00,
            l=5884.25,
            c=5890.00,
        ),
    ]

    snap = compute_snapshot(candles, es_offset, session.replace(hour=10, minute=7))

    assert snap.current_state == "COOLDOWN"
    assert snap.flip_condition is not None
    assert "Touch-window buy completed" in snap.flip_condition
    assert any("8:00 setup buy triggered" in event.event for event in snap.decision_trace)


def test_snapshot_serializes_to_camelcase_json(es_candles_ascending_inside, es_offset, as_of):
    """The schema uses camelCase aliases so the JSON matches the TS contract."""
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    js = snap.model_dump(by_alias=True)
    # camelCase keys at top level
    assert "asOf" in js
    assert "sessionDateCT" in js
    assert "scenarioExplanation" in js
    assert "reentryWatch" in js
    assert "fanRead" in js
    assert "descendingDeviationFan" in js
    # nested camelCase
    assert "changePct" in js["price"]
    assert "currentValue" in js["lines"][0]
    assert "openBias" in js["descendingDeviationFan"]
    assert "nearestLine" in js["descendingDeviationFan"]


def test_snapshot_deviation_fan_emits_next_candle_signal(
    es_candles_ascending_inside,
    es_offset,
):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from _lib.spx.candles import Candle

    ct = ZoneInfo("America/Chicago")
    session = datetime(2026, 5, 8, tzinfo=ct)
    candles = [
        *es_candles_ascending_inside,
        Candle(
            t=session.replace(hour=10),
            o=5879.00,
            h=5879.70,
            l=5878.40,
            c=5879.20,
        ),
    ]

    snap = compute_snapshot(candles, es_offset, session.replace(hour=11, minute=5))
    fan = snap.descending_deviation_fan

    assert fan is not None
    assert fan.open_bias.direction == "BULLISH"
    assert fan.recent_signals
    latest = fan.recent_signals[-1]
    assert latest.side == "BUY"
    assert latest.window_key == "PRIMARY"
    assert latest.line_label == "North Gate I"
    assert "BUY next candle" in latest.note


def test_snapshot_deviation_fan_labels_post_noon_extension_signal(
    es_candles_ascending_inside,
    es_offset,
):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from _lib.spx.candles import Candle

    ct = ZoneInfo("America/Chicago")
    session = datetime(2026, 5, 8, tzinfo=ct)
    candles = [
        *es_candles_ascending_inside,
        Candle(
            t=session.replace(hour=13),
            o=5876.00,
            h=5876.00,
            l=5875.10,
            c=5875.25,
        ),
    ]

    snap = compute_snapshot(candles, es_offset, session.replace(hour=13, minute=55))
    fan = snap.descending_deviation_fan

    assert fan is not None
    assert fan.active_window.key == "EXTENSION"
    assert fan.recent_signals
    latest = fan.recent_signals[-1]
    assert latest.side == "SELL"
    assert latest.window_key == "EXTENSION"
    assert latest.window_label == "12-2 extension"
    assert latest.line_value == 5875.50
    assert "Post-window rejection/continuation" in latest.note


def test_snapshot_price_is_last_close_in_native_es_space(es_candles_ascending_inside, es_offset, as_of):
    """ES Channel keeps the displayed price and structure lines native to ES."""
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    # Last bar before 09:35 is the 09:00 ES bar with c=5860.00.
    assert snap.price.last == pytest.approx(5860.00)


def test_snapshot_control_map_uses_calibrated_high_pivot_and_gates(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    fan = snap.descending_deviation_fan

    assert fan is not None
    assert fan.anchor.price == pytest.approx(5864.00)
    assert fan.anchor.time.endswith("2026-05-07T13:00:00-05:00")
    assert fan.slope_per_hour == pytest.approx(-0.98)
    assert fan.spacing == pytest.approx(34.0)
    assert snap.control_trade_plan is not None
    assert snap.control_trade_plan.primary_map.control_value == pytest.approx(5846.25)
    assert snap.control_trade_plan.opposite_map.control_value == pytest.approx(5872.50)


def test_snapshot_dealer_pressure_keeps_separate_low_pivot_model(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of, control_mode="dealer_pressure")
    fan = snap.descending_deviation_fan

    assert fan is not None
    assert fan.anchor.price == pytest.approx(5848.00)
    assert fan.slope_per_hour == pytest.approx(1.22)
    assert fan.spacing == pytest.approx(34.0)


def test_snapshot_prev_rth_lines_do_not_apply_es_to_spx_offset(es_candles_ascending_inside, es_offset, as_of):
    snap = compute_snapshot(es_candles_ascending_inside, es_offset, as_of)
    by_kind = {line.kind: line for line in snap.lines}

    assert by_kind["PREV_RTH_HIGH_ASC"].anchor_price == pytest.approx(5866.50)
    assert by_kind["PREV_RTH_HIGH_ASC"].entry_value == pytest.approx(5885.12)
    assert by_kind["PREV_RTH_HIGH_DESC"].anchor_price == pytest.approx(5866.50)
    assert by_kind["PREV_RTH_HIGH_DESC"].entry_value == pytest.approx(5847.88)
    assert by_kind["PREV_RTH_LOW_ASC"].anchor_price == pytest.approx(5837.00)
    assert by_kind["PREV_RTH_LOW_ASC"].entry_value == pytest.approx(5859.54)
    assert by_kind["PREV_RTH_LOW_DESC"].anchor_price == pytest.approx(5837.00)
    assert by_kind["PREV_RTH_LOW_DESC"].entry_value == pytest.approx(5814.46)
    assert by_kind["PREV_RTH_HIGH_DESC"].entry_reference_time.endswith("09:00:00-05:00")


def test_tuesday_control_map_uses_monday_holiday_futures_pivot():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from _lib.spx.candles import Candle

    ct = ZoneInfo("America/Chicago")
    monday = datetime(2026, 5, 25, tzinfo=ct)
    tuesday = datetime(2026, 5, 26, tzinfo=ct)
    candles = [
        Candle(t=monday.replace(hour=8), o=7558.00, h=7561.00, l=7556.00, c=7560.00),
        Candle(t=monday.replace(hour=9), o=7560.00, h=7565.00, l=7559.50, c=7565.00),
        Candle(t=monday.replace(hour=10), o=7565.00, h=7565.00, l=7563.00, c=7564.50),
        Candle(t=monday.replace(hour=11), o=7564.50, h=7565.00, l=7560.00, c=7562.00),
        Candle(t=monday.replace(hour=17), o=7562.00, h=7563.00, l=7558.00, c=7560.00),
        Candle(t=monday.replace(hour=18), o=7560.00, h=7562.00, l=7559.00, c=7561.00),
        Candle(t=monday.replace(hour=19), o=7561.00, h=7564.00, l=7560.00, c=7563.00),
        Candle(t=monday.replace(hour=20), o=7563.00, h=7564.00, l=7561.00, c=7562.00),
        Candle(t=monday.replace(hour=21), o=7562.00, h=7563.00, l=7559.00, c=7560.00),
        Candle(t=monday.replace(hour=22), o=7560.00, h=7561.00, l=7558.00, c=7559.00),
        Candle(t=monday.replace(hour=23), o=7559.00, h=7561.00, l=7557.00, c=7558.00),
        Candle(t=tuesday.replace(hour=0), o=7558.00, h=7560.00, l=7556.00, c=7559.00),
        Candle(t=tuesday.replace(hour=1), o=7559.00, h=7560.00, l=7557.00, c=7558.50),
        Candle(t=tuesday.replace(hour=2), o=7558.50, h=7560.00, l=7557.00, c=7559.50),
        Candle(t=tuesday.replace(hour=8), o=7550.00, h=7552.00, l=7548.00, c=7551.00),
        Candle(t=tuesday.replace(hour=9), o=7551.00, h=7553.00, l=7549.00, c=7552.00),
    ]

    snap = compute_snapshot(candles, 0.0, tuesday.replace(hour=9, minute=5))
    fan = snap.descending_deviation_fan

    assert fan is not None
    assert fan.anchor.price == pytest.approx(7565.00)
    assert fan.anchor.time.endswith("2026-05-25T09:00:00-05:00")
    assert fan.entry_main == pytest.approx(7546.50)


def test_holiday_after_noon_projects_next_session_without_overnight_bars():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from _lib.spx.candles import Candle

    ct = ZoneInfo("America/Chicago")
    monday = datetime(2026, 5, 25, tzinfo=ct)
    candles = [
        Candle(t=monday.replace(hour=8), o=7558.00, h=7561.00, l=7556.00, c=7560.00),
        Candle(t=monday.replace(hour=9), o=7560.00, h=7565.00, l=7559.50, c=7565.00),
        Candle(t=monday.replace(hour=10), o=7565.00, h=7565.00, l=7563.00, c=7564.50),
        Candle(t=monday.replace(hour=11), o=7564.50, h=7565.00, l=7560.00, c=7564.50),
    ]

    snap = compute_snapshot(candles, 0.0, monday.replace(hour=13, minute=24))
    fan = snap.descending_deviation_fan

    assert snap.session_date_ct == "2026-05-26"
    assert fan is not None
    assert fan.anchor.price == pytest.approx(7565.00)
    assert fan.anchor.time.endswith("2026-05-25T09:00:00-05:00")
    assert fan.entry_main == pytest.approx(7546.50)


def test_snapshot_rejects_empty_candles(as_of):
    with pytest.raises(ValueError):
        compute_snapshot([], 12.0, as_of)
