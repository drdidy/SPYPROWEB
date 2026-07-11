#!/usr/bin/env python3
"""Control Grid high-family complex and replay tests.

This script answers the trader's current decision question:

    Which prior RTH high should pin the descending 1.04/hour, 34-point shelf
    family as the week progresses?

It keeps the Control Grid constants fixed and tests the anchor-selection layer:

1. Single-family rules: previous RTH high, inherited Friday high, Monday high.
2. Complex rules: Friday/Monday parent-child, week-to-date family stack,
   rolling two-day stack.
3. Active scoring rules: nearest shelf, recent held shelf, recent touch memory,
   and a light EMA agreement bonus.
4. Last-six-week replay tables so the screenshots can be audited by date.

The model is intentionally high-family only. Low-family mirroring can be added
after the high anchor election is settled.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

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
    memory_hours: int = 8
    last_weeks: int = 6

    @property
    def per_minute(self) -> float:
        return SLOPE_PER_HOUR / 60.0


def pct(x: float) -> str:
    return "-" if pd.isna(x) else f"{x * 100:.1f}%"


def md_table(df: pd.DataFrame, n: int = 40) -> str:
    if df.empty:
        return "_No rows._"
    return df.head(n).to_markdown(index=False)


def read_es(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    ts_col = "timestamp" if "timestamp" in df.columns else "ts_event"
    keep = [ts_col, "open", "high", "low", "close"]
    if "volume" in df.columns:
        keep.append("volume")
    df = df[keep].rename(columns={ts_col: "timestamp"}).copy()
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
        .merge(
            high_rows.rename(columns={"high": "high_at_bar", "minute_bar": "high_bar", "et": "high_et"}),
            on="rth_date",
            how="left",
        )
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


def row_to_family(row: pd.Series | pd.NamedAgg, role: str) -> dict:
    return {
        "family_key": f"{role}:{row['rth_date']}",
        "role": role,
        "anchor_date": row["rth_date"],
        "anchor_weekday": row["weekday"],
        "anchor_price": float(row["high"]),
        "anchor_bar": int(row["high_bar"]),
    }


def families_for_date(daily: pd.DataFrame, target_date: str) -> list[dict]:
    d = pd.Timestamp(target_date)
    week_start = (d - pd.Timedelta(days=d.weekday())).date().isoformat()
    prior = daily[daily["date"] < d].sort_values("date")
    if prior.empty:
        return []

    out: list[dict] = []
    prev = prior.iloc[-1]
    out.append(row_to_family(prev, "previous"))

    pre_week = prior[prior["week_start"] != week_start]
    if not pre_week.empty:
        inherited = pre_week.iloc[-1]
        out.append(row_to_family(inherited, "inherited"))

    same_week_prior = prior[prior["week_start"] == week_start]
    for _, row in same_week_prior.iterrows():
        role = str(row["weekday"])[:3]
        out.append(row_to_family(row, role))

    # Deduplicate exact same anchor by role/date.
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for fam in out:
        key = (fam["role"], fam["anchor_date"])
        if key not in seen:
            seen.add(key)
            unique.append(fam)
    return unique


def control_at(fam: dict, minute_bar: int, cfg: Config) -> float:
    return fam["anchor_price"] - cfg.per_minute * (minute_bar - fam["anchor_bar"])


def shelf_price(fam: dict, minute_bar: int, idx: int, cfg: Config) -> float:
    return control_at(fam, minute_bar, cfg) + idx * BAND


def nearest_shelf(price: float, minute_bar: int, families: list[dict], cfg: Config) -> dict | None:
    best: dict | None = None
    for fam in families:
        control = control_at(fam, minute_bar, cfg)
        raw = int(round((price - control) / BAND))
        for idx in range(raw - 1, raw + 2):
            if abs(idx) > cfg.max_shelf_index:
                continue
            level = control + idx * BAND
            dist = price - level
            rec = {
                **fam,
                "shelf_index": int(idx),
                "shelf_price": float(level),
                "distance": float(dist),
                "abs_distance": float(abs(dist)),
                "label": f"{fam['role']} {idx:+d}",
            }
            if best is None or rec["abs_distance"] < best["abs_distance"]:
                best = rec
    return best


def family_by_role(families: list[dict], role: str) -> list[dict]:
    return [fam for fam in families if fam["role"] == role]


def current_week_roles(families: list[dict]) -> list[dict]:
    return [fam for fam in families if fam["role"] in {"Mon", "Tue", "Wed", "Thu", "Fri"}]


def monday_parent_roles(families: list[dict]) -> list[dict]:
    return [fam for fam in families if fam["role"] in {"inherited", "Mon"}]


def rolling_two_roles(families: list[dict]) -> list[dict]:
    ordered = [fam for fam in families if fam["role"] in {"Mon", "Tue", "Wed", "Thu", "Fri"}]
    if len(ordered) >= 2:
        return ordered[-2:]
    if len(ordered) == 1:
        return ordered
    return family_by_role(families, "previous")


RuleFn = Callable[[list[dict]], list[dict]]


RULES: dict[str, RuleFn] = {
    "previous_only": lambda fams: family_by_role(fams, "previous"),
    "inherited_only": lambda fams: family_by_role(fams, "inherited"),
    "monday_only": lambda fams: family_by_role(fams, "Mon") or family_by_role(fams, "inherited"),
    "friday_monday_complex": monday_parent_roles,
    "rolling_two_weekdays": rolling_two_roles,
    "week_to_date_complex": lambda fams: family_by_role(fams, "inherited") + current_week_roles(fams),
    "all_singles_nearest": lambda fams: fams,
}


def find_reactions(hourly: pd.DataFrame, daily: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    rows: list[dict] = []
    h = hourly.reset_index(drop=True)
    for i in range(cfg.pivot_lr, len(h) - cfg.pivot_lr):
        row = h.iloc[i]
        fams = families_for_date(daily, row["rth_date"])
        if not fams:
            continue
        window = h.iloc[i - cfg.pivot_lr : i + cfg.pivot_lr + 1]
        is_pivot_high = row["high"] >= window["high"].max()
        is_pivot_low = row["low"] <= window["low"].min()
        if not is_pivot_high and not is_pivot_low:
            continue
        future = h.iloc[i + 1 : min(len(h), i + cfg.horizon_hours + 1)]
        future = future[future["rth_date"] == row["rth_date"]]
        if future.empty:
            continue
        candidates = [
            ("resistance", "down", float(row["high"]), is_pivot_high),
            ("support", "up", float(row["low"]), is_pivot_low),
        ]
        for event_type, direction, price, ok in candidates:
            if not ok:
                continue
            if direction == "down":
                forward_move = price - future["low"].min()
                adverse = future["high"].max() - price
            else:
                forward_move = future["high"].max() - price
                adverse = price - future["low"].min()
            if forward_move < cfg.move_points:
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
                    "close": float(row["close"]),
                    "ema_state": row["ema_state"],
                    "forward_move": float(forward_move),
                    "forward_adverse": float(adverse),
                }
            )
    return pd.DataFrame(rows)


def recent_memory(
    hourly: pd.DataFrame,
    event_idx: int,
    fam: dict,
    shelf_idx: int,
    event_type: str,
    cfg: Config,
) -> dict[str, float]:
    start = max(0, event_idx - cfg.memory_hours)
    hist = hourly.iloc[start:event_idx]
    if hist.empty:
        return {"touches": 0, "held": 0, "broken": 0, "last_touch_age": np.nan}
    touches = 0
    held = 0
    broken = 0
    last_touch_age = np.nan
    for j, row in hist.iterrows():
        level = shelf_price(fam, int(row["minute_bar"]), shelf_idx, cfg)
        touched = row["low"] <= level <= row["high"]
        if not touched:
            continue
        touches += 1
        last_touch_age = event_idx - j
        if event_type == "resistance":
            if row["close"] <= level:
                held += 1
            else:
                broken += 1
        else:
            if row["close"] >= level:
                held += 1
            else:
                broken += 1
    return {"touches": touches, "held": held, "broken": broken, "last_touch_age": last_touch_age}


def score_family(
    hourly: pd.DataFrame,
    event: pd.Series,
    fam: dict,
    cfg: Config,
    mode: str,
) -> dict:
    ns = nearest_shelf(float(event["price"]), int(event["minute_bar"]), [fam], cfg)
    if ns is None:
        return {"score": -1e9}
    mem = recent_memory(hourly, int(event["hour_index"]), fam, int(ns["shelf_index"]), str(event["event_type"]), cfg)
    dist = float(ns["abs_distance"])
    age = 0.0 if pd.isna(mem["last_touch_age"]) else float(mem["last_touch_age"])
    ema_bonus = 0.0
    if event["event_type"] == "support" and event["ema_state"] == "bull":
        ema_bonus = 1.0
    if event["event_type"] == "resistance" and event["ema_state"] == "bear":
        ema_bonus = 1.0

    if mode == "score_distance":
        score = -dist
    elif mode == "score_recent_touch":
        score = -dist + 1.25 * mem["touches"] - 0.15 * age
    elif mode == "score_held_reaction":
        score = -dist + 2.0 * mem["held"] - 1.5 * mem["broken"] - 0.15 * age
    elif mode == "score_memory_ema":
        score = -dist + 1.5 * mem["held"] + 0.75 * mem["touches"] - 1.0 * mem["broken"] + ema_bonus - 0.1 * age
    else:
        raise ValueError(mode)
    return {**ns, **mem, "score": float(score)}


def evaluate_rules(events: pd.DataFrame, daily: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows: list[dict] = []
    expanded: list[dict] = []
    for event in events.itertuples(index=False):
        fams = families_for_date(daily, event.target_date)
        for rule, fn in RULES.items():
            selected = fn(fams)
            ns = nearest_shelf(float(event.price), int(event.minute_bar), selected, cfg) if selected else None
            if ns is None:
                rows.append(
                    {
                        "rule": rule,
                        "target_date": event.target_date,
                        "target_weekday": event.target_weekday,
                        "event_type": event.event_type,
                        "matched": False,
                        "within_tolerance": False,
                        "abs_distance": np.nan,
                        "label": "",
                        "shelf_index": np.nan,
                        "role": "",
                        "anchor_date": "",
                        "forward_move": event.forward_move,
                        "forward_adverse": event.forward_adverse,
                    }
                )
                continue
            rec = {
                "rule": rule,
                "target_date": event.target_date,
                "target_weekday": event.target_weekday,
                "week_start": event.week_start,
                "event_time_et": event.event_time_et,
                "event_type": event.event_type,
                "direction": event.direction,
                "price": event.price,
                "matched": True,
                "within_tolerance": ns["abs_distance"] <= cfg.tolerance,
                "forward_move": event.forward_move,
                "forward_adverse": event.forward_adverse,
                **ns,
            }
            rows.append(rec)
            expanded.append(rec)
    return pd.DataFrame(rows), pd.DataFrame(expanded)


def evaluate_scoring(hourly: pd.DataFrame, events: pd.DataFrame, daily: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    modes = ["score_distance", "score_recent_touch", "score_held_reaction", "score_memory_ema"]
    rows: list[dict] = []
    for _, event in events.iterrows():
        fams = families_for_date(daily, str(event["target_date"]))
        for mode in modes:
            best: dict | None = None
            for fam in fams:
                rec = score_family(hourly, event, fam, cfg, mode)
                if "abs_distance" not in rec:
                    continue
                if best is None or rec["score"] > best["score"]:
                    best = rec
            if best is None:
                continue
            rows.append(
                {
                    "scoring_rule": mode,
                    "target_date": event["target_date"],
                    "target_weekday": event["target_weekday"],
                    "week_start": event["week_start"],
                    "event_time_et": event["event_time_et"],
                    "event_type": event["event_type"],
                    "price": event["price"],
                    "within_tolerance": best["abs_distance"] <= cfg.tolerance,
                    "forward_move": event["forward_move"],
                    "forward_adverse": event["forward_adverse"],
                    **best,
                }
            )
    return pd.DataFrame(rows)


def summarize_rule_events(df: pd.DataFrame, key_col: str, cfg: Config) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()
    g = (
        df.groupby([key_col], dropna=False)
        .agg(
            events=("price", "size"),
            matched=("matched", "sum") if "matched" in df.columns else ("price", "size"),
            within_tolerance=("within_tolerance", "sum"),
            median_abs_dist=("abs_distance", "median"),
            avg_abs_dist=("abs_distance", "mean"),
            avg_forward_move=("forward_move", "mean"),
            avg_adverse=("forward_adverse", "mean"),
        )
        .reset_index()
    )
    g["coverage_rate"] = g["within_tolerance"] / g["events"]
    return g.sort_values(["coverage_rate", "median_abs_dist"], ascending=[False, True])


def summarize_by_day(df: pd.DataFrame, key_col: str) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()
    out = (
        df.groupby([key_col, "target_weekday"], dropna=False)
        .agg(
            events=("price", "size"),
            within_tolerance=("within_tolerance", "sum"),
            median_abs_dist=("abs_distance", "median"),
        )
        .reset_index()
    )
    out["coverage_rate"] = out["within_tolerance"] / out["events"]
    return out.sort_values([key_col, "target_weekday"])


def summarize_labels(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()
    src = df[df["rule"] == rule].copy() if "rule" in df.columns else df.copy()
    src = src[src["within_tolerance"]]
    if src.empty:
        return pd.DataFrame()
    out = (
        src.groupby(["target_weekday", "role", "anchor_weekday", "shelf_index", "label"], dropna=False)
        .agg(
            events=("price", "size"),
            median_abs_dist=("abs_distance", "median"),
            avg_forward_move=("forward_move", "mean"),
            avg_adverse=("forward_adverse", "mean"),
        )
        .reset_index()
        .sort_values(["target_weekday", "events", "median_abs_dist"], ascending=[True, False, True])
    )
    return out


def replay_trace(hourly: pd.DataFrame, daily: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    weeks = sorted(hourly["week_start"].dropna().unique())
    keep_weeks = set(weeks[-cfg.last_weeks :])
    rows: list[dict] = []
    h = hourly[hourly["week_start"].isin(keep_weeks)].copy()
    for i, row in h.iterrows():
        fams = families_for_date(daily, row["rth_date"])
        price = float(row["close"])
        for rule in ["friday_monday_complex", "week_to_date_complex", "all_singles_nearest"]:
            selected = RULES[rule](fams)
            ns = nearest_shelf(price, int(row["minute_bar"]), selected, cfg) if selected else None
            if ns is None:
                continue
            rows.append(
                {
                    "rule": rule,
                    "week_start": row["week_start"],
                    "rth_date": row["rth_date"],
                    "weekday": row["weekday"],
                    "rth_bucket": int(row["rth_bucket"]),
                    "time_et": row["et"],
                    "close": price,
                    "ema_state": row["ema_state"],
                    "distance_to_active_shelf": ns["distance"],
                    "abs_distance_to_active_shelf": ns["abs_distance"],
                    "active_label": ns["label"],
                    "active_role": ns["role"],
                    "active_anchor_date": ns["anchor_date"],
                    "active_shelf_price": ns["shelf_price"],
                    "active_shelf_index": ns["shelf_index"],
                }
            )
    return pd.DataFrame(rows)


def last_six_reactions(rule_events: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    weeks = sorted(rule_events["week_start"].dropna().unique())
    keep_weeks = set(weeks[-cfg.last_weeks :])
    last = rule_events[(rule_events["week_start"].isin(keep_weeks)) & (rule_events["within_tolerance"])].copy()
    summary = (
        last.groupby(["week_start", "target_weekday", "rule"], dropna=False)
        .agg(
            reactions=("price", "size"),
            median_abs_dist=("abs_distance", "median"),
            top_label=("label", lambda x: x.value_counts().index[0] if len(x) else ""),
        )
        .reset_index()
        .sort_values(["week_start", "target_weekday", "rule"])
    )
    return last, summary


def write_report(
    out: Path,
    source: Path,
    cfg: Config,
    events: pd.DataFrame,
    rule_events: pd.DataFrame,
    scoring_events: pd.DataFrame,
    last6_summary: pd.DataFrame,
    trace: pd.DataFrame,
) -> None:
    rule_summary = summarize_rule_events(rule_events, "rule", cfg)
    day_summary = summarize_by_day(rule_events, "rule")
    scoring_summary = summarize_rule_events(scoring_events.rename(columns={"scoring_rule": "score_rule"}), "score_rule", cfg)
    scoring_day = summarize_by_day(scoring_events.rename(columns={"scoring_rule": "score_rule"}), "score_rule")
    week_labels = summarize_labels(rule_events, "week_to_date_complex")
    fm_labels = summarize_labels(rule_events, "friday_monday_complex")
    nearest_labels = summarize_labels(rule_events, "all_singles_nearest")

    for name, frame in {
        "reaction_universe": events,
        "rule_event_attribution": rule_events,
        "rule_summary": rule_summary,
        "rule_by_day": day_summary,
        "scoring_event_attribution": scoring_events,
        "scoring_summary": scoring_summary,
        "scoring_by_day": scoring_day,
        "week_to_date_labels": week_labels,
        "friday_monday_labels": fm_labels,
        "nearest_single_labels": nearest_labels,
        "last6_replay_summary": last6_summary,
        "last6_active_trace": trace,
    }.items():
        frame.to_csv(out / f"{name}.csv", index=False)

    fmt_rule = rule_summary.copy()
    if not fmt_rule.empty:
        fmt_rule["coverage_rate"] = fmt_rule["coverage_rate"].map(pct)
    fmt_score = scoring_summary.copy()
    if not fmt_score.empty:
        fmt_score["coverage_rate"] = fmt_score["coverage_rate"].map(pct)
    fmt_day = day_summary.copy()
    if not fmt_day.empty:
        fmt_day["coverage_rate"] = fmt_day["coverage_rate"].map(pct)

    best_rule = rule_summary.iloc[0] if not rule_summary.empty else None
    headline = (
        f"Best anchor election on this ES year is `{best_rule['rule']}`: "
        f"{best_rule['within_tolerance']}/{best_rule['events']} reactions within {cfg.tolerance} points "
        f"({best_rule['coverage_rate']:.1%}), median distance {best_rule['median_abs_dist']:.2f} points."
        if best_rule is not None
        else "No reactions were found."
    )

    md: list[str] = [
        "# Control Grid Family Complex Tests",
        "",
        f"**Headline:** {headline}",
        "",
        "## Setup",
        f"- Data: `{source}`",
        "- Instrument: ES 1-minute, converted to America/New_York, RTH 09:30-16:00 ET, resampled to RTH hourly bars.",
        f"- Constants held fixed: `{SLOPE_PER_HOUR}` points per trading hour, `{BAND}`-point shelves.",
        f"- Reaction: hourly pivot high/low that moves away at least `{cfg.move_points}` points within `{cfg.horizon_hours}` RTH hours.",
        f"- Match: touched shelf family is within `{cfg.tolerance}` points of the reaction price.",
        "",
        "## Rule Comparison",
        md_table(fmt_rule, 20),
        "",
        "## Rule Comparison By Weekday",
        md_table(fmt_day, 60),
        "",
        "## Active Scoring Comparison",
        md_table(fmt_score, 20),
        "",
        "## Active Scoring By Weekday",
        md_table(scoring_day.assign(coverage_rate=scoring_day["coverage_rate"].map(pct)) if not scoring_day.empty else scoring_day, 60),
        "",
        "## Week-To-Date Complex Shelf Labels",
        "This is the clearest answer to your 'Wednesday may be using Monday +34 or -34' point.",
        md_table(week_labels, 80),
        "",
        "## Friday/Monday Parent-Child Shelf Labels",
        md_table(fm_labels, 60),
        "",
        "## Nearest Single-Family Shelf Labels",
        md_table(nearest_labels, 60),
        "",
        "## Last Six Weeks Replay Summary",
        md_table(last6_summary, 100),
        "",
        "## Indicator Build Implications",
        "- Do not hard-replace the anchor every day. The data is split across the inherited Friday/Monday complex, yesterday, and the week-to-date stack.",
        "- The indicator should display one active shelf at a time, but keep the parent complex available in a thin/faded style.",
        "- The active shelf label should include family and shelf index, for example `Mon +1`, `Fri -2`, or `Wed 0`. Otherwise an older-family shelf looks random.",
        "- The production rule should start with the week-to-date complex and score it down to one active shelf using distance plus recent held-touch memory.",
        "- A later refinement should add the mirrored low-family after the high-family election is stable.",
    ]
    (out / "family_complex_report.md").write_text("\n".join(md), encoding="utf-8")


def run_once(data: Path, out: Path, cfg: Config) -> dict[str, pd.DataFrame]:
    out.mkdir(parents=True, exist_ok=True)
    df = read_es(data)
    daily = daily_rth(df)
    hourly = hourly_rth(df)
    events = find_reactions(hourly, daily, cfg)
    rule_events, _ = evaluate_rules(events, daily, cfg)
    scoring_events = evaluate_scoring(hourly, events, daily, cfg)
    trace = replay_trace(hourly, daily, cfg)
    last6_events, last6_summary = last_six_reactions(rule_events, cfg)
    daily.to_csv(out / "daily_rth_highs.csv", index=False)
    hourly.to_csv(out / "hourly_rth_bars.csv", index=False)
    last6_events.to_csv(out / "last6_replay_events.csv", index=False)
    write_report(out, data, cfg, events, rule_events, scoring_events, last6_summary, trace)
    return {
        "events": events,
        "rule_events": rule_events,
        "scoring_events": scoring_events,
        "last6_summary": last6_summary,
        "trace": trace,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=6.0)
    parser.add_argument("--move-points", type=float, default=17.0)
    parser.add_argument("--horizon-hours", type=int, default=6)
    parser.add_argument("--last-weeks", type=int, default=6)
    args = parser.parse_args()
    cfg = Config(
        tolerance=args.tolerance,
        move_points=args.move_points,
        horizon_hours=args.horizon_hours,
        last_weeks=args.last_weeks,
    )
    run_once(args.data, args.out, cfg)
    print((args.out / "family_complex_report.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
