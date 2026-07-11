#!/usr/bin/env python3
"""Replay the current SPY Prophet Control Shelf v1 logic on ES 1-minute data.

This is a behavior replay, not a full trading-system backtest. The Pine script
draws/alerts shelf behavior. It does not define option entry sizing, stops, or
profit targets. This runner mirrors the current shelf-selection and event rules
and then measures whether price moved away from the shelf after each event.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


ET_TZ = "America/New_York"
SLOPE_PER_HOUR = 1.04
BAND_WIDTH = 34.0
TOLERANCE = 6.0
RTH_OPEN_MIN = 9 * 60 + 30
RTH_CLOSE_MIN = 16 * 60


@dataclass
class Anchor:
    price: float
    bar: int
    role: str


def read_es(paths: list[Path]) -> pd.DataFrame:
    frames = []
    for path in paths:
        raw = pd.read_csv(path)
        ts_col = "timestamp" if "timestamp" in raw.columns else "ts_event"
        df = raw[[ts_col, "open", "high", "low", "close"] + (["volume"] if "volume" in raw.columns else [])].rename(
            columns={ts_col: "timestamp"}
        )
        if "volume" not in df.columns:
            df["volume"] = 0
        frames.append(df)
    out = pd.concat(frames, ignore_index=True)
    out["timestamp"] = pd.to_datetime(out["timestamp"], utc=True)
    for col in ["open", "high", "low", "close", "volume"]:
        out[col] = pd.to_numeric(out[col], errors="coerce")
    out = out.dropna(subset=["open", "high", "low", "close"]).drop_duplicates("timestamp")
    out = out.sort_values("timestamp").reset_index(drop=True)
    out["bar_index"] = np.arange(len(out), dtype=np.int64)
    out["et"] = out["timestamp"].dt.tz_convert(ET_TZ)
    mins = out["et"].dt.hour * 60 + out["et"].dt.minute
    out["rth"] = (out["et"].dt.weekday < 5) & (mins >= RTH_OPEN_MIN) & (mins < RTH_CLOSE_MIN)
    out["rth_date"] = out["et"].dt.date.astype(str)
    out["week_start"] = (out["et"].dt.normalize() - pd.to_timedelta(out["et"].dt.weekday, unit="D")).dt.date.astype(str)
    return out


def dow_role(ts: pd.Timestamp) -> str:
    name = ts.day_name()
    return {"Monday": "Mon", "Tuesday": "Tue", "Wednesday": "Wed", "Thursday": "Thu", "Friday": "Fri"}.get(name, "RTH")


def owner_label(role: str, shelf_idx: int) -> str:
    return f"{role} {shelf_idx:+d}"


def source_text(role: str, high_family: bool) -> str:
    side = "high" if high_family else "low"
    mapping = {"Fri": "Friday", "Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday"}
    return f"{mapping.get(role, 'prior')} {side}"


def anchor_text(role: str, shelf_idx: int, high_family: bool) -> str:
    if shelf_idx == 0:
        shelf = "control shelf"
    else:
        shelf = f"{abs(shelf_idx)} shelf{'s' if abs(shelf_idx) != 1 else ''} {'above' if shelf_idx > 0 else 'below'}"
    return f"{shelf} from {source_text(role, high_family)}"


def nearest(
    anchors: list[Anchor],
    bar_index: int,
    selector_price: float,
    high_family: bool,
    resistance_side: bool,
    search_shelves: int = 8,
) -> dict | None:
    per_bar = SLOPE_PER_HOUR / 60.0
    best = None
    for anchor in anchors:
        base = anchor.price - per_bar * (bar_index - anchor.bar) if high_family else anchor.price + per_bar * (bar_index - anchor.bar)
        raw = int(round((selector_price - base) / BAND_WIDTH))
        for shelf_idx in range(raw - search_shelves, raw + search_shelves + 1):
            level = base + BAND_WIDTH * shelf_idx
            eligible = level >= selector_price - TOLERANCE if resistance_side else level <= selector_price + TOLERANCE
            if not eligible:
                continue
            abs_dist = abs(level - selector_price)
            rec = {
                "level": float(level),
                "dist": float(level - selector_price if resistance_side else selector_price - level),
                "abs_dist": float(abs_dist),
                "shelf_idx": int(shelf_idx),
                "role": anchor.role,
                "label": owner_label(anchor.role, shelf_idx),
                "anchor_price": float(anchor.price),
                "anchor_bar": int(anchor.bar),
                "anchor_text": anchor_text(anchor.role, shelf_idx, high_family),
            }
            if best is None or rec["abs_dist"] < best["abs_dist"]:
                best = rec
    return best


def first_race(future: pd.DataFrame, direction: str, entry: float, target: float, adverse: float) -> str:
    for row in future.itertuples(index=False):
        if direction == "down":
            hit_target = row.low <= entry - target
            hit_adverse = row.high >= entry + adverse
        else:
            hit_target = row.high >= entry + target
            hit_adverse = row.low <= entry - adverse
        if hit_target and hit_adverse:
            return "both_same_bar"
        if hit_target:
            return "target_first"
        if hit_adverse:
            return "adverse_first"
    return "timeout"


def add_outcomes(events: pd.DataFrame, bars: pd.DataFrame) -> pd.DataFrame:
    if events.empty:
        return events
    rows = []
    bars_by_date = {k: v.reset_index(drop=True) for k, v in bars[bars["rth"]].groupby("rth_date", sort=False)}
    for ev in events.itertuples(index=False):
        day = bars_by_date.get(ev.rth_date)
        if day is None:
            continue
        pos = day.index[day["bar_index"] == ev.bar_index]
        if len(pos) == 0:
            continue
        future = day.iloc[pos[0] + 1 :].copy()
        entry = float(ev.close)
        if future.empty:
            mfe = mae = 0.0
            race17 = race34 = "timeout"
        elif ev.direction == "down":
            mfe = entry - float(future["low"].min())
            mae = float(future["high"].max()) - entry
            race17 = first_race(future, "down", entry, 17.0, 17.0)
            race34 = first_race(future, "down", entry, 34.0, 17.0)
        else:
            mfe = float(future["high"].max()) - entry
            mae = entry - float(future["low"].min())
            race17 = first_race(future, "up", entry, 17.0, 17.0)
            race34 = first_race(future, "up", entry, 34.0, 17.0)
        rec = ev._asdict()
        rec.update(
            {
                "mfe_to_rth_close": float(mfe),
                "mae_to_rth_close": float(mae),
                "mfe_17": bool(mfe >= 17.0),
                "mfe_34": bool(mfe >= 34.0),
                "mfe_51": bool(mfe >= 51.0),
                "race17": race17,
                "race34": race34,
            }
        )
        rows.append(rec)
    return pd.DataFrame(rows)


def replay(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    hi_anchors: list[Anchor] = []
    lo_anchors: list[Anchor] = []
    saved_fri_hi: Anchor | None = None
    saved_fri_lo: Anchor | None = None
    session_hi = session_hi_bar = session_lo = session_lo_bar = None
    session_date = None
    last_alert_bar = None

    events = []
    prev = {"res_clean": False, "sup_clean": False, "res_break": False, "sup_break": False, "res_approach": False, "sup_approach": False}

    def reset_week() -> None:
        hi_anchors.clear()
        lo_anchors.clear()
        if saved_fri_hi is not None and saved_fri_lo is not None:
            hi_anchors.append(saved_fri_hi)
            lo_anchors.append(saved_fri_lo)

    prev_rth = False
    prev_week = None
    prev_row = None
    for row in df.itertuples(index=False):
        rth = bool(row.rth)
        week = row.week_start
        if prev_week is not None and week != prev_week and saved_fri_hi is not None:
            reset_week()
        if rth and not prev_rth:
            session_hi = float(row.high)
            session_hi_bar = int(row.bar_index)
            session_lo = float(row.low)
            session_lo_bar = int(row.bar_index)
            session_date = row.rth_date
            if row.et.weekday() == 0:
                reset_week()
        elif rth:
            if float(row.high) > float(session_hi):
                session_hi = float(row.high)
                session_hi_bar = int(row.bar_index)
            if float(row.low) < float(session_lo):
                session_lo = float(row.low)
                session_lo_bar = int(row.bar_index)
        elif (not rth) and prev_rth and session_date is not None and prev_row is not None:
            done_ts = pd.Timestamp(prev_row.et)
            role = dow_role(done_ts)
            hi = Anchor(float(session_hi), int(session_hi_bar), role)
            lo = Anchor(float(session_lo), int(session_lo_bar), role)
            if role == "Fri":
                saved_fri_hi = hi
                saved_fri_lo = lo
            elif role in {"Mon", "Tue", "Wed", "Thu"}:
                hi_anchors.append(hi)
                lo_anchors.append(lo)
            session_hi = session_hi_bar = session_lo = session_lo_bar = None
            session_date = None

        res = nearest(hi_anchors, int(row.bar_index), float(row.close), True, True)
        sup = nearest(lo_anchors, int(row.bar_index), float(row.close), False, False)

        has_res = res is not None
        has_sup = sup is not None
        res_touched = has_res and float(row.high) >= res["level"] - TOLERANCE and float(row.low) <= res["level"] + TOLERANCE
        sup_touched = has_sup and float(row.low) <= sup["level"] + TOLERANCE and float(row.high) >= sup["level"] - TOLERANCE
        res_held = res_touched and float(row.close) <= res["level"]
        sup_held = sup_touched and float(row.close) >= sup["level"]
        res_rejected = res_held and float(row.close) < float(row.open)
        sup_rejected = sup_held and float(row.close) > float(row.open)
        res_clean = res_rejected
        sup_clean = sup_rejected
        res_break = res_touched and float(row.close) > res["level"] if has_res else False
        sup_break = sup_touched and float(row.close) < sup["level"] if has_sup else False
        res_approach = has_res and res["dist"] >= 0 and res["dist"] <= 12.0 and not res_touched
        sup_approach = has_sup and sup["dist"] >= 0 and sup["dist"] <= 12.0 and not sup_touched

        candidates = [
            ("clean_resistance_rejection", res_clean and not prev["res_clean"], "resistance", "down", res),
            ("clean_support_hold", sup_clean and not prev["sup_clean"], "support", "up", sup),
            ("break_hold_above", res_break and not prev["res_break"], "resistance", "up", res),
            ("break_hold_below", sup_break and not prev["sup_break"], "support", "down", sup),
            ("approaching_resistance", res_approach and not prev["res_approach"], "resistance", "down", res),
            ("approaching_support", sup_approach and not prev["sup_approach"], "support", "up", sup),
        ]
        alert_ready = last_alert_bar is None or int(row.bar_index) - last_alert_bar > 8
        default_alerted = False
        if alert_ready and candidates[0][1]:
            default_alerted = True
            last_alert_bar = int(row.bar_index)

        for kind, fired, side, direction, shelf in candidates:
            if fired and shelf is not None:
                events.append(
                    {
                        "timestamp": row.timestamp,
                        "et": row.et,
                        "bar_index": int(row.bar_index),
                        "rth_date": row.rth_date,
                        "week_start": row.week_start,
                        "kind": kind,
                        "side": side,
                        "direction": direction,
                        "default_alerted": bool(kind == "clean_resistance_rejection" and default_alerted),
                        "open": float(row.open),
                        "high": float(row.high),
                        "low": float(row.low),
                        "close": float(row.close),
                        **{f"shelf_{k}": v for k, v in shelf.items()},
                    }
                )

        prev = {
            "res_clean": res_clean,
            "sup_clean": sup_clean,
            "res_break": res_break,
            "sup_break": sup_break,
            "res_approach": res_approach,
            "sup_approach": sup_approach,
        }
        prev_rth = rth
        prev_week = week
        prev_row = row

    event_df = pd.DataFrame(events)
    return event_df, add_outcomes(event_df, df)


def summarize(events: pd.DataFrame) -> pd.DataFrame:
    rows = []
    if events.empty:
        return pd.DataFrame()
    for kind, g in events.groupby("kind", sort=False):
        decided17 = g[g["race17"].isin(["target_first", "adverse_first"])]
        decided34 = g[g["race34"].isin(["target_first", "adverse_first"])]
        rows.append(
            {
                "kind": kind,
                "events": int(len(g)),
                "median_mfe": float(g["mfe_to_rth_close"].median()),
                "median_mae": float(g["mae_to_rth_close"].median()),
                "mfe17_rate": float(g["mfe_17"].mean()),
                "mfe34_rate": float(g["mfe_34"].mean()),
                "mfe51_rate": float(g["mfe_51"].mean()),
                "race17_target_first": float((decided17["race17"] == "target_first").mean()) if len(decided17) else np.nan,
                "race17_decided": int(len(decided17)),
                "race34_target_first": float((decided34["race34"] == "target_first").mean()) if len(decided34) else np.nan,
                "race34_decided": int(len(decided34)),
            }
        )
    return pd.DataFrame(rows)


def fmt_pct(v: float) -> str:
    return "-" if pd.isna(v) else f"{v * 100:.1f}%"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", nargs="+", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--last-weeks", type=int, default=6)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    df = read_es(args.data)
    rth_weeks = sorted(df.loc[df["rth"], "week_start"].dropna().unique())
    keep_weeks = rth_weeks[-args.last_weeks :]
    warmup_start = pd.Timestamp(keep_weeks[0], tz=ET_TZ) - pd.Timedelta(days=7)
    replay_df = df[df["et"] >= warmup_start].copy()
    _, events_all = replay(replay_df)
    events = events_all[events_all["week_start"].isin(keep_weeks)].copy()
    summary = summarize(events)

    events.to_csv(args.out / "control_shelf_v1_last6_events.csv", index=False)
    summary.to_csv(args.out / "control_shelf_v1_last6_summary.csv", index=False)
    default_alerts = events[events["default_alerted"]].copy()
    default_alerts.to_csv(args.out / "control_shelf_v1_last6_default_alerts.csv", index=False)

    report_summary = summary.copy()
    for col in ["mfe17_rate", "mfe34_rate", "mfe51_rate", "race17_target_first", "race34_target_first"]:
        if col in report_summary:
            report_summary[col] = report_summary[col].map(fmt_pct)
    default_summary = summarize(default_alerts)
    if not default_summary.empty:
        for col in ["mfe17_rate", "mfe34_rate", "mfe51_rate", "race17_target_first", "race34_target_first"]:
            default_summary[col] = default_summary[col].map(fmt_pct)

    date_range = f"{df['timestamp'].min()} to {df['timestamp'].max()}"
    weeks_txt = ", ".join(keep_weeks)
    md = [
        "# SPY Prophet Control Shelf v1 Last-Six-Week Replay",
        "",
        f"- Data: ES 1-minute, {date_range}.",
        f"- Weeks scored: {weeks_txt}.",
        "- Logic: current Control Shelf v1 shelf selector, high-family sell ceiling, low-family buy floor, 6-point tolerance, 1.04/hour slope, 34-point shelves.",
        "- Outcomes: measured from the signal close to that same RTH close. MFE is favorable move. MAE is adverse move.",
        "- Race17/Race34: whether +17 or +34 points was reached before a -17 point adverse move. Same-bar target/adverse is excluded from the decided rate.",
        "",
        "## All State-Change Events",
        report_summary.to_markdown(index=False),
        "",
        "## Default Live Alert Events",
        "Default settings only alert clean resistance rejection. This table applies the script's 8-bar alert cooldown.",
        default_summary.to_markdown(index=False) if not default_summary.empty else "_No default alerts._",
        "",
        "## Default Alert Log",
        default_alerts[
            [
                "et",
                "kind",
                "close",
                "shelf_level",
                "shelf_anchor_text",
                "mfe_to_rth_close",
                "mae_to_rth_close",
                "race17",
                "race34",
            ]
        ].to_markdown(index=False)
        if not default_alerts.empty
        else "_No default alerts._",
    ]
    report = "\n".join(md)
    (args.out / "control_shelf_v1_last6_report.md").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
