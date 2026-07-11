#!/usr/bin/env python3
"""Confluence study: Control Grid shelves + EMA/Fib trades."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


CT = "America/Chicago"


def metric(df: pd.DataFrame, label: str, kind: str) -> dict:
    if kind == "ema":
        decided = df[df["result"].isin(["WIN", "LOSS"])]
        wins = int((decided["result"] == "WIN").sum())
        losses = int((decided["result"] == "LOSS").sum())
        timeouts = int((df["result"] == "TIMEOUT").sum())
        avg_r = float(df["r"].mean()) if len(df) else np.nan
    else:
        decided = df[df["outcome"].isin(["target", "loss"])]
        wins = int((decided["outcome"] == "target").sum())
        losses = int((decided["outcome"] == "loss").sum())
        timeouts = int((df["outcome"] == "timeout").sum())
        avg_r = np.nan
    return {
        "label": label,
        "kind": kind,
        "trades": int(len(df)),
        "decided": int(len(decided)),
        "wins": wins,
        "losses": losses,
        "timeouts": timeouts,
        "win_rate": np.nan if len(decided) == 0 else wins / len(decided),
        "all_win_rate": np.nan if len(df) == 0 else wins / len(df),
        "avg_r_all": avg_r,
    }


def day_time_index(df: pd.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    out: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for day, g in df.groupby("session_day"):
        ordered = g.sort_values("minute_abs")
        out[str(day)] = (ordered["minute_abs"].to_numpy(dtype=np.int64), ordered["direction"].astype(str).to_numpy())
    return out


def has_match(index: dict[str, tuple[np.ndarray, np.ndarray]], day: str, minute_abs: int, direction: str, before: int, after: int, same_dir: bool) -> bool:
    pair = index.get(str(day))
    if pair is None:
        return False
    times, dirs = pair
    left = np.searchsorted(times, minute_abs - before, side="left")
    right = np.searchsorted(times, minute_abs + after, side="right")
    if right <= left:
        return False
    if same_dir:
        return bool(np.any(dirs[left:right] == direction))
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ema", type=Path, default=Path("outputs/control_grid/ema_fib_options_trades.csv"))
    parser.add_argument("--grid", type=Path, default=Path("outputs/control_grid/scenario_miner_targets/t17_a34/scenario_events.csv"))
    parser.add_argument("--out", type=Path, default=Path("outputs/control_grid/ema_control_confluence"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    ema = pd.read_csv(args.ema)
    ema = ema[(ema["symbol"] == "ES") & (ema["target"].isin([1.5, 1.618])) & (ema["variant"].isin(["baseline", "cross_only"]))].copy()
    ema["entry_dt"] = pd.to_datetime(ema["entryAt"], utc=True).dt.tz_convert(CT)
    ema["session_day"] = (ema["entry_dt"] - pd.Timedelta(hours=17)).dt.date.astype(str)
    ema["minute_abs"] = (ema["entry_dt"].astype("int64") // 60_000_000_000).astype(int)

    grid = pd.read_csv(args.grid)
    grid["ct_dt"] = pd.to_datetime(grid["ct"], utc=True).dt.tz_convert(CT)
    grid["minute_abs"] = (grid["ct_dt"].astype("int64") // 60_000_000_000).astype(int)
    grid["direction"] = np.where(grid["side"].eq("long_support"), "long", "short")

    grid_filters = {
        "grid_all": grid,
        "grid_held": grid[grid["held"]],
        "grid_rth_held": grid[grid["held"] & grid["tod_min"].between(8 * 60 + 50, 11 * 60 + 50)],
        "grid_rth_held_ema": grid[
            grid["held"]
            & grid["tod_min"].between(8 * 60 + 50, 11 * 60 + 50)
            & (((grid["direction"] == "long") & grid["ema_bull"]) | ((grid["direction"] == "short") & grid["ema_bear"]))
        ],
        "grid_control_desc_rth_held": grid[
            (grid["scenario"] == "control_desc") & grid["held"] & grid["tod_min"].between(8 * 60 + 50, 11 * 60 + 50)
        ],
        "grid_control_desc_zone_m7_m4": grid[(grid["scenario"] == "control_desc") & grid["zone"].between(-7, -4)],
        "grid_control_desc_above_held": grid[(grid["scenario"] == "control_desc") & grid["above_control"] & grid["held"]],
    }

    rows: list[dict] = []
    for (target, variant), g in ema.groupby(["target", "variant"]):
        rows.append(metric(g, f"EMA {target} {variant}", "ema"))
    for name, gf in grid_filters.items():
        rows.append(metric(gf, f"GRID {name}", "grid"))

    for name, gf in grid_filters.items():
        gidx = day_time_index(gf)
        for mins in [30, 60, 120]:
            for same in [False, True]:
                mask = [
                    has_match(gidx, row.session_day, int(row.minute_abs), row.direction, before=mins, after=15, same_dir=same)
                    for row in ema.itertuples(index=False)
                ]
                sub = ema[pd.Series(mask, index=ema.index)]
                rows.append(metric(sub, f"EMA + {name} {'same_dir ' if same else ''}prior{mins}/after15", "ema"))

    eidx = day_time_index(ema)
    for name, gf in grid_filters.items():
        for mins in [30, 60, 120]:
            for same in [False, True]:
                mask = [
                    has_match(eidx, row.session_day, int(row.minute_abs), row.direction, before=15, after=mins, same_dir=same)
                    for row in gf.itertuples(index=False)
                ]
                sub = gf[pd.Series(mask, index=gf.index)]
                rows.append(metric(sub, f"GRID {name} + EMA {'same_dir ' if same else ''}prior15/after{mins}", "grid"))

    scores = pd.DataFrame(rows).sort_values(["win_rate", "decided"], ascending=[False, False])
    scores.to_csv(args.out / "confluence_scores.csv", index=False)
    report = [
        "# EMA-Fib + Control Grid Confluence Report",
        "",
        "## Best Rows, Decided >= 30",
        scores[scores["decided"] >= 30].head(40).to_markdown(index=False),
        "",
        "## Baselines",
        scores[scores["label"].str.startswith("EMA ") | scores["label"].str.startswith("GRID grid_")].to_markdown(index=False),
    ]
    (args.out / "confluence_report.md").write_text("\n".join(report), encoding="utf-8")
    print(scores[scores["decided"] >= 30].head(30).to_string(index=False))


if __name__ == "__main__":
    main()
