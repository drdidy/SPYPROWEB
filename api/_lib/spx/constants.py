"""SPX engine constants.

All numbers that govern the engine's behavior live here so they can be
tuned without hunting through the modules.
"""
from __future__ import annotations

from datetime import time

# ---------------------------------------------------------------------------
# Symbols and zones
# ---------------------------------------------------------------------------

SYMBOL = "SPX"
PROXY_SYMBOL = "ES"  # we pull ES hourly bars; SPX values are derived via offset
CENTRAL_TZ_NAME = "America/Chicago"

# ---------------------------------------------------------------------------
# Slope: applied (positive) to ascending lines, negative to descending lines.
# All four lines (channel ceiling, channel floor, prev-RTH-high asc,
# prev-RTH-low desc) use the same magnitude.
# ---------------------------------------------------------------------------

DEFAULT_SLOPE_PER_HOUR = 1.04

# ---------------------------------------------------------------------------
# Session windows (Central Time, naive `time` objects — combine with a date
# in time_utils to get tz-aware bounds).
#
# OVERNIGHT spans 15:00 prev-day -> 02:00 today CT (11 hours). The anchor
#   pivots are scanned across this window — the highest and lowest prints
#   before 02:00 CT become the channel ceiling and floor anchors. London
#   open (02:00) is the session boundary; anchors set after that point
#   belong to today's session, not the overnight build-up.
# SYDNEY 17:00 -> 20:00 (3h). Used for direction determination only.
# TOKYO  21:00 -> 02:00 (5h, crossing midnight). Used for direction
#   determination; ends at the session boundary so it doesn't reach into
#   the next day's pre-session.
# RTH    08:30 -> 15:00 (cash session for SPX).
# ---------------------------------------------------------------------------

OVERNIGHT_START = time(15, 0)
OVERNIGHT_END = time(2, 0)  # 02:00 CT (London open / session boundary)
SYDNEY_START = time(17, 0)
SYDNEY_END = time(20, 0)
TOKYO_START = time(21, 0)
TOKYO_END = time(2, 0)
RTH_START = time(8, 30)
RTH_END = time(15, 0)

# Session boundary — the moment of day that demarcates "still part of
# yesterday's trading session" from "this is now today's session."
# Channel anchors are pinned strictly before this; bars at 02:00 or
# after belong to the new session.
SESSION_BOUNDARY = time(2, 0)

# ---------------------------------------------------------------------------
# Overnight anchor rule
# ---------------------------------------------------------------------------
# ASCENDING channel  -> anchor at highest CLOSE / lowest CLOSE of window
# DESCENDING channel -> anchor at highest WICK / lowest WICK (raw h/l)
# Determined by direction in channel.overnight_anchors().

# ---------------------------------------------------------------------------
# Contract suggestion
# ---------------------------------------------------------------------------

DEFAULT_OTM_DISTANCE = 22.5  # midpoint of 20-25 spec
SPX_STRIKE_INCREMENT = 5     # SPX standard board

# ---------------------------------------------------------------------------
# Scenario thresholds
# ---------------------------------------------------------------------------

# "Far" outside the planned play (scenario 7) means past the prev-RTH-high
# asc line above, or past the prev-RTH-low desc line below. The user
# specified this as a hard rule, not a numeric tolerance.

# ---------------------------------------------------------------------------
# Confluence action gates
# ---------------------------------------------------------------------------

ACTION_TAKE_THRESHOLD = 70
ACTION_SELECTIVE_THRESHOLD = 50

# ---------------------------------------------------------------------------
# Confluence factors. Only implemented factors are emitted to the UI.
# Weights sum to 1.0 across the live factor set.
# ---------------------------------------------------------------------------

FACTOR_WEIGHTS = {
    "asian": 0.30,
    "london": 0.30,
    "reaction": 0.40,
}
