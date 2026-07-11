"""Time / session window helpers."""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from _lib.spx.time_utils import (
    es_trading_hours_between,
    hours_between,
    next_es_candle_open,
    overnight_window,
    previous_futures_session_date,
    previous_session_date,
    rth_window,
    session_date_ct,
    sydney_window,
    to_ct,
    tokyo_window,
)


CT = ZoneInfo("America/Chicago")


def test_to_ct_naive_treated_as_central():
    naive = datetime(2026, 5, 7, 13, 0)
    aware = to_ct(naive)
    assert aware.tzinfo is not None
    assert aware.utcoffset() == datetime(2026, 5, 7, 13, 0, tzinfo=CT).utcoffset()


def test_session_date_ct_after_2am_is_today():
    # 09:35 CT on Friday -> session date is Friday.
    dt = datetime(2026, 5, 8, 9, 35, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 8)


def test_session_date_ct_before_boundary_belongs_to_rth_session_date():
    # Tokyo crosses midnight into the Friday RTH session.
    dt = datetime(2026, 5, 8, 1, 30, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 8)


def test_sunday_evening_belongs_to_monday_session():
    dt = datetime(2026, 5, 10, 18, 0, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 11)


def test_weekday_evening_belongs_to_next_futures_session():
    dt = datetime(2026, 5, 25, 18, 0, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 26)


def test_holiday_after_early_halt_moves_to_next_session():
    for hour in (12, 13, 16):
        dt = datetime(2026, 5, 25, hour, 0, tzinfo=CT)
        assert session_date_ct(dt) == date(2026, 5, 26)


def test_regular_day_after_noon_stays_same_session():
    dt = datetime(2026, 5, 26, 13, 0, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 26)


def test_holiday_evening_reopen_belongs_to_next_futures_session():
    dt = datetime(2026, 5, 25, 17, 0, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 26)


def test_session_date_ct_walks_back_over_weekends():
    # Saturday early morning -> session is the Friday that just ended.
    dt = datetime(2026, 5, 9, 4, 0, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 8)


def test_previous_session_date_skips_weekend():
    # Monday's prior trading day is Friday, not Sunday.
    monday = date(2026, 5, 11)
    assert previous_session_date(monday) == date(2026, 5, 8)


def test_session_date_ct_keeps_market_holiday_for_live_futures_map():
    memorial_day = datetime(2026, 5, 25, 8, 0, tzinfo=CT)
    assert session_date_ct(memorial_day) == date(2026, 5, 25)


def test_previous_session_date_skips_market_holiday():
    assert previous_session_date(date(2026, 5, 26)) == date(2026, 5, 22)


def test_previous_futures_session_date_keeps_market_holiday():
    assert previous_futures_session_date(date(2026, 5, 26)) == date(2026, 5, 25)


def test_overnight_window_spans_prev_day_to_session_boundary():
    """Overnight anchor window is 15:00 prev-day -> session boundary today."""
    w = overnight_window(date(2026, 5, 8))
    assert w.start == datetime(2026, 5, 7, 15, 0, tzinfo=CT)
    assert w.end == datetime(2026, 5, 8, 2, 0, tzinfo=CT)


def test_sydney_and_tokyo_windows_have_one_hour_gap():
    """Sydney 17:00-20:00, Tokyo 21:00-03:00 — there's a 1h gap
    (20:00-21:00) where bars are still inside the overnight anchor
    window but excluded from direction determination."""
    sd = date(2026, 5, 8)
    s = sydney_window(sd)
    t = tokyo_window(sd)
    assert s.start == datetime(2026, 5, 7, 17, 0, tzinfo=CT)
    assert s.end == datetime(2026, 5, 7, 20, 0, tzinfo=CT)
    assert t.start == datetime(2026, 5, 7, 21, 0, tzinfo=CT)
    assert t.end == datetime(2026, 5, 8, 2, 0, tzinfo=CT)
    # Hour-gap between Sydney close and Tokyo open is real.
    assert (t.start - s.end).total_seconds() == 3600


def test_rth_window_is_8_30_to_15():
    w = rth_window(date(2026, 5, 8))
    assert w.start == datetime(2026, 5, 8, 8, 30, tzinfo=CT)
    assert w.end == datetime(2026, 5, 8, 15, 0, tzinfo=CT)


def test_hours_between_signed():
    a = datetime(2026, 5, 8, 9, 0, tzinfo=CT)
    b = datetime(2026, 5, 8, 12, 30, tzinfo=CT)
    assert hours_between(a, b) == 3.5
    assert hours_between(b, a) == -3.5


def test_hours_between_uses_ct_wall_clock_across_dst():
    a = datetime(2026, 3, 8, 1, 0, tzinfo=CT)
    b = datetime(2026, 3, 8, 3, 0, tzinfo=CT)
    assert hours_between(a, b) == 2.0


def test_es_trading_hours_skip_weekend_closure():
    friday_pivot = datetime(2026, 5, 22, 10, 0, tzinfo=CT)
    monday_entry = datetime(2026, 5, 25, 9, 0, tzinfo=CT)
    assert es_trading_hours_between(friday_pivot, monday_entry) == 22.0
    assert es_trading_hours_between(monday_entry, friday_pivot) == -22.0


def test_es_trading_hours_skip_memorial_day_midday_halt():
    monday_pivot = datetime(2026, 5, 25, 9, 0, tzinfo=CT)
    tuesday_entry = datetime(2026, 5, 26, 9, 0, tzinfo=CT)
    assert es_trading_hours_between(monday_pivot, tuesday_entry) == 19.0


def test_next_es_candle_open_skips_memorial_day_midday_halt():
    candle = datetime(2026, 5, 25, 11, 0, tzinfo=CT)
    assert next_es_candle_open(candle) == datetime(2026, 5, 25, 17, 0, tzinfo=CT)


def test_es_trading_hours_skip_daily_maintenance_break():
    start = datetime(2026, 5, 21, 15, 0, tzinfo=CT)
    end = datetime(2026, 5, 21, 18, 0, tzinfo=CT)
    assert es_trading_hours_between(start, end) == 2.0


def test_next_es_candle_open_skips_daily_maintenance_break():
    candle = datetime(2026, 5, 21, 15, 0, tzinfo=CT)
    assert next_es_candle_open(candle) == datetime(2026, 5, 21, 17, 0, tzinfo=CT)


def test_es_trading_hours_count_sunday_evening():
    start = datetime(2026, 5, 24, 16, 0, tzinfo=CT)
    end = datetime(2026, 5, 24, 20, 0, tzinfo=CT)
    assert es_trading_hours_between(start, end) == 3.0
