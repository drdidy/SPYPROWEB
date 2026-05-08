"""Candle dataclass + windowing helpers.

The engine expects ES hourly bars in. Times must be CT-aware (or the
caller treats naive as CT — see time_utils.to_ct).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Sequence

from .time_utils import SessionWindow, to_ct


@dataclass(frozen=True)
class Candle:
    """OHLC bar. `t` is the *bar open* timestamp."""

    t: datetime
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0


def in_window(candles: Iterable[Candle], window: SessionWindow) -> list[Candle]:
    """Filter candles whose open timestamp falls within the window."""
    return [c for c in candles if window.contains(to_ct(c.t))]


def range_high_low(candles: Sequence[Candle]) -> tuple[float, float, datetime, datetime] | None:
    """Return (raw high, raw low, time-of-high, time-of-low) over the candles.

    Uses bar wicks (h, l). For ties the *first* occurrence wins. Returns
    None for empty input.
    """
    if not candles:
        return None
    hi_c = max(candles, key=lambda c: c.h)
    lo_c = min(candles, key=lambda c: c.l)
    return hi_c.h, lo_c.l, to_ct(hi_c.t), to_ct(lo_c.t)


def range_high_low_close(candles: Sequence[Candle]) -> tuple[float, float, datetime, datetime] | None:
    """Return (highest close, lowest close, time-of-high, time-of-low).

    Uses bar closes (c) instead of wicks. For ties the *first* occurrence
    wins. Returns None for empty input.
    """
    if not candles:
        return None
    hi_c = max(candles, key=lambda c: c.c)
    lo_c = min(candles, key=lambda c: c.c)
    return hi_c.c, lo_c.c, to_ct(hi_c.t), to_ct(lo_c.t)
