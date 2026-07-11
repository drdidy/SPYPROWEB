"""Time/zone helpers for the SPX engine.

The methodology is anchored to America/Chicago. Every helper here either
returns a CT-aware datetime or operates on one. Naive datetimes are
treated as already CT-anchored (caller's responsibility to be honest).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .constants import (
    CENTRAL_TZ_NAME,
    OVERNIGHT_END,
    OVERNIGHT_START,
    RTH_END,
    RTH_START,
    SESSION_BOUNDARY,
    SYDNEY_END,
    SYDNEY_START,
    TOKYO_END,
    TOKYO_START,
)

CT = ZoneInfo(CENTRAL_TZ_NAME)

NYSE_HOLIDAYS_2026 = {
    date(2026, 1, 1),
    date(2026, 1, 19),
    date(2026, 2, 16),
    date(2026, 4, 3),
    date(2026, 5, 25),
    date(2026, 6, 19),
    date(2026, 7, 3),
    date(2026, 9, 7),
    date(2026, 11, 26),
    date(2026, 12, 25),
}

ES_EARLY_CLOSES_CT_2026 = {
    # Cash equities were closed for Memorial Day 2026, but ES printed a
    # shortened Globex session before the evening reopen.
    date(2026, 5, 25): time(12, 0),
}


def is_trading_session_date(d: date) -> bool:
    return d.weekday() < 5 and d not in NYSE_HOLIDAYS_2026


def next_session_date(d: date) -> date:
    nxt = d + timedelta(days=1)
    while not is_trading_session_date(nxt):
        nxt = nxt + timedelta(days=1)
    return nxt


def next_futures_session_date(d: date) -> date:
    """Next ES session date, skipping weekends but not cash holidays."""
    nxt = d + timedelta(days=1)
    while nxt.weekday() >= 5:
        nxt = nxt + timedelta(days=1)
    return nxt


def to_ct(dt: datetime) -> datetime:
    """Coerce a datetime to CT. Naive input is assumed already CT."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=CT)
    return dt.astimezone(CT)


def session_date_ct(dt: datetime) -> date:
    """The CT calendar date the SPX session belongs to.

    For a `dt` between 00:00 and 02:00 CT we still belong to the *prior*
    trading day's overnight (London hasn't opened yet). For anything else
    the session is dt.date(). Weekend handling: if the resulting date is
    Sat/Sun we walk back to Friday — the engine treats Mon-Fri as the only
    valid session days.
    """
    dt = to_ct(dt)
    d = dt.date()
    early_close = ES_EARLY_CLOSES_CT_2026.get(d)
    if d in NYSE_HOLIDAYS_2026 and early_close is not None and dt.time() >= early_close:
        return next_futures_session_date(d)
    if dt.time() >= OVERNIGHT_START:
        if d.weekday() < 4 or d.weekday() == 6:
            d = next_futures_session_date(d)
    # Walk back over weekends. ES has no Saturday session.
    while d.weekday() >= 5:  # 5=Sat, 6=Sun
        d = d - timedelta(days=1)
    return d


def previous_session_date(d: date) -> date:
    """Most recent prior trading day (skip weekends and market holidays)."""
    prev = d - timedelta(days=1)
    while not is_trading_session_date(prev):
        prev = prev - timedelta(days=1)
    return prev


def previous_futures_session_date(d: date) -> date:
    """Most recent prior ES session date.

    ES can print useful bars on U.S. cash-market holidays. Skip weekends only;
    callers that need a real anchor should still verify that bars exist.
    """
    prev = d - timedelta(days=1)
    while prev.weekday() >= 5:
        prev = prev - timedelta(days=1)
    return prev


def at_ct(d: date, t: time) -> datetime:
    """Combine a date and a naive time into a CT-aware datetime."""
    return datetime.combine(d, t, tzinfo=CT)


@dataclass(frozen=True)
class SessionWindow:
    start: datetime
    end: datetime

    def contains(self, dt: datetime) -> bool:
        dt = to_ct(dt)
        return self.start <= dt < self.end


def overnight_window(session_date: date) -> SessionWindow:
    """15:00 prev-day -> 02:00 today CT."""
    prev = previous_futures_session_date(session_date)
    return SessionWindow(at_ct(prev, OVERNIGHT_START), at_ct(session_date, OVERNIGHT_END))


def sydney_window(session_date: date) -> SessionWindow:
    """17:00 -> 21:00 CT, on the prior calendar day relative to session_date."""
    prev = previous_futures_session_date(session_date)
    return SessionWindow(at_ct(prev, SYDNEY_START), at_ct(prev, SYDNEY_END))


def tokyo_window(session_date: date) -> SessionWindow:
    """21:00 prev-day -> 02:00 today CT (crosses midnight)."""
    prev = previous_futures_session_date(session_date)
    return SessionWindow(at_ct(prev, TOKYO_START), at_ct(session_date, TOKYO_END))


def rth_window(session_date: date) -> SessionWindow:
    """08:30 -> 15:00 CT on the session date."""
    return SessionWindow(at_ct(session_date, RTH_START), at_ct(session_date, RTH_END))


def hours_between(a: datetime, b: datetime) -> float:
    """Signed CT wall-clock hours from a to b."""
    a_ct = to_ct(a).replace(tzinfo=None)
    b_ct = to_ct(b).replace(tzinfo=None)
    return (b_ct - a_ct).total_seconds() / 3600.0


def es_trading_hours_between(a: datetime, b: datetime) -> float:
    """Signed ES trading hours between two CT times.

    The Control Map slope follows the ES futures clock, not calendar time.
    Count regular Globex trading hours and skip the daily 16:00-17:00 CT
    maintenance break plus the weekend closure from Friday 16:00 to Sunday
    17:00. Market holidays still count when Globex is trading.
    """
    a_ct = to_ct(a).replace(tzinfo=None)
    b_ct = to_ct(b).replace(tzinfo=None)
    if a_ct == b_ct:
        return 0.0
    if b_ct < a_ct:
        return -es_trading_hours_between(b_ct.replace(tzinfo=CT), a_ct.replace(tzinfo=CT))

    total = 0.0
    current_day = a_ct.date()
    while current_day <= b_ct.date():
        for start_t, end_t in _es_open_windows_for_day(current_day):
            start = datetime.combine(current_day, start_t)
            end = (
                datetime.combine(current_day + timedelta(days=1), time(0, 0))
                if end_t is None
                else datetime.combine(current_day, end_t)
            )
            overlap_start = max(a_ct, start)
            overlap_end = min(b_ct, end)
            if overlap_end > overlap_start:
                total += (overlap_end - overlap_start).total_seconds() / 3600.0
        current_day = current_day + timedelta(days=1)
    return total


def next_es_candle_open(candle_open: datetime, hours: int = 1) -> datetime:
    """Next hourly ES candle open after `candle_open`.

    On normal days this is usually +1 hour. On maintenance breaks, weekend
    closures, and holiday halts it advances to the next valid ES open.
    """
    candidate = to_ct(candle_open).replace(minute=0, second=0, microsecond=0) + timedelta(hours=hours)
    for _ in range(24 * 7):
        if _is_es_open_time(candidate):
            return candidate
        candidate = candidate + timedelta(hours=1)
    return candidate


def _es_open_windows_for_day(d: date) -> list[tuple[time, time | None]]:
    weekday = d.weekday()
    if weekday == 5:
        return []
    if weekday == 6:
        return [(time(17, 0), None)]
    early_close = ES_EARLY_CLOSES_CT_2026.get(d)
    if early_close is not None:
        return [
            (time(0, 0), early_close),
            (time(17, 0), None),
        ]
    if weekday == 4:
        return [(time(0, 0), time(16, 0))]
    return [
        (time(0, 0), time(16, 0)),
        (time(17, 0), None),
    ]


def _is_es_open_time(dt: datetime) -> bool:
    dt_ct = to_ct(dt).replace(tzinfo=None)
    day = dt_ct.date()
    for start_t, end_t in _es_open_windows_for_day(day):
        start = datetime.combine(day, start_t)
        end = (
            datetime.combine(day + timedelta(days=1), time(0, 0))
            if end_t is None
            else datetime.combine(day, end_t)
        )
        if start <= dt_ct < end:
            return True
    return False
