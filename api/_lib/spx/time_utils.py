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
    if d.weekday() == 6 and dt.time() >= OVERNIGHT_START:
        return d + timedelta(days=1)
    # Walk back over weekends. SPX cash doesn't trade Sat/Sun.
    while d.weekday() >= 5:  # 5=Sat, 6=Sun
        d = d - timedelta(days=1)
    return d


def previous_session_date(d: date) -> date:
    """Most recent prior trading day (skip weekends)."""
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
    prev = previous_session_date(session_date)
    return SessionWindow(at_ct(prev, OVERNIGHT_START), at_ct(session_date, OVERNIGHT_END))


def sydney_window(session_date: date) -> SessionWindow:
    """17:00 -> 21:00 CT, on the prior calendar day relative to session_date."""
    prev = previous_session_date(session_date)
    return SessionWindow(at_ct(prev, SYDNEY_START), at_ct(prev, SYDNEY_END))


def tokyo_window(session_date: date) -> SessionWindow:
    """21:00 prev-day -> 02:00 today CT (crosses midnight)."""
    prev = previous_session_date(session_date)
    return SessionWindow(at_ct(prev, TOKYO_START), at_ct(session_date, TOKYO_END))


def rth_window(session_date: date) -> SessionWindow:
    """08:30 -> 15:00 CT on the session date."""
    return SessionWindow(at_ct(session_date, RTH_START), at_ct(session_date, RTH_END))


def hours_between(a: datetime, b: datetime) -> float:
    """Signed CT wall-clock hours from a to b."""
    a_ct = to_ct(a).replace(tzinfo=None)
    b_ct = to_ct(b).replace(tzinfo=None)
    return (b_ct - a_ct).total_seconds() / 3600.0
