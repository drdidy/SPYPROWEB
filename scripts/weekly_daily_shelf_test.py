#!/usr/bin/env python3
"""Test weekly Monday shelves vs previous-day daily shelves on ES 1-minute data.

Definitions used here:
- Anchor window: 12:00-14:00 America/Chicago, equivalent to 13:00-15:00 ET.
- Weekly control: Monday anchor-window high, carried forward through Fri.
- Daily control: previous completed RTH day anchor-window high.
- Shelves: descending high-family lines spaced by 34 points.
- Touch/rejection: price touches a shelf within tolerance, then closes back away
  from it on a candle of the rejection direction.
- Win proxy: after the rejection close, price moves away by a target before it
  moves adversely by the stop amount, using only later bars in that RTH session.

This is a shelf-quality test, not the EMA-Fib options engine.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


ET_TZ = "America/New_York"
CT_TZ = "America/Chicago"
SLOPE_PER_HOUR = 1.04
BAND = 34.0
RTH_OPEN_ET = 9 * 60 + 30
RTH_CLOSE_ET = 16 * 60
ANCHOR_START_CT = 12 * 60
ANCHOR_END_CT = 14 * 60


@dataclass(frozen=True)
class Config:
    tolerance: float = 6.0
    confluence_tolerance: float = 6.0
    target_points: float = 17.0
    adverse_points: float = 17.0
    cooldown_bars: int = 30
    max_shelf_abs: int = 10

    @property
    def per_bar(self) -> float:
        return SLOPE_PER_HOUR / 60.0


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


def build_anchor_table(df: pd.DataFrame) -> pd.DataFrame:
    rth = df[df["rth"]].copy()
    window = df[df["anchor_window"]].copy()
    rows: list[dict] = []
    for rth_date, day in rth.groupby("rth_date", sort=True):
        win = window[window["rth_date"] == rth_date]
        source = "12-2 CT"
        if win.empty:
            win = day
            source = "fallback RTH"
        idx = win["high"].idxmax()
        row = df.loc[idx]
        rows.append(
            {
                "rth_date": rth_date,
                "weekday": str(day["weekday"].iloc[0]),
                "week_start": str(day["week_start"].iloc[0]),
                "anchor_price": float(row["high"]),
                "anchor_bar": int(row["bar_index"]),
                "anchor_time_ct": row["ct"],
                "source": source,
                "rth_first_bar": int(day["bar_index"].iloc[0]),
                "rth_last_bar": int(day["bar_index"].iloc[-1]),
                "rth_bars": int(len(day)),
            }
        )
    out = pd.DataFrame(rows)
    out["date"] = pd.to_datetime(out["rth_date"])
    return out


def shelf_level(anchor_price: float, anchor_bar: int, bar_index: int, shelf_index: int, cfg: Config) -> float:
    return anchor_price - cfg.per_bar * (bar_index - anchor_bar) + BAND * shelf_index


def nearest_shelf(price: float, bar_index: int, anchor: pd.Series, side: str, cfg: Config) -> dict:
    base = float(anchor["anchor_price"]) - cfg.per_bar * (bar_index - int(anchor["anchor_bar"]))
    raw = int(round((price - base) / BAND))
    best: dict | None = None
    for k in range(raw - 2, raw + 3):
        if abs(k) > cfg.max_shelf_abs:
            continue
        level = base + BAND * k
        eligible = level >= price - cfg.tolerance if side == "resistance" else level <= price + cfg.tolerance
        if not eligible:
            continue
        dist = level - price if side == "resistance" else price - level
        rec = {"level": float(level), "shelf_index": int(k), "dist": float(dist), "abs_dist": float(abs(level - price))}
        if best is None or rec["abs_dist"] < best["abs_dist"]:
            best = rec
    if best is None:
        k = raw
        level = base + BAND * k
        best = {"level": float(level), "shelf_index": int(k), "dist": float(abs(level - price)), "abs_dist": float(abs(level - price))}
    return best


def anchor_for_day(anchors: pd.DataFrame, rth_date: str, family: str) -> pd.Series | None:
    day = pd.Timestamp(rth_date)
    current = anchors[anchors["rth_date"] == rth_date]
    if current.empty:
        return None
    week_start = current["week_start"].iloc[0]
    prior = anchors[anchors["date"] < day].sort_values("date")
    if family == "daily":
        return None if prior.empty else prior.iloc[-1]
    if family == "weekly":
        same_week_monday = anchors[
            (anchors["week_start"] == week_start) & (anchors["weekday"] == "Monday") & (anchors["date"] < day)
        ].sort_values("date")
        if not same_week_monday.empty:
            return same_week_monday.iloc[-1]
        return None if prior.empty else prior.iloc[-1]
    raise ValueError(f"unknown family {family}")


def race_outcome(day: pd.DataFrame, pos: int, direction: str, entry: float, cfg: Config) -> tuple[str, float, float, int | None]:
    future = day.iloc[pos + 1 :]
    if future.empty:
        return "timeout", 0.0, 0.0, None
    if direction == "short":
        mfe = entry - float(future["low"].min())
        mae = float(future["high"].max()) - entry
        for row in future.itertuples(index=False):
            target = row.low <= entry - cfg.target_points
            adverse = row.high >= entry + cfg.adverse_points
            if target and adverse:
                return "both_same_bar", mfe, mae, int(row.bar_index)
            if target:
                return "target_first", mfe, mae, int(row.bar_index)
            if adverse:
                return "adverse_first", mfe, mae, int(row.bar_index)
    else:
        mfe = float(future["high"].max()) - entry
        mae = entry - float(future["low"].min())
        for row in future.itertuples(index=False):
            target = row.high >= entry + cfg.target_points
            adverse = row.low <= entry - cfg.adverse_points
            if target and adverse:
                return "both_same_bar", mfe, mae, int(row.bar_index)
            if target:
                return "target_first", mfe, mae, int(row.bar_index)
            if adverse:
                return "adverse_first", mfe, mae, int(row.bar_index)
    return "timeout", mfe, mae, None


def collect_events(df: pd.DataFrame, anchors: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    events: list[dict] = []
    last_event_bar: dict[tuple[str, str, str], int] = {}
    rth = df[df["rth"]].copy()
    for rth_date, day in rth.groupby("rth_date", sort=True):
        weekly = anchor_for_day(anchors, rth_date, "weekly")
        daily = anchor_for_day(anchors, rth_date, "daily")
        if weekly is None or daily is None:
            continue
        day = day.reset_index(drop=True)
        for pos, row in day.iterrows():
            bar_index = int(row["bar_index"])
            selector = float(row["close"])
            for side, direction in [("resistance", "short"), ("support", "long")]:
                w = nearest_shelf(selector, bar_index, weekly, side, cfg)
                d = nearest_shelf(selector, bar_index, daily, side, cfg)
                touched_w = (float(row["high"]) >= w["level"] - cfg.tolerance and float(row["low"]) <= w["level"] + cfg.tolerance)
                touched_d = (float(row["high"]) >= d["level"] - cfg.tolerance and float(row["low"]) <= d["level"] + cfg.tolerance)
                reject_w = touched_w and ((side == "resistance" and float(row["close"]) <= w["level"] and float(row["close"]) < float(row["open"])) or (side == "support" and float(row["close"]) >= w["level"] and float(row["close"]) > float(row["open"])))
                reject_d = touched_d and ((side == "resistance" and float(row["close"]) <= d["level"] and float(row["close"]) < float(row["open"])) or (side == "support" and float(row["close"]) >= d["level"] and float(row["close"]) > float(row["open"])))
                independent_families = str(weekly["rth_date"]) != str(daily["rth_date"])
                confluence = independent_families and abs(w["level"] - d["level"]) <= cfg.confluence_tolerance
                variants = []
                if reject_w:
                    variants.append(("weekly", w))
                if reject_d:
                    variants.append(("daily", d))
                if confluence and (reject_w or reject_d):
                    variants.append(("confluence", w if reject_w else d))
                for variant, sh in variants:
                    key = (variant, rth_date, side)
                    if key in last_event_bar and bar_index - last_event_bar[key] < cfg.cooldown_bars:
                        continue
                    last_event_bar[key] = bar_index
                    outcome, mfe, mae, exit_bar = race_outcome(day, pos, direction, float(row["close"]), cfg)
                    events.append(
                        {
                            "variant": variant,
                            "rth_date": rth_date,
                            "weekday": row["weekday"],
                            "time_ct": row["ct"],
                            "bar_index": bar_index,
                            "side": side,
                            "direction": direction,
                            "entry_close": float(row["close"]),
                            "shelf_level": sh["level"],
                            "shelf_index": sh["shelf_index"],
                            "weekly_level": w["level"],
                            "weekly_index": w["shelf_index"],
                            "daily_level": d["level"],
                            "daily_index": d["shelf_index"],
                            "weekly_daily_gap": abs(w["level"] - d["level"]),
                            "weekly_anchor_date": weekly["rth_date"],
                            "weekly_anchor_weekday": weekly["weekday"],
                            "daily_anchor_date": daily["rth_date"],
                            "daily_anchor_weekday": daily["weekday"],
                            "independent_families": independent_families,
                            "outcome": outcome,
                            "mfe": mfe,
                            "mae": mae,
                            "exit_bar": exit_bar,
                            "win": outcome in {"target_first", "both_same_bar"},
                            "loss": outcome == "adverse_first",
                            "timeout": outcome == "timeout",
                        }
                    )
    return pd.DataFrame(events)


def summarize(events: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    if events.empty:
        return pd.DataFrame()
    for keys, group in events.groupby(["variant", "side"], dropna=False):
        variant, side = keys
        decided = group[group["outcome"].isin(["target_first", "both_same_bar", "adverse_first"])]
        wins = int(decided["win"].sum())
        losses = int(decided["loss"].sum())
        n = len(group)
        rows.append(
            {
                "variant": variant,
                "side": side,
                "events": n,
                "decided": len(decided),
                "wins": wins,
                "losses": losses,
                "timeouts": int(group["timeout"].sum()),
                "win_rate_decided": wins / len(decided) if len(decided) else np.nan,
                "median_mfe": float(group["mfe"].median()) if n else np.nan,
                "median_mae": float(group["mae"].median()) if n else np.nan,
                "avg_mfe": float(group["mfe"].mean()) if n else np.nan,
                "avg_mae": float(group["mae"].mean()) if n else np.nan,
                "median_weekly_daily_gap": float(group["weekly_daily_gap"].median()) if n else np.nan,
            }
        )
    for variant, group in events.groupby("variant"):
        decided = group[group["outcome"].isin(["target_first", "both_same_bar", "adverse_first"])]
        wins = int(decided["win"].sum())
        losses = int(decided["loss"].sum())
        n = len(group)
        rows.append(
            {
                "variant": variant,
                "side": "ALL",
                "events": n,
                "decided": len(decided),
                "wins": wins,
                "losses": losses,
                "timeouts": int(group["timeout"].sum()),
                "win_rate_decided": wins / len(decided) if len(decided) else np.nan,
                "median_mfe": float(group["mfe"].median()) if n else np.nan,
                "median_mae": float(group["mae"].median()) if n else np.nan,
                "avg_mfe": float(group["mfe"].mean()) if n else np.nan,
                "avg_mae": float(group["mae"].mean()) if n else np.nan,
                "median_weekly_daily_gap": float(group["weekly_daily_gap"].median()) if n else np.nan,
            }
        )
    return pd.DataFrame(rows).sort_values(["variant", "side"]).reset_index(drop=True)


def write_report(out_dir: Path, df: pd.DataFrame, anchors: pd.DataFrame, events: pd.DataFrame, summary: pd.DataFrame, cfg: Config) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    summary.to_csv(out_dir / "weekly_daily_shelf_summary.csv", index=False)
    events.to_csv(out_dir / "weekly_daily_shelf_events.csv", index=False)
    anchors.to_csv(out_dir / "weekly_daily_shelf_anchors.csv", index=False)
    start = df["ct"].min()
    end = df["ct"].max()
    lines = [
        "# Weekly vs Daily Control Shelf Test",
        "",
        f"Data: ES 1-minute, {start} to {end}, {len(df):,} bars.",
        f"Anchor: 12:00-14:00 CT high. Slope {SLOPE_PER_HOUR} points/hour. Shelf spacing {BAND} points.",
        f"Reaction rule: touch within {cfg.tolerance} points, close rejects away. Outcome target {cfg.target_points} before adverse {cfg.adverse_points}, through RTH close.",
        "",
        "## Summary",
        "",
        summary.to_markdown(index=False, floatfmt=".3f") if not summary.empty else "No events.",
        "",
        "## Interpretation",
        "",
    ]
    if not summary.empty:
        all_rows = summary[summary["side"] == "ALL"].copy()
        all_rows["score"] = all_rows["win_rate_decided"].fillna(0) * np.log1p(all_rows["decided"])
        best = all_rows.sort_values("score", ascending=False).iloc[0]
        lines += [
            f"Best broad shelf behavior by decided win rate with sample-size weighting: {best['variant']} ({best['decided']} decided, {best['win_rate_decided']:.1%}).",
            "Weekly control should be treated as the larger map. Daily control is useful if it improves the same shelf reaction or creates confluence, not as an equal competing map.",
        ]
        conf = all_rows[all_rows["variant"] == "confluence"]
        if not conf.empty:
            c = conf.iloc[0]
            lines.append(f"Confluence produced {int(c['events'])} events and {int(c['decided'])} decided outcomes with {c['win_rate_decided']:.1%} decided win rate.")
    (out_dir / "weekly_daily_shelf_report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("SPYPROWEB-live-recovered/data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv"))
    parser.add_argument("--out", type=Path, default=Path("outputs/control_shelf_weekly_daily"))
    parser.add_argument("--tolerance", type=float, default=6.0)
    parser.add_argument("--confluence", type=float, default=6.0)
    parser.add_argument("--target", type=float, default=17.0)
    parser.add_argument("--adverse", type=float, default=17.0)
    args = parser.parse_args()

    cfg = Config(tolerance=args.tolerance, confluence_tolerance=args.confluence, target_points=args.target, adverse_points=args.adverse)
    df = read_es(args.data)
    anchors = build_anchor_table(df)
    events = collect_events(df, anchors, cfg)
    summary = summarize(events)
    write_report(args.out, df, anchors, events, summary, cfg)
    print(summary.to_string(index=False))
    print(f"\nWrote: {args.out}")


if __name__ == "__main__":
    main()
