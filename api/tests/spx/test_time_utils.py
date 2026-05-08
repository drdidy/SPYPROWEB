"""Time / session window helpers."""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from _lib.spx.time_utils import (
    hours_between,
    overnight_window,
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


def test_session_date_ct_before_2am_belongs_to_prior_session():
    # 01:30 CT on Friday morning -> still part of Thursday's session.
    dt = datetime(2026, 5, 8, 1, 30, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 7)


def test_session_date_ct_walks_back_over_weekends():
    # Saturday early morning -> session is the Friday that just ended.
    dt = datetime(2026, 5, 9, 4, 0, tzinfo=CT)
    assert session_date_ct(dt) == date(2026, 5, 8)


def test_previous_session_date_skips_weekend():
    # Monday's prior trading day is Friday, not Sunday.
    monday = date(2026, 5, 11)
    assert previous_session_date(monday) == date(2026, 5, 8)


def test_overnight_window_spans_15h_prev_to_midnight_today():
    """Overnight anchor window is 15:00 prev-day -> 00:00 today (midnight).
    Tokyo bars after midnight are still used for direction determination
    but NOT for anchor scanning."""
    w = overnight_window(date(2026, 5, 8))
    assert w.start == datetime(2026, 5, 7, 15, 0, tzinfo=CT)
    assert w.end == datetime(2026, 5, 8, 0, 0, tzinfo=CT)


def test_sydney_and_tokyo_windows_align():
    sd = date(2026, 5, 8)
    s = sydney_window(sd)
    t = tokyo_window(sd)
    assert s.end == t.start  # Sydney 21:00 hands off to Tokyo
    assert s.start.time() == time(17, 0)
    assert t.end == datetime(2026, 5, 8, 2, 0, tzinfo=CT)


def test_rth_window_is_8_30_to_15():
    w = rth_window(date(2026, 5, 8))
    assert w.start == datetime(2026, 5, 8, 8, 30, tzinfo=CT)
    assert w.end == datetime(2026, 5, 8, 15, 0, tzinfo=CT)


def test_hours_between_signed():
    a = datetime(2026, 5, 8, 9, 0, tzinfo=CT)
    b = datetime(2026, 5, 8, 12, 30, tzinfo=CT)
    assert hours_between(a, b) == 3.5
    assert hours_between(b, a) == -3.5
