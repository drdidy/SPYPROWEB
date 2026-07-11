#!/usr/bin/env python3
"""Control Grid shelf touch quality study.

Distance attribution alone is too easy for a dense shelf stack. This script
tests the usable trading question instead:

    When price touches a candidate high-family shelf, what kind of touch
    actually follows through?

It evaluates support and resistance touches on RTH hourly ES bars using the
same high-family candidates as the family-complex study.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd


def load_family_module(root: Path):
    path = root / "scripts" / "control_grid_family_complex_tests.py"
    spec = importlib.util.spec_from_file_location("cg_family_complex_tests", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def pct(x: float) -> str:
    return "-" if pd.isna(x) else f"{x * 100:.1f}%"


def md_table(df: pd.DataFrame, n: int = 40) -> str:
    if df.empty:
        return "_No rows._"
    return df.head(n).to_markdown(index=False)


def touch_events(cg, hourly: pd.DataFrame, daily: pd.DataFrame, cfg, rule: str) -> pd.DataFrame:
    rows: list[dict] = []
    h = hourly.reset_index(drop=True)
    for i in range(0, len(h) - cfg.horizon_hours):
        row = h.iloc[i]
        fams = cg.RULES[rule](cg.families_for_date(daily, row["rth_date"]))
        if not fams:
            continue
        future = h.iloc[i + 1 : min(len(h), i + cfg.horizon_hours + 1)]
        future = future[future["rth_date"] == row["rth_date"]]
        if future.empty:
            continue
        for side, price, direction in [
            ("support", float(row["low"]), "up"),
            ("resistance", float(row["high"]), "down"),
        ]:
            ns = cg.nearest_shelf(price, int(row["minute_bar"]), fams, cfg)
            if ns is None or ns["abs_distance"] > cfg.tolerance:
                continue
            shelf = float(ns["shelf_price"])
            if side == "support":
                fav = future["high"].max() - price
                adv = price - future["low"].min()
                held = row["close"] >= shelf
                candle_ok = row["close"] > row["open"]
                ema_ok = row["ema_state"] == "bull"
                close_distance = row["close"] - shelf
            else:
                fav = price - future["low"].min()
                adv = future["high"].max() - price
                held = row["close"] <= shelf
                candle_ok = row["close"] < row["open"]
                ema_ok = row["ema_state"] == "bear"
                close_distance = shelf - row["close"]
            rows.append(
                {
                    "rule": rule,
                    "target_date": row["rth_date"],
                    "target_weekday": row["weekday"],
                    "week_start": row["week_start"],
                    "hour_index": i,
                    "time_et": row["et"],
                    "side": side,
                    "direction": direction,
                    "price": price,
                    "open": float(row["open"]),
                    "close": float(row["close"]),
                    "ema_state": row["ema_state"],
                    "held_close": bool(held),
                    "rejection_candle": bool(held and candle_ok),
                    "ema_agrees": bool(ema_ok),
                    "held_plus_ema": bool(held and ema_ok),
                    "clean_rejection": bool(held and candle_ok and ema_ok),
                    "close_distance_from_shelf": float(close_distance),
                    "forward_move": float(fav),
                    "forward_adverse": float(adv),
                    "win_17": bool(fav >= 17.0),
                    "win_34": bool(fav >= 34.0),
                    **ns,
                }
            )
    return pd.DataFrame(rows)


def summarize(events: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    if events.empty:
        return pd.DataFrame()
    filters = {
        "all_touches": pd.Series(True, index=events.index),
        "held_close": events["held_close"],
        "rejection_candle": events["rejection_candle"],
        "ema_agrees": events["ema_agrees"],
        "held_plus_ema": events["held_plus_ema"],
        "clean_rejection": events["clean_rejection"],
    }
    for rule, rdf in events.groupby("rule"):
        for side, sdf in rdf.groupby("side"):
            for name, mask in filters.items():
                m = mask.loc[sdf.index].fillna(False)
                subset = sdf[m]
                if subset.empty:
                    continue
                rows.append(
                    {
                        "rule": rule,
                        "side": side,
                        "filter": name,
                        "touches": int(len(subset)),
                        "win17": int(subset["win_17"].sum()),
                        "win34": int(subset["win_34"].sum()),
                        "win17_rate": float(subset["win_17"].mean()),
                        "win34_rate": float(subset["win_34"].mean()),
                        "median_forward_move": float(subset["forward_move"].median()),
                        "median_adverse": float(subset["forward_adverse"].median()),
                        "median_abs_dist": float(subset["abs_distance"].median()),
                    }
                )
    return pd.DataFrame(rows).sort_values(["win34_rate", "win17_rate", "touches"], ascending=[False, False, False])


def by_day(events: pd.DataFrame) -> pd.DataFrame:
    if events.empty:
        return pd.DataFrame()
    src = events[events["held_close"]].copy()
    out = (
        src.groupby(["rule", "target_weekday", "side"], dropna=False)
        .agg(
            touches=("price", "size"),
            win17=("win_17", "sum"),
            win34=("win_34", "sum"),
            median_forward_move=("forward_move", "median"),
            top_label=("label", lambda x: x.value_counts().index[0] if len(x) else ""),
        )
        .reset_index()
    )
    out["win17_rate"] = out["win17"] / out["touches"]
    out["win34_rate"] = out["win34"] / out["touches"]
    return out.sort_values(["rule", "target_weekday", "side"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=6.0)
    parser.add_argument("--horizon-hours", type=int, default=6)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    cg = load_family_module(root)
    cfg = cg.Config(tolerance=args.tolerance, move_points=17.0, horizon_hours=args.horizon_hours)
    args.out.mkdir(parents=True, exist_ok=True)

    df = cg.read_es(args.data)
    daily = cg.daily_rth(df)
    hourly = cg.hourly_rth(df)
    frames = []
    for rule in ["friday_monday_complex", "rolling_two_weekdays", "week_to_date_complex", "all_singles_nearest"]:
        frames.append(touch_events(cg, hourly, daily, cfg, rule))
    events = pd.concat(frames, ignore_index=True)
    summary = summarize(events)
    day = by_day(events)
    events.to_csv(args.out / "touch_events.csv", index=False)
    summary.to_csv(args.out / "touch_quality_summary.csv", index=False)
    day.to_csv(args.out / "touch_quality_by_day.csv", index=False)

    fmt = summary.copy()
    for c in ["win17_rate", "win34_rate"]:
        fmt[c] = fmt[c].map(pct)
    day_fmt = day.copy()
    for c in ["win17_rate", "win34_rate"]:
        day_fmt[c] = day_fmt[c].map(pct)
    md = [
        "# Control Grid Shelf Touch Quality",
        "",
        f"- Tolerance: {args.tolerance} points.",
        f"- Horizon: {args.horizon_hours} RTH hours.",
        "- Touch win17: moves away at least 17 ES points. Touch win34: moves away at least 34 ES points.",
        "",
        "## Summary",
        md_table(fmt, 40),
        "",
        "## Held-Close Touches By Day",
        md_table(day_fmt, 80),
        "",
        "## Interpretation",
        "- A shelf should not be actionable from distance alone.",
        "- A held close and rejection candle are the minimum useful visual states.",
        "- If clean rejection has much better win34 than all touches, the indicator should label only those as tradeable shelf reactions and keep the rest as context.",
    ]
    (args.out / "touch_quality_report.md").write_text("\n".join(md), encoding="utf-8")
    print((args.out / "touch_quality_report.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
