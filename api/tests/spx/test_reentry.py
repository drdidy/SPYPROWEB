"""Channel re-entry / breakout watch."""
from datetime import datetime
from zoneinfo import ZoneInfo

from _lib.spx.candles import Candle
from _lib.spx.channel import Anchor, Line
from _lib.spx.reentry import evaluate_reentry


CT = ZoneInfo("America/Chicago")


def _line(kind, anchor_price, anchor_hour, slope):
    return Line(
        kind=kind,
        anchor=Anchor(price=anchor_price, time=datetime(2026, 5, 7, anchor_hour, tzinfo=CT)),
        slope_per_hour=slope,
    )


def _ceiling():
    # 5872.40 anchor at 23:00 prev day, +1.04/hr.
    return _line("CHANNEL_CEILING", 5872.40, 23, 1.04)


def _floor():
    # 5848.20 anchor at 17:00 prev day, +1.04/hr (ascending channel).
    return _line("CHANNEL_FLOOR", 5848.20, 17, 1.04)


def test_inside_channel_dormant():
    w = evaluate_reentry("INSIDE_ASCENDING", None, _ceiling(), _floor())
    assert w.active is False
    assert w.side is None


def test_outside_play_dormant():
    w = evaluate_reentry("OUTSIDE_PLAY", None, _ceiling(), _floor())
    assert w.active is False


def test_above_armed_without_qualifying_candle():
    # Bullish candle (close > open) above ceiling — does NOT trigger.
    # Ceiling at 09:00 today = 5872.40 + 10 * 1.04 = 5882.80
    bar = Candle(
        t=datetime(2026, 5, 8, 9, tzinfo=CT),
        o=5885.00, h=5888.00, l=5884.00, c=5887.00,  # bullish
    )
    w = evaluate_reentry("ABOVE_ASCENDING", bar, _ceiling(), _floor())
    assert w.active is True
    assert w.side == "BUY_FROM_ABOVE"
    assert "awaiting" in w.detail.lower()


def test_above_triggered_by_bearish_touch_and_close_above():
    # Bearish candle that touches ceiling (5882.80 at 09:00) and closes above.
    bar = Candle(
        t=datetime(2026, 5, 8, 9, tzinfo=CT),
        o=5890.00, h=5891.00, l=5882.50, c=5884.00,  # bearish (c < o), low <= 5882.80 <= high, c > 5882.80
    )
    w = evaluate_reentry("ABOVE_ASCENDING", bar, _ceiling(), _floor())
    assert w.active is True
    assert w.side == "BUY_FROM_ABOVE"
    assert "confirmed" in w.detail.lower()


def test_below_triggered_by_bullish_touch_and_close_below():
    # Bullish candle that touches floor and closes below.
    # Floor at 09:00 today = 5848.20 + 16 * 1.04 = 5864.84
    bar = Candle(
        t=datetime(2026, 5, 8, 9, tzinfo=CT),
        o=5860.00, h=5867.00, l=5859.00, c=5863.00,  # bullish, touched floor (5864.84 in range), c<5864.84
    )
    w = evaluate_reentry("BELOW_ASCENDING", bar, _ceiling(), _floor())
    assert w.active is True
    assert w.side == "SELL_FROM_BELOW"
    assert "confirmed" in w.detail.lower()
