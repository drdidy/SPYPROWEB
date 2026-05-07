"""Parity tests pinning known-good outputs from drdidy/SPYPROST.

Each test mirrors a specific assertion from the Streamlit version's test
suite (drdidy/SPYPROST/tests/) and asserts it against the ported
prophet_core module. If a value drifts here, the Streamlit and FastAPI
engines have diverged and the migration is no longer A/B-safe.
"""
from __future__ import annotations

from datetime import datetime

import pandas as pd
import pytest

from _lib.prophet_core import (
    DEFAULT_SLOPE_PER_HOUR,
    BiasState,
    DynamicLine,
    OptionsIntelligence,
    Pivot,
    SecondaryPivot,
    SelectedStrikes,
    SourceStatus,
    TradeSignal,
    build_decision_state,
    build_pivot_source_table,
    build_primary_lines,
    build_secondary_lines,
    build_structure_projection_table,
    build_trade_signal_from_rejection,
    build_wait_discipline_items,
    calculate_bias_strength,
    calculate_signal_risk_reward,
    calculate_slope_from_observed,
    calculate_wick_rejection_metrics,
    candle_color,
    detect_rejection_signals,
    determine_preopen_bias,
    display_anchor_source,
    display_line_description,
    display_line_list,
    display_line_name,
    display_state_label,
    evaluate_chase_status,
    evaluate_daily_risk,
    evaluate_structure_status,
    find_high_pivot,
    find_low_pivot,
    find_secondary_pivots,
    find_target_for_signal,
    fmt_nan,
    fmt_price,
    format_watch_contract,
    get_central_tz,
    get_closest_primary_line,
    get_contract_watch_price,
    get_line_by_name,
    get_primary_anchor_summary,
    get_structure_calibration,
    is_call_rejection,
    is_put_rejection,
    market_hours_between,
    normalize_tradingview_anchor_time,
    premium_flow_alignment,
    project_lines,
    safe_to_dict,
    score_signal_quality,
    select_0dte_strikes,
    select_flow_aware_watch_contracts,
    select_watch_contracts,
)


def _ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(datetime.fromisoformat(s), tz=get_central_tz())


def _df(rows: list[tuple[str, float, float, float, float]]) -> pd.DataFrame:
    idx = pd.DatetimeIndex([_ts(ts) for ts, *_ in rows])
    data = {
        "Open": [r[1] for r in rows],
        "High": [r[2] for r in rows],
        "Low": [r[3] for r in rows],
        "Close": [r[4] for r in rows],
    }
    return pd.DataFrame(data, index=idx)


def _candles(rows):
    idx = pd.DatetimeIndex([_ts(r[0]) for r in rows])
    return pd.DataFrame(
        {"Open": [r[1] for r in rows], "High": [r[2] for r in rows], "Low": [r[3] for r in rows], "Close": [r[4] for r in rows]},
        index=idx,
    )


# ---------------------------------------------------------------------------
# Pivots / candle parity (mirrors drdidy/SPYPROST tests/test_pivots.py)
# ---------------------------------------------------------------------------

def test_candle_color() -> None:
    assert candle_color(pd.Series({"Open": 1, "Close": 2})) == "green"
    assert candle_color(pd.Series({"Open": 2, "Close": 1})) == "red"
    assert candle_color(pd.Series({"Open": 2, "Close": 2})) == "doji"


def test_half_hour_anchor_normalizes_to_tradingview_hour() -> None:
    assert normalize_tradingview_anchor_time(_ts("2026-04-28T14:30:00")) == _ts("2026-04-28T14:00:00")
    assert normalize_tradingview_anchor_time(_ts("2026-04-28T10:30:00")) == _ts("2026-04-28T11:00:00")


def test_high_pivot_projection_uses_tradingview_candle_anchor() -> None:
    df = _df([
        ("2026-04-28T13:00:00", 718, 718.5, 717, 718.2),
        ("2026-04-28T14:00:00", 718.2, 719.78, 718, 719.1),
    ])
    hp = find_high_pivot(df)
    assert hp.price == 719.78
    assert hp.timestamp == _ts("2026-04-28T14:00:00")
    ua, ud, *_ = build_primary_lines(hp, find_low_pivot(df), DEFAULT_SLOPE_PER_HOUR)
    next_9am = _ts("2026-04-29T09:00:00")
    assert ua.tradable_value_at(next_9am) == 721.78
    assert ud.tradable_value_at(next_9am) == 717.78


def test_two_pm_anchor_projects_to_expected_nine_am_level() -> None:
    hp = Pivot("HIGH_PIVOT", 714.47, _ts("2026-04-28T14:00:00"), "session_high", "green", False)
    lp = Pivot("LOW_PIVOT", 700.00, _ts("2026-04-28T14:00:00"), "session_low", "red", False)
    _, ud, *_ = build_primary_lines(hp, lp, DEFAULT_SLOPE_PER_HOUR)
    assert ud.tradable_value_at(_ts("2026-04-29T09:00:00")) == 712.47


def test_secondary_pivots_pattern() -> None:
    df = _df([
        ("2026-04-28T08:30:00", 10, 10.5, 9, 9),    # red
        ("2026-04-28T09:30:00", 9, 10.6, 8.8, 10),  # green
        ("2026-04-28T10:30:00", 10, 11.0, 9.7, 9),  # red
        ("2026-04-28T11:30:00", 9, 9.8, 8.2, 9),    # doji
        ("2026-04-28T12:30:00", 9, 9.5, 7.5, 8),    # red
        ("2026-04-28T13:30:00", 8, 9.2, 7.2, 9),    # green
    ])
    pivots = find_secondary_pivots(df)
    assert len(pivots) == 3
    assert pivots[0].direction == "descending" and pivots[0].price == 9
    assert pivots[1].direction == "ascending" and pivots[1].price == 10.6
    assert pivots[2].direction == "descending" and pivots[2].price == 7.5


def test_empty_rth_handling() -> None:
    empty = pd.DataFrame()
    assert find_high_pivot(empty).fallback_used
    assert find_low_pivot(empty).fallback_used
    assert find_secondary_pivots(empty) == []


# ---------------------------------------------------------------------------
# Lines (mirrors drdidy/SPYPROST tests/test_lines.py)
# ---------------------------------------------------------------------------

def test_default_slope_constant() -> None:
    assert DEFAULT_SLOPE_PER_HOUR == 0.20


def test_structure_calibration_reads_env_without_ui(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SPYPROPHET_STRUCTURE_CALIBRATION", "0.111")
    assert get_structure_calibration() == 0.111


def test_hours_since_uses_tradingview_active_chart_hours() -> None:
    line_desc = DynamicLine("X", 714.46, _ts("2026-04-28T14:00:00"), DEFAULT_SLOPE_PER_HOUR, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "")
    line_asc = DynamicLine("Y", 714.46, _ts("2026-04-28T14:00:00"), DEFAULT_SLOPE_PER_HOUR, "ascending", "PUT_ZONE", "PRIMARY_HIGH", True, "")
    now = _ts("2026-04-29T08:00:00")
    assert line_desc.hours_since(now) == 9
    assert abs(line_desc.raw_value_at(now) - 712.66) < 1e-9
    assert line_desc.tradable_value_at(now) == 712.66
    assert abs(line_asc.raw_value_at(now) - 716.26) < 1e-9
    assert line_asc.tradable_value_at(now) == 716.26


def test_weekend_projection_skips_closed_chart_hours() -> None:
    friday_anchor = _ts("2026-05-01T09:00:00")
    monday_projection = _ts("2026-05-04T09:00:00")
    line = DynamicLine("UA", 724.87, friday_anchor, DEFAULT_SLOPE_PER_HOUR, "ascending", "PUT_ZONE", "PRIMARY_HIGH", True, "")
    assert market_hours_between(friday_anchor, monday_projection) == 15
    assert line.hours_since(monday_projection) == 15
    assert line.tradable_value_at(monday_projection) == 727.87


def test_calibration_helper() -> None:
    s_desc = calculate_slope_from_observed(714.46, 712.61, 18, "descending")
    assert abs(s_desc - 0.1027777778) < 1e-7
    s_asc = calculate_slope_from_observed(100, 101, 4, "ascending")
    assert s_asc == 0.25


def test_build_primary_lines_and_override() -> None:
    hp = Pivot("HIGH_PIVOT", 714.46, _ts("2026-04-28T14:00:00"), "x", "green", False)
    lp = Pivot("LOW_PIVOT", 700.12, _ts("2026-04-28T10:00:00"), "x", "red", False)
    lines = build_primary_lines(hp, lp)
    assert [l.name for l in lines] == ["UA", "UD", "LA", "LD"]
    assert [l.zone_type for l in lines] == ["PUT_ZONE", "CALL_ZONE", "PUT_ZONE", "CALL_ZONE"]
    assert all(l.is_primary for l in lines)
    assert all(l.slope_per_hour == DEFAULT_SLOPE_PER_HOUR for l in lines)
    lines2 = build_primary_lines(hp, lp, slope_per_hour=0.104)
    assert all(l.slope_per_hour == 0.104 for l in lines2)


def test_build_secondary_lines() -> None:
    pivs = [
        SecondaryPivot("A", 10, _ts("2026-04-28T09:00:00"), "ascending", "secondary_transition"),
        SecondaryPivot("B", 9, _ts("2026-04-28T10:00:00"), "descending", "secondary_transition"),
    ]
    lines = build_secondary_lines(pivs)
    assert lines[0].direction == "ascending" and lines[0].zone_type == "TARGET_ONLY"
    assert lines[1].direction == "descending" and lines[1].zone_type == "TARGET_ONLY"
    assert all(not l.is_primary and l.source == "SECONDARY" for l in lines)


def test_project_lines_columns_and_distance() -> None:
    now = _ts("2026-04-29T08:00:00")
    hp = Pivot("HIGH_PIVOT", 714.46, _ts("2026-04-28T14:00:00"), "x", "green", False)
    lp = Pivot("LOW_PIVOT", 700.00, _ts("2026-04-28T14:00:00"), "x", "red", False)
    prim = build_primary_lines(hp, lp)
    df = project_lines(prim, now, 712.50)
    required = {"name", "raw_projected_value", "tradable_value", "distance", "abs_distance",
                "percent_distance", "direction", "zone_type", "source", "is_primary",
                "anchor_price", "anchor_time", "slope_per_hour", "description"}
    assert required.issubset(set(df.columns))
    row = df[df["name"] == "UD"].iloc[0]
    assert row["distance"] == 712.50 - row["tradable_value"]
    closest = get_closest_primary_line(prim, now, 712.50)
    assert closest is not None and closest.is_primary


def test_structure_tables_explain_source_and_projection() -> None:
    idx = pd.DatetimeIndex([
        _ts("2026-04-28T08:30:00"),
        _ts("2026-04-28T09:30:00"),
        _ts("2026-04-28T14:30:00"),
    ])
    candles = pd.DataFrame(
        {"Open": [100.0, 102.0, 105.0], "High": [103.0, 104.0, 110.0],
         "Low": [99.0, 98.0, 104.0], "Close": [102.0, 103.0, 106.0]},
        index=idx,
    )
    source = build_pivot_source_table(candles)
    assert list(source["Pivot"]) == ["High Pivot", "Low Pivot"]
    assert source.iloc[0]["Source"] == "Yahoo SPY 60m RTH"
    assert source.iloc[0]["Pivot Price"] == 110.0

    hp = Pivot("HIGH_PIVOT", 110.0, _ts("2026-04-28T15:00:00"), "session_high", "green", False)
    lp = Pivot("LOW_PIVOT", 98.0, _ts("2026-04-28T10:30:00"), "session_low", "red", False)
    projection = build_structure_projection_table(
        build_primary_lines(hp, lp), _ts("2026-04-29T09:00:00"), 112.0, idx[0].date(), idx[0].date()
    )
    assert "UA" not in set(projection["Trigger"])
    assert "Upper Ascending Trigger" in set(projection["Trigger"])
    assert projection[projection["Trigger"] == "Upper Descending Trigger"].iloc[0]["Based On"] == "High Pivot"


def test_primary_anchor_summary() -> None:
    hp = Pivot("HIGH_PIVOT", 110.0, _ts("2026-04-28T15:00:00"), "session_high", "green", False)
    lp = Pivot("LOW_PIVOT", 98.0, _ts("2026-04-28T10:30:00"), "session_low", "red", False)
    summary = get_primary_anchor_summary(build_primary_lines(hp, lp))
    assert summary["high_time"] == _ts("2026-04-28T15:00:00")
    assert summary["high_price"] == 110.0
    assert summary["low_price"] == 98.0


# ---------------------------------------------------------------------------
# Signals (mirrors drdidy/SPYPROST tests/test_signals.py)
# ---------------------------------------------------------------------------

def test_call_rejection_confirmed_and_pending() -> None:
    line = DynamicLine("UD", 100, _ts("2026-04-28T08:00:00"), 0, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "")
    df = _candles([
        ("2026-04-28T10:00:00", 101, 101.5, 99.9, 100.2),
        ("2026-04-28T11:00:00", 100.4, 101, 100, 100.6),
    ])
    assert is_call_rejection(df.iloc[0], line, df.index[0])
    sigs = detect_rejection_signals(df, [line], [])
    assert sigs[0].status == "CONFIRMED"
    assert sigs[0].entry_price == 100.4
    assert sigs[0].stop_price == 99.4

    df2 = _candles([("2026-04-28T10:00:00", 101, 101.5, 99.9, 100.2)])
    pending = detect_rejection_signals(df2, [line], [])
    assert pending[0].status == "PENDING_CONFIRMATION"
    assert pd.isna(pending[0].entry_price)


def test_put_rejection_uses_descending_guard() -> None:
    line = DynamicLine("UA", 100, _ts("2026-04-28T08:00:00"), 0, "ascending", "PUT_ZONE", "PRIMARY_HIGH", True, "")
    desc_guard = DynamicLine("UD", 101, _ts("2026-04-28T08:00:00"), 0, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "")
    df = _candles([
        ("2026-04-28T10:00:00", 99, 100.2, 98.9, 99.8),
        ("2026-04-28T11:00:00", 99.7, 99.9, 99.2, 99.4),
    ])
    assert is_put_rejection(df.iloc[0], line, df.index[0])
    sigs = detect_rejection_signals(df, [line, desc_guard], [])
    assert sigs[0].status == "CONFIRMED"
    assert sigs[0].entry_price == 99.7
    assert sigs[0].stop_price == 100.7


def test_secondary_targets_and_rr() -> None:
    ud = DynamicLine("UD", 100, _ts("2026-04-28T08:00:00"), 0, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "")
    sd = DynamicLine("S_DESC_001", 102, _ts("2026-04-28T08:00:00"), 0, "descending", "TARGET_ONLY", "SECONDARY", False, "")
    su = DynamicLine("S_ASC_001", 99, _ts("2026-04-28T08:00:00"), 0, "ascending", "TARGET_ONLY", "SECONDARY", False, "")
    df = _candles([
        ("2026-04-28T09:00:00", 101, 101.2, 99.9, 100.2),
        ("2026-04-28T10:00:00", 100.5, 100.7, 100.1, 100.3),
    ])
    sigs = detect_rejection_signals(df, [ud], [sd, su])
    assert len(sigs) == 1
    assert sigs[0].target_line_name == "S_DESC_001"

    tn, tp = find_target_for_signal("PUT", "UA", 100, _ts("2026-04-28T10:00:00"), [ud, sd, su])
    assert tn == "S_ASC_001" and tp == 99

    r, rew, rr = calculate_signal_risk_reward("CALL", 100, 99, 102)
    assert r == 1 and rew == 2 and rr == 2
    r3, _, _ = calculate_signal_risk_reward("CALL", float("nan"), 99, 102)
    assert pd.isna(r3)


# ---------------------------------------------------------------------------
# Bias & strikes (mirrors drdidy/SPYPROST tests/test_bias_and_strikes.py)
# ---------------------------------------------------------------------------

def _bias_lines() -> list[DynamicLine]:
    anc = _ts("2026-04-28T08:00:00")
    return [
        DynamicLine("UA", 100.005, anc, 0.0, "ascending", "PUT_ZONE", "PRIMARY_HIGH", True, ""),
        DynamicLine("UD", 99.995, anc, 0.0, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, ""),
        DynamicLine("LA", 95.0, anc, 0.0, "ascending", "PUT_ZONE", "PRIMARY_LOW", True, ""),
        DynamicLine("LD", 94.0, anc, 0.0, "descending", "CALL_ZONE", "PRIMARY_LOW", True, ""),
    ]


def test_get_line_by_name_lookup() -> None:
    lines = _bias_lines()
    assert get_line_by_name(lines, "UA") is not None
    assert get_line_by_name(lines, "ZZ") is None


def test_bullish_preopen() -> None:
    b = determine_preopen_bias(_bias_lines(), 101.0, _ts("2026-04-29T08:30:00"))
    assert b.bias == "BULLISH"
    assert set(b.watched_call_lines) == {"UD", "LD"}
    assert b.watched_put_lines == []
    assert b.primary_line == "UD"
    s = select_0dte_strikes(101.0, _ts("2026-04-29T08:30:00"))
    assert format_watch_contract(s, bias_state=b) == "WATCH CALL 103"


def test_neutral_preopen() -> None:
    b = determine_preopen_bias(_bias_lines(), 100.0, _ts("2026-04-29T08:30:00"))
    assert b.bias == "NEUTRAL"
    assert set(b.watched_call_lines) == {"LD"}
    assert b.final_take_profit_line == "LA"


def test_regular_session_mode() -> None:
    b = determine_preopen_bias(_bias_lines(), 101.0, _ts("2026-04-29T09:00:00"))
    assert b.bias == "REGULAR_SESSION"


def test_bias_strength_bounds() -> None:
    assert 0 <= calculate_bias_strength(110, 100, 99, "BULLISH") <= 100
    assert 0 <= calculate_bias_strength(90, 100, 99, "BEARISH") <= 100
    assert calculate_bias_strength(float("nan"), 1, 2, "BULLISH") == 0


def test_strike_selection_two_points_otm() -> None:
    s = select_0dte_strikes(712.61, _ts("2026-04-29T08:30:00"))
    assert s.call_strike == 715
    assert s.put_strike == 711
    s2 = select_0dte_strikes(717.85, _ts("2026-04-29T08:30:00"))
    assert s2.call_strike == 720 and s2.put_strike == 716


def test_invalid_price_warning() -> None:
    s = select_0dte_strikes(float("nan"), _ts("2026-04-29T08:30:00"))
    assert s.warning is not None


def test_watch_contracts_use_pending_signal_trigger_price() -> None:
    lines = _bias_lines()
    sig = TradeSignal(
        "p", "PUT", "PENDING_CONFIRMATION", "UA", 100, _ts("2026-04-29T10:00:00"),
        0, 0, 0, 0, None, float("nan"), 0, None, float("nan"), 0, 0, 0, "", "",
    )
    s = select_watch_contracts(96.0, _ts("2026-04-29T10:00:00"), sig, lines)
    assert get_contract_watch_price(96.0, _ts("2026-04-29T10:00:00"), sig, lines) == 100.0
    assert s.put_strike == 98
    assert format_watch_contract(s, sig) == "WATCH PUT 98"


def test_flow_aware_contracts_use_nearby_otm_flow_not_far_chase() -> None:
    options = OptionsIntelligence(
        SourceStatus("Options intelligence", "connected", ""),
        1, 1, 718, 724, 715, [],
        unusual_whales={
            "flow_alerts": {
                "flow_bias": "Bullish flow",
                "largest_alerts": [
                    {"type": "CALL", "strike": 724, "premium": 900000},
                    {"type": "CALL", "strike": 720, "premium": 250000},
                    {"type": "PUT", "strike": 716, "premium": 220000},
                ],
                "key_strikes": [],
            }
        },
    )
    s = select_flow_aware_watch_contracts(717.85, _ts("2026-04-29T09:00:00"), options_intel=options)
    assert s.call_strike == 720
    assert s.put_strike == 716


def test_flow_alignment_warns_when_pressure_conflicts_with_watch_side() -> None:
    options = OptionsIntelligence(
        SourceStatus("Options intelligence", "connected", ""),
        1, 1, 718, 724, 715, [],
        unusual_whales={"flow_alerts": {"flow_bias": "Bearish flow"}, "market_tide": {"tone": "Risk-off options tide"}},
    )
    read = premium_flow_alignment(options, "CALL")
    assert read["state"] == "opposes"
    assert "Caution for call setup" in read["title"]


# ---------------------------------------------------------------------------
# Decision quality (mirrors drdidy/SPYPROST tests/test_decision_quality.py)
# ---------------------------------------------------------------------------

def _sig(sig_type: str = "CALL", status: str = "CONFIRMED", rr: float = 2.1, close: float = 100.1, line: float = 100.0, target: float = 102.0, entry: float = 100.5) -> TradeSignal:
    return TradeSignal(
        "id", sig_type, status, "UD" if sig_type == "CALL" else "UA", line,
        _ts("2026-04-28T10:00:00"), 101, 101.5, 99.8, close,
        _ts("2026-04-28T11:00:00") if status == "CONFIRMED" else None,
        entry if status == "CONFIRMED" else float("nan"),
        99.3 if sig_type == "CALL" else 101.7,
        "T" if not pd.isna(target) else None, target,
        1, 1, rr, "be", "x",
    )


def test_wick_metrics_call_put() -> None:
    c = _sig("CALL")
    m = calculate_wick_rejection_metrics(c)
    assert m["candle_range"] == 1.7 and m["wick_penetration"] == 0.2
    p = _sig("PUT", close=101.2, line=101.0, target=99.0, entry=100.5)
    mp = calculate_wick_rejection_metrics(p)
    assert mp["candle_range"] == 1.7 and mp["wick_penetration"] == 0.5


def test_quality_warnings_and_strengths() -> None:
    q1 = score_signal_quality(_sig(close=102.2))
    assert "CLOSE_TOO_FAR_FROM_LINE" in q1.warnings
    q2 = score_signal_quality(_sig(close=99.81, rr=0.8))
    assert "VERY_WEAK_REJECTION" in q2.warnings and "POOR_RISK_REWARD" in q2.warnings
    q3 = score_signal_quality(_sig(rr=2.2, close=100.9))
    assert "GOOD_RISK_REWARD" in q3.strengths
    q4 = score_signal_quality(_sig(target=float("nan")))
    assert "NO_STRUCTURAL_TARGET" in q4.warnings and q4.target_quality == "NO_TARGET"


def test_target_too_close_and_pending() -> None:
    q = score_signal_quality(_sig(target=100.8, entry=100.5))
    assert "TARGET_TOO_CLOSE" in q.warnings
    qp = score_signal_quality(_sig(status="PENDING_CONFIRMATION"))
    assert "WAIT_FOR_NEXT_CANDLE_OPEN" in qp.warnings and qp.action_label == "WAIT_FOR_CONFIRMATION"


def test_structure_call_put_and_chase() -> None:
    line = DynamicLine("UD", 100, _ts("2026-04-28T08:00:00"), 0, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "")
    intact = evaluate_structure_status(_sig("CALL"), pd.Series({"Close": 100.0}), line, _ts("2026-04-28T12:00:00"))
    broken = evaluate_structure_status(_sig("CALL"), pd.Series({"Close": 99.9}), line, _ts("2026-04-28T12:00:00"))
    assert intact["structure_status"] == "INTACT"
    assert broken["structure_status"] == "BROKEN"
    assert evaluate_chase_status(_sig("CALL"), 101.0)["chase_status"] == "MISSED_ENTRY"


def test_decision_priority_and_daily_guardrail() -> None:
    d0 = build_decision_state(None, [], float("nan"), _ts("2026-04-28T12:00:00"), None, [])
    assert d0.final_decision == "WAIT"
    line = DynamicLine("UD", 100, _ts("2026-04-28T08:00:00"), 0, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "")
    dp = build_decision_state(_sig(status="PENDING_CONFIRMATION"), [line], 100.1, _ts("2026-04-28T12:00:00"), pd.Series({"Close": 100.2}), [])
    assert dp.final_decision == "WAIT_FOR_CONFIRMATION"
    stop = evaluate_daily_risk([_sig(), _sig(), _sig()], [score_signal_quality(_sig())], max_signals_per_day=3)
    assert stop["daily_action"] == "STOP_TRADING"


def test_wait_discipline_items_match_streamlit_labels() -> None:
    line = DynamicLine("UD", 100, _ts("2026-04-28T08:00:00"), 0, "descending", "CALL_ZONE", "PRIMARY_HIGH", True, "")
    pending = _sig(status="PENDING_CONFIRMATION")
    decision = build_decision_state(pending, [line], 100.1, _ts("2026-04-28T10:30:00"), pd.Series({"Close": 100.2}), [])
    strikes = SelectedStrikes(100.0, 102, 98, _ts("2026-04-28").date(), "0DTE", None)
    items = build_wait_discipline_items(decision, pending, line, strikes, _ts("2026-04-28T10:30:00"))
    assert [item["label"] for item in items] == ["Candle Gate", "Chase Guard", "Contract Guard"]
    assert items[0]["value"] == "Open 11:00 AM CDT"
    assert items[1]["value"] == "No early entry"
    assert items[2]["value"] == "Call OTM"


# ---------------------------------------------------------------------------
# Display / format helpers (mirrors drdidy/SPYPROST tests/test_ui_format_helpers.py)
# ---------------------------------------------------------------------------

def test_fmt_helpers() -> None:
    assert fmt_price(1.234) == "1.23"
    assert fmt_nan(float("nan")) == "-"
    assert fmt_nan(pd.NA) == "-"


def test_safe_to_dict_redacts_secrets() -> None:
    d = safe_to_dict({"access_token": "abc", "x": 1})
    assert d["access_token"] == "[REDACTED]"


def test_display_anchor_source_uses_pivot_price() -> None:
    line = DynamicLine("UA", 719.78, None, 0.103, "ascending", "PUT_ZONE", "PRIMARY_HIGH", True, "")
    assert display_anchor_source(line) == "High pivot 719.78"


def test_display_line_names_are_product_facing() -> None:
    assert display_line_name("UA") == "Upper Ascending Trigger"
    assert display_line_name("UD") == "Upper Descending Trigger"
    assert display_line_name("S DESC 002") == "Upper Target"
    assert display_line_description("LA") == "Ascending structure from the low pivot; entry trigger only in bearish structure"
    assert display_line_list(["UD", "UA"]) == "Upper Descending Trigger, Upper Ascending Trigger"


def test_display_state_labels_hide_internal_enums() -> None:
    assert display_state_label("REGULAR_SESSION") == "Session watch"
    assert display_state_label("WAIT_FOR_CONFIRMATION") == "Wait for confirmation"
    assert display_state_label("YFINANCE_FALLBACK") == "Delayed quotes"
    assert display_state_label("unavailable") == "Needs data"
    assert display_state_label("connected") == "Connected"
