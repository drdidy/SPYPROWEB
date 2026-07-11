#!/usr/bin/env python3
"""Mine simple early-day rules for choosing Monday-high descending vs ascending shelves."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from monday_high_alternating_slope_test import (
    BAND,
    Config,
    monday_anchors,
    read_es,
)


def build_day_features(df: pd.DataFrame, anchors: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    rth = df[df["rth"]].copy()
    rows = []
    monday_by_week = {row.week_start: row for row in anchors.itertuples(index=False)}
    daily = (
        rth.groupby(["week_start", "rth_date"], sort=True)
        .agg(
            weekday=("weekday", "first"),
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            first_bar=("bar_index", "first"),
            last_bar=("bar_index", "last"),
        )
        .reset_index()
    )
    daily["prev_close"] = daily["close"].shift(1)
    daily["prev_return"] = daily["close"].shift(1) - daily["open"].shift(1)
    for row in daily.itertuples(index=False):
        if row.weekday not in {"Tuesday", "Wednesday", "Thursday", "Friday"}:
            continue
        if row.week_start not in monday_by_week:
            continue
        a = monday_by_week[row.week_start]
        day = rth[rth["rth_date"] == row.rth_date].reset_index(drop=True)
        if day.empty:
            continue
        first_30 = day.iloc[: min(30, len(day))]
        first_60 = day.iloc[: min(60, len(day))]
        open_bar = int(row.first_bar)
        desc_base = float(a.anchor_price) - cfg.per_bar * (open_bar - int(a.anchor_bar))
        asc_base = float(a.anchor_price) + cfg.per_bar * (open_bar - int(a.anchor_bar))
        desc_rel = float(row.open) - desc_base
        asc_rel = float(row.open) - asc_base
        desc_idx = int(round(desc_rel / BAND))
        asc_idx = int(round(asc_rel / BAND))
        desc_near = desc_base + desc_idx * BAND
        asc_near = asc_base + asc_idx * BAND
        rows.append(
            {
                "week_start": row.week_start,
                "rth_date": row.rth_date,
                "weekday": row.weekday,
                "open": float(row.open),
                "close": float(row.close),
                "range": float(row.high - row.low),
                "day_return": float(row.close - row.open),
                "gap": float(row.open - row.prev_close) if not pd.isna(row.prev_close) else np.nan,
                "prev_return": float(row.prev_return) if not pd.isna(row.prev_return) else np.nan,
                "first30_return": float(first_30["close"].iloc[-1] - row.open),
                "first60_return": float(first_60["close"].iloc[-1] - row.open),
                "desc_open_rel_control": desc_rel,
                "asc_open_rel_control": asc_rel,
                "desc_open_shelf_idx": desc_idx,
                "asc_open_shelf_idx": asc_idx,
                "desc_open_dist_nearest": float(abs(row.open - desc_near)),
                "asc_open_dist_nearest": float(abs(row.open - asc_near)),
                "open_above_desc_control": desc_rel > 0,
                "open_above_asc_control": asc_rel > 0,
                "monday_anchor": float(a.anchor_price),
                "monday_anchor_time_ct": a.anchor_time_ct,
            }
        )
    return pd.DataFrame(rows)


def model_stats(events: pd.DataFrame, label: str) -> dict:
    decided = events[events["outcome"].isin(["target_first", "both_same_bar", "adverse_first"])]
    wins = int(decided["win"].sum())
    losses = int(decided["loss"].sum())
    return {
        "rule": label,
        "events": int(len(events)),
        "decided": int(len(decided)),
        "wins": wins,
        "losses": losses,
        "timeouts": int(events["timeout"].sum()),
        "win_rate": wins / len(decided) if len(decided) else np.nan,
        "net_wins": wins - losses,
        "median_mfe": float(events["mfe"].median()) if len(events) else np.nan,
        "median_mae": float(events["mae"].median()) if len(events) else np.nan,
    }


def choose_events(events: pd.DataFrame, features: pd.DataFrame, rule_name: str, chooser) -> pd.DataFrame:
    f = features.copy()
    f["chosen_model"] = f.apply(chooser, axis=1)
    merged = events.merge(f[["rth_date", "chosen_model"]], on="rth_date", how="inner")
    return merged[merged["model"] == merged["chosen_model"]].copy()


def mine_rules(events: pd.DataFrame, features: pd.DataFrame) -> pd.DataFrame:
    rows = []
    rows.append(model_stats(events[events["model"] == "descending"], "always descending"))
    rows.append(model_stats(events[events["model"] == "ascending"], "always ascending"))
    rows.append(
        model_stats(
            choose_events(
                events,
                features,
                "Tue/Thu ascending",
                lambda r: "ascending" if r["weekday"] in {"Tuesday", "Thursday"} else "descending",
            ),
            "Tue/Thu ascending, Wed/Fri descending",
        )
    )
    rows.append(
        model_stats(
            choose_events(
                events,
                features,
                "positive first30 ascending",
                lambda r: "ascending" if r["first30_return"] > 0 else "descending",
            ),
            "first30 up -> ascending",
        )
    )
    rows.append(
        model_stats(
            choose_events(
                events,
                features,
                "negative first30 ascending",
                lambda r: "ascending" if r["first30_return"] < 0 else "descending",
            ),
            "first30 down -> ascending",
        )
    )
    for col in ["gap", "prev_return", "first30_return", "first60_return", "desc_open_rel_control", "desc_open_dist_nearest"]:
        vals = features[col].dropna()
        if vals.empty:
            continue
        thresholds = sorted(set([float(vals.quantile(q)) for q in [0.2, 0.35, 0.5, 0.65, 0.8]] + [0.0]))
        for t in thresholds:
            for op in [">", "<="]:
                label = f"{col} {op} {t:.2f} -> ascending"
                if op == ">":
                    chosen = choose_events(events, features, label, lambda r, c=col, th=t: "ascending" if r[c] > th else "descending")
                else:
                    chosen = choose_events(events, features, label, lambda r, c=col, th=t: "ascending" if r[c] <= th else "descending")
                rows.append(model_stats(chosen, label))
    out = pd.DataFrame(rows)
    return out.sort_values(["win_rate", "decided"], ascending=[False, False]).reset_index(drop=True)


def feature_contrasts(events: pd.DataFrame, features: pd.DataFrame) -> pd.DataFrame:
    # Per-day net score for each model, then compare days where ascending is better.
    day_model = (
        events[events["outcome"].isin(["target_first", "both_same_bar", "adverse_first"])]
        .groupby(["rth_date", "model"])
        .agg(wins=("win", "sum"), losses=("loss", "sum"), decided=("win", "size"))
        .reset_index()
    )
    day_model["score"] = day_model["wins"] - day_model["losses"]
    pivot = day_model.pivot(index="rth_date", columns="model", values="score").fillna(0).reset_index()
    pivot["better_model"] = np.where(pivot.get("ascending", 0) > pivot.get("descending", 0), "ascending", np.where(pivot.get("descending", 0) > pivot.get("ascending", 0), "descending", "tie"))
    joined = features.merge(pivot[["rth_date", "better_model"]], on="rth_date", how="inner")
    rows = []
    for better, g in joined.groupby("better_model"):
        rec = {"better_model": better, "days": len(g)}
        for col in ["gap", "prev_return", "first30_return", "first60_return", "desc_open_rel_control", "desc_open_dist_nearest", "range", "day_return"]:
            rec[f"{col}_median"] = float(g[col].median())
        rows.append(rec)
    return pd.DataFrame(rows)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("SPYPROWEB-live-recovered/data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv"))
    p.add_argument("--events", type=Path, default=Path("outputs/control_shelf_monday_alternating/tol6_target17/monday_high_alternating_events.csv"))
    p.add_argument("--out", type=Path, default=Path("outputs/control_shelf_monday_slope_regime"))
    p.add_argument("--tolerance", type=float, default=6.0)
    args = p.parse_args()
    cfg = Config(tolerance=args.tolerance)
    df = read_es(args.data)
    anchors = monday_anchors(df)
    features = build_day_features(df, anchors, cfg)
    events = pd.read_csv(args.events)
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    rules = mine_rules(events, features)
    contrasts = feature_contrasts(events, features)
    features.to_csv(out / "monday_slope_day_features.csv", index=False)
    rules.to_csv(out / "monday_slope_rule_scores.csv", index=False)
    contrasts.to_csv(out / "monday_slope_feature_contrasts.csv", index=False)
    report = [
        "# Monday Slope Regime Miner",
        "",
        "This checks whether there is a simple early-day condition that tells us when to use the ascending Monday-high family instead of the descending family.",
        "",
        "## Best Simple Rules",
        "",
        rules.head(20).to_markdown(index=False, floatfmt=".3f"),
        "",
        "## Feature Contrast by Which Model Won the Day",
        "",
        contrasts.to_markdown(index=False, floatfmt=".3f"),
    ]
    (out / "monday_slope_regime_report.md").write_text("\n".join(report), encoding="utf-8")
    print(rules.head(20).to_string(index=False))
    print("\nFeature contrasts")
    print(contrasts.to_string(index=False))
    print(f"\nWrote: {out}")


if __name__ == "__main__":
    main()
