"""Seed snapshot used when live data is unavailable."""
from __future__ import annotations

from datetime import datetime, timezone

SPARK = [
    583.28, 583.31, 583.45, 583.62, 583.78, 583.91, 583.74, 583.55, 583.41, 583.30,
    583.18, 583.04, 582.91, 582.85, 582.74, 582.68, 582.71, 582.79, 582.92, 583.05,
    583.14, 583.21, 583.16, 583.08, 582.96, 582.84, 582.71, 582.58, 582.42, 582.28,
    582.15, 582.04, 581.92, 581.84, 581.76, 581.82, 581.94, 582.08, 582.21, 582.34,
    582.48, 582.61, 582.74, 582.83, 582.91, 582.97, 583.02, 582.96, 582.88, 582.79,
    582.71, 582.65, 582.74, 582.81, 582.85, 582.88, 582.91, 582.89, 582.87, 582.86,
]

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


SIGNALS = [
    {"id": "seed-1", "type": "REJECTION",  "line": "4H SUPPLY",   "ts": "11:42:18", "score": 8.2, "grade": "A",  "dir": "down",    "status": "PENDING_CONFIRMATION", "outcome": None,  "entry": None,   "stop": None,   "target": None,   "rr": None},
    {"id": "seed-2", "type": "REJECTION",  "line": "PIVOT LOW",   "ts": "11:18:04", "score": 6.4, "grade": "B",  "dir": "down",    "status": "CONFIRMED",            "outcome": -0.34, "entry": 581.85, "stop": 582.55, "target": 579.20, "rr": 1.8},
    {"id": "seed-3", "type": "REJECTION",  "line": "DAY OPEN",    "ts": "10:58:31", "score": 5.1, "grade": "C",  "dir": "neutral", "status": "CONFIRMED",            "outcome": 0.0,   "entry": 582.40, "stop": 583.10, "target": 581.00, "rr": 1.2},
    {"id": "seed-4", "type": "REJECTION",  "line": "1H VWAP",     "ts": "10:42:09", "score": 7.8, "grade": "A",  "dir": "up",      "status": "CONFIRMED",            "outcome": 0.82,  "entry": 582.81, "stop": 582.10, "target": 583.91, "rr": 2.1},
    {"id": "seed-5", "type": "REJECTION",  "line": "PDH",         "ts": "10:24:55", "score": 7.0, "grade": "B",  "dir": "down",    "status": "CONFIRMED",            "outcome": 0.41,  "entry": 584.12, "stop": 584.82, "target": 582.55, "rr": 2.0},
    {"id": "seed-6", "type": "REJECTION",  "line": "GLOBEX HIGH", "ts": "10:08:12", "score": 5.6, "grade": "C",  "dir": "up",      "status": "CONFIRMED",            "outcome": 0.18,  "entry": 583.05, "stop": 582.40, "target": 583.91, "rr": 1.5},
    {"id": "seed-7", "type": "REJECTION",  "line": "PIVOT LOW",   "ts": "09:54:48", "score": 4.2, "grade": "D",  "dir": "neutral", "status": "CONFIRMED",            "outcome": 0.0,   "entry": 581.85, "stop": 582.55, "target": 580.80, "rr": 1.0},
    {"id": "seed-8", "type": "REJECTION",  "line": "DAY OPEN",    "ts": "09:36:02", "score": 6.9, "grade": "B",  "dir": "up",      "status": "CONFIRMED",            "outcome": 0.55,  "entry": 582.40, "stop": 581.80, "target": 583.50, "rr": 1.8},
]


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
        "signals": SIGNALS,
        "pivots": {
            "high": {
                "name": "HIGH_PIVOT", "price": 583.91, "source": "Yahoo SPY 60m RTH",
                "anchorTime": "2026-05-06T14:00:00-05:00",
                "candleStarts": "2026-05-06T14:00:00-05:00",
                "candleCloses": "2026-05-06T15:00:00-05:00",
                "fallbackUsed": False, "candleColor": "red",
                "structureDay": "2026-05-06",
                "candle": {"o": 583.62, "h": 583.91, "l": 582.71, "c": 582.85},
            },
            "low": {
                "name": "LOW_PIVOT", "price": 581.76, "source": "Yahoo SPY 60m RTH",
                "anchorTime": "2026-05-06T11:00:00-05:00",
                "candleStarts": "2026-05-06T11:00:00-05:00",
                "candleCloses": "2026-05-06T12:00:00-05:00",
                "fallbackUsed": False, "candleColor": "red",
                "structureDay": "2026-05-06",
                "candle": {"o": 582.04, "h": 582.21, "l": 581.76, "c": 581.92},
            },
            "slope": 0.20,
            "structureDay": "2026-05-06",
            "signalDay": "2026-05-07",
        },
        "decision": {
            "verb": "WAIT",
            "bias": "NEUTRAL",
            "biasColor": "var(--text-secondary)",
            "score": 0.0,
            "grade": "—",
            "conviction": 2,
            "window": "opens 08:30 CT",
            "rationale": "SPY 582.86 inside yesterday's RTH range. No qualified rejection yet on the active triggers.",
            "why": "Waiting for the first hourly RTH candle to print before the engine can score a setup.",
            "rr": None,
            "winPct": None,
            "edgePct": None,
        },
    }
