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
# Slope: applied positive to ascending lines and negative to descending lines.
# The six-line ES framework uses the same magnitude on every structure line.
# ---------------------------------------------------------------------------

DEFAULT_SLOPE_PER_HOUR = 1.04

# ---------------------------------------------------------------------------
# Session windows (Central Time, naive `time` objects; combine with a date in
# time_utils to get tz-aware bounds).
#
# OVERNIGHT spans 15:00 prev-day -> 02:00 today CT (11 hours). The highest
#   swing-high close and lowest swing-low close before 02:00 CT anchor four
#   swing lines. London open (02:00) is the session boundary; anchors set
#   after that point belong to today's session, not the overnight build-up.
# SYDNEY 17:00 -> 20:00 (3h). Retained for diagnostics and confluence.
# TOKYO  21:00 -> 02:00 (5h, crossing midnight). Retained for diagnostics and
#   confluence; ends at the session boundary so it doesn't reach into the next
#   day's pre-session.
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

# Session boundary: the moment of day that demarcates "still part of yesterday's
# trading session" from "this is now today's session." Structure anchors are
# pinned strictly before this; bars at 02:00 or after belong to the new session.
SESSION_BOUNDARY = time(2, 0)

# ---------------------------------------------------------------------------
# Overnight anchor rule
# ---------------------------------------------------------------------------
# Highest CLOSE and lowest CLOSE in the overnight window before 02:00 CT. Both
# anchors produce an ascending and descending line.

# ---------------------------------------------------------------------------
# Contract suggestion
# ---------------------------------------------------------------------------

DEFAULT_OTM_DISTANCE = 22.5  # midpoint of 20-25 spec
SPX_STRIKE_INCREMENT = 5     # SPX standard board

# ---------------------------------------------------------------------------
# Scenario thresholds
# ---------------------------------------------------------------------------

# "Far" outside the planned play means past the previous RTH high ascending
# line above, or past the previous RTH low descending line below. The user
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