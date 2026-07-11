#!/usr/bin/env python3
"""Test whether price stays/bounces inside its 34-point shelf zone after 9:10-9:30 CT.

Uses the production weekly shelf idea:
- Monday 12:00-14:00 CT high is the weekly anchor.
- Shelves descend at 1.04 points per trading hour.
- A zone is the 34-point band between adjacent shelves around price at a check time.

For each Tue-Fri RTH day, classify price at 09:10, 09:20, and 09:30 CT,
then watch the rest of RTH for containment, upper/lower tags, and zone breaks.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from monday_high_alternating_slope_test import BAND, Config, monday_anchors, read_es


CHECK_TIMES_CT = [(9, 10), (9, 20), (9, 30)]
HORIZONS_CT = [(10, 30), (11, 0), (12, 0), (15, 0)]


def shelf_base(anchor_price: float, anchor_bar: int, bar_index: int, cfg: Config) -> float:
    return anchor_price - cfg.per_bar * (bar_index - anchor_bar)


def zone_for_price(price: float, base: float) -> tuple[int, float, float]:
    # Zone k sits between shelf k and shelf k+1.
    k = int(np.floor((price - base) / BAND))
    lower = base + k * BAND
    upper = base + (k + 1) * BAND
    return k, float(lower), float(upper)


def first_check_bar(day: pd.DataFrame, hour: int, minute: int) -> pd.Series | None:
    mins = day["ct"].dt.hour * 60 + day["ct"].dt.minute
    target = hour * 60 + minute
    candidates = day[mins >= target]
    if candidates.empty:
        return None
    return candidates.iloc[0]


def analyze(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    anchors = monday_anchors(df)
    anchor_by_week = {row.week_start: row for row in anchors.itertuples(index=False)}
    rth = df[df["rth"]].copy()
    rows: list[dict] = []
    for (week_start, rth_date), day in rth.groupby(["week_start", "rth_date"], sort=True):
        weekday = str(day["weekday"].iloc[0])
        if weekday not in {"Tuesday", "Wednesday", "Thursday", "Friday"}:
            continue
        if week_start not in anchor_by_week:
            continue
        anchor = anchor_by_week[week_start]
        day = day.reset_index(drop=True)
        for hour, minute in CHECK_TIMES_CT:
            chk = first_check_bar(day, hour, minute)
            if chk is None:
                continue
            chk_pos = int(day.index[day["bar_index"] == chk["bar_index"]][0])
            base0 = shelf_base(float(anchor.anchor_price), int(anchor.anchor_bar), int(chk["bar_index"]), cfg)
            zone_idx, lower0, upper0 = zone_for_price(float(chk["close"]), base0)
            future = day.iloc[chk_pos + 1 :].copy()
            if future.empty:
                continue

            broke_up_bar = None
            broke_down_bar = None
            broke_up_time = None
            broke_down_time = None
            upper_tag = False
            lower_tag = False
            upper_reject = False
            lower_bounce = False
            max_fav_inside = 0.0
            max_adverse_inside = 0.0
            for fr in future.itertuples(index=False):
                base = shelf_base(float(anchor.anchor_price), int(anchor.anchor_bar), int(fr.bar_index), cfg)
                lower = base + zone_idx * BAND
                upper = base + (zone_idx + 1) * BAND
                upper_tag = upper_tag or (fr.high >= upper - cfg.tolerance)
                lower_tag = lower_tag or (fr.low <= lower + cfg.tolerance)
                upper_reject = upper_reject or (fr.high >= upper - cfg.tolerance and fr.close <= upper)
                lower_bounce = lower_bounce or (fr.low <= lower + cfg.tolerance and fr.close >= lower)
                if broke_up_bar is None and fr.close > upper + cfg.tolerance:
                    broke_up_bar = int(fr.bar_index)
                    broke_up_time = fr.ct
                if broke_down_bar is None and fr.close < lower - cfg.tolerance:
                    broke_down_bar = int(fr.bar_index)
                    broke_down_time = fr.ct
                max_fav_inside = max(max_fav_inside, min(float(fr.high), upper) - float(chk["close"]))
                max_adverse_inside = max(max_adverse_inside, float(chk["close"]) - max(float(fr.low), lower))

            final = future.iloc[-1]
            base_end = shelf_base(float(anchor.anchor_price), int(anchor.anchor_bar), int(final["bar_index"]), cfg)
            lower_end = base_end + zone_idx * BAND
            upper_end = base_end + (zone_idx + 1) * BAND
            stayed = broke_up_bar is None and broke_down_bar is None
            both_edges = upper_tag and lower_tag
            first_break = (
                "none"
                if stayed
                else "up"
                if broke_up_bar is not None and (broke_down_bar is None or broke_up_bar < broke_down_bar)
                else "down"
            )
            first_break_time = (
                pd.NaT
                if stayed
                else broke_up_time
                if first_break == "up"
                else broke_down_time
            )
            first_break_minutes = (
                np.nan
                if pd.isna(first_break_time)
                else (pd.Timestamp(first_break_time) - pd.Timestamp(chk["ct"])).total_seconds() / 60.0
            )
            rows.append(
                {
                    "rth_date": rth_date,
                    "weekday": weekday,
                    "check_time_ct": f"{hour:02d}:{minute:02d}",
                    "check_close": float(chk["close"]),
                    "zone_index": zone_idx,
                    "zone_lower_at_check": lower0,
                    "zone_upper_at_check": upper0,
                    "zone_width": upper0 - lower0,
                    "dist_to_lower": float(chk["close"] - lower0),
                    "dist_to_upper": float(upper0 - chk["close"]),
                    "stayed_in_zone_to_rth_close": stayed,
                    "first_break": first_break,
                    "first_break_time_ct": first_break_time,
                    "minutes_to_first_break": first_break_minutes,
                    "upper_tag": upper_tag,
                    "lower_tag": lower_tag,
                    "upper_reject": upper_reject,
                    "lower_bounce": lower_bounce,
                    "both_edges_tagged": both_edges,
                    "close_inside_zone": bool(lower_end <= float(final["close"]) <= upper_end),
                    "monday_anchor": float(anchor.anchor_price),
                    "monday_anchor_time_ct": anchor.anchor_time_ct,
                }
            )
    return pd.DataFrame(rows)


def summarize(events: pd.DataFrame) -> pd.DataFrame:
    def no_break_by(g: pd.DataFrame, hour: int, minute: int) -> float:
        horizon = hour * 60 + minute
        chk_mins = pd.to_datetime(g["check_time_ct"], format="%H:%M").dt.hour * 60 + pd.to_datetime(g["check_time_ct"], format="%H:%M").dt.minute
        needed = horizon - chk_mins
        return ((g["first_break"] == "none") | (g["minutes_to_first_break"] > needed)).mean()

    def add_horizons(row: dict, g: pd.DataFrame) -> dict:
        for hour, minute in HORIZONS_CT:
            row[f"no_break_by_{hour:02d}{minute:02d}_pct"] = no_break_by(g, hour, minute)
        row["median_minutes_to_break"] = g["minutes_to_first_break"].median()
        return row

    rows = []
    for key, g in events.groupby("check_time_ct", dropna=False):
        rows.append(add_horizons(
            {
                "check_time_ct": key,
                "days": len(g),
                "stayed_pct": g["stayed_in_zone_to_rth_close"].mean(),
                "close_inside_pct": g["close_inside_zone"].mean(),
                "upper_tag_pct": g["upper_tag"].mean(),
                "lower_tag_pct": g["lower_tag"].mean(),
                "both_edges_pct": g["both_edges_tagged"].mean(),
                "upper_reject_pct": g["upper_reject"].mean(),
                "lower_bounce_pct": g["lower_bounce"].mean(),
                "break_up_pct": (g["first_break"] == "up").mean(),
                "break_down_pct": (g["first_break"] == "down").mean(),
            },
            g,
        ))
    for keys, g in events.groupby(["check_time_ct", "weekday"], dropna=False):
        rows.append(add_horizons(
            {
                "check_time_ct": keys[0],
                "weekday": keys[1],
                "days": len(g),
                "stayed_pct": g["stayed_in_zone_to_rth_close"].mean(),
                "close_inside_pct": g["close_inside_zone"].mean(),
                "upper_tag_pct": g["upper_tag"].mean(),
                "lower_tag_pct": g["lower_tag"].mean(),
                "both_edges_pct": g["both_edges_tagged"].mean(),
                "upper_reject_pct": g["upper_reject"].mean(),
                "lower_bounce_pct": g["lower_bounce"].mean(),
                "break_up_pct": (g["first_break"] == "up").mean(),
                "break_down_pct": (g["first_break"] == "down").mean(),
            },
            g,
        ))
    return pd.DataFrame(rows)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("SPYPROWEB-live-recovered/data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv"))
    p.add_argument("--out", type=Path, default=Path("outputs/control_shelf_morning_zone"))
    p.add_argument("--tolerance", type=float, default=2.5)
    args = p.parse_args()
    cfg = Config(tolerance=args.tolerance)
    df = read_es(args.data)
    events = analyze(df, cfg)
    summary = summarize(events)
    args.out.mkdir(parents=True, exist_ok=True)
    events.to_csv(args.out / "morning_zone_events.csv", index=False)
    summary.to_csv(args.out / "morning_zone_summary.csv", index=False)
    report = [
        "# Morning Shelf Zone Containment",
        "",
        "Question: after 9:10-9:30 CT, does price mostly bounce inside the 34-point shelf zone it is already in?",
        "",
        f"Tolerance: {args.tolerance} points. Weekly family: Monday 12-2 CT high, descending 1.04/hour.",
        "",
        summary.to_markdown(index=False, floatfmt=".3f"),
    ]
    (args.out / "morning_zone_report.md").write_text("\n".join(report), encoding="utf-8")
    print(summary.to_string(index=False))
    print(f"\nWrote: {args.out}")


if __name__ == "__main__":
    main()
