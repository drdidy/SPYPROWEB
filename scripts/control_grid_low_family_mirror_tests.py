#!/usr/bin/env python3
"""Low-family mirror and combined Control Shelf tests.

The prior research established that high-family shelves are useful as
resistance only after quality interaction, not proximity alone. This script
tests the missing half:

1. Low-family shelves from inherited Friday/current-week RTH lows.
2. Both low geometries:
   - ascending mirror: low + 1.04 points/hour
   - descending shelf: low - 1.04 points/hour
3. Combined model:
   - resistance uses high-family descending shelves
   - support uses the better low-family geometry
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
RTH_OPEN_MIN = 9 * 60 + 30
RTH_CLOSE_MIN = 16 * 60


@dataclass(frozen=True)
class Config:
    tolerance: float = 6.0
    move_points: float = 17.0
    horizon_hours: int = 6
    pivot_lr: int = 1
    max_shelf_index: int = 10

    @property
    def per_minute(self) -> float:
        return SLOPE_PER_HOUR / 60.0


def pct(v: float) -> str:
    return "-" if pd.isna(v) else f"{v * 100:.1f}%"


def md_table(df: pd.DataFrame, n: int = 40) -> str:
    return "_No rows._" if df.empty else df.head(n).to_markdown(index=False)


def read_es(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    ts_col = "timestamp" if "timestamp" in df.columns else "ts_event"
    cols = [ts_col, "open", "high", "low", "close"]
    if "volume" in df.columns:
        cols.append("volume")
    df = df[cols].rename(columns={ts_col: "timestamp"}).copy()
    if "volume" not in df.columns:
        df["volume"] = 0
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["et"] = df["timestamp"].dt.tz_convert(ET_TZ)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).sort_values("timestamp").reset_index(drop=True)
    df["minute_bar"] = np.arange(len(df), dtype=np.int64)
    mins = df["et"].dt.hour * 60 + df["et"].dt.minute
    df["rth"] = (df["et"].dt.weekday < 5) & (mins >= RTH_OPEN_MIN) & (mins <= RTH_CLOSE_MIN)
    df["rth_date"] = df["et"].dt.date.astype(str)
    return df


def daily_rth(df: pd.DataFrame) -> pd.DataFrame:
    rth = df[df["rth"]].copy()
    high_rows = rth.loc[rth.groupby("rth_date")["high"].idxmax(), ["rth_date", "high", "minute_bar", "et"]]
    low_rows = rth.loc[rth.groupby("rth_date")["low"].idxmin(), ["rth_date", "low", "minute_bar", "et"]]
    out = (
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
        .merge(high_rows.rename(columns={"high": "high_at_bar", "minute_bar": "high_bar", "et": "high_et"}), on="rth_date")
        .merge(low_rows.rename(columns={"low": "low_at_bar", "minute_bar": "low_bar", "et": "low_et"}), on="rth_date")
    )
    out["date"] = pd.to_datetime(out["rth_date"])
    out["weekday"] = out["date"].dt.day_name()
    out["weekday_idx"] = out["date"].dt.weekday
    out["week_start"] = (out["date"] - pd.to_timedelta(out["weekday_idx"], unit="D")).dt.date.astype(str)
    return out.sort_values("date").reset_index(drop=True)


def hourly_rth(df: pd.DataFrame) -> pd.DataFrame:
    r = df[df["rth"]].copy()
    mins = r["et"].dt.hour * 60 + r["et"].dt.minute
    r["rth_bucket"] = ((mins - RTH_OPEN_MIN) // 60).clip(lower=0)
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
    out["weekday_idx"] = out["date"].dt.weekday
    out["week_start"] = (out["date"] - pd.to_timedelta(out["weekday_idx"], unit="D")).dt.date.astype(str)
    out["ema21"] = out["close"].ewm(span=21, adjust=False).mean()
    out["ema50"] = out["close"].ewm(span=50, adjust=False).mean()
    out["ema_state"] = np.where(out["ema21"] >= out["ema50"], "bull", "bear")
    return out.sort_values(["rth_date", "rth_bucket"]).reset_index(drop=True)


def family_from_row(row: pd.Series, role: str, anchor_type: str) -> dict:
    if anchor_type == "high":
        price_col, bar_col = "high", "high_bar"
    else:
        price_col, bar_col = "low", "low_bar"
    return {
        "family_key": f"{anchor_type}:{role}:{row['rth_date']}",
        "anchor_type": anchor_type,
        "role": role,
        "anchor_date": row["rth_date"],
        "anchor_weekday": row["weekday"],
        "anchor_price": float(row[price_col]),
        "anchor_bar": int(row[bar_col]),
    }


def families_for_date(daily: pd.DataFrame, target_date: str, anchor_type: str) -> list[dict]:
    d = pd.Timestamp(target_date)
    week_start = (d - pd.Timedelta(days=d.weekday())).date().isoformat()
    prior = daily[daily["date"] < d].sort_values("date")
    if prior.empty:
        return []
    out: list[dict] = []
    prev = prior.iloc[-1]
    out.append(family_from_row(prev, "previous", anchor_type))
    pre_week = prior[prior["week_start"] != week_start]
    if not pre_week.empty:
        out.append(family_from_row(pre_week.iloc[-1], "inherited", anchor_type))
    same_week = prior[prior["week_start"] == week_start]
    for _, row in same_week.iterrows():
        out.append(family_from_row(row, str(row["weekday"])[:3], anchor_type))
    seen: set[tuple[str, str, str]] = set()
    unique: list[dict] = []
    for fam in out:
        key = (fam["anchor_type"], fam["role"], fam["anchor_date"])
        if key not in seen:
            seen.add(key)
            unique.append(fam)
    return unique


def week_to_date(fams: list[dict]) -> list[dict]:
    return [f for f in fams if f["role"] == "inherited" or f["role"] in {"Mon", "Tue", "Wed", "Thu", "Fri"}]


def friday_monday(fams: list[dict]) -> list[dict]:
    return [f for f in fams if f["role"] in {"inherited", "Mon"}]


RULES = {
    "week_to_date_complex": week_to_date,
    "friday_monday_complex": friday_monday,
    "previous_only": lambda fams: [f for f in fams if f["role"] == "previous"],
    "inherited_only": lambda fams: [f for f in fams if f["role"] == "inherited"],
    "monday_only": lambda fams: [f for f in fams if f["role"] == "Mon"] or [f for f in fams if f["role"] == "inherited"],
}


def control_at(fam: dict, minute_bar: int, cfg: Config, geometry: str) -> float:
    elapsed = minute_bar - fam["anchor_bar"]
    if geometry == "low_ascending":
        return fam["anchor_price"] + cfg.per_minute * elapsed
    return fam["anchor_price"] - cfg.per_minute * elapsed


def nearest_shelf(price: float, minute_bar: int, fams: list[dict], cfg: Config, geometry: str) -> dict | None:
    best = None
    for fam in fams:
        control = control_at(fam, minute_bar, cfg, geometry)
        raw = int(round((price - control) / BAND))
        for idx in range(raw - 1, raw + 2):
            if abs(idx) > cfg.max_shelf_index:
                continue
            shelf = control + idx * BAND
            dist = price - shelf
            rec = {
                **fam,
                "geometry": geometry,
                "shelf_index": int(idx),
                "shelf_price": float(shelf),
                "distance": float(dist),
                "abs_distance": float(abs(dist)),
                "label": f"{fam['role']} {idx:+d}",
            }
            if best is None or rec["abs_distance"] < best["abs_distance"]:
                best = rec
    return best


def reaction_universe(hourly: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    rows: list[dict] = []
    h = hourly.reset_index(drop=True)
    for i in range(cfg.pivot_lr, len(h) - cfg.pivot_lr):
        row = h.iloc[i]
        win = h.iloc[i - cfg.pivot_lr : i + cfg.pivot_lr + 1]
        is_high = row["high"] >= win["high"].max()
        is_low = row["low"] <= win["low"].min()
        if not is_high and not is_low:
            continue
        future = h.iloc[i + 1 : min(len(h), i + cfg.horizon_hours + 1)]
        future = future[future["rth_date"] == row["rth_date"]]
        if future.empty:
            continue
        cases = [
            ("resistance", "high", "down", float(row["high"]), is_high),
            ("support", "low", "up", float(row["low"]), is_low),
        ]
        for event_type, price_col, direction, price, ok in cases:
            if not ok:
                continue
            if direction == "down":
                move = price - future["low"].min()
                adverse = future["high"].max() - price
            else:
                move = future["high"].max() - price
                adverse = price - future["low"].min()
            if move < cfg.move_points:
                continue
            rows.append(
                {
                    "hour_index": i,
                    "target_date": row["rth_date"],
                    "target_weekday": row["weekday"],
                    "week_start": row["week_start"],
                    "rth_bucket": int(row["rth_bucket"]),
                    "event_time_et": row["et"],
                    "event_type": event_type,
                    "direction": direction,
                    "price": price,
                    "minute_bar": int(row["minute_bar"]),
                    "ema_state": row["ema_state"],
                    "forward_move": float(move),
                    "forward_adverse": float(adverse),
                }
            )
    return pd.DataFrame(rows)


def evaluate_family(
    events: pd.DataFrame,
    daily: pd.DataFrame,
    cfg: Config,
    anchor_type: str,
    geometry: str,
) -> pd.DataFrame:
    rows: list[dict] = []
    for ev in events.itertuples(index=False):
        fams = families_for_date(daily, ev.target_date, anchor_type)
        for rule, fn in RULES.items():
            selected = fn(fams)
            ns = nearest_shelf(float(ev.price), int(ev.minute_bar), selected, cfg, geometry) if selected else None
            if ns is None:
                continue
            rows.append(
                {
                    "anchor_model": f"{anchor_type}_{geometry}_{rule}",
                    "anchor_type": anchor_type,
                    "geometry": geometry,
                    "rule": rule,
                    "target_date": ev.target_date,
                    "target_weekday": ev.target_weekday,
                    "week_start": ev.week_start,
                    "event_type": ev.event_type,
                    "price": ev.price,
                    "within_tolerance": ns["abs_distance"] <= cfg.tolerance,
                    "forward_move": ev.forward_move,
                    "forward_adverse": ev.forward_adverse,
                    **ns,
                }
            )
    return pd.DataFrame(rows)


def evaluate_combined(events: pd.DataFrame, daily: pd.DataFrame, cfg: Config, low_geometry: str) -> pd.DataFrame:
    rows: list[dict] = []
    for ev in events.itertuples(index=False):
        if ev.event_type == "resistance":
            fams = week_to_date(families_for_date(daily, ev.target_date, "high"))
            ns = nearest_shelf(float(ev.price), int(ev.minute_bar), fams, cfg, "high_descending")
            model = "combined_high_resistance_low_support"
        else:
            fams = week_to_date(families_for_date(daily, ev.target_date, "low"))
            ns = nearest_shelf(float(ev.price), int(ev.minute_bar), fams, cfg, low_geometry)
            model = f"combined_high_resistance_low_{low_geometry}_support"
        if ns is None:
            continue
        rows.append(
            {
                "anchor_model": model,
                "target_date": ev.target_date,
                "target_weekday": ev.target_weekday,
                "week_start": ev.week_start,
                "event_type": ev.event_type,
                "price": ev.price,
                "within_tolerance": ns["abs_distance"] <= cfg.tolerance,
                "forward_move": ev.forward_move,
                "forward_adverse": ev.forward_adverse,
                **ns,
            }
        )
    return pd.DataFrame(rows)


def touch_quality(
    hourly: pd.DataFrame,
    daily: pd.DataFrame,
    cfg: Config,
    anchor_type: str,
    geometry: str,
    event_side: str,
) -> pd.DataFrame:
    h = hourly.reset_index(drop=True)
    rows: list[dict] = []
    for i in range(0, len(h) - cfg.horizon_hours):
        row = h.iloc[i]
        fams = week_to_date(families_for_date(daily, row["rth_date"], anchor_type))
        if not fams:
            continue
        price = float(row["high"] if event_side == "resistance" else row["low"])
        ns = nearest_shelf(price, int(row["minute_bar"]), fams, cfg, geometry)
        if ns is None or ns["abs_distance"] > cfg.tolerance:
            continue
        future = h.iloc[i + 1 : min(len(h), i + cfg.horizon_hours + 1)]
        future = future[future["rth_date"] == row["rth_date"]]
        if future.empty:
            continue
        shelf = ns["shelf_price"]
        if event_side == "resistance":
            fav = price - future["low"].min()
            adverse = future["high"].max() - price
            held = row["close"] <= shelf
            rejection_candle = row["close"] < row["open"]
            ema_ok = row["ema_state"] == "bear"
        else:
            fav = future["high"].max() - price
            adverse = price - future["low"].min()
            held = row["close"] >= shelf
            rejection_candle = row["close"] > row["open"]
            ema_ok = row["ema_state"] == "bull"
        rows.append(
            {
                "anchor_type": anchor_type,
                "geometry": geometry,
                "side": event_side,
                "target_date": row["rth_date"],
                "target_weekday": row["weekday"],
                "week_start": row["week_start"],
                "time_et": row["et"],
                "price": price,
                "held_close": bool(held),
                "rejection_candle": bool(held and rejection_candle),
                "ema_agrees": bool(ema_ok),
                "clean_rejection": bool(held and rejection_candle and ema_ok),
                "forward_move": float(fav),
                "forward_adverse": float(adverse),
                "win17": bool(fav >= 17.0),
                "win34": bool(fav >= 34.0),
                **ns,
            }
        )
    return pd.DataFrame(rows)


def summary(df: pd.DataFrame, group_col: str = "anchor_model") -> pd.DataFrame:
    out = (
        df.groupby(group_col, dropna=False)
        .agg(
            events=("price", "size"),
            within_tolerance=("within_tolerance", "sum"),
            median_abs_dist=("abs_distance", "median"),
            avg_abs_dist=("abs_distance", "mean"),
            avg_forward_move=("forward_move", "mean"),
            avg_adverse=("forward_adverse", "mean"),
        )
        .reset_index()
    )
    out["coverage_rate"] = out["within_tolerance"] / out["events"]
    return out.sort_values(["coverage_rate", "median_abs_dist"], ascending=[False, True])


def touch_summary(df: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    filters = {
        "all_touches": pd.Series(True, index=df.index),
        "held_close": df["held_close"],
        "rejection_candle": df["rejection_candle"],
        "ema_agrees": df["ema_agrees"],
        "clean_rejection": df["clean_rejection"],
    }
    for (atype, geom, side), group in df.groupby(["anchor_type", "geometry", "side"]):
        for name, mask in filters.items():
            subset = group[mask.loc[group.index].fillna(False)]
            if subset.empty:
                continue
            rows.append(
                {
                    "anchor_type": atype,
                    "geometry": geom,
                    "side": side,
                    "filter": name,
                    "touches": int(len(subset)),
                    "win17": int(subset["win17"].sum()),
                    "win34": int(subset["win34"].sum()),
                    "win17_rate": float(subset["win17"].mean()),
                    "win34_rate": float(subset["win34"].mean()),
                    "median_forward_move": float(subset["forward_move"].median()),
                    "median_adverse": float(subset["forward_adverse"].median()),
                    "median_abs_dist": float(subset["abs_distance"].median()),
                }
            )
    return pd.DataFrame(rows).sort_values(["win34_rate", "win17_rate", "touches"], ascending=[False, False, False])


def format_pct_cols(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in ["coverage_rate", "win17_rate", "win34_rate"]:
        if col in out.columns:
            out[col] = out[col].map(pct)
    return out


def run(args: argparse.Namespace) -> None:
    cfg = Config(tolerance=args.tolerance, move_points=args.move_points, horizon_hours=args.horizon_hours)
    args.out.mkdir(parents=True, exist_ok=True)
    df = read_es(args.data)
    daily = daily_rth(df)
    hourly = hourly_rth(df)
    events = reaction_universe(hourly, cfg)
    frames = [
        evaluate_family(events, daily, cfg, "high", "high_descending"),
        evaluate_family(events, daily, cfg, "low", "low_ascending"),
        evaluate_family(events, daily, cfg, "low", "low_descending"),
        evaluate_combined(events, daily, cfg, "low_ascending"),
        evaluate_combined(events, daily, cfg, "low_descending"),
    ]
    attrib = pd.concat(frames, ignore_index=True)
    attrib_summary = summary(attrib)
    by_event = (
        attrib.groupby(["anchor_model", "event_type"], dropna=False)
        .agg(events=("price", "size"), within_tolerance=("within_tolerance", "sum"), median_abs_dist=("abs_distance", "median"))
        .reset_index()
    )
    by_event["coverage_rate"] = by_event["within_tolerance"] / by_event["events"]
    touch = pd.concat(
        [
            touch_quality(hourly, daily, cfg, "high", "high_descending", "resistance"),
            touch_quality(hourly, daily, cfg, "low", "low_ascending", "support"),
            touch_quality(hourly, daily, cfg, "low", "low_descending", "support"),
        ],
        ignore_index=True,
    )
    ts = touch_summary(touch)
    label_dist = (
        attrib[(attrib["within_tolerance"]) & (attrib["rule"].fillna("") == "week_to_date_complex")]
        .groupby(["anchor_type", "geometry", "event_type", "role", "anchor_weekday", "shelf_index", "label"], dropna=False)
        .agg(events=("price", "size"), median_abs_dist=("abs_distance", "median"), avg_forward_move=("forward_move", "mean"))
        .reset_index()
        .sort_values(["anchor_type", "geometry", "event_type", "events"], ascending=[True, True, True, False])
    )
    for name, frame in {
        "reaction_universe": events,
        "family_attribution": attrib,
        "family_attribution_summary": attrib_summary,
        "family_attribution_by_event": by_event,
        "touch_events": touch,
        "touch_summary": ts,
        "week_to_date_label_distribution": label_dist,
    }.items():
        frame.to_csv(args.out / f"{name}.csv", index=False)

    report = [
        "# Control Grid Low-Family Mirror Tests",
        "",
        f"- Data: `{args.data}`",
        f"- Tolerance: `{cfg.tolerance}` points.",
        f"- Reaction universe: `{len(events)}` hourly pivots with at least `{cfg.move_points}` points away within `{cfg.horizon_hours}` RTH hours.",
        "",
        "## Family Attribution Summary",
        md_table(format_pct_cols(attrib_summary), 30),
        "",
        "## Attribution Split By Support/Resistance",
        md_table(format_pct_cols(by_event.sort_values(["event_type", "coverage_rate"], ascending=[True, False])), 50),
        "",
        "## Touch Quality",
        md_table(format_pct_cols(ts), 40),
        "",
        "## Week-To-Date Label Distribution",
        md_table(label_dist, 80),
        "",
        "## Interpretation",
        "- If low ascending beats low descending on support reactions, use the classic mirrored low-family.",
        "- If low descending beats low ascending, use a single descending geometry for both high and low shelves.",
        "- Combined models reveal whether high-family resistance plus low-family support improves the full active shelf engine.",
    ]
    (args.out / "low_family_mirror_report.md").write_text("\n".join(report), encoding="utf-8")
    print((args.out / "low_family_mirror_report.md").read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=6.0)
    parser.add_argument("--move-points", type=float, default=17.0)
    parser.add_argument("--horizon-hours", type=int, default=6)
    run(parser.parse_args())


if __name__ == "__main__":
    main()
