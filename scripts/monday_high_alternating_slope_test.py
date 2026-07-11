#!/usr/bin/env python3
"""Test whether Tue/Thu prefer ascending Monday-high shelves while Wed/Fri prefer descending.

Anchor: Monday 12:00-14:00 CT high.
Families tested from the exact same anchor:
- descending: anchor - 1.04 points per trading hour, with 34-point shelves
- ascending: anchor + 1.04 points per trading hour, with 34-point shelves

This is a shelf-behavior study only. It measures touch/rejection and follow-through
inside the same RTH session. It does not include the EMA/Fib engine.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


ET_TZ = "America/New_York"
CT_TZ = "America/Chicago"
SLOPE = 1.04
BAND = 34.0
RTH_OPEN_ET = 9 * 60 + 30
RTH_CLOSE_ET = 16 * 60
ANCHOR_START_CT = 12 * 60
ANCHOR_END_CT = 14 * 60


@dataclass(frozen=True)
class Config:
    tolerance: float = 2.5
    target_points: float = 17.0
    adverse_points: float = 17.0
    cooldown_bars: int = 30
    max_shelf_abs: int = 10

    @property
    def per_bar(self) -> float:
        return SLOPE / 60.0


def read_es(path: Path) -> pd.DataFrame:
    raw = pd.read_csv(path)
    ts_col = "timestamp" if "timestamp" in raw.columns else "ts_event"
    cols = [ts_col, "open", "high", "low", "close"]
    if "volume" in raw.columns:
        cols.append("volume")
    df = raw[cols].rename(columns={ts_col: "timestamp"}).copy()
    if "volume" not in df.columns:
        df["volume"] = 0
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).drop_duplicates("timestamp")
    df = df.sort_values("timestamp").reset_index(drop=True)
    df["bar_index"] = np.arange(len(df), dtype=np.int64)
    df["et"] = df["timestamp"].dt.tz_convert(ET_TZ)
    df["ct"] = df["timestamp"].dt.tz_convert(CT_TZ)
    et_mins = df["et"].dt.hour * 60 + df["et"].dt.minute
    ct_mins = df["ct"].dt.hour * 60 + df["ct"].dt.minute
    df["rth"] = (df["et"].dt.weekday < 5) & (et_mins >= RTH_OPEN_ET) & (et_mins < RTH_CLOSE_ET)
    df["anchor_window"] = df["rth"] & (ct_mins >= ANCHOR_START_CT) & (ct_mins < ANCHOR_END_CT)
    df["rth_date"] = df["ct"].dt.date.astype(str)
    df["weekday"] = df["ct"].dt.day_name()
    day = pd.to_datetime(df["rth_date"])
    df["week_start"] = (day - pd.to_timedelta(day.dt.weekday, unit="D")).dt.date.astype(str)
    return df


def monday_anchors(df: pd.DataFrame) -> pd.DataFrame:
    rth = df[df["rth"]].copy()
    win = df[df["anchor_window"]].copy()
    rows = []
    for week_start, week in rth.groupby("week_start", sort=True):
        mon = week[week["weekday"] == "Monday"]
        if mon.empty:
            continue
        mon_date = mon["rth_date"].iloc[0]
        mon_win = win[win["rth_date"] == mon_date]
        source = "12-2 CT"
        if mon_win.empty:
            mon_win = mon
            source = "fallback RTH"
        idx = mon_win["high"].idxmax()
        row = df.loc[idx]
        rows.append(
            {
                "week_start": week_start,
                "monday_date": mon_date,
                "anchor_price": float(row["high"]),
                "anchor_bar": int(row["bar_index"]),
                "anchor_time_ct": row["ct"],
                "source": source,
            }
        )
    return pd.DataFrame(rows)


def level_at(anchor_price: float, anchor_bar: int, bar_index: int, shelf_index: int, model: str, cfg: Config) -> float:
    drift = cfg.per_bar * (bar_index - anchor_bar)
    base = anchor_price + drift if model == "ascending" else anchor_price - drift
    return base + shelf_index * BAND


def nearest(price: float, anchor_price: float, anchor_bar: int, bar_index: int, side: str, model: str, cfg: Config) -> dict:
    drift = cfg.per_bar * (bar_index - anchor_bar)
    base = anchor_price + drift if model == "ascending" else anchor_price - drift
    raw = int(round((price - base) / BAND))
    best = None
    for k in range(raw - 2, raw + 3):
        if abs(k) > cfg.max_shelf_abs:
            continue
        lvl = base + BAND * k
        eligible = lvl >= price - cfg.tolerance if side == "resistance" else lvl <= price + cfg.tolerance
        if not eligible:
            continue
        rec = {
            "level": float(lvl),
            "shelf_index": int(k),
            "abs_dist": float(abs(lvl - price)),
            "dist": float(lvl - price if side == "resistance" else price - lvl),
        }
        if best is None or rec["abs_dist"] < best["abs_dist"]:
            best = rec
    if best is None:
        lvl = base + BAND * raw
        best = {"level": float(lvl), "shelf_index": int(raw), "abs_dist": float(abs(lvl - price)), "dist": float(abs(lvl - price))}
    return best


def race(day: pd.DataFrame, pos: int, direction: str, entry: float, cfg: Config) -> tuple[str, float, float]:
    future = day.iloc[pos + 1 :]
    if future.empty:
        return "timeout", 0.0, 0.0
    if direction == "short":
        mfe = entry - float(future["low"].min())
        mae = float(future["high"].max()) - entry
        for row in future.itertuples(index=False):
            hit_target = row.low <= entry - cfg.target_points
            hit_adverse = row.high >= entry + cfg.adverse_points
            if hit_target and hit_adverse:
                return "both_same_bar", mfe, mae
            if hit_target:
                return "target_first", mfe, mae
            if hit_adverse:
                return "adverse_first", mfe, mae
    else:
        mfe = float(future["high"].max()) - entry
        mae = entry - float(future["low"].min())
        for row in future.itertuples(index=False):
            hit_target = row.high >= entry + cfg.target_points
            hit_adverse = row.low <= entry - cfg.adverse_points
            if hit_target and hit_adverse:
                return "both_same_bar", mfe, mae
            if hit_target:
                return "target_first", mfe, mae
            if hit_adverse:
                return "adverse_first", mfe, mae
    return "timeout", mfe, mae


def collect(df: pd.DataFrame, anchors: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    events = []
    rth = df[df["rth"]].copy()
    by_week = {row.week_start: row for row in anchors.itertuples(index=False)}
    last: dict[tuple[str, str, str, str], int] = {}
    for (week_start, rth_date), day in rth.groupby(["week_start", "rth_date"], sort=True):
        if week_start not in by_week:
            continue
        a = by_week[week_start]
        weekday = day["weekday"].iloc[0]
        if weekday not in {"Tuesday", "Wednesday", "Thursday", "Friday"}:
            continue
        day = day.reset_index(drop=True)
        for pos, row in day.iterrows():
            bar_index = int(row["bar_index"])
            if bar_index <= int(a.anchor_bar):
                continue
            for model in ["descending", "ascending"]:
                for side, direction in [("resistance", "short"), ("support", "long")]:
                    sh = nearest(float(row["close"]), float(a.anchor_price), int(a.anchor_bar), bar_index, side, model, cfg)
                    touched = float(row["high"]) >= sh["level"] - cfg.tolerance and float(row["low"]) <= sh["level"] + cfg.tolerance
                    if side == "resistance":
                        reject = touched and float(row["close"]) <= sh["level"] and float(row["close"]) < float(row["open"])
                    else:
                        reject = touched and float(row["close"]) >= sh["level"] and float(row["close"]) > float(row["open"])
                    if not reject:
                        continue
                    key = (model, rth_date, side, str(sh["shelf_index"]))
                    if key in last and bar_index - last[key] < cfg.cooldown_bars:
                        continue
                    last[key] = bar_index
                    outcome, mfe, mae = race(day, pos, direction, float(row["close"]), cfg)
                    proposed = (weekday in {"Tuesday", "Thursday"} and model == "ascending") or (weekday in {"Wednesday", "Friday"} and model == "descending")
                    events.append(
                        {
                            "model": model,
                            "proposed_alternating": proposed,
                            "weekday": weekday,
                            "rth_date": rth_date,
                            "time_ct": row["ct"],
                            "side": side,
                            "direction": direction,
                            "entry_close": float(row["close"]),
                            "shelf_level": sh["level"],
                            "shelf_index": sh["shelf_index"],
                            "abs_dist": sh["abs_dist"],
                            "monday_anchor": float(a.anchor_price),
                            "monday_anchor_time_ct": a.anchor_time_ct,
                            "outcome": outcome,
                            "mfe": mfe,
                            "mae": mae,
                            "win": outcome in {"target_first", "both_same_bar"},
                            "loss": outcome == "adverse_first",
                            "timeout": outcome == "timeout",
                        }
                    )
    return pd.DataFrame(events)


def summarize(events: pd.DataFrame) -> pd.DataFrame:
    rows = []
    if events.empty:
        return pd.DataFrame()
    groupers = [
        ("model_weekday_side", ["model", "weekday", "side"]),
        ("model_weekday", ["model", "weekday"]),
        ("model_all", ["model"]),
        ("proposed_alternating", ["proposed_alternating"]),
    ]
    for section, cols in groupers:
        for keys, g in events.groupby(cols, dropna=False):
            if not isinstance(keys, tuple):
                keys = (keys,)
            decided = g[g["outcome"].isin(["target_first", "both_same_bar", "adverse_first"])]
            rec = {"section": section}
            rec.update({col: val for col, val in zip(cols, keys)})
            rec.update(
                {
                    "events": len(g),
                    "decided": len(decided),
                    "wins": int(decided["win"].sum()),
                    "losses": int(decided["loss"].sum()),
                    "timeouts": int(g["timeout"].sum()),
                    "win_rate": float(decided["win"].sum() / len(decided)) if len(decided) else np.nan,
                    "median_mfe": float(g["mfe"].median()),
                    "median_mae": float(g["mae"].median()),
                    "avg_mfe": float(g["mfe"].mean()),
                    "avg_mae": float(g["mae"].mean()),
                }
            )
            rows.append(rec)
    return pd.DataFrame(rows)


def write_report(out: Path, df: pd.DataFrame, events: pd.DataFrame, summary: pd.DataFrame, cfg: Config) -> None:
    out.mkdir(parents=True, exist_ok=True)
    events.to_csv(out / "monday_high_alternating_events.csv", index=False)
    summary.to_csv(out / "monday_high_alternating_summary.csv", index=False)
    pivot = summary[summary["section"].isin(["model_weekday", "model_all", "proposed_alternating"])].copy()
    lines = [
        "# Monday High Descending vs Ascending Shelf Test",
        "",
        f"Data: ES 1-minute, {df['ct'].min()} to {df['ct'].max()}, {len(df):,} bars.",
        f"Anchor: Monday 12:00-14:00 CT high. Tolerance {cfg.tolerance} points. Target {cfg.target_points}, adverse {cfg.adverse_points}.",
        "",
        pivot.to_markdown(index=False, floatfmt=".3f") if not pivot.empty else "No events.",
        "",
        "Interpretation rule tested: Tuesday and Thursday use ascending Monday-high family; Wednesday and Friday use descending Monday-high family.",
    ]
    (out / "monday_high_alternating_report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("SPYPROWEB-live-recovered/data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv"))
    p.add_argument("--out", type=Path, default=Path("outputs/control_shelf_monday_alternating"))
    p.add_argument("--tolerance", type=float, default=2.5)
    p.add_argument("--target", type=float, default=17.0)
    p.add_argument("--adverse", type=float, default=17.0)
    args = p.parse_args()
    cfg = Config(tolerance=args.tolerance, target_points=args.target, adverse_points=args.adverse)
    df = read_es(args.data)
    anchors = monday_anchors(df)
    events = collect(df, anchors, cfg)
    summary = summarize(events)
    write_report(args.out, df, events, summary, cfg)
    print(summary[summary["section"].isin(["model_weekday", "model_all", "proposed_alternating"])].to_string(index=False))
    print(f"\nWrote: {args.out}")


if __name__ == "__main__":
    main()
