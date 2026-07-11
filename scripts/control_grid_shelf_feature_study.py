#!/usr/bin/env python3
"""Focused Control Grid shelf feature study for EMA-Fib trades.

The corrected bias retest killed the broad "same direction bias" idea. This
script tests the more specific structural question: do EMA-Fib trades improve
when the entry zone/pivots/recent price action line up with a meaningful
Control Grid shelf?
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd


CT_TZ = "America/Chicago"
BAND = 34.0


@dataclass(frozen=True)
class FilterSpec:
    key: str
    family: str
    label: str
    fn: Callable[[pd.DataFrame], pd.Series]


def pct(v: float) -> str:
    return "-" if pd.isna(v) else f"{v * 100:.1f}%"


def ci_text(lo: float, hi: float) -> str:
    return "[-, -]" if pd.isna(lo) or pd.isna(hi) else f"[{lo:.3f}, {hi:.3f}]"


def bootstrap_mean_ci(values: np.ndarray, rng: np.random.Generator, draws: int) -> tuple[float, float]:
    values = values[np.isfinite(values)]
    if len(values) == 0:
        return (np.nan, np.nan)
    if len(values) == 1:
        return (float(values[0]), float(values[0]))
    samples = rng.choice(values, size=(draws, len(values)), replace=True).mean(axis=1)
    return tuple(np.quantile(samples, [0.025, 0.975]).astype(float))


def bootstrap_delta_ci(base_values: np.ndarray, mask: np.ndarray, rng: np.random.Generator, draws: int) -> tuple[float, float]:
    finite = np.isfinite(base_values)
    base_values = base_values[finite]
    mask = mask[finite]
    if len(base_values) == 0 or not mask.any():
        return (np.nan, np.nan)
    idx_all = np.arange(len(base_values))
    deltas: list[float] = []
    for _ in range(draws):
        idx = rng.choice(idx_all, size=len(idx_all), replace=True)
        sample = base_values[idx]
        sample_mask = mask[idx]
        if sample_mask.any():
            deltas.append(float(sample[sample_mask].mean() - sample.mean()))
    return tuple(np.quantile(np.asarray(deltas), [0.025, 0.975]).astype(float))


def nearest_shelf(value: float, active_line: float) -> tuple[int, float, float]:
    if not np.isfinite(value) or not np.isfinite(active_line):
        return (0, np.nan, np.nan)
    idx = int(round((value - active_line) / BAND))
    price = active_line + idx * BAND
    return (idx, price, value - price)


def load_inputs(trade_path: Path, grid_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    trades = pd.read_csv(trade_path)
    trades = trades[(trades["target"] == 1.5) & (trades["variant"] == "baseline")].copy()
    trades["entry_ts"] = pd.to_datetime(trades["entryAt"], utc=True)
    trades["exit_ts"] = pd.to_datetime(trades["exitAt"], utc=True)
    trades["r"] = pd.to_numeric(trades["r"], errors="coerce")
    trades = trades.sort_values("entry_ts").reset_index(drop=True)

    grid = pd.read_csv(grid_path)
    grid["timestamp"] = pd.to_datetime(grid["timestamp"], utc=True)
    grid["ct"] = pd.to_datetime(grid["ct"], utc=True)
    grid = grid.sort_values("timestamp").reset_index(drop=True)
    return trades, grid


def add_features(trades: pd.DataFrame, grid: pd.DataFrame) -> pd.DataFrame:
    joined = pd.merge_asof(
        trades,
        grid[
            [
                "timestamp",
                "bar_index",
                "open",
                "high",
                "low",
                "close",
                "active_line",
                "high_line",
                "low_line",
                "regime",
                "zone_count",
            ]
        ],
        left_on="entry_ts",
        right_on="timestamp",
        direction="backward",
        tolerance=pd.Timedelta(minutes=2),
        suffixes=("", "_grid"),
    )
    if joined["timestamp"].isna().any():
        raise RuntimeError(f"{joined['timestamp'].isna().sum()} trades did not match grid bars.")

    joined["entry_ct"] = joined["entry_ts"].dt.tz_convert(CT_TZ)
    joined["year"] = joined["entry_ct"].dt.year
    joined["entry_minutes_ct"] = joined["entry_ct"].dt.hour * 60 + joined["entry_ct"].dt.minute
    joined["rth_0850_1150"] = (joined["entry_minutes_ct"] >= 8 * 60 + 50) & (joined["entry_minutes_ct"] <= 11 * 60 + 50)
    joined["rth_0830_1500"] = (joined["entry_minutes_ct"] >= 8 * 60 + 30) & (joined["entry_minutes_ct"] <= 15 * 60)

    entry_rows = []
    for row in joined.itertuples(index=False):
        entry_idx, entry_shelf, entry_dist = nearest_shelf(float(row.entryPrice), float(row.active_line))
        fib_idx, fib_shelf, fib_dist = nearest_shelf(float(row.fib50), float(row.active_line))
        deep_idx, deep_shelf, deep_dist = nearest_shelf(float(row.fibDeep), float(row.active_line))
        low_idx, low_shelf, low_dist = nearest_shelf(float(row.pivotLow), float(row.active_line))
        high_idx, high_shelf, high_dist = nearest_shelf(float(row.pivotHigh), float(row.active_line))
        directional_pivot_dist = low_dist if row.direction == "long" else high_dist
        directional_pivot_idx = low_idx if row.direction == "long" else high_idx
        opposing_pivot_dist = high_dist if row.direction == "long" else low_dist

        zone_low = min(float(row.fib50), float(row.fibDeep))
        zone_high = max(float(row.fib50), float(row.fibDeep))
        shelf_in_entry_zone = zone_low <= fib_shelf <= zone_high

        window_features = {}
        for minutes in [15, 30, 60]:
            start = row.entry_ts - pd.Timedelta(minutes=minutes)
            win = grid[(grid["timestamp"] >= start) & (grid["timestamp"] <= row.entry_ts)].copy()
            shelf_series = win["active_line"] + entry_idx * BAND
            touch = (win["low"] <= shelf_series) & (win["high"] >= shelf_series)
            held = touch & (win["close"] >= shelf_series if row.direction == "long" else win["close"] <= shelf_series)
            broken = touch & (win["close"] < shelf_series if row.direction == "long" else win["close"] > shelf_series)
            touch_count = int(touch.sum())
            held_count = int(held.sum())
            broken_count = int(broken.sum())
            last_touch_age = np.nan
            if touch_count:
                last_touch_ts = win.loc[touch, "timestamp"].iloc[-1]
                last_touch_age = (row.entry_ts - last_touch_ts).total_seconds() / 60.0
            window_features[f"touch_{minutes}m"] = touch_count > 0
            window_features[f"held_touch_{minutes}m"] = held_count > 0
            window_features[f"clean_held_touch_{minutes}m"] = held_count > 0 and broken_count == 0
            window_features[f"touch_count_{minutes}m"] = touch_count
            window_features[f"held_count_{minutes}m"] = held_count
            window_features[f"broken_count_{minutes}m"] = broken_count
            window_features[f"last_touch_age_{minutes}m"] = last_touch_age

        entry_rows.append(
            {
                "entry_shelf_idx": entry_idx,
                "entry_shelf_price": entry_shelf,
                "entry_shelf_dist": entry_dist,
                "entry_shelf_abs_dist": abs(entry_dist),
                "fib50_shelf_idx": fib_idx,
                "fib50_shelf_price": fib_shelf,
                "fib50_shelf_dist": fib_dist,
                "fib50_shelf_abs_dist": abs(fib_dist),
                "fibdeep_shelf_abs_dist": abs(deep_dist),
                "shelf_in_entry_zone": shelf_in_entry_zone,
                "pivot_low_shelf_idx": low_idx,
                "pivot_high_shelf_idx": high_idx,
                "pivot_low_shelf_abs_dist": abs(low_dist),
                "pivot_high_shelf_abs_dist": abs(high_dist),
                "directional_pivot_shelf_idx": directional_pivot_idx,
                "directional_pivot_shelf_abs_dist": abs(directional_pivot_dist),
                "opposing_pivot_shelf_abs_dist": abs(opposing_pivot_dist),
                "entry_zone_same_shelf": fib_idx == deep_idx,
                "pivot_pair_same_shelf": low_idx == high_idx,
                "entry_above_control": entry_idx > 0,
                "entry_below_control": entry_idx < 0,
                "entry_at_control": entry_idx == 0,
                "entry_deep_below_control": entry_idx <= -4,
                "entry_near_control": abs(entry_idx) <= 1,
                **window_features,
            }
        )

    feats = pd.concat([joined.reset_index(drop=True), pd.DataFrame(entry_rows)], axis=1)
    return feats


def summarize(label: str, df: pd.DataFrame, base: pd.DataFrame, mask: pd.Series, rng: np.random.Generator, draws: int) -> dict[str, object]:
    wins = int((df["result"] == "WIN").sum())
    losses = int((df["result"] == "LOSS").sum())
    timeouts = int((df["result"] == "TIMEOUT").sum())
    decided = wins + losses
    avg_r = float(df["r"].mean()) if len(df) else np.nan
    ci_lo, ci_hi = bootstrap_mean_ci(df["r"].to_numpy(float), rng, draws)
    d_lo, d_hi = bootstrap_delta_ci(base["r"].to_numpy(float), mask.to_numpy(bool), rng, draws)
    return {
        "set": label,
        "trades": int(len(df)),
        "wins": wins,
        "losses": losses,
        "timeouts": timeouts,
        "decided": decided,
        "avg_r": avg_r,
        "avg_r_ci": ci_text(ci_lo, ci_hi),
        "all_trades_win_rate": wins / len(df) if len(df) else np.nan,
        "decided_win_rate": wins / decided if decided else np.nan,
        "timeout_rate": timeouts / len(df) if len(df) else np.nan,
        "retained": len(df) / len(base) if len(base) else np.nan,
        "delta_r_vs_baseline": avg_r - float(base["r"].mean()) if len(df) and len(base) else np.nan,
        "delta_r_ci": ci_text(d_lo, d_hi),
        "delta_ci_low": d_lo,
        "delta_ci_high": d_hi,
        "underpowered": decided < 80,
    }


def build_filters() -> list[FilterSpec]:
    specs: list[FilterSpec] = []
    for pts in [2, 4, 6, 8, 10, 17]:
        specs.append(FilterSpec(f"entry_dist_le_{pts}", "distance", f"Entry within {pts} pts of nearest shelf", lambda df, pts=pts: df["entry_shelf_abs_dist"] <= pts))
        specs.append(FilterSpec(f"fib50_dist_le_{pts}", "entry_zone", f"Fib50 within {pts} pts of shelf", lambda df, pts=pts: df["fib50_shelf_abs_dist"] <= pts))
        specs.append(FilterSpec(f"pivot_dir_dist_le_{pts}", "pivot", f"Directional EMA pivot within {pts} pts of shelf", lambda df, pts=pts: df["directional_pivot_shelf_abs_dist"] <= pts))
    specs.extend(
        [
            FilterSpec("shelf_inside_entry_zone", "entry_zone", "Nearest fib50 shelf lies inside 50-61.8 entry zone", lambda df: df["shelf_in_entry_zone"]),
            FilterSpec("entry_zone_same_shelf", "entry_zone", "Fib50 and deep fib sit on same shelf band", lambda df: df["entry_zone_same_shelf"]),
            FilterSpec("entry_at_or_near_control", "zone", "Entry at control or first parallel", lambda df: df["entry_near_control"]),
            FilterSpec("entry_deep_below_control", "zone", "Entry at zone -4 or lower", lambda df: df["entry_deep_below_control"]),
            FilterSpec("entry_above_control", "zone", "Entry above control line", lambda df: df["entry_above_control"]),
            FilterSpec("entry_below_control", "zone", "Entry below control line", lambda df: df["entry_below_control"]),
        ]
    )
    for minutes in [15, 30, 60]:
        specs.append(FilterSpec(f"touch_{minutes}m", "interaction", f"Nearest shelf touched within {minutes}m", lambda df, minutes=minutes: df[f"touch_{minutes}m"]))
        specs.append(FilterSpec(f"held_touch_{minutes}m", "interaction", f"Nearest shelf touched and held within {minutes}m", lambda df, minutes=minutes: df[f"held_touch_{minutes}m"]))
        specs.append(FilterSpec(f"clean_held_touch_{minutes}m", "interaction", f"Nearest shelf held within {minutes}m with no broken touch", lambda df, minutes=minutes: df[f"clean_held_touch_{minutes}m"]))
    specs.extend(
        [
            FilterSpec(
                "fib50_le_6_and_held60",
                "combo",
                "Fib50 within 6 pts of shelf + held touch within 60m",
                lambda df: (df["fib50_shelf_abs_dist"] <= 6) & df["held_touch_60m"],
            ),
            FilterSpec(
                "pivot_le_6_and_held60",
                "combo",
                "Directional pivot within 6 pts of shelf + held touch within 60m",
                lambda df: (df["directional_pivot_shelf_abs_dist"] <= 6) & df["held_touch_60m"],
            ),
            FilterSpec(
                "entry_le_6_and_held60",
                "combo",
                "Entry within 6 pts of shelf + held touch within 60m",
                lambda df: (df["entry_shelf_abs_dist"] <= 6) & df["held_touch_60m"],
            ),
            FilterSpec(
                "rth_pivot_le_6_held60",
                "combo",
                "08:50-11:50 + directional pivot near shelf + held touch",
                lambda df: df["rth_0850_1150"] & (df["directional_pivot_shelf_abs_dist"] <= 6) & df["held_touch_60m"],
            ),
            FilterSpec(
                "cross_pivot_le_6_held60",
                "combo",
                "Cross setups only + directional pivot near shelf + held touch",
                lambda df: (df["setupType"] == "cross") & (df["directional_pivot_shelf_abs_dist"] <= 6) & df["held_touch_60m"],
            ),
            FilterSpec(
                "cross_fib50_le_6_held60",
                "combo",
                "Cross setups only + fib50 near shelf + held touch",
                lambda df: (df["setupType"] == "cross") & (df["fib50_shelf_abs_dist"] <= 6) & df["held_touch_60m"],
            ),
        ]
    )
    return specs


def run_study(features: pd.DataFrame, draws: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(20260620)
    filters = build_filters()
    split_masks = {
        "in_sample_2026": features["year"] == 2026,
        "out_of_sample_2025": features["year"] == 2025,
        "all_available": features["year"].isin([2025, 2026]),
    }
    rows: list[dict[str, object]] = []
    for split, split_mask in split_masks.items():
        base = features[split_mask].copy()
        rows.append({"split": split, "key": "baseline", "family": "baseline", **summarize("Baseline", base, base, pd.Series(True, index=base.index), rng, draws)})
        for spec in filters:
            mask = spec.fn(base).fillna(False)
            rows.append({"split": split, "key": spec.key, "family": spec.family, **summarize(spec.label, base[mask], base, mask, rng, draws)})

    results = pd.DataFrame(rows)
    all_rows = results[results["split"] == "all_available"].copy()
    oos = results[results["split"] == "out_of_sample_2025"][["key", "avg_r", "delta_r_vs_baseline", "delta_ci_low", "delta_ci_high", "trades"]].rename(
        columns={
            "avg_r": "oos_avg_r",
            "delta_r_vs_baseline": "oos_delta_r",
            "delta_ci_low": "oos_delta_ci_low",
            "delta_ci_high": "oos_delta_ci_high",
            "trades": "oos_trades",
        }
    )
    ranked = all_rows.merge(oos, on="key", how="left")
    ranked = ranked[ranked["key"] != "baseline"].sort_values(["delta_ci_low", "avg_r"], ascending=[False, False])
    return results, ranked


def basic_stats(df: pd.DataFrame) -> dict[str, object]:
    wins = int((df["result"] == "WIN").sum())
    losses = int((df["result"] == "LOSS").sum())
    timeouts = int((df["result"] == "TIMEOUT").sum())
    decided = wins + losses
    return {
        "trades": int(len(df)),
        "wins": wins,
        "losses": losses,
        "timeouts": timeouts,
        "avg_r": float(df["r"].mean()) if len(df) else np.nan,
        "all_trades_win_rate": wins / len(df) if len(df) else np.nan,
        "decided_win_rate": wins / decided if decided else np.nan,
        "timeout_rate": timeouts / len(df) if len(df) else np.nan,
    }


def build_diagnostics(features: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    bins = [-0.001, 2, 4, 6, 8, 10, 17.0001]
    labels = ["0-2", "2-4", "4-6", "6-8", "8-10", "10-17"]
    rows: list[dict[str, object]] = []
    for col in ["directional_pivot_shelf_abs_dist", "fib50_shelf_abs_dist", "entry_shelf_abs_dist"]:
        bucket = pd.cut(features[col], bins=bins, labels=labels, include_lowest=True)
        for split, split_df in {
            "all_available": features,
            "in_sample_2026": features[features["year"] == 2026],
            "out_of_sample_2025": features[features["year"] == 2025],
        }.items():
            for value, group in split_df.groupby(bucket.loc[split_df.index], observed=False):
                if len(group) == 0:
                    continue
                rows.append({"split": split, "feature": col, "bucket": str(value), **basic_stats(group)})

    zone_rows: list[dict[str, object]] = []
    for split, split_df in {
        "all_available": features,
        "in_sample_2026": features[features["year"] == 2026],
        "out_of_sample_2025": features[features["year"] == 2025],
    }.items():
        for value, group in split_df.groupby("entry_shelf_idx"):
            zone_rows.append({"split": split, "entry_shelf_idx": int(value), **basic_stats(group)})
    zone = pd.DataFrame(zone_rows).sort_values(["split", "entry_shelf_idx"])
    return pd.DataFrame(rows), zone


def write_report(features: pd.DataFrame, results: pd.DataFrame, ranked: pd.DataFrame, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    features.to_csv(out / "shelf_feature_trade_universe.csv", index=False)
    results.to_csv(out / "shelf_feature_results.csv", index=False)
    ranked.to_csv(out / "shelf_feature_ranked.csv", index=False)
    bins, zones = build_diagnostics(features)
    bins.to_csv(out / "shelf_feature_bins.csv", index=False)
    zones.to_csv(out / "shelf_feature_zone_index.csv", index=False)

    def pretty(df: pd.DataFrame, n: int = 20) -> str:
        view = df.head(n).copy()
        for col in ["all_trades_win_rate", "decided_win_rate", "timeout_rate", "retained"]:
            if col in view:
                view[col] = view[col].map(pct)
        for col in ["avg_r", "delta_r_vs_baseline", "oos_avg_r", "oos_delta_r"]:
            if col in view:
                view[col] = view[col].map(lambda x: "-" if pd.isna(x) else f"{x:.3f}")
        cols = [
            "key",
            "family",
            "set",
            "trades",
            "avg_r",
            "avg_r_ci",
            "all_trades_win_rate",
            "timeout_rate",
            "delta_r_vs_baseline",
            "delta_r_ci",
            "oos_trades",
            "oos_avg_r",
            "oos_delta_r",
        ]
        cols = [c for c in cols if c in view.columns]
        return view[cols].to_markdown(index=False)

    all_base = results[(results["split"] == "all_available") & (results["key"] == "baseline")].iloc[0]
    robust = ranked[
        (ranked["trades"] >= 80)
        & (ranked["oos_trades"] >= 40)
        & (ranked["delta_ci_low"] > 0)
        & (ranked["oos_delta_ci_low"] > 0)
    ]
    exploratory = ranked[
        (ranked["trades"] >= 50)
        & (ranked["delta_r_vs_baseline"] > 0)
        & (ranked["oos_delta_r"] > 0)
    ]

    md: list[str] = []
    md.append("# Control Grid Shelf Feature Study")
    md.append("")
    md.append("## Question")
    md.append("Does the Control Grid help the EMA-Fib engine when tested as shelf structure rather than simple bull/bear bias?")
    md.append("")
    md.append("## Fixed Baseline")
    md.append(f"- Trade universe: {int(all_base['trades'])} EMA-Fib baseline trades, target 1.5, realized R preserved from the engine export.")
    md.append(f"- Baseline average R: {float(all_base['avg_r']):.3f}; all-trades win rate: {pct(float(all_base['all_trades_win_rate']))}; timeout rate: {pct(float(all_base['timeout_rate']))}.")
    md.append("- Control Grid constants unchanged: 1.04 points/hour and 34-point shelves.")
    md.append("- Splits: 2026 in-sample, 2025 out-of-sample confirmation.")
    md.append("")
    md.append("## Tested Feature Families")
    md.append("- **Distance:** entry or fib50 within 2/4/6/8/10/17 points of nearest shelf.")
    md.append("- **Entry zone:** whether the 50-61.8 EMA retracement band actually contains a shelf.")
    md.append("- **Pivot:** whether the directional EMA pivot, long=pivot low and short=pivot high, is close to a shelf.")
    md.append("- **Interaction:** whether the nearest shelf was touched, held, or cleanly held in the prior 15/30/60 minutes.")
    md.append("- **Combos:** small structural combinations around pivot/fib50 proximity plus held shelf behavior.")
    md.append("")
    md.append("## Robust Pass Check")
    if len(robust):
        md.append("The following passed the strict check: positive all-sample delta CI and positive out-of-sample delta CI.")
        md.append(pretty(robust, 10))
    else:
        md.append("No shelf feature passed the strict check of positive all-sample delta CI plus positive out-of-sample delta CI.")
    md.append("")
    md.append("## Best Exploratory Rows")
    md.append("These are not production rules yet; they are leads for a second confirmation pass.")
    md.append(pretty(exploratory, 20) if len(exploratory) else "No exploratory row had positive all-sample and out-of-sample average-R deltas with at least 50 total trades.")
    md.append("")
    md.append("## Full Ranking Snapshot")
    md.append(pretty(ranked, 25))
    md.append("")
    md.append("## Distance Bin Diagnostics")
    bin_view = bins[(bins["split"] == "all_available") & (bins["feature"] == "directional_pivot_shelf_abs_dist")].copy()
    for col in ["all_trades_win_rate", "decided_win_rate", "timeout_rate"]:
        bin_view[col] = bin_view[col].map(pct)
    bin_view["avg_r"] = bin_view["avg_r"].map(lambda x: "-" if pd.isna(x) else f"{x:.3f}")
    md.append("Directional EMA pivot distance to nearest shelf:")
    md.append(bin_view[["bucket", "trades", "avg_r", "all_trades_win_rate", "timeout_rate"]].to_markdown(index=False))
    md.append("")
    zone_view = zones[zones["split"] == "all_available"].sort_values("trades", ascending=False).head(12).copy()
    for col in ["all_trades_win_rate", "decided_win_rate", "timeout_rate"]:
        zone_view[col] = zone_view[col].map(pct)
    zone_view["avg_r"] = zone_view["avg_r"].map(lambda x: "-" if pd.isna(x) else f"{x:.3f}")
    md.append("Most common entry shelf zones:")
    md.append(zone_view[["entry_shelf_idx", "trades", "avg_r", "all_trades_win_rate", "timeout_rate"]].to_markdown(index=False))
    md.append("")
    md.append("## Verdict")
    if len(robust):
        md.append("- At least one shelf-structure feature survived the strict pass check; inspect the robust rows before changing code.")
    else:
        md.append("- The shelf idea is more promising than simple bias conceptually, but this pass still does not produce a statistically clean production filter.")
    md.append("- The strongest research direction is not broad grid bias. It is specific shelf interaction around the EMA pivot/entry zone, especially where the EMA trade setup and shelf touch refer to the same price neighborhood.")
    md.append("- Any row with fewer than 80 total trades or fewer than 40 out-of-sample trades is underpowered and should not be used as a default.")
    (out / "shelf_feature_report.md").write_text("\n".join(md), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ema", type=Path, default=Path("outputs/control_grid/ema_fib_options_trades.csv"))
    parser.add_argument("--grid", type=Path, default=Path("outputs/control_grid/corrected_retest_grid_full/bars_2026.csv"))
    parser.add_argument("--out", type=Path, default=Path("outputs/control_grid/shelf_feature_study"))
    parser.add_argument("--draws", type=int, default=5000)
    args = parser.parse_args()

    trades, grid = load_inputs(args.ema, args.grid)
    features = add_features(trades, grid)
    results, ranked = run_study(features, args.draws)
    write_report(features, results, ranked, args.out)
    print(f"Wrote {args.out / 'shelf_feature_report.md'}")


if __name__ == "__main__":
    main()
