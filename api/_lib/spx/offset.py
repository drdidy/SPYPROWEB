"""ES -> SPX offset application.

We pull ES (E-mini S&P futures) hourly bars; the methodology operates on
SPX-equivalent prices. The conversion is a single offset:

    spx_price = es_price + offset

The offset captures the futures basis (dividends carried by SPX cash that
ES does not pay, plus financing). For an active contract month it drifts
slowly through the day; for a single session a fixed offset is acceptable.

Callers compute the offset upstream from a synchronized SPX-cash / ES
print and pass it in.
"""
from __future__ import annotations

from dataclasses import replace

from .candles import Candle


def apply_offset(es_price: float, offset: float) -> float:
    """Convert one ES price to its SPX equivalent."""
    return es_price + offset


def apply_offset_to_candle(candle: Candle, offset: float) -> Candle:
    """Return a new Candle with OHLC shifted by `offset`. Volume preserved."""
    return replace(
        candle,
        o=candle.o + offset,
        h=candle.h + offset,
        l=candle.l + offset,
        c=candle.c + offset,
    )


def apply_offset_to_series(candles: list[Candle], offset: float) -> list[Candle]:
    """Convert a series of ES candles to SPX-equivalent candles."""
    return [apply_offset_to_candle(c, offset) for c in candles]


def derive_offset(spx_spot: float, es_spot: float) -> float:
    """Compute the spot offset from a synchronized print pair.

    Use the latest cash SPX print and the simultaneous ES print. Caller
    is responsible for making sure they were captured at the same instant
    (otherwise the offset reflects a tick of drift, not basis).
    """
    return spx_spot - es_spot
