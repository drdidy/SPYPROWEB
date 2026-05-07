"""Seed snapshot used when live data is unavailable.

Mirrors the fixtures embedded in the SPY Prophet design bundle so the
preview UI renders identically to the static design before live data is
wired up. Once the yfinance + tastytrade fetchers are online, this module
becomes the deterministic offline-test fallback.
"""
from __future__ import annotations

from datetime import datetime, timezone

# Intraday spark from the Landing component in 81ed613d* of the design bundle.
SPARK = [
    583.28, 583.31, 583.45, 583.62, 583.78, 583.91, 583.74, 583.55, 583.41, 583.30,
    583.18, 583.04, 582.91, 582.85, 582.74, 582.68, 582.71, 582.79, 582.92, 583.05,
    583.14, 583.21, 583.16, 583.08, 582.96, 582.84, 582.71, 582.58, 582.42, 582.28,
    582.15, 582.04, 581.92, 581.84, 581.76, 581.82, 581.94, 582.08, 582.21, 582.34,
    582.48, 582.61, 582.74, 582.83, 582.91, 582.97, 583.02, 582.96, 582.88, 582.79,
    582.71, 582.65, 582.74, 582.81, 582.85, 582.88, 582.91, 582.89, 582.87, 582.86,
]

# Trigger rows from e108b48a* (Trigger Map page).
TRIGGERS = [
    {"line": "4H Supply",     "level": 583.40, "dist":  0.43, "bps":   7, "bias": -72, "status": "ARMED"},
    {"line": "Pivot Low",     "level": 581.85, "dist": -1.12, "bps": -19, "bias":  44, "status": "WATCHING"},
    {"line": "Day Open",      "level": 582.40, "dist": -0.57, "bps": -10, "bias": -12, "status": "BREACHED"},
    {"line": "1H VWAP",       "level": 582.81, "dist": -0.16, "bps":  -3, "bias":   8, "status": "WATCHING"},
    {"line": "PDH",           "level": 584.12, "dist":  1.15, "bps":  20, "bias": -58, "status": "ARMED"},
    {"line": "PDL",           "level": 580.04, "dist": -2.93, "bps": -50, "bias":  62, "status": "ARMED"},
    {"line": "Globex High",   "level": 583.05, "dist":  0.08, "bps":   1, "bias": -22, "status": "ARMED"},
    {"line": "Overnight Low", "level": 579.62, "dist": -3.35, "bps": -58, "bias":  18, "status": "STALE"},
]


# Deterministic seeded candles for the chart; one bar per 5 minutes of RTH.
# Generated with the same algorithm the React component uses, so the seed
# fixture and the design bundle agree pixel-for-pixel.
def _seed_candles() -> list[dict]:
    rnd = 7
    out: list[dict] = []
    price = 580.20
    for i in range(80):
        rnd = (rnd * 9301 + 49297) % 233280
        rand1 = rnd / 233280
        rnd = (rnd * 9301 + 49297) % 233280
        rand2 = rnd / 233280
        rnd = (rnd * 9301 + 49297) % 233280
        rand3 = rnd / 233280
        o = price
        c = o + (rand1 - 0.48) * 0.6
        h = max(o, c) + rand2 * 0.35
        lo = min(o, c) - rand3 * 0.35
        out.append({"t": f"2026-05-06T{8 + i // 12:02d}:{(i % 12) * 5:02d}:00", "o": round(o, 2), "h": round(h, 2), "l": round(lo, 2), "c": round(c, 2)})
        price = c
    out[-1]["c"] = 582.97
    out[-1]["h"] = max(out[-1]["h"], out[-1]["c"] + 0.05)
    return out


CHART_LINES = [
    {"label": "4H Supply", "value": 583.40, "color": "var(--red)",  "dash": False, "armed": False},
    {"label": "Pivot Low", "value": 581.85, "color": "var(--blue)", "dash": False, "armed": False},
    {"label": "Open",      "value": 582.40, "color": "var(--text-secondary)", "dash": True, "armed": False},
    {"label": "Trigger",   "value": 583.40, "color": "var(--amber)", "dash": False, "armed": True},
]


def build() -> dict:
    return {
        "asOf": datetime.now(timezone.utc).isoformat(),
        "source": "seed",
        "bias": {
            "label": "SHORT-LEAN",
            "score": -34,
            "note": "BACKWARDATION · 4H SUPPLY INTACT · DEALER GAMMA SHORT",
        },
        "quote": {
            "last": 582.86,
            "chg": -0.42,
            "chgPct": -0.072,
            "open": 582.40,
            "high": 583.91,
            "low": 581.76,
            "prevClose": 583.28,
        },
        "context": {"vix": 14.82, "dxy": 104.31, "vvix": 91.4},
        "spark": SPARK,
        "triggers": TRIGGERS,
        "candles": _seed_candles(),
        "chartLines": CHART_LINES,
        "options": None,
    }
