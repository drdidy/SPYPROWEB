#!/usr/bin/env python3
"""
Parallel shelf interaction study for the SPY Prophet Control Grid.

This evaluates touches of every 34-point parallel around the active control
line, not only touches of the control line itself.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def classify_shelf_events(
    bars: pd.DataFrame,
    band_width: float,
    max_zones: int,
    horizon_bars: int,
) -> pd.DataFrame:
    events: list[dict] = []
    bars = bars.reset_index(drop=True).copy()
    prev_close = bars["close"].shift(1)

    for i in range(1, len(bars)):
        row = bars.iloc[i]
        active = row["active_line"]
        if pd.isna(active):
            continue

        low = float(row["low"])
        high = float(row["high"])
        close = float(row["close"])
        pc = float(prev_close.iloc[i])
        session_day = row["session_day"]

        touched: list[tuple[int, float]] = []
        for zone in range(-max_zones, max_zones + 1):
            shelf = float(active) + zone * band_width
            if low <= shelf <= high:
                touched.append((zone, shelf))
        if not touched:
            continue

        # If one candle crosses multiple shelves, use the shelf closest to the
        # previous close as the operative interaction. This approximates what a
        # trader sees first without lookahead.
        zone, shelf = min(touched, key=lambda item: abs(pc - item[1]))
        approach = "from_above" if pc >= shelf else "from_below"
        side = "long_support" if approach == "from_above" else "short_resistance"
        held = close >= shelf if side == "long_support" else close <= shelf

        target_shelf = shelf + band_width if side == "long_support" else shelf - band_width
        adverse_shelf = shelf - band_width if side == "long_support" else shelf + band_width
        outcome = "timeout"
        bars_to_outcome = None
        mfe = 0.0
        mae = 0.0
        end = min(len(bars) - 1, i + horizon_bars)
        for j in range(i + 1, end + 1):
            future = bars.iloc[j]
            if future["session_day"] != session_day:
                break
            if side == "long_support":
                mfe = max(mfe, float(future["high"]) - shelf)
                mae = max(mae, shelf - float(future["low"]))
                target_hit = float(future["high"]) >= target_shelf
                adverse_hit = float(future["low"]) <= adverse_shelf
            else:
                mfe = max(mfe, shelf - float(future["low"]))
                mae = max(mae, float(future["high"]) - shelf)
                target_hit = float(future["low"]) <= target_shelf
                adverse_hit = float(future["high"]) >= adverse_shelf
            if target_hit and adverse_hit:
                outcome = "both_same_bar"
                bars_to_outcome = j - i
                break
            if target_hit:
                outcome = "target_next_shelf"
                bars_to_outcome = j - i
                break
            if adverse_hit:
                outcome = "adverse_next_shelf"
                bars_to_outcome = j - i
                break

        events.append(
            {
                "bar_index": int(row["bar_index"]),
                "ct": row["ct"],
                "session_day": session_day,
                "zone": int(zone),
                "shelf": shelf,
                "approach": approach,
                "side": side,
                "held_on_close": bool(held),
                "close": close,
                "outcome": outcome,
                "bars_to_outcome": bars_to_outcome,
                "mfe": mfe,
                "mae": mae,
            }
        )

    return pd.DataFrame(events)


def summarize(events: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if events.empty:
        empty = pd.DataFrame()
        return empty, empty, empty

    events = events.copy()
    decided = events[events["outcome"].isin(["target_next_shelf", "adverse_next_shelf", "both_same_bar"])].copy()
    events["target_win"] = events["outcome"].eq("target_next_shelf")
    events["adverse_loss"] = events["outcome"].eq("adverse_next_shelf")
    decided["target_win"] = decided["outcome"].eq("target_next_shelf")

    overall = pd.DataFrame(
        [
            {
                "events": len(events),
                "held_on_close": int(events["held_on_close"].sum()),
                "held_rate": events["held_on_close"].mean(),
                "decided": len(decided),
                "target_wins": int(decided["target_win"].sum()) if len(decided) else 0,
                "target_rate_decided": decided["target_win"].mean() if len(decided) else np.nan,
                "timeouts": int(events["outcome"].eq("timeout").sum()),
                "both_same_bar": int(events["outcome"].eq("both_same_bar").sum()),
                "avg_mfe": events["mfe"].mean(),
                "avg_mae": events["mae"].mean(),
            }
        ]
    )

    by_zone = (
        events.groupby("zone")
        .agg(
            events=("zone", "size"),
            held_rate=("held_on_close", "mean"),
            target_rate=("target_win", "mean"),
            avg_mfe=("mfe", "mean"),
            avg_mae=("mae", "mean"),
        )
        .reset_index()
        .sort_values("zone")
    )
    by_side = (
        events.groupby("side")
        .agg(
            events=("side", "size"),
            held_rate=("held_on_close", "mean"),
            target_rate=("target_win", "mean"),
            avg_mfe=("mfe", "mean"),
            avg_mae=("mae", "mean"),
        )
        .reset_index()
    )
    return overall, by_zone, by_side


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bars", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--band-width", type=float, default=34.0)
    parser.add_argument("--max-zones", type=int, default=10)
    parser.add_argument("--horizon-bars", type=int, default=180)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    bars = pd.read_csv(args.bars)
    events = classify_shelf_events(bars, args.band_width, args.max_zones, args.horizon_bars)
    overall, by_zone, by_side = summarize(events)

    events.to_csv(args.out / "shelf_events.csv", index=False)
    overall.to_csv(args.out / "shelf_overall.csv", index=False)
    by_zone.to_csv(args.out / "shelf_by_zone.csv", index=False)
    by_side.to_csv(args.out / "shelf_by_side.csv", index=False)

    report = [
        "# Control Grid Parallel Shelf Study",
        "",
        f"- Bars file: `{args.bars}`",
        f"- Band width: {args.band_width}",
        f"- Zones tested: {-args.max_zones} to +{args.max_zones}",
        f"- Outcome horizon: {args.horizon_bars} bars",
        "",
        "## Overall",
        overall.to_markdown(index=False),
        "",
        "## By Side",
        by_side.to_markdown(index=False),
        "",
        "## By Zone",
        by_zone.to_markdown(index=False),
        "",
        "Interpretation: `zone=0` is the control line. Negative zones are shelves below the control line; positive zones are shelves above it. `target_next_shelf` means price reached the next 34-point shelf in the expected direction before the adverse shelf within the horizon.",
    ]
    (args.out / "shelf_report.md").write_text("\n".join(report), encoding="utf-8")
    print(overall.to_string(index=False))


if __name__ == "__main__":
    main()
