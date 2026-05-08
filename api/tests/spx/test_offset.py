"""ES -> SPX offset arithmetic."""
from datetime import datetime
from zoneinfo import ZoneInfo

from _lib.spx.candles import Candle
from _lib.spx.offset import (
    apply_offset,
    apply_offset_to_candle,
    apply_offset_to_series,
    derive_offset,
)


CT = ZoneInfo("America/Chicago")


def test_apply_offset_scalar():
    assert apply_offset(5860.0, 12.0) == 5872.0
    assert apply_offset(5860.0, -3.0) == 5857.0


def test_apply_offset_to_candle_shifts_ohlc_only():
    c = Candle(t=datetime(2026, 5, 7, 10, tzinfo=CT), o=5860.0, h=5862.0, l=5858.0, c=5861.0, v=1000.0)
    shifted = apply_offset_to_candle(c, 12.0)
    assert shifted.o == 5872.0
    assert shifted.h == 5874.0
    assert shifted.l == 5870.0
    assert shifted.c == 5873.0
    # Volume must not move; timestamp is identity.
    assert shifted.v == 1000.0
    assert shifted.t == c.t


def test_apply_offset_to_series_preserves_length():
    series = [
        Candle(t=datetime(2026, 5, 7, h, tzinfo=CT), o=5860.0, h=5862.0, l=5858.0, c=5861.0)
        for h in range(8, 14)
    ]
    shifted = apply_offset_to_series(series, 12.0)
    assert len(shifted) == len(series)
    assert all(s.c - orig.c == 12.0 for s, orig in zip(shifted, series))


def test_derive_offset_from_synced_print():
    assert derive_offset(spx_spot=5872.50, es_spot=5860.50) == 12.0
