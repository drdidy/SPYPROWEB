#!/usr/bin/env python3
"""
Mine Control Grid interaction scenarios.

Scenarios tested:
  - control_desc: descending high control line with infinite 34-point parallels
  - high_asc_when_above: if prior close is above descending weekly control, use
    ascending line from the high anchor; otherwise use descending control
  - low_asc_when_above: if prior close is above descending weekly control, use
    ascending line from the low anchor; otherwise use descending control

The shelf selected for a candle is the touched parallel closest to the previous
close, so the study does not require the base control line itself to be touched.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


PER_BAR = 1.04 / 60.0
BAND = 34.0


def load_bars(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["ct_dt"] = pd.to_datetime(df["ct"], utc=True).dt.tz_convert("America/Chicago")
    df["tod_min"] = df["ct_dt"].dt.hour * 60 + df["ct_dt"].dt.minute
    df["age_hi"] = df["bar_index"] - df["hi_bar"]
    df["age_lo"] = df["bar_index"] - df["lo_bar"]
    df["control_desc"] = df["hi_anchor"] - df["age_hi"] * PER_BAR
    df["high_asc"] = df["hi_anchor"] + df["age_hi"] * PER_BAR
    df["low_asc"] = df["lo_anchor"] + df["age_lo"] * PER_BAR
    df["ema21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema50"] = df["close"].ewm(span=50, adjust=False).mean()
    df["ema50_slope_30"] = df["ema50"] - df["ema50"].shift(30)
    return df


def scenario_base(row: pd.Series, prev_close: float, scenario: str) -> tuple[float, str]:
    control = float(row["control_desc"])
    if scenario == "control_desc":
        return control, "control_desc"
    if scenario == "high_asc_when_above" and prev_close > control:
        return float(row["high_asc"]), "high_asc"
    if scenario == "low_asc_when_above" and prev_close > control:
        return float(row["low_asc"]), "low_asc"
    return control, "control_desc"


def first_touched_shelf(base: float, prev_close: float, low: float, high: float) -> tuple[int, float] | None:
    k0 = int(round((prev_close - base) / BAND))
    candidates = []
    for k in range(k0 - 4, k0 + 5):
        shelf = base + k * BAND
        if low <= shelf <= high:
            candidates.append((k, shelf))
    if not candidates:
        return None
    return min(candidates, key=lambda x: abs(prev_close - x[1]))


def build_events(
    df: pd.DataFrame,
    scenario: str,
    horizon_bars: int,
    session_end_min: int,
    target_points: float,
    adverse_points: float,
) -> pd.DataFrame:
    events: list[dict] = []
    close = df["close"].to_numpy()
    high = df["high"].to_numpy()
    low = df["low"].to_numpy()
    session_day = df["session_day"].to_numpy()
    tod = df["tod_min"].to_numpy()
    n = len(df)

    for i in range(1, n):
        prev_close = float(close[i - 1])
        row = df.iloc[i]
        base, line_used = scenario_base(row, prev_close, scenario)
        touched = first_touched_shelf(base, prev_close, float(low[i]), float(high[i]))
        if touched is None:
            continue
        zone, shelf = touched
        side = "long_support" if prev_close >= shelf else "short_resistance"
        held = float(close[i]) >= shelf if side == "long_support" else float(close[i]) <= shelf
        target = shelf + target_points if side == "long_support" else shelf - target_points
        adverse = shelf - adverse_points if side == "long_support" else shelf + adverse_points
        outcome = "timeout"
        bars_to = np.nan
        mfe = 0.0
        mae = 0.0
        end = min(n - 1, i + horizon_bars)
        for j in range(i + 1, end + 1):
            if session_day[j] != session_day[i] or tod[j] > session_end_min:
                break
            if side == "long_support":
                mfe = max(mfe, float(high[j]) - shelf)
                mae = max(mae, shelf - float(low[j]))
                hit_target = high[j] >= target
                hit_adverse = low[j] <= adverse
            else:
                mfe = max(mfe, shelf - float(low[j]))
                mae = max(mae, float(high[j]) - shelf)
                hit_target = low[j] <= target
                hit_adverse = high[j] >= adverse
            if hit_target and hit_adverse:
                outcome = "both_same_bar"
                bars_to = j - i
                break
            if hit_target:
                outcome = "target"
                bars_to = j - i
                break
            if hit_adverse:
                outcome = "loss"
                bars_to = j - i
                break
        events.append(
            {
                "scenario": scenario,
                "bar_index": int(row["bar_index"]),
                "ct": row["ct"],
                "session_day": row["session_day"],
                "tod_min": int(row["tod_min"]),
                "line_used": line_used,
                "zone": int(zone),
                "shelf": shelf,
                "side": side,
                "held": bool(held),
                "close": float(row["close"]),
                "prev_close": prev_close,
                "above_control": bool(prev_close > float(row["control_desc"])),
                "ema_bull": bool(row["ema21"] > row["ema50"]),
                "ema_bear": bool(row["ema21"] < row["ema50"]),
                "ema50_slope_up": bool(row["ema50_slope_30"] > 0),
                "outcome": outcome,
                "bars_to_outcome": bars_to,
                "mfe": mfe,
                "mae": mae,
            }
        )
    return pd.DataFrame(events)


def score_subset(label: str, e: pd.DataFrame) -> dict:
    decided = e[e["outcome"].isin(["target", "loss"])]
    wins = int((decided["outcome"] == "target").sum())
    losses = int((decided["outcome"] == "loss").sum())
    return {
        "filter": label,
        "events": int(len(e)),
        "decided": int(len(decided)),
        "wins": wins,
        "losses": losses,
        "win_rate": np.nan if len(decided) == 0 else wins / len(decided),
        "timeouts": int((e["outcome"] == "timeout").sum()),
        "avg_mfe": np.nan if len(e) == 0 else float(e["mfe"].mean()),
        "avg_mae": np.nan if len(e) == 0 else float(e["mae"].mean()),
    }


def filter_scores(events: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    for scenario, g in events.groupby("scenario"):
        filters = {
            "all": g,
            "held": g[g["held"]],
            "rth_0850_1150": g[g["tod_min"].between(8 * 60 + 50, 11 * 60 + 50)],
            "rth_0850_1150_held": g[g["tod_min"].between(8 * 60 + 50, 11 * 60 + 50) & g["held"]],
            "first_per_day": g.sort_values("bar_index").groupby("session_day", as_index=False).first(),
            "first_per_day_held": g[g["held"]].sort_values("bar_index").groupby("session_day", as_index=False).first(),
            "short_only": g[g["side"].eq("short_resistance")],
            "long_only": g[g["side"].eq("long_support")],
            "above_control": g[g["above_control"]],
            "above_control_held": g[g["above_control"] & g["held"]],
            "ema_aligned": g[((g["side"].eq("long_support")) & g["ema_bull"]) | ((g["side"].eq("short_resistance")) & g["ema_bear"])],
            "ema_aligned_held": g[(((g["side"].eq("long_support")) & g["ema_bull"]) | ((g["side"].eq("short_resistance")) & g["ema_bear"])) & g["held"]],
            "rth_held_ema": g[g["tod_min"].between(8 * 60 + 50, 11 * 60 + 50) & g["held"] & (((g["side"].eq("long_support")) & g["ema_bull"]) | ((g["side"].eq("short_resistance")) & g["ema_bear"]))],
        }
        for label, subset in filters.items():
            row = score_subset(label, subset)
            row["scenario"] = scenario
            rows.append(row)
        for line_used, lg in g.groupby("line_used"):
            row = score_subset(f"line_used={line_used}", lg)
            row["scenario"] = scenario
            rows.append(row)
        for zone_min, zone_max in [(-20, -8), (-7, -4), (-3, -1), (0, 0), (1, 3), (4, 7), (8, 20)]:
            subset = g[g["zone"].between(zone_min, zone_max)]
            row = score_subset(f"zone_{zone_min}_{zone_max}", subset)
            row["scenario"] = scenario
            rows.append(row)
    scores = pd.DataFrame(rows)
    return scores.sort_values(["win_rate", "decided"], ascending=[False, False])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bars", type=Path, default=Path("outputs/control_grid/run_20260619_high_only/bars_2026.csv"))
    parser.add_argument("--out", type=Path, default=Path("outputs/control_grid/scenario_miner"))
    parser.add_argument("--horizon-bars", type=int, default=180)
    parser.add_argument("--session-end", default="12:00")
    parser.add_argument("--target-points", type=float, default=34.0)
    parser.add_argument("--adverse-points", type=float, default=34.0)
    args = parser.parse_args()
    end_h, end_m = [int(x) for x in args.session_end.split(":")]
    session_end_min = end_h * 60 + end_m

    args.out.mkdir(parents=True, exist_ok=True)
    bars = load_bars(args.bars)
    all_events = []
    for scenario in ["control_desc", "high_asc_when_above", "low_asc_when_above"]:
        all_events.append(build_events(bars, scenario, args.horizon_bars, session_end_min, args.target_points, args.adverse_points))
    events = pd.concat(all_events, ignore_index=True)
    scores = filter_scores(events)
    robust = scores[scores["decided"] >= 30].copy()

    events.to_csv(args.out / "scenario_events.csv", index=False)
    scores.to_csv(args.out / "scenario_scores.csv", index=False)
    robust.to_csv(args.out / "scenario_scores_decided30.csv", index=False)

    report = [
        "# Control Grid Scenario Miner",
        "",
        f"- Bars: `{args.bars}`",
        f"- Horizon: {args.horizon_bars} bars, capped at {args.session_end}",
        f"- Target: {args.target_points:g} points in the expected direction.",
        f"- Loss: {args.adverse_points:g} adverse points.",
        "- Entry model: shelf touch selected by closest parallel to previous close; optional filters are evaluated without future data.",
        "",
        "## Best Robust Filters (decided >= 30)",
        robust.head(25).to_markdown(index=False),
        "",
        "## Scenario Core Rows",
        scores[scores["filter"].isin(["all", "held", "rth_0850_1150_held", "ema_aligned_held", "rth_held_ema"])].sort_values(["scenario", "filter"]).to_markdown(index=False),
    ]
    (args.out / "scenario_report.md").write_text("\n".join(report), encoding="utf-8")
    print(robust.head(20).to_string(index=False))


if __name__ == "__main__":
    main()
