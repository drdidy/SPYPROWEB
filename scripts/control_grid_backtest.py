#!/usr/bin/env python3
"""
SPY Prophet Control Grid research harness.

Faithfulness note:
  The control-line decay is intentionally indexed by sequential CSV row number.
  Timestamps are used only for session day/week grouping and reporting.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


CT_TZ = "America/Chicago"


@dataclass(frozen=True)
class ControlGridConfig:
    slope_per_hour: float = 1.04
    band_width: float = 34.0
    base_zones: int = 4
    max_zones: int = 10
    roll_hour_ct: int = 17
    reset_raises: bool = True
    reset_mode: str = "Weekly"
    repin_mode: str = "Daily close beyond zone"
    line_mode: str = "mirror"
    output_start: str = "2026-01-01"
    output_end: str = "2026-12-31"

    @property
    def per_bar(self) -> float:
        # One input row is one 1-minute trading bar.
        return self.slope_per_hour / 60.0


def read_ohlcv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    ts_col = "timestamp" if "timestamp" in df.columns else "ts_event"
    required = {ts_col, "open", "high", "low", "close"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {sorted(missing)}")
    out = df[[ts_col, "open", "high", "low", "close"] + (["volume"] if "volume" in df.columns else [])].copy()
    out = out.rename(columns={ts_col: "timestamp"})
    out["timestamp"] = pd.to_datetime(out["timestamp"], utc=True)
    out["ct"] = out["timestamp"].dt.tz_convert(CT_TZ)
    for col in ["open", "high", "low", "close"]:
        out[col] = pd.to_numeric(out[col], errors="coerce")
    out = out.dropna(subset=["open", "high", "low", "close"]).sort_values("timestamp").reset_index(drop=True)
    out["bar_index"] = np.arange(len(out), dtype=np.int64)
    return out


def add_session_keys(df: pd.DataFrame, cfg: ControlGridConfig) -> pd.DataFrame:
    out = df.copy()
    shifted = out["ct"] - pd.Timedelta(hours=cfg.roll_hour_ct)
    out["session_day"] = shifted.dt.date.astype(str)
    shifted_midnight = shifted.dt.normalize()
    # Monday=0 ... Sunday=6. Days since Sunday:
    days_since_sunday = (shifted.dt.weekday + 1) % 7
    out["week_start"] = (shifted_midnight - pd.to_timedelta(days_since_sunday, unit="D")).dt.date.astype(str)
    return out


def build_period_summaries(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    day = (
        df.groupby("session_day", sort=True)
        .agg(
            first_bar=("bar_index", "first"),
            last_bar=("bar_index", "last"),
            first_ts=("ct", "first"),
            last_ts=("ct", "last"),
            high=("high", "max"),
            low=("low", "min"),
            open=("open", "first"),
            close=("close", "last"),
            bars=("bar_index", "size"),
        )
        .reset_index()
    )
    day_high_idx = df.loc[df.groupby("session_day")["high"].idxmax(), ["session_day", "bar_index", "ct", "high"]]
    day_low_idx = df.loc[df.groupby("session_day")["low"].idxmin(), ["session_day", "bar_index", "ct", "low"]]
    day = day.merge(
        day_high_idx.rename(columns={"bar_index": "high_bar", "ct": "high_ts", "high": "high_at_bar"}),
        on="session_day",
        how="left",
    ).merge(
        day_low_idx.rename(columns={"bar_index": "low_bar", "ct": "low_ts", "low": "low_at_bar"}),
        on="session_day",
        how="left",
    )

    week = (
        df.groupby("week_start", sort=True)
        .agg(
            first_bar=("bar_index", "first"),
            last_bar=("bar_index", "last"),
            first_ts=("ct", "first"),
            last_ts=("ct", "last"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            bars=("bar_index", "size"),
        )
        .reset_index()
    )
    return day, week


def prior_maps(day: pd.DataFrame, week: pd.DataFrame) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    day_sorted = day.sort_values("first_bar").reset_index(drop=True)
    week_sorted = week.sort_values("first_bar").reset_index(drop=True)
    prior_day: dict[str, dict[str, Any]] = {}
    for i in range(1, len(day_sorted)):
        prior_day[str(day_sorted.loc[i, "session_day"])] = day_sorted.loc[i - 1].to_dict()
    prior_week: dict[str, dict[str, Any]] = {}
    for i in range(1, len(week_sorted)):
        prior_week[str(week_sorted.loc[i, "week_start"])] = week_sorted.loc[i - 1].to_dict()
    return prior_day, prior_week


def line_value(anchor: float | None, anchor_bar: int | None, bar_index: int, per_bar: float, direction: str) -> float | None:
    if anchor is None or anchor_bar is None:
        return None
    age = bar_index - anchor_bar
    return anchor - age * per_bar if direction == "down" else anchor + age * per_bar


def zone_count(close: float, active_line: float | None, cfg: ControlGridConfig) -> int:
    if active_line is None or not np.isfinite(active_line):
        return cfg.base_zones
    needed = int(math.ceil(abs(close - active_line) / cfg.band_width)) + 1
    return max(cfg.base_zones, min(cfg.max_zones, needed))


def run_control_grid(df: pd.DataFrame, cfg: ControlGridConfig) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    day_summary, week_summary = build_period_summaries(df)
    prior_day, prior_week = prior_maps(day_summary, week_summary)
    day_by_key = {str(row["session_day"]): row for row in day_summary.to_dict("records")}

    hi: float | None = None
    lo: float | None = None
    hi_bar: int | None = None
    lo_bar: int | None = None
    regime = "bull"
    prev_day_key: str | None = None
    prev_week_key: str | None = None
    prev_completed_close: float | None = None
    pending_bias: str | None = None
    bias_n = 0
    bias_hit = 0
    both_confirm_days: list[str] = []
    events: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    low_line_direction = "down" if cfg.line_mode == "descending-only" else "up"
    high_only = cfg.line_mode == "high-only"

    for r in df.itertuples(index=False):
        b = int(r.bar_index)
        session_day = str(r.session_day)
        week_start = str(r.week_start)
        day_change = prev_day_key is None or session_day != prev_day_key
        week_change = prev_week_key is None or week_start != prev_week_key

        event_names: list[str] = []

        if day_change and pending_bias and prev_day_key in day_by_key:
            prev_row = day_by_key[prev_day_key]
            if prev_completed_close is not None:
                delta = float(prev_row["close"]) - float(prev_completed_close)
                if (pending_bias == "bull" and delta > 0) or (pending_bias == "bear" and delta < 0):
                    bias_hit += 1
                bias_n += 1
            prev_completed_close = float(prev_row["close"])

        if week_change and cfg.reset_mode.lower() == "weekly":
            seed = prior_week.get(week_start)
            seed_source = "prior_week"
            if seed is None:
                start = max(0, b - 100)
                lookback = df.iloc[start : b + 1]
                seed = {"high": float(lookback["high"].max()), "low": float(lookback["low"].min())}
                seed_source = "fallback_100_bars"

            new_hi = float(seed["high"])
            new_lo = float(seed["low"])
            if cfg.reset_raises and hi is not None:
                new_hi = max(new_hi, hi)
            if cfg.reset_raises and lo is not None:
                new_lo = min(new_lo, lo)
            hi, lo = new_hi, new_lo
            hi_bar = lo_bar = b
            high_line_now = line_value(hi, hi_bar, b, cfg.per_bar, "down")
            low_line_now = None if high_only else line_value(lo, lo_bar, b, cfg.per_bar, low_line_direction)
            if high_only:
                regime = "bull"
            elif low_line_now is not None and r.close < low_line_now:
                regime = "bear"
            elif high_line_now is not None and r.close > high_line_now:
                regime = "bull"
            event_names.append("weekly_seed")
            events.append(
                {
                    "bar_index": b,
                    "ct": r.ct.isoformat(),
                    "session_day": session_day,
                    "week_start": week_start,
                    "event": "weekly_seed",
                    "regime": regime,
                    "hi": hi,
                    "lo": lo,
                    "source": seed_source,
                }
            )

        if day_change and not week_change and hi is not None and lo is not None and hi_bar is not None and lo_bar is not None:
            prev = prior_day.get(session_day)
            if prev is not None:
                hline = line_value(hi, hi_bar, b, cfg.per_bar, "down")
                lline = None if high_only else line_value(lo, lo_bar, b, cfg.per_bar, low_line_direction)
                prior_close = float(prev["close"])
                bull_confirm = hline is not None and prior_close > hline + cfg.band_width
                bear_confirm = False if high_only else lline is not None and prior_close < lline - cfg.band_width
                if bull_confirm and bear_confirm:
                    both_confirm_days.append(session_day)
                if bull_confirm:
                    hi = float(prev["high"])
                    hi_bar = b
                    regime = "bull"
                    event_names.append("bull_repin")
                    events.append(
                        {
                            "bar_index": b,
                            "ct": r.ct.isoformat(),
                            "session_day": session_day,
                            "week_start": week_start,
                            "event": "bull_repin",
                            "regime": regime,
                            "anchor": hi,
                            "prior_close": prior_close,
                            "confirm_line": hline,
                        }
                    )
                if bear_confirm:
                    lo = float(prev["low"])
                    lo_bar = b
                    regime = "bear"
                    event_names.append("bear_repin")
                    events.append(
                        {
                            "bar_index": b,
                            "ct": r.ct.isoformat(),
                            "session_day": session_day,
                            "week_start": week_start,
                            "event": "bear_repin",
                            "regime": regime,
                            "anchor": lo,
                            "prior_close": prior_close,
                            "confirm_line": lline,
                        }
                    )

        high_line = line_value(hi, hi_bar, b, cfg.per_bar, "down")
        low_line = None if high_only else line_value(lo, lo_bar, b, cfg.per_bar, low_line_direction)
        active_line = high_line if high_only or regime == "bull" else low_line
        mirror_line = None if high_only else low_line if regime == "bull" else high_line
        zc = zone_count(float(r.close), active_line, cfg)
        bias_call = "bull" if active_line is not None and float(r.close) >= active_line else "bear"
        if day_change:
            pending_bias = bias_call

        rows.append(
            {
                "bar_index": b,
                "timestamp": r.timestamp.isoformat(),
                "ct": r.ct.isoformat(),
                "session_day": session_day,
                "week_start": week_start,
                "open": float(r.open),
                "high": float(r.high),
                "low": float(r.low),
                "close": float(r.close),
                "hi_anchor": hi,
                "lo_anchor": lo,
                "hi_bar": hi_bar,
                "lo_bar": lo_bar,
                "high_line": high_line,
                "low_line": low_line,
                "regime": regime,
                "active_line": active_line,
                "mirror_line": mirror_line,
                "active_delta_close": None if active_line is None else float(r.close) - active_line,
                "zone_count": zc,
                "bias_call": bias_call,
                "events": ",".join(event_names),
            }
        )
        prev_day_key = session_day
        prev_week_key = week_start

    out = pd.DataFrame(rows)
    ev = pd.DataFrame(events)
    summary = {
        "rows": len(out),
        "date_range_ct": [out["ct"].iloc[0], out["ct"].iloc[-1]] if len(out) else None,
        "slope_per_hour": cfg.slope_per_hour,
        "per_bar": cfg.per_bar,
        "band_width": cfg.band_width,
        "roll_hour_ct": cfg.roll_hour_ct,
        "line_mode": cfg.line_mode,
        "bias_n": bias_n,
        "bias_hit": bias_hit,
        "bias_hit_rate": None if bias_n == 0 else bias_hit / bias_n,
        "event_counts": ev["event"].value_counts().to_dict() if len(ev) else {},
        "both_confirm_days": both_confirm_days,
    }
    return out, ev, summary


def respect_stats(out: pd.DataFrame, cfg: ControlGridConfig) -> dict[str, Any]:
    df = out.dropna(subset=["active_line"]).copy()
    if df.empty:
        return {}
    touch = (df["low"] <= df["active_line"]) & (df["high"] >= df["active_line"])
    touched = df[touch].copy()
    held = ((touched["regime"] == "bull") & (touched["close"] >= touched["active_line"])) | (
        (touched["regime"] == "bear") & (touched["close"] <= touched["active_line"])
    )
    by_regime = {}
    for regime, g in touched.groupby("regime"):
        gheld = ((g["regime"] == "bull") & (g["close"] >= g["active_line"])) | (
            (g["regime"] == "bear") & (g["close"] <= g["active_line"])
        )
        by_regime[regime] = {
            "touches": int(len(g)),
            "held": int(gheld.sum()),
            "held_rate": None if len(g) == 0 else float(gheld.mean()),
        }
    return {
        "touches": int(touch.sum()),
        "held": int(held.sum()),
        "held_rate": None if len(touched) == 0 else float(held.mean()),
        "by_regime": by_regime,
        "close_to_active_abs_median": float(df["active_delta_close"].abs().median()),
        "close_to_active_abs_p95": float(df["active_delta_close"].abs().quantile(0.95)),
        "close_to_active_abs_max": float(df["active_delta_close"].abs().max()),
        "auto_extend_hits": int((df["zone_count"] >= cfg.max_zones).sum()),
    }


def monthly_bias(out: pd.DataFrame) -> pd.DataFrame:
    days = (
        out.groupby("session_day", sort=True)
        .agg(first_ct=("ct", "first"), close=("close", "last"), bias=("bias_call", "first"))
        .reset_index()
    )
    days["prev_close"] = days["close"].shift(1)
    days["delta"] = days["close"] - days["prev_close"]
    days = days.dropna(subset=["prev_close"])
    days["hit"] = ((days["bias"] == "bull") & (days["delta"] > 0)) | ((days["bias"] == "bear") & (days["delta"] < 0))
    days["month"] = pd.to_datetime(days["first_ct"], utc=True).dt.tz_convert(CT_TZ).dt.strftime("%Y-%m")
    return days.groupby("month").agg(days=("hit", "size"), hits=("hit", "sum"), hit_rate=("hit", "mean")).reset_index()


def calendar_diagnostics(df: pd.DataFrame, cfg: ControlGridConfig) -> dict[str, Any]:
    gaps = df[["ct", "bar_index"]].copy()
    gaps["prev_ct"] = gaps["ct"].shift(1)
    gaps["gap_minutes"] = (gaps["ct"] - gaps["prev_ct"]).dt.total_seconds() / 60.0
    big = gaps[gaps["gap_minutes"] > 1.5].copy()
    phantom_points = ((big["gap_minutes"] - 1.0).clip(lower=0) / 60.0 * cfg.slope_per_hour).sum()
    return {
        "big_gap_count": int(len(big)),
        "largest_gaps_minutes": [float(x) for x in big["gap_minutes"].nlargest(10).round(2).tolist()],
        "wall_clock_phantom_descent_points_total": float(phantom_points),
        "daily_halt_like_gaps": int(((big["gap_minutes"] >= 55) & (big["gap_minutes"] <= 70)).sum()),
        "weekend_like_gaps": int((big["gap_minutes"] > 1000).sum()),
    }


def find_section7_candidates(out: pd.DataFrame, cfg: ControlGridConfig) -> list[dict[str, Any]]:
    days = (
        out.groupby("session_day", sort=True)
        .agg(
            first_ct=("ct", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            high_line_first=("high_line", "first"),
            high_line_min=("high_line", "min"),
            events=("events", lambda s: ",".join([x for x in s if x])),
        )
        .reset_index()
    )
    candidates: list[dict[str, Any]] = []
    for i in range(1, len(days) - 1):
        d = days.iloc[i]
        next_d = days.iloc[i + 1]
        if pd.isna(d["high_line_first"]) or pd.isna(next_d["high_line_first"]):
            continue
        wick_above = float(d["high"]) > float(d["high_line_first"])
        no_zone_close = float(d["close"]) <= float(d["high_line_first"]) + cfg.band_width
        next_respects = float(next_d["high"]) >= float(next_d["high_line_first"]) - 3 and float(next_d["close"]) < float(next_d["high_line_first"])
        if wick_above and no_zone_close and next_respects:
            candidates.append(
                {
                    "setup_day": str(d["session_day"]),
                    "next_day": str(next_d["session_day"]),
                    "setup_high": float(d["high"]),
                    "setup_close": float(d["close"]),
                    "line_first": float(d["high_line_first"]),
                    "confirm_required": float(d["high_line_first"]) + cfg.band_width,
                    "next_high": float(next_d["high"]),
                    "next_close": float(next_d["close"]),
                    "next_line": float(next_d["high_line_first"]),
                }
            )
    return candidates[:10]


def run_sensitivity(df: pd.DataFrame, base: ControlGridConfig) -> pd.DataFrame:
    rows = []
    # Keep this report-time probe bounded. The full baseline remains all bars;
    # sensitivity uses enough lead-in for prior-week seeding, then the output year.
    ct = df["ct"]
    probe_start = pd.Timestamp(base.output_start, tz=CT_TZ) - pd.Timedelta(days=45)
    df_probe = df[ct >= probe_start].copy().reset_index(drop=True)
    if "bar_index" in df_probe:
        df_probe["bar_index"] = np.arange(len(df_probe), dtype=np.int64)
    for roll in [16, 17, 18]:
        cfg = ControlGridConfig(**{**base.__dict__, "roll_hour_ct": roll})
        keyed = add_session_keys(df_probe, cfg)
        out, ev, summary = run_control_grid(keyed, cfg)
        filt = filter_output_window(out, cfg)
        rs = respect_stats(filt, cfg)
        rows.append(
            {
                "variant": f"roll_{roll}",
                "roll_hour": roll,
                "slope": cfg.slope_per_hour,
                "band": cfg.band_width,
                "bars": len(filt),
                "repins": int(len(ev[ev["event"].str.contains("repin", na=False)])) if len(ev) else 0,
                "bias_hit_rate": summary["bias_hit_rate"],
                "line_held_rate": rs.get("held_rate"),
                "p95_abs_drift": rs.get("close_to_active_abs_p95"),
            }
        )
    for slope, band in [(0.98, 34.0), (1.04, 32.0), (1.04, 34.0), (1.04, 36.0), (1.10, 34.0)]:
            cfg = ControlGridConfig(**{**base.__dict__, "slope_per_hour": slope, "band_width": band})
            keyed = add_session_keys(df_probe, cfg)
            out, ev, summary = run_control_grid(keyed, cfg)
            filt = filter_output_window(out, cfg)
            rs = respect_stats(filt, cfg)
            rows.append(
                {
                    "variant": f"s{slope}_b{band}",
                    "roll_hour": cfg.roll_hour_ct,
                    "slope": slope,
                    "band": band,
                    "bars": len(filt),
                    "repins": int(len(ev[ev["event"].str.contains("repin", na=False)])) if len(ev) else 0,
                    "bias_hit_rate": summary["bias_hit_rate"],
                    "line_held_rate": rs.get("held_rate"),
                    "p95_abs_drift": rs.get("close_to_active_abs_p95"),
                }
            )
    return pd.DataFrame(rows)


def filter_output_window(out: pd.DataFrame, cfg: ControlGridConfig) -> pd.DataFrame:
    ct = pd.to_datetime(out["ct"], utc=True).dt.tz_convert(CT_TZ)
    start = pd.Timestamp(cfg.output_start, tz=CT_TZ)
    end = pd.Timestamp(cfg.output_end, tz=CT_TZ) + pd.Timedelta(days=1)
    return out[(ct >= start) & (ct < end)].copy()


def write_report(
    out: pd.DataFrame,
    ev: pd.DataFrame,
    summary: dict[str, Any],
    cfg: ControlGridConfig,
    output_dir: Path,
    source_csv: Path,
    full_df: pd.DataFrame,
    include_sensitivity: bool = False,
) -> None:
    rs = respect_stats(out, cfg)
    mb = monthly_bias(out)
    cal = calendar_diagnostics(full_df, cfg)
    candidates = find_section7_candidates(out, cfg)
    if include_sensitivity:
        sens = run_sensitivity(full_df, cfg)
        sensitivity_note = "Full table written to `sensitivity.csv`. Higher held-rate is better only if drift/repin counts remain practical; it is not a trade P&L metric."
    else:
        sens = pd.DataFrame(
            [
                {
                    "variant": "baseline_only",
                    "roll_hour": cfg.roll_hour_ct,
                    "slope": cfg.slope_per_hour,
                    "band": cfg.band_width,
                    "bars": len(out),
                    "repins": int(len(ev[ev["event"].str.contains("repin", na=False)])) if len(ev) else 0,
                    "bias_hit_rate": summary["bias_hit_rate"],
                    "line_held_rate": rs.get("held_rate"),
                    "p95_abs_drift": rs.get("close_to_active_abs_p95"),
                    "note": "Sensitivity sweep skipped for initial output; rerun with --sensitivity for the full grid.",
                }
            ]
        )
        sensitivity_note = "Initial run skipped the full sensitivity sweep for speed. Rerun with `--sensitivity` to populate the full grid."
    sens.to_csv(output_dir / "sensitivity.csv", index=False)
    mb.to_csv(output_dir / "monthly_bias.csv", index=False)

    event_counts = ev["event"].value_counts().to_dict() if len(ev) else {}
    repins = ev[ev["event"].isin(["bull_repin", "bear_repin"])] if len(ev) else ev
    durations = (
        out.groupby((out["regime"] != out["regime"].shift()).cumsum())
        .agg(regime=("regime", "first"), bars=("bar_index", "size"), from_ct=("ct", "first"), to_ct=("ct", "last"))
        .reset_index(drop=True)
    )
    durations.to_csv(output_dir / "regime_durations.csv", index=False)

    report = []
    report.append("# SPY Prophet Control Grid Research Report")
    report.append("")
    report.append("## Baseline Assumptions")
    report.append(f"- Source CSV: `{source_csv}`")
    report.append("- Timestamp assumption: Databento `ts_event` is UTC; converted to America/Chicago for session buckets.")
    report.append(f"- Output window: {cfg.output_start} through {cfg.output_end}; actual CT range: {out['ct'].iloc[0]} to {out['ct'].iloc[-1]}.")
    report.append(f"- Decay clock: row index only. `perBar = {cfg.slope_per_hour} / 60 = {cfg.per_bar:.8f}` points per 1-minute bar.")
    report.append(f"- Day/week roll: {cfg.roll_hour_ct}:00 CT; week starts Sunday {cfg.roll_hour_ct}:00 CT.")
    report.append(f"- Baseline: slopePerHour={cfg.slope_per_hour}, bandWidth={cfg.band_width}, resetRaises={cfg.reset_raises}, lineMode={cfg.line_mode}.")
    if cfg.line_mode == "descending-only":
        report.append("- Line formula mode: highLine = hi - age * perBar; lowLine = lo - age * perBar. This is the descending-only comparison requested by the user.")
    elif cfg.line_mode == "high-only":
        report.append("- Line formula mode: highLine = hi - age * perBar only. Low-line state and bear re-pins are disabled; 34-point parallels are interpreted around the high control line.")
    else:
        report.append("- Inferred formulas because the pasted prompt replaced code blocks with `Code`: highLine = hi - (barIndex - hiBar) * perBar; lowLine = lo + (barIndex - loBar) * perBar.")
    report.append("")
    report.append("## Headline Results")
    report.append(f"- Bars analyzed in output window: {len(out):,}")
    report.append(f"- Bias hit rate: {summary.get('bias_hit_rate', 0) * 100:.1f}% over {summary.get('bias_n', 0)} completed daily calls.")
    report.append(f"- Event counts: `{json.dumps(event_counts, sort_keys=True)}`")
    report.append(f"- Re-pins: {len(repins):,}")
    report.append(f"- Active-line touches: {rs.get('touches', 0):,}; held {rs.get('held', 0):,} ({(rs.get('held_rate') or 0) * 100:.1f}%).")
    report.append(f"- Active line absolute drift: median {rs.get('close_to_active_abs_median', 0):.2f} pts; p95 {rs.get('close_to_active_abs_p95', 0):.2f}; max {rs.get('close_to_active_abs_max', 0):.2f}.")
    report.append(f"- Auto-extend cap hits: {rs.get('auto_extend_hits', 0):,} bars at maxZones={cfg.max_zones}.")
    report.append("")
    report.append("## Monthly Bias")
    report.append(mb.to_markdown(index=False))
    report.append("")
    report.append("## Calendar And Clock-Freeze Findings")
    report.append(f"- Large gaps >1.5 minutes: {cal['big_gap_count']:,}")
    report.append(f"- Daily halt-like gaps (55-70 minutes): {cal['daily_halt_like_gaps']:,}")
    report.append(f"- Weekend-like gaps (>1000 minutes): {cal['weekend_like_gaps']:,}")
    report.append(f"- If wall-clock time were used, phantom descent across gaps would total about {cal['wall_clock_phantom_descent_points_total']:.2f} points over the full file. The bar-index implementation avoids this.")
    report.append(f"- Largest gaps in minutes: {cal['largest_gaps_minutes']}")
    report.append("")
    report.append("## Section 7 Worked Example Search")
    if candidates:
        report.append("Closest matching candidates where a day wicked above the decaying high line without zone-close confirmation and the next day respected/dropped from the same line:")
        report.append(pd.DataFrame(candidates).to_markdown(index=False))
        report.append("Interpretation: these candidates reproduce the key non-repaint behavior: wick-only movement does not re-pin; the following day still uses the prior anchor decayed by bar count.")
    else:
        report.append("No exact candidate matching all Section 7 details was found in the available partial-2026 ES file. The implementation still enforces the required rule: a wick above highLine is ignored unless the completed daily close clears highLine + bandWidth.")
    report.append("")
    report.append("## Sensitivity Snapshot")
    report.append(sensitivity_note)
    report.append(sens.head(15).to_markdown(index=False))
    report.append("")
    report.append("## Issues, Root Causes, Fixes")
    report.append("1. **Spec code blocks were omitted.** Root cause: the prompt contains `Code` placeholders. Fix: keep formulas explicit in code and report; confirm tie-break and bias formula before app integration.")
    report.append("2. **Both-confirm days are ambiguous.** Baseline follows the prompt's last-assignment behavior, so bear wins if bull and bear confirmations fire on the same day. Fix: make tie-break a parameter (`bear_wins`, `largest_distance`, `no_flip`).")
    report.append("3. **Daily close re-pin lags intraday breaks.** Root cause: design intentionally waits for the completed session day. Fix: keep baseline, but add a separately labeled intraday-confirmed mode for alerting if evidence supports it.")
    report.append("4. **Weekly reset changes slope reference.** Root cause: reset re-seeds the anchor price at week open rather than the actual high/low bar. Fix: keep weekly baseline but expose `resetMode=Never` and report slope-reference error in QA.")
    report.append("5. **Fixed 34-point band can become regime-sensitive.** Root cause: point band is a shrinking percent as ES rises and ignores volatility. Fix: do not change default; test ATR/percent-scaled overlays as optional diagnostics.")
    report.append("")
    report.append("## Recommendations")
    report.append("- Keep the baseline bar-index decay exactly as specified; do not use wall-clock minutes.")
    report.append("- Use the 17:00 CT roll as default unless broker data proves otherwise; include roll-hour sensitivity in ongoing QA.")
    report.append("- For production UI, label this as a structural control grid rather than a direct entry signal until line-respect, forward-return, and MFE/MAE metrics are finalized.")
    report.append("- Add configuration switches for tie-break, resetRaises, and confirmation mode, but keep baseline defaults unchanged for reproducibility.")
    report.append("")
    (output_dir / "report.md").write_text("\n".join(report), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=Path("data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv"))
    parser.add_argument("--out", type=Path, default=Path("outputs/control_grid"))
    parser.add_argument("--start", default="2026-01-01")
    parser.add_argument("--end", default="2026-12-31")
    parser.add_argument("--roll-hour-ct", type=int, default=17)
    parser.add_argument("--sensitivity", action="store_true", help="Run the slower roll/slope/band sensitivity grid.")
    parser.add_argument(
        "--line-mode",
        choices=["mirror", "descending-only", "high-only"],
        default="mirror",
        help="mirror = high desc / low asc baseline; descending-only = both anchors decay downward; high-only = high descending line only.",
    )
    args = parser.parse_args()

    cfg = ControlGridConfig(output_start=args.start, output_end=args.end, roll_hour_ct=args.roll_hour_ct, line_mode=args.line_mode)
    args.out.mkdir(parents=True, exist_ok=True)

    raw = read_ohlcv(args.csv)
    keyed = add_session_keys(raw, cfg)
    out_all, ev_all, summary_all = run_control_grid(keyed, cfg)
    out = filter_output_window(out_all, cfg)
    ev = ev_all[ev_all["bar_index"].isin(set(out["bar_index"]))].copy() if len(ev_all) else ev_all

    bars_path = args.out / "bars_2026.csv"
    events_path = args.out / "events_2026.csv"
    summary_path = args.out / "summary.json"
    report_path = args.out / "report.md"
    out.to_csv(bars_path, index=False)
    ev.to_csv(events_path, index=False)
    summary = {**summary_all, "output_rows": len(out), "output_range_ct": [out["ct"].iloc[0], out["ct"].iloc[-1]]}
    summary_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    write_report(out, ev, summary, cfg, args.out, args.csv, keyed, include_sensitivity=args.sensitivity)

    shutil.copyfile(bars_path, args.out / "control_grid_per_bar.csv")
    shutil.copyfile(events_path, args.out / "control_grid_events.csv")
    shutil.copyfile(summary_path, args.out / "control_grid_summary.json")
    shutil.copyfile(report_path, args.out / "control_grid_report.md")
    print(json.dumps({"ok": True, "output_dir": str(args.out), "rows": len(out), "events": len(ev)}, indent=2))


if __name__ == "__main__":
    main()
