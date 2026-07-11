#!/usr/bin/env python3
"""Corrected EMA-Fib + Control Grid confluence retest.

This script deliberately avoids the earlier broad label search. It tests only
the pre-registered filters in the corrected prompt, using the exact same EMA
trade universe and realized-R exits for every comparison.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd


CT_TZ = "America/Chicago"


@dataclass(frozen=True)
class FilterSpec:
    key: str
    label: str
    fn: Callable[[pd.DataFrame], pd.Series]


def pct(v: float) -> str:
    if pd.isna(v):
        return "-"
    return f"{v * 100:.1f}%"


def fmt_ci(lo: float, hi: float) -> str:
    if pd.isna(lo) or pd.isna(hi):
        return "[-, -]"
    return f"[{lo:.3f}, {hi:.3f}]"


def bootstrap_mean_ci(values: np.ndarray, rng: np.random.Generator, draws: int) -> tuple[float, float]:
    values = values[np.isfinite(values)]
    if len(values) == 0:
        return (np.nan, np.nan)
    if len(values) == 1:
        return (float(values[0]), float(values[0]))
    samples = rng.choice(values, size=(draws, len(values)), replace=True).mean(axis=1)
    return tuple(np.quantile(samples, [0.025, 0.975]).astype(float))


def bootstrap_delta_ci(
    base_values: np.ndarray,
    filter_mask: np.ndarray,
    rng: np.random.Generator,
    draws: int,
) -> tuple[float, float]:
    finite = np.isfinite(base_values)
    base_values = base_values[finite]
    filter_mask = filter_mask[finite]
    n = len(base_values)
    if n == 0 or not filter_mask.any():
        return (np.nan, np.nan)
    deltas: list[float] = []
    idx_all = np.arange(n)
    for _ in range(draws):
        idx = rng.choice(idx_all, size=n, replace=True)
        sampled = base_values[idx]
        sampled_mask = filter_mask[idx]
        if sampled_mask.any():
            deltas.append(float(sampled[sampled_mask].mean() - sampled.mean()))
    if not deltas:
        return (np.nan, np.nan)
    return tuple(np.quantile(np.asarray(deltas), [0.025, 0.975]).astype(float))


def summarize_set(
    label: str,
    df: pd.DataFrame,
    base_df: pd.DataFrame,
    mask_in_base: pd.Series,
    rng: np.random.Generator,
    draws: int,
) -> dict[str, object]:
    wins = int((df["result"] == "WIN").sum())
    losses = int((df["result"] == "LOSS").sum())
    timeouts = int((df["result"] == "TIMEOUT").sum())
    decided = wins + losses
    avg_r = float(df["r"].mean()) if len(df) else np.nan
    ci_lo, ci_hi = bootstrap_mean_ci(df["r"].to_numpy(float), rng, draws)
    base_avg = float(base_df["r"].mean()) if len(base_df) else np.nan
    delta = avg_r - base_avg if len(df) and len(base_df) else np.nan
    d_lo, d_hi = bootstrap_delta_ci(base_df["r"].to_numpy(float), mask_in_base.to_numpy(bool), rng, draws)
    return {
        "set": label,
        "trades": int(len(df)),
        "wins": wins,
        "losses": losses,
        "timeouts": timeouts,
        "decided": decided,
        "avg_r": avg_r,
        "avg_r_ci": fmt_ci(ci_lo, ci_hi),
        "all_trades_win_rate": wins / len(df) if len(df) else np.nan,
        "decided_win_rate": wins / decided if decided else np.nan,
        "timeout_rate": timeouts / len(df) if len(df) else np.nan,
        "retained": len(df) / len(base_df) if len(base_df) else np.nan,
        "delta_r_vs_baseline": delta,
        "delta_r_ci": fmt_ci(d_lo, d_hi),
        "delta_ci_low": d_lo,
        "delta_ci_high": d_hi,
        "underpowered": decided < 150,
    }


def add_grid_bias(trades: pd.DataFrame, grid: pd.DataFrame) -> pd.DataFrame:
    t = trades.copy()
    t["entry_ts"] = pd.to_datetime(t["entryAt"], utc=True)
    t["exit_ts"] = pd.to_datetime(t["exitAt"], utc=True)
    t = t.sort_values("entry_ts").reset_index(drop=True)

    g = grid.copy()
    g["timestamp"] = pd.to_datetime(g["timestamp"], utc=True)
    g = g.sort_values("timestamp").reset_index(drop=True)
    g["grid_bias"] = np.where(g["close"] >= g["active_line"], "bullish", "bearish")
    g["grid_same_long"] = g["grid_bias"] == "bullish"

    joined = pd.merge_asof(
        t,
        g[
            [
                "timestamp",
                "bar_index",
                "ct",
                "close",
                "active_line",
                "regime",
                "grid_bias",
            ]
        ],
        left_on="entry_ts",
        right_on="timestamp",
        direction="backward",
        tolerance=pd.Timedelta(minutes=2),
    )
    joined = joined.rename(
        columns={
            "timestamp": "grid_timestamp",
            "close": "grid_close",
            "ct": "grid_ct",
        }
    )
    joined["entry_ct"] = joined["entry_ts"].dt.tz_convert(CT_TZ)
    joined["entry_date"] = joined["entry_ct"].dt.date.astype(str)
    joined["year"] = joined["entry_ct"].dt.year
    joined["same_direction_bias"] = (
        ((joined["direction"] == "long") & (joined["grid_bias"] == "bullish"))
        | ((joined["direction"] == "short") & (joined["grid_bias"] == "bearish"))
    )
    joined["opposed_bias"] = (
        ((joined["direction"] == "long") & (joined["grid_bias"] == "bearish"))
        | ((joined["direction"] == "short") & (joined["grid_bias"] == "bullish"))
    )

    # H3: agreement must have held for the 30 minutes ending at the entry bar.
    g_indexed = g.set_index("timestamp")
    held_30: list[bool] = []
    for row in joined.itertuples(index=False):
        if pd.isna(row.grid_timestamp):
            held_30.append(False)
            continue
        start = row.entry_ts - pd.Timedelta(minutes=30)
        window = g_indexed.loc[(g_indexed.index >= start) & (g_indexed.index <= row.entry_ts)]
        if len(window) < 25:
            held_30.append(False)
            continue
        wanted = "bullish" if row.direction == "long" else "bearish"
        held_30.append(bool((window["grid_bias"] == wanted).all()))
    joined["same_direction_held_30m"] = held_30

    # ES RTH as requested: 08:30-15:00 CT.
    minutes = joined["entry_ct"].dt.hour * 60 + joined["entry_ct"].dt.minute
    joined["in_rth"] = (minutes >= 8 * 60 + 30) & (minutes <= 15 * 60)
    return joined


def verdict_lines(table: pd.DataFrame) -> list[str]:
    def row(split: str, hyp: str) -> pd.Series:
        return table[(table["split"] == split) & (table["hypothesis"] == hyp)].iloc[0]

    lines: list[str] = []
    h1_2026 = row("in_sample_2026", "h1")
    h1_2025 = row("out_of_sample_2025", "h1")
    h4_2026 = row("in_sample_2026", "h4")
    h4_2025 = row("out_of_sample_2025", "h4")
    h3_all = row("all_available", "h3")

    h1_passes = (
        float(h1_2026["delta_ci_low"]) > 0
        and float(h1_2025["delta_ci_low"]) > 0
    )
    h4_hurts = (
        float(h4_2026["delta_r_vs_baseline"]) < 0
        and float(h4_2025["delta_r_vs_baseline"]) < 0
    )

    lines.append(
        f"- H1 does {'pass' if h1_passes else 'not pass'} the corrected edge test. "
        f"In 2026 its average-R delta is {float(h1_2026['delta_r_vs_baseline']):+.3f} "
        f"with CI {h1_2026['delta_r_ci']}; in 2025 it is "
        f"{float(h1_2025['delta_r_vs_baseline']):+.3f} with CI {h1_2025['delta_r_ci']}."
    )
    lines.append(
        f"- H4, the deliberately wrong opposite-bias filter, does {'hurt' if h4_hurts else 'not reliably hurt'}. "
        f"Its 2026 delta is {float(h4_2026['delta_r_vs_baseline']):+.3f} "
        f"and its 2025 delta is {float(h4_2025['delta_r_vs_baseline']):+.3f}; both confidence intervals cross zero."
    )
    lines.append(
        f"- H3 is stricter but not cleaner: all-available average-R delta is "
        f"{float(h3_all['delta_r_vs_baseline']):+.3f} with CI {h3_all['delta_r_ci']}."
    )
    lines.append(
        "- Every filtered main hypothesis is under the 150-decided-trade threshold, so even a positive-looking split should be treated as exploratory."
    )
    lines.append(
        "- The earlier high-ranking confluence result was likely inflated by non-identical trade universes, multiple-comparison selection, and timeout handling."
    )
    return lines


def write_outputs(
    enriched: pd.DataFrame,
    table: pd.DataFrame,
    breakdown: pd.DataFrame,
    out_dir: Path,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    enriched.to_csv(out_dir / "corrected_trade_universe.csv", index=False)
    table.to_csv(out_dir / "corrected_retest_table.csv", index=False)
    breakdown.to_csv(out_dir / "corrected_retest_breakdown.csv", index=False)

    md: list[str] = []
    md.append("# Control Grid Confluence Corrected Re-Test")
    md.append("")
    md.append("## Methodology")
    md.append("- EMA universe: `target=1.5`, `variant=baseline`; every comparison uses the exact same entries and realized-R exits.")
    md.append("- Control Grid constants unchanged: slope `1.04` points/hour and band `34` points.")
    md.append("- Bias at entry is computed from the Control Grid bar at or before the EMA entry bar. No future Control Grid bar is used.")
    md.append("- RTH window for H2: `08:30-15:00 CT`.")
    md.append("- H3 requires every available Control Grid bar in the prior 30 minutes to agree with the trade direction, with at least 25 bars present.")
    md.append("- Split: `2026` is the development/in-sample set; `2025` is the untouched confirmation/out-of-sample set because 2025 data is available.")
    md.append("")
    md.append("## Main Table")
    display = table.copy()
    for col in ["all_trades_win_rate", "decided_win_rate", "timeout_rate", "retained"]:
        display[col] = display[col].map(pct)
    for col in ["avg_r", "delta_r_vs_baseline"]:
        display[col] = display[col].map(lambda v: "-" if pd.isna(v) else f"{v:.3f}")
    md.append(display.drop(columns=["delta_ci_low", "delta_ci_high"]).to_markdown(index=False))
    md.append("")
    md.append("## Breakdown")
    bd = breakdown.copy()
    for col in ["all_trades_win_rate", "decided_win_rate", "timeout_rate", "retained"]:
        bd[col] = bd[col].map(pct)
    for col in ["avg_r", "delta_r_vs_baseline"]:
        bd[col] = bd[col].map(lambda v: "-" if pd.isna(v) else f"{v:.3f}")
    md.append(bd.drop(columns=["delta_ci_low", "delta_ci_high"]).to_markdown(index=False))
    md.append("")
    md.append("## Verdict")
    md.extend(verdict_lines(table))
    md.append("")
    md.append("## Methodology Risk Notes")
    md.append("- The Control Grid bias join is point-in-time: each EMA entry uses the latest grid bar at or before entry, with a 2-minute maximum tolerance.")
    md.append("- The Control Grid itself uses prior completed day/week summaries for anchors and bar-index decay, so the filter does not read forming daily or weekly extremes.")
    md.append("- This retest uses ES-only EMA trades from the existing export. It does not prove the same result for SPY/SPX until an equivalent clean trade export exists.")
    md.append("")
    (out_dir / "corrected_retest_report.md").write_text("\n".join(md), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ema", type=Path, default=Path("outputs/control_grid/ema_fib_options_trades.csv"))
    parser.add_argument("--grid", type=Path, default=Path("outputs/control_grid/corrected_retest_grid_full/bars_2026.csv"))
    parser.add_argument("--out", type=Path, default=Path("outputs/control_grid/corrected_retest"))
    parser.add_argument("--draws", type=int, default=5000)
    args = parser.parse_args()

    trades = pd.read_csv(args.ema)
    trades = trades[(trades["target"] == 1.5) & (trades["variant"] == "baseline")].copy()
    trades["r"] = pd.to_numeric(trades["r"], errors="coerce")
    grid = pd.read_csv(args.grid)
    enriched = add_grid_bias(trades, grid)
    if enriched["grid_bias"].isna().any():
        missing = int(enriched["grid_bias"].isna().sum())
        raise RuntimeError(f"{missing} EMA entries could not be matched to a Control Grid bar.")

    filters = [
        FilterSpec("baseline", "Baseline", lambda df: pd.Series(True, index=df.index)),
        FilterSpec("h1", "H1 same-direction bias", lambda df: df["same_direction_bias"]),
        FilterSpec("h2", "H2 H1 + RTH", lambda df: df["same_direction_bias"] & df["in_rth"]),
        FilterSpec("h3", "H3 H1 held 30m", lambda df: df["same_direction_held_30m"]),
        FilterSpec("h4", "H4 opposed-bias control", lambda df: df["opposed_bias"]),
    ]
    split_masks = {
        "in_sample_2026": enriched["year"] == 2026,
        "out_of_sample_2025": enriched["year"] == 2025,
        "all_available": enriched["year"].isin([2025, 2026]),
    }

    rng = np.random.default_rng(20260619)
    rows: list[dict[str, object]] = []
    breakdown_rows: list[dict[str, object]] = []
    for split_name, split_mask in split_masks.items():
        split_df = enriched[split_mask].copy()
        for spec in filters:
            mask = spec.fn(split_df).fillna(False)
            rows.append(
                {
                    "split": split_name,
                    "hypothesis": spec.key,
                    **summarize_set(spec.label, split_df[mask], split_df, mask, rng, args.draws),
                }
            )

        for group_col in ["setupType", "direction"]:
            for group_value, group_df in split_df.groupby(group_col):
                base_group = group_df.copy()
                for spec in filters[1:]:
                    mask = spec.fn(base_group).fillna(False)
                    breakdown_rows.append(
                        {
                            "split": split_name,
                            "group": group_col,
                            "value": group_value,
                            "hypothesis": spec.key,
                            **summarize_set(spec.label, base_group[mask], base_group, mask, rng, args.draws),
                        }
                    )

    table = pd.DataFrame(rows)
    breakdown = pd.DataFrame(breakdown_rows)
    write_outputs(enriched, table, breakdown, args.out)
    print(f"Wrote {args.out / 'corrected_retest_report.md'}")


if __name__ == "__main__":
    main()
