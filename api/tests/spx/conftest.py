"""Shared fixtures for the SPX engine + data tests.

Builds a self-consistent INSIDE_ASCENDING demo session. Tokyo prints
HH+HL vs Sydney; overnight close anchors at 23:00 (highest close) and
17:00 (lowest close) per the methodology spec.
"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from _lib.spx.candles import Candle

CT = ZoneInfo("America/Chicago")
TEST_OFFSET = 12.0  # SPX = ES + 12.0


def _bar(
    ts: datetime,
    *,
    o: float,
    c: float,
    h: float | None = None,
    l: float | None = None,
) -> Candle:
    """Build an SPX-equivalent bar; subtract TEST_OFFSET to make it ES."""
    h = h if h is not None else max(o, c)
    l = l if l is not None else min(o, c)
    return Candle(
        t=ts,
        o=o - TEST_OFFSET,
        h=h - TEST_OFFSET,
        l=l - TEST_OFFSET,
        c=c - TEST_OFFSET,
    )


@pytest.fixture
def es_candles_ascending_inside() -> list[Candle]:
    """Two-day series: prev day RTH + Sydney + Tokyo + London + today open.

    Tuned so:
      Sydney  17:00-20:00 (window EXCLUDES 20:00):
        HH 5862.10 (in 19:00 bar)
        LL 5848.20 (in 17:00 bar)
      Tokyo   21:00-03:00 (window includes 21:00..02:00):
        HH 5872.40 (>5862.10) -> HH
        LL 5853.20 (>5848.20) -> HL
        => ASCENDING channel.

      Overnight anchor window 15:00 prev -> 03:00 today:
        Highest CLOSE 5870.00 at 23:00 (Tokyo bar)
        Lowest  CLOSE 5850.00 at 17:00 (Sydney first bar)

      Prev RTH high (raw):  5878.50 at 13:00
      Prev RTH low  (raw):  5849.00 at 09:00
    """
    prev_day = datetime(2026, 5, 7, tzinfo=CT)
    bars: list[Candle] = []

    # Prev RTH hourly bars 08:00..14:00.
    bars.append(_bar(prev_day.replace(hour=8), o=5851.00, c=5852.00))
    bars.append(_bar(prev_day.replace(hour=9), o=5852.00, c=5849.50, h=5853.00, l=5849.00))
    bars.append(_bar(prev_day.replace(hour=10), o=5849.50, c=5860.00))
    bars.append(_bar(prev_day.replace(hour=11), o=5860.00, c=5867.00))
    bars.append(_bar(prev_day.replace(hour=12), o=5867.00, c=5874.00))
    bars.append(_bar(prev_day.replace(hour=13), o=5874.00, c=5876.00, h=5878.50, l=5873.00))
    bars.append(_bar(prev_day.replace(hour=14), o=5876.00, c=5870.00))

    # Pre-Sydney pad.
    bars.append(_bar(prev_day.replace(hour=15), o=5870.00, c=5860.00))
    bars.append(_bar(prev_day.replace(hour=16), o=5860.00, c=5852.00))

    # Sydney 17:00..20:00 (window excludes 20:00). HH lives in 19:00 bar.
    bars.append(_bar(prev_day.replace(hour=17), o=5852.00, c=5850.00, h=5854.00, l=5848.20))  # SYD low
    bars.append(_bar(prev_day.replace(hour=18), o=5850.00, c=5856.00))
    bars.append(_bar(prev_day.replace(hour=19), o=5856.00, c=5858.00, h=5862.10, l=5855.00))  # SYD high
    # 20:00 bar sits in the gap between Sydney and Tokyo windows. Still
    # part of overnight anchor scanning; excluded from direction calc.
    bars.append(_bar(prev_day.replace(hour=20), o=5858.00, c=5860.00))

    # Tokyo 21:00..02:00 (window extends to 03:00 exclusive).
    bars.append(_bar(prev_day.replace(hour=21), o=5860.00, c=5855.00, h=5860.50, l=5853.20))  # TKY low
    bars.append(_bar(prev_day.replace(hour=22), o=5855.00, c=5865.00))
    bars.append(_bar(prev_day.replace(hour=23), o=5865.00, c=5870.00, h=5872.40, l=5864.00))  # TKY high

    today = datetime(2026, 5, 8, tzinfo=CT)
    # 00:00..02:00 — Tokyo's late hours, also inside the anchor window.
    bars.append(_bar(today.replace(hour=0), o=5870.00, c=5868.00))
    bars.append(_bar(today.replace(hour=1), o=5868.00, c=5867.00))
    bars.append(_bar(today.replace(hour=2), o=5867.00, c=5866.00))

    # London 03:00..07:00 — past the anchor window, holds inside channel.
    bars.append(_bar(today.replace(hour=3), o=5866.00, c=5867.00))
    bars.append(_bar(today.replace(hour=4), o=5867.00, c=5868.50))
    bars.append(_bar(today.replace(hour=5), o=5868.50, c=5869.00))
    bars.append(_bar(today.replace(hour=6), o=5869.00, c=5870.50))
    bars.append(_bar(today.replace(hour=7), o=5870.50, c=5871.00))

    # Today 08:00 + 09:00 (open).
    bars.append(_bar(today.replace(hour=8), o=5871.00, c=5871.50))
    bars.append(_bar(today.replace(hour=9), o=5871.50, c=5872.00, h=5873.00, l=5871.00))

    return bars


@pytest.fixture
def es_offset() -> float:
    return TEST_OFFSET


@pytest.fixture
def as_of() -> datetime:
    """09:35 CT on session date — 5 minutes into RTH."""
    return datetime(2026, 5, 8, 9, 35, tzinfo=CT)


@pytest.fixture
def session_date() -> date:
    return date(2026, 5, 8)
