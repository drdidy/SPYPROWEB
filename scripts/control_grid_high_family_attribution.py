#!/usr/bin/env python3
"""Attribute hourly ES reactions to prior high shelf families.

This tests the specific trader question:

    If a later day appears to respect a line, is it really respecting the
    latest prior-day high, or an older high family at a +/- 34 point shelf?

The constants are fixed to the SPY Prophet Control Grid values:
    slope = 1.04 points per trading hour
    shelf spacing = 34 points

The test uses RTH daily highs as candidate high anchors, resamples RTH ES
1-minute bars into 1-hour bars, finds meaningful hourly swing reactions, then
assigns each reaction to the closest prior high shelf family.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


ET_TZ = "America/New_York"
SLOPE_PER_HOUR = 1.04
BAND = 34.0


@dataclass(frozen=True)
class Config:
    tolerance: float = 6.0
    pivot_lr: int = 1
    move_points: float = 17.0
    horizon_hours: int = 6
    max_shelf_index: int = 8

    @property
    def per_minute_bar(self) -> float:
        return SLOPE_PER_HOUR / 60.0


def read_es(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    ts_col = "timestamp" if "timestamp" in df.columns else "ts_event"
    df = df[[ts_col, "open", "high", "low", "close", "volume"]].rename(columns={ts_col: "timestamp"}).copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["et"] = df["timestamp"].dt.tz_convert(ET_TZ)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).sort_values("timestamp").reset_index(drop=True)
    df["minute_bar"] = np.arange(len(df), dtype=np.int64)
    mins = df["et"].dt.hour * 60 + df["et"].dt.minute
    df["rth"] = (mins >= 9 * 60 + 30) & (mins <= 16 * 60) & (df["et"].dt.weekday < 5)
    df["rth_date"] = df["et"].dt.date.astype(str)
    return df


def daily_rth(df: pd.DataFrame) -> pd.DataFrame:
    rth = df[df["rth"]].copy()
    high_rows = rth.loc[rth.groupby("rth_date")["high"].idxmax(), ["rth_date", "high", "minute_bar", "et"]]
    daily = (
        rth.groupby("rth_date", sort=True)
        .agg(
            first_bar=("minute_bar", "first"),
            last_bar=("minute_bar", "last"),
            first_et=("et", "first"),
            last_et=("et", "last"),
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            bars=("minute_bar", "size"),
        )
        .reset_index()
        .merge(
            high_rows.rename(columns={"high": "high_at_bar", "minute_bar": "high_bar", "et": "high_et"}),
            on="rth_date",
            how="left",
        )
    )
    daily["date"] = pd.to_datetime(daily["rth_date"])
    daily["weekday"] = daily["date"].dt.day_name()
    # Week starts Monday for the RTH decision problem.
    daily["week_start"] = (daily["date"] - pd.to_timedelta(daily["date"].dt.weekday, unit="D")).dt.date.astype(str)
    return daily


def hourly_rth(df: pd.DataFrame) -> pd.DataFrame:
    r = df[df["rth"]].copy()
    mins = r["et"].dt.hour * 60 + r["et"].dt.minute
    r["rth_bucket"] = ((mins - (9 * 60 + 30)) // 60).clip(lower=0)
    out = (
        r.groupby(["rth_date", "rth_bucket"], sort=True)
        .agg(
            timestamp=("timestamp", "first"),
            et=("et", "first"),
            minute_bar=("minute_bar", "first"),
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            volume=("volume", "sum"),
            bars=("minute_bar", "size"),
        )
        .reset_index()
    )
    out["date"] = pd.to_datetime(out["rth_date"])
    out["weekday"] = out["date"].dt.day_name()
    out["week_start"] = (out["date"] - pd.to_timedelta(out["date"].dt.weekday, unit="D")).dt.date.astype(str)
    return out.sort_values(["rth_date", "rth_bucket"]).reset_index(drop=True)


def candidate_anchors(daily: pd.DataFrame, target_date: str) -> list[dict]:
    d = pd.Timestamp(target_date)
    week_start = (d - pd.Timedelta(days=d.weekday())).date().isoformat()
    prior = daily[daily["date"] < d].sort_values("date")
    same_week_prior = prior[prior["week_start"] == week_start].copy()
    anchors: list[dict] = []
    if not prior.empty:
        inherited = prior.iloc[-1]
        # For Monday this is normally Friday. For Tue-Fri, include the prior
        # completed RTH day as a separate "previous day" family.
        anchors.append(
            {
                "source": "previous_rth",
                "anchor_date": inherited["rth_date"],
                "anchor_weekday": inherited["weekday"],
                "anchor_price": float(inherited["high"]),
                "anchor_bar": int(inherited["high_bar"]),
            }
        )
    # Add explicit current-week high families. This lets Wednesday choose Monday
    # -34 instead of Tuesday 0 if that older family is closer.
    for row in same_week_prior.itertuples(index=False):
        anchors.append(
            {
                "source": str(row.weekday)[:3],
                "anchor_date": row.rth_date,
                "anchor_weekday": row.weekday,
                "anchor_price": float(row.high),
                "anchor_bar": int(row.high_bar),
            }
        )
    # Add inherited Friday-like family once for Tue-Fri too.
    pre_week = prior[prior["week_start"] != week_start]
    if not pre_week.empty:
        row = pre_week.iloc[-1]
        anchors.append(
            {
                "source": "inherited",
                "anchor_date": row["rth_date"],
                "anchor_weekday": row["weekday"],
                "anchor_price": float(row["high"]),
                "anchor_bar": int(row["high_bar"]),
            }
        )
    # Deduplicate same anchor date/source collisions while preserving labels.
    seen = set()
    unique = []
    for a in anchors:
        key = (a["source"], a["anchor_date"])
        if key not in seen:
            seen.add(key)
            unique.append(a)
    return unique


def shelf_at(anchor: dict, minute_bar: int, shelf_index: int, cfg: Config) -> float:
    control = anchor["anchor_price"] - cfg.per_minute_bar * (minute_bar - anchor["anchor_bar"])
    return control + shelf_index * BAND


def nearest_family(price: float, minute_bar: int, anchors: list[dict], cfg: Config) -> dict | None:
    best = None
    for anchor in anchors:
        raw_idx = round((price - (anchor["anchor_price"] - cfg.per_minute_bar * (minute_bar - anchor["anchor_bar"]))) / BAND)
        for shelf_index in range(int(raw_idx) - 1, int(raw_idx) + 2):
            if abs(shelf_index) > cfg.max_shelf_index:
                continue
            shelf = shelf_at(anchor, minute_bar, shelf_index, cfg)
            dist = price - shelf
            rec = {
                **anchor,
                "shelf_index": int(shelf_index),
                "shelf_price": float(shelf),
                "distance": float(dist),
                "abs_distance": float(abs(dist)),
            }
            if best is None or rec["abs_distance"] < best["abs_distance"]:
                best = rec
    return best


def find_reactions(hourly: pd.DataFrame, daily: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    events: list[dict] = []
    h = hourly.reset_index(drop=True)
    for i in range(cfg.pivot_lr, len(h) - cfg.pivot_lr):
        row = h.iloc[i]
        target_date = row["rth_date"]
        anchors = candidate_anchors(daily, target_date)
        if not anchors:
            continue

        lo = max(0, i - cfg.pivot_lr)
        hi = min(len(h), i + cfg.pivot_lr + 1)
        is_pivot_high = row["high"] >= h["high"].iloc[lo:hi].max()
        is_pivot_low = row["low"] <= h["low"].iloc[lo:hi].min()
        if not is_pivot_high and not is_pivot_low:
            continue

        for kind, price, direction in [
            ("resistance_reaction", float(row["high"]), "down"),
            ("support_reaction", float(row["low"]), "up"),
        ]:
            if kind == "resistance_reaction" and not is_pivot_high:
                continue
            if kind == "support_reaction" and not is_pivot_low:
                continue
            end = min(len(h), i + cfg.horizon_hours + 1)
            future = h.iloc[i + 1 : end]
            # Keep the outcome inside the same RTH date; we are attributing
            # same-day reaction quality, not overnight drift.
            future = future[future["rth_date"] == target_date]
            if future.empty:
                continue
            if direction == "down":
                moved = price - future["low"].min()
                adverse = future["high"].max() - price
            else:
                moved = future["high"].max() - price
                adverse = price - future["low"].min()
            if moved < cfg.move_points:
                continue
            nearest = nearest_family(price, int(row["minute_bar"]), anchors, cfg)
            if nearest is None:
                continue
            events.append(
                {
                    "target_date": target_date,
                    "target_weekday": row["weekday"],
                    "rth_bucket": int(row["rth_bucket"]),
                    "event_time_et": row["et"],
                    "event_type": kind,
                    "price": price,
                    "forward_move": float(moved),
                    "forward_adverse": float(adverse),
                    "within_tolerance": bool(nearest["abs_distance"] <= cfg.tolerance),
                    **nearest,
                }
            )
    return pd.DataFrame(events)


def summarize(events: pd.DataFrame) -> dict[str, pd.DataFrame]:
    e = events.copy()
    if e.empty:
        return {"empty": pd.DataFrame()}
    e["anchor_label"] = e["source"] + " " + e["shelf_index"].map(lambda x: f"{x:+d}")
    in_tol = e[e["within_tolerance"]].copy()

    by_day_source = (
        in_tol.groupby(["target_weekday", "source", "anchor_weekday"], dropna=False)
        .agg(
            events=("price", "size"),
            median_abs_dist=("abs_distance", "median"),
            avg_forward_move=("forward_move", "mean"),
            avg_adverse=("forward_adverse", "mean"),
        )
        .reset_index()
        .sort_values(["target_weekday", "events"], ascending=[True, False])
    )
    by_day_label = (
        in_tol.groupby(["target_weekday", "anchor_label", "anchor_weekday", "source", "shelf_index"], dropna=False)
        .agg(
            events=("price", "size"),
            median_abs_dist=("abs_distance", "median"),
            avg_forward_move=("forward_move", "mean"),
            avg_adverse=("forward_adverse", "mean"),
        )
        .reset_index()
        .sort_values(["target_weekday", "events"], ascending=[True, False])
    )
    by_shelf = (
        in_tol.groupby(["shelf_index"])
        .agg(
            events=("price", "size"),
            median_abs_dist=("abs_distance", "median"),
            avg_forward_move=("forward_move", "mean"),
            avg_adverse=("forward_adverse", "mean"),
        )
        .reset_index()
        .sort_values("events", ascending=False)
    )
    by_type = (
        in_tol.groupby(["event_type", "source", "shelf_index"])
        .agg(events=("price", "size"), median_abs_dist=("abs_distance", "median"))
        .reset_index()
        .sort_values(["event_type", "events"], ascending=[True, False])
    )
    coverage = (
        e.groupby(["target_weekday"])
        .agg(
            total_reactions=("price", "size"),
            within_tolerance=("within_tolerance", "sum"),
            median_nearest_dist=("abs_distance", "median"),
        )
        .reset_index()
    )
    coverage["within_tolerance_rate"] = coverage["within_tolerance"] / coverage["total_reactions"]
    return {
        "events": e,
        "events_within_tolerance": in_tol,
        "by_day_source": by_day_source,
        "by_day_label": by_day_label,
        "by_shelf": by_shelf,
        "by_type": by_type,
        "coverage": coverage,
    }


def md_table(df: pd.DataFrame, n: int = 20) -> str:
    if df.empty:
        return "_No rows._"
    return df.head(n).to_markdown(index=False)


def write_report(out: Path, source: Path, cfg: Config, tables: dict[str, pd.DataFrame]) -> None:
    by_day = tables["by_day_source"]
    by_label = tables["by_day_label"]
    lines = [
        "# Control Grid High-Family Attribution Study",
        "",
        f"- Data: `{source}`",
        f"- Bars: ES 1-minute resampled to RTH 1-hour buckets.",
        f"- Constants: slope `{SLOPE_PER_HOUR}` points/hour, spacing `{BAND}` points.",
        f"- Reaction definition: hourly swing high/low followed by at least `{cfg.move_points}` ES points away within `{cfg.horizon_hours}` RTH hourly bars.",
        f"- Attribution: nearest prior RTH high shelf family, shelf index `0, +/-34, +/-68...`; accepted if within `{cfg.tolerance}` points.",
        "",
        "## Coverage",
        md_table(tables["coverage"], 10),
        "",
        "## Which High Family Controls Each Later Day?",
        md_table(by_day, 40),
        "",
        "## Best Specific Shelf Labels",
        md_table(by_label, 50),
        "",
        "## Shelf Index Distribution",
        md_table(tables["by_shelf"], 30),
        "",
        "## Event Type Breakdown",
        md_table(tables["by_type"], 40),
        "",
        "## Interpretation",
        "",
        "- If `Mon -1` or `Mon -2` ranks above `Tue 0` on Wednesday/Thursday/Friday, that supports the hypothesis that the market is using Monday's shelf family even when the touched line looks unrelated.",
        "- If `previous_rth 0` dominates every day, then yesterday's high is enough.",
        "- If the winners are split across older families and negative shelf indexes, the indicator should score families, not replace the anchor mechanically every day.",
    ]
    (out / "report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--tolerance", type=float, default=6.0)
    p.add_argument("--move-points", type=float, default=17.0)
    p.add_argument("--horizon-hours", type=int, default=6)
    args = p.parse_args()
    cfg = Config(tolerance=args.tolerance, move_points=args.move_points, horizon_hours=args.horizon_hours)
    args.out.mkdir(parents=True, exist_ok=True)
    df = read_es(args.data)
    daily = daily_rth(df)
    hourly = hourly_rth(df)
    events = find_reactions(hourly, daily, cfg)
    tables = summarize(events)
    for name, table in tables.items():
        table.to_csv(args.out / f"{name}.csv", index=False)
    daily.to_csv(args.out / "daily_rth_highs.csv", index=False)
    write_report(args.out, args.data, cfg, tables)
    print((args.out / "report.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
