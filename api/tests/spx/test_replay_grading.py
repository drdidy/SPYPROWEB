"""SPX replay grading rule — verdictOutcome / verdictPnl.

The grader's contract: any session where the channel was projected
(direction != NONE) is graded against the day's net open→close.
The confluence `action` (TAKE / SELECTIVE / STAND_DOWN) is *not*
a grading input — that gate is for display-side recommendation,
not for "what would have happened if the user took the rail tag."

These cases pin the rule with synthetic payloads so we don't have
to mock yfinance or hit the wire. Run with pytest from the repo
root.
"""
from __future__ import annotations

from datetime import date
from unittest.mock import patch

# The grader is a private helper inside the route handler module.
# Importing it directly is fine for tests; it has no side effects.
from spx.snapshot import _build_spx_replay_block


def _payload(action: str, direction: str, offset: float = 28.0):
    """Minimal payload shape the grader reads."""
    return {
        "confluence": {"action": action, "score": 0.5},
        "channel": {"direction": direction, "reason": ""},
        "_meta": {"appliedOffset": offset},
    }


def _ohlc(open_: float, close: float):
    """Replace _spx_session_ohlc with a stub returning a fixed bar."""
    return {"open": open_, "close": close}


# ---------------------------------------------------------------------
# v9: drop the `action` filter. Every session with a channel
# direction grades; the action label is display-only.
# ---------------------------------------------------------------------


def test_stand_down_with_ascending_channel_now_grades_win():
    """A STAND_DOWN session with an ASCENDING channel and a positive
    day-net was returning N_A under the old rule (action filter).
    v9 grades it as a WIN — the floor tag at 9am IS the trade."""
    with patch(
        "spx.snapshot._spx_session_ohlc",
        return_value=_ohlc(open_=5840.0, close=5919.0),  # net +79
    ):
        block = _build_spx_replay_block(
            _payload("STAND_DOWN", "ASCENDING"),
            date(2026, 5, 8),
        )
    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 79.0


def test_stand_down_with_descending_channel_grades_win_on_down_day():
    with patch(
        "spx.snapshot._spx_session_ohlc",
        return_value=_ohlc(open_=5919.0, close=5840.0),  # net -79
    ):
        block = _build_spx_replay_block(
            _payload("STAND_DOWN", "DESCENDING"),
            date(2026, 5, 8),
        )
    # DESCENDING channel = short play; close < open is a WIN.
    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 79.0  # P&L expressed as positive favorable move


def test_take_action_keeps_grading_unchanged():
    """The action filter is gone, so TAKE + ASCENDING grades the
    same way it always did."""
    with patch(
        "spx.snapshot._spx_session_ohlc",
        return_value=_ohlc(open_=5840.0, close=5860.0),  # net +20
    ):
        block = _build_spx_replay_block(
            _payload("TAKE", "ASCENDING"),
            date(2026, 5, 8),
        )
    assert block["verdictOutcome"] == "WIN"
    assert block["verdictPnl"] == 20.0


def test_loss_when_day_moves_against_channel_direction():
    """ASCENDING channel + bearish day = LOSS (floor tag failed,
    price kept falling)."""
    with patch(
        "spx.snapshot._spx_session_ohlc",
        return_value=_ohlc(open_=5860.0, close=5840.0),  # net -20
    ):
        block = _build_spx_replay_block(
            _payload("STAND_DOWN", "ASCENDING"),
            date(2026, 5, 8),
        )
    assert block["verdictOutcome"] == "LOSS"
    assert block["verdictPnl"] == -20.0


def test_push_when_day_closes_flat():
    with patch(
        "spx.snapshot._spx_session_ohlc",
        return_value=_ohlc(open_=5860.0, close=5860.0),
    ):
        block = _build_spx_replay_block(
            _payload("STAND_DOWN", "ASCENDING"),
            date(2026, 5, 8),
        )
    assert block["verdictOutcome"] == "PUSH"
    assert block["verdictPnl"] == 0.0


def test_no_channel_direction_stays_n_a():
    """direction == NONE → no rails projected → no rail to tag →
    N_A is the honest read. This is the only case where the
    grader still emits N_A."""
    with patch(
        "spx.snapshot._spx_session_ohlc",
        return_value=_ohlc(open_=5840.0, close=5919.0),
    ):
        block = _build_spx_replay_block(
            _payload("STAND_DOWN", "NONE"),
            date(2026, 5, 8),
        )
    assert block["verdictOutcome"] == "N_A"
    # P&L stays None because the engine didn't take a directional bet.
    assert block["verdictPnl"] is None


def test_session_block_populates_even_when_n_a():
    """The session OHLC block is informational — the user still
    sees the day's net move on the dashboard recap line even
    when the grader emits N_A."""
    with patch(
        "spx.snapshot._spx_session_ohlc",
        return_value=_ohlc(open_=5840.0, close=5919.0),
    ):
        block = _build_spx_replay_block(
            _payload("STAND_DOWN", "NONE"),
            date(2026, 5, 8),
        )
    assert block["session"] is not None
    assert block["session"]["netPts"] == 79.0
    assert block["verdictOutcome"] == "N_A"


def test_replay_date_none_returns_skeleton():
    block = _build_spx_replay_block(_payload("TAKE", "ASCENDING"), None)
    assert block["isReplay"] is False
    assert block["date"] is None
    assert block["verdictOutcome"] is None
    assert block["session"] is None
