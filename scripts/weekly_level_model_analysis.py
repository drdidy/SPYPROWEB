#!/usr/bin/env python3
"""SPY Prophet weekly ES level-model decision brief.

The script is intentionally self-contained: it rebuilds the weekly descending
grid, tests flat-vs-sloped breakout extremes, respected-edge extensions, slope
fit, entry bands, and supporting zone/gold checks from one ES 1-minute file.
"""

from __future__ import annotations

import argparse
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


ET_TZ = "America/New_York"


@dataclass(frozen=True)
class Config:
    slope: float = 1.04
    band_width: float = 34.0
    z_n: int = 6
    tolerance: float = 3.0
    r_react: float = 17.0
    n_bars: int = 120
    pivot_lr: int = 2

    @property
    def per_bar(self) -> float:
        return self.slope / 60.0


def read_data(path: Path) -> pd.DataFrame:
    raw = pd.read_csv(path)
    ts_col = "timestamp" if "timestamp" in raw.columns else "ts_event"
    cols = [ts_col, "open", "high", "low", "close"] + (["volume"] if "volume" in raw.columns else [])
    df = raw[cols].rename(columns={ts_col: "timestamp"}).copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["et"] = df["timestamp"].dt.tz_convert(ET_TZ)
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if "volume" in df:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).sort_values("timestamp").reset_index(drop=True)
    df["bar_index"] = np.arange(len(df), dtype=np.int64)
    df["rth"] = is_rth(df["et"])
    df["rth_date"] = df["et"].dt.date.astype(str)
    shifted = df["et"] - pd.Timedelta(hours=18)
    days_since_sunday = (shifted.dt.weekday + 1) % 7
    df["week_start"] = (shifted.dt.normalize() - pd.to_timedelta(days_since_sunday, unit="D")).dt.date.astype(str)
    df["session_day"] = shifted.dt.date.astype(str)
    return df


def is_rth(et: pd.Series) -> pd.Series:
    mins = et.dt.hour * 60 + et.dt.minute
    return (mins >= 9 * 60 + 30) & (mins <= 16 * 60)


def inventory(df: pd.DataFrame, source: Path) -> dict[str, object]:
    diffs = df["timestamp"].diff().dropna().dt.total_seconds() / 60
    duplicates = int(df["timestamp"].duplicated().sum())
    gaps = diffs[diffs > 1.5]
    rth_counts = df[df["rth"]].groupby("rth_date").size()
    short_sessions = rth_counts[rth_counts < 300]
    # Roll-risk proxy: large weekend/session-open gaps around quarterly roll months.
    gap_rows = df.loc[gaps.index, ["timestamp", "et", "open"]].copy()
    gap_rows["prev_close"] = df.loc[gaps.index - 1, "close"].to_numpy()
    gap_rows["gap_minutes"] = gaps.to_numpy()
    gap_rows["price_gap"] = gap_rows["open"] - gap_rows["prev_close"]
    gap_rows["month"] = gap_rows["et"].dt.month
    roll_like = gap_rows[(gap_rows["month"].isin([3, 6, 9, 12])) & (gap_rows["price_gap"].abs() > 25)]
    return {
        "source": str(source),
        "columns": list(pd.read_csv(source, nrows=0).columns),
        "timestamp": "ts_event" if "ts_event" in pd.read_csv(source, nrows=0).columns else "timestamp",
        "timezone": "UTC in source; converted to America/New_York for analysis.",
        "bar_minutes_median": float(diffs.median()),
        "bar_minutes_mode": float(diffs.mode().iloc[0]) if len(diffs.mode()) else np.nan,
        "rows": int(len(df)),
        "range_utc": [df["timestamp"].iloc[0].isoformat(), df["timestamp"].iloc[-1].isoformat()],
        "range_et": [df["et"].iloc[0].isoformat(), df["et"].iloc[-1].isoformat()],
        "duplicates": duplicates,
        "gap_count": int(len(gaps)),
        "largest_gaps_minutes": [float(x) for x in gaps.sort_values(ascending=False).head(8).round(1).to_list()],
        "short_sessions": int(len(short_sessions)),
        "short_session_examples": short_sessions.head(8).to_dict(),
        "roll_like_gaps": roll_like[["et", "gap_minutes", "price_gap"]].head(20).to_dict("records"),
    }


def rth_daily(df: pd.DataFrame) -> pd.DataFrame:
    r = df[df["rth"]].copy()
    daily = r.groupby("rth_date", sort=True).agg(
        first_bar=("bar_index", "first"),
        last_bar=("bar_index", "last"),
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
        bars=("bar_index", "size"),
    ).reset_index()
    high_idx = r.loc[r.groupby("rth_date")["high"].idxmax(), ["rth_date", "bar_index", "et", "high"]]
    low_idx = r.loc[r.groupby("rth_date")["low"].idxmin(), ["rth_date", "bar_index", "et", "low"]]
    daily = daily.merge(high_idx.rename(columns={"bar_index": "high_bar", "et": "high_et", "high": "high_at_bar"}), on="rth_date")
    daily = daily.merge(low_idx.rename(columns={"bar_index": "low_bar", "et": "low_et", "low": "low_at_bar"}), on="rth_date")
    daily["date"] = pd.to_datetime(daily["rth_date"])
    return daily


def build_week_models(df: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    daily = rth_daily(df)
    dmap = {row.rth_date: row for row in daily.itertuples(index=False)}
    rows = []
    for week_start in sorted(df["week_start"].unique()):
        ws = pd.Timestamp(week_start)
        mon = (ws + pd.Timedelta(days=1)).date().isoformat()
        fri = (ws + pd.Timedelta(days=5)).date().isoformat()
        possible_prior = daily[daily["date"] < pd.Timestamp(mon)].sort_values("date")
        if possible_prior.empty or mon not in dmap:
            continue
        prior = possible_prior.iloc[-1]
        monday = dmap[mon]
        week_bars = df[df["week_start"] == week_start]
        if week_bars.empty:
            continue
        rows.append(
            {
                "week_start": week_start,
                "monday_date": mon,
                "friday_date": fri,
                "week_first_bar": int(week_bars["bar_index"].min()),
                "week_last_bar": int(week_bars["bar_index"].max()),
                "prior_rth_date": str(prior["rth_date"]),
                "anchor_high": float(prior["high"]),
                "anchor_high_bar": int(prior["high_bar"]),
                "monday_high": float(monday.high),
                "monday_high_bar": int(monday.high_bar),
                "monday_low": float(monday.low),
                "monday_low_bar": int(monday.low_bar),
                "monday_lock_bar": int(monday.last_bar),
            }
        )
    models = pd.DataFrame(rows)
    model_map = models.set_index("week_start").to_dict("index")
    enriched = df.copy()
    for col in ["grid", "upper_outer_grid", "lower_outer_grid", "gold_high", "gold_low", "ob_up", "ob_dn"]:
        enriched[col] = np.nan
    enriched["model_ready"] = False
    for week_start, m in model_map.items():
        mask = enriched["week_start"] == week_start
        idx = enriched.loc[mask, "bar_index"]
        grid = m["anchor_high"] - cfg.per_bar * (idx - m["anchor_high_bar"])
        upper = grid + cfg.z_n * cfg.band_width
        lower = grid - cfg.z_n * cfg.band_width
        gh = m["monday_high"] - cfg.per_bar * (idx - m["monday_high_bar"])
        gl = m["monday_low"] - cfg.per_bar * (idx - m["monday_low_bar"])
        locked = idx >= m["monday_lock_bar"]
        enriched.loc[mask, "grid"] = grid
        enriched.loc[mask, "upper_outer_grid"] = upper
        enriched.loc[mask, "lower_outer_grid"] = lower
        enriched.loc[mask & locked, "gold_high"] = gh[locked.to_numpy()]
        enriched.loc[mask & locked, "gold_low"] = gl[locked.to_numpy()]
        enriched.loc[mask & locked, "ob_up"] = np.maximum(upper[locked.to_numpy()], gh[locked.to_numpy()])
        enriched.loc[mask & locked, "ob_dn"] = np.minimum(lower[locked.to_numpy()], gl[locked.to_numpy()])
        enriched.loc[mask & locked, "model_ready"] = True
    return enriched, models


def pivot_high(df: pd.DataFrame, pos: int, lr: int) -> bool:
    if pos < lr or pos + lr >= len(df):
        return False
    v = df["high"].iat[pos]
    return bool(v == df["high"].iloc[pos - lr : pos + lr + 1].max())


def pivot_low(df: pd.DataFrame, pos: int, lr: int) -> bool:
    if pos < lr or pos + lr >= len(df):
        return False
    v = df["low"].iat[pos]
    return bool(v == df["low"].iloc[pos - lr : pos + lr + 1].min())


def pivot_masks(frame: pd.DataFrame, lr: int) -> tuple[np.ndarray, np.ndarray]:
    highs = frame["high"].to_numpy(float)
    lows = frame["low"].to_numpy(float)
    ph = np.zeros(len(frame), dtype=bool)
    pl = np.zeros(len(frame), dtype=bool)
    for i in range(lr, len(frame) - lr):
        ph[i] = highs[i] == highs[i - lr : i + lr + 1].max()
        pl[i] = lows[i] == lows[i - lr : i + lr + 1].min()
    return ph, pl


def forward_move(df: pd.DataFrame, pos: int, side: str, r: float, n: int) -> bool:
    end = min(len(df), pos + n + 1)
    if side == "down":
        return bool(df["low"].iloc[pos + 1 : end].min() <= df["high"].iat[pos] - r)
    return bool(df["high"].iloc[pos + 1 : end].max() >= df["low"].iat[pos] + r)


def phase2_breakouts(df: pd.DataFrame, models: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    events = []
    reactions = []
    for m in models.itertuples(index=False):
        wk = df[(df["week_start"] == m.week_start) & (df["model_ready"])].reset_index(drop=True)
        if wk.empty:
            continue
        wk = wk[wk["et"].dt.date.astype(str) >= (pd.Timestamp(m.monday_date) + pd.Timedelta(days=1)).date().isoformat()].reset_index(drop=True)
        if wk.empty:
            continue
        for side in ["up", "down"]:
            cond = wk["close"] > wk["ob_up"] + cfg.tolerance if side == "up" else wk["close"] < wk["ob_dn"] - cfg.tolerance
            if not cond.any():
                continue
            arm_pos = int(np.flatnonzero(cond.to_numpy())[0])
            post = wk.iloc[arm_pos:].copy().reset_index(drop=True)
            if side == "up":
                # Printed extreme is the highest wick after arming before first close back inside OB or 240 bars.
                inside = post["close"] < post["ob_up"]
                cut = int(np.flatnonzero(inside.to_numpy())[0]) if inside.any() else min(len(post) - 1, 240)
                seg = post.iloc[: max(cut + 1, 1)]
                ext_i = int(seg["high"].idxmax())
                p = float(seg["high"].loc[ext_i])
                t0_bar = int(seg["bar_index"].loc[ext_i])
            else:
                inside = post["close"] > post["ob_dn"]
                cut = int(np.flatnonzero(inside.to_numpy())[0]) if inside.any() else min(len(post) - 1, 240)
                seg = post.iloc[: max(cut + 1, 1)]
                ext_i = int(seg["low"].idxmin())
                p = float(seg["low"].loc[ext_i])
                t0_bar = int(seg["bar_index"].loc[ext_i])
            event_id = f"{m.week_start}_{side}_{int(wk['bar_index'].iat[arm_pos])}"
            events.append(
                {
                    "event_id": event_id,
                    "week_start": m.week_start,
                    "side": side,
                    "arm_bar": int(wk["bar_index"].iat[arm_pos]),
                    "arm_et": wk["et"].iat[arm_pos].isoformat(),
                    "printed_price": p,
                    "printed_bar": t0_bar,
                    "printed_et": seg.loc[ext_i, "et"].isoformat(),
                }
            )
            rest = wk[wk["bar_index"] > t0_bar].reset_index(drop=True)
            for pos in range(cfg.pivot_lr, len(rest) - cfg.pivot_lr):
                if side == "up":
                    if not pivot_high(rest, pos, cfg.pivot_lr) or not forward_move(rest, pos, "down", cfg.r_react, cfg.n_bars):
                        continue
                    reaction_price = float(rest["high"].iat[pos])
                else:
                    if not pivot_low(rest, pos, cfg.pivot_lr) or not forward_move(rest, pos, "up", cfg.r_react, cfg.n_bars):
                        continue
                    reaction_price = float(rest["low"].iat[pos])
                b = int(rest["bar_index"].iat[pos])
                sloped = p - cfg.per_bar * (b - t0_bar)
                flat_dist = abs(reaction_price - p)
                sloped_dist = abs(reaction_price - sloped)
                reactions.append(
                    {
                        "event_id": event_id,
                        "week_start": m.week_start,
                        "side": side,
                        "reaction_bar": b,
                        "reaction_et": rest["et"].iat[pos].isoformat(),
                        "reaction_price": reaction_price,
                        "flat_level": p,
                        "sloped_level": sloped,
                        "flat_abs_dist": flat_dist,
                        "sloped_abs_dist": sloped_dist,
                        "flat_hit": flat_dist <= cfg.tolerance,
                        "sloped_hit": sloped_dist <= cfg.tolerance,
                    }
                )
    return pd.DataFrame(events), pd.DataFrame(reactions)


def phase3_respected_edges(df: pd.DataFrame, models: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    tags = []
    retests = []
    for m in models.itertuples(index=False):
        wk = df[(df["week_start"] == m.week_start) & (df["model_ready"])].reset_index(drop=True)
        if wk.empty:
            continue
        prior_respects = {"up": 0, "down": 0}
        skip_until = {"up": -1, "down": -1}
        for pos in range(cfg.pivot_lr, len(wk) - cfg.pivot_lr):
            b = int(wk["bar_index"].iat[pos])
            for side in ["up", "down"]:
                if b <= skip_until[side]:
                    continue
                ob = float(wk["ob_up"].iat[pos] if side == "up" else wk["ob_dn"].iat[pos])
                if not np.isfinite(ob):
                    continue
                if side == "up":
                    tag = wk["high"].iat[pos] >= ob - cfg.tolerance and wk["high"].iat[pos] <= ob + cfg.tolerance and wk["close"].iat[pos] <= ob + cfg.tolerance
                    respect = tag and wk["low"].iloc[pos + 1 : min(len(wk), pos + cfg.n_bars + 1)].min() <= ob - cfg.r_react
                else:
                    tag = wk["low"].iat[pos] <= ob + cfg.tolerance and wk["low"].iat[pos] >= ob - cfg.tolerance and wk["close"].iat[pos] >= ob - cfg.tolerance
                    respect = tag and wk["high"].iloc[pos + 1 : min(len(wk), pos + cfg.n_bars + 1)].max() >= ob + cfg.r_react
                if not tag:
                    continue
                tag_id = f"{m.week_start}_{side}_{b}"
                tags.append(
                    {
                        "tag_id": tag_id,
                        "week_start": m.week_start,
                        "side": side,
                        "tag_bar": b,
                        "tag_et": wk["et"].iat[pos].isoformat(),
                        "boundary_at_tag": ob,
                        "respected": bool(respect),
                        "prior_respects_same_week": prior_respects[side],
                    }
                )
                if respect:
                    prior_respects[side] += 1
                    # Later returns to same edge after the initial reaction window.
                    rest = wk[wk["bar_index"] > b + cfg.n_bars // 2].reset_index(drop=True)
                    for j in range(cfg.pivot_lr, len(rest) - cfg.pivot_lr):
                        if side == "up":
                            if not pivot_high(rest, j, cfg.pivot_lr) or not forward_move(rest, j, "down", cfg.r_react, cfg.n_bars):
                                continue
                            reaction_price = float(rest["high"].iat[j])
                            sloped = float(rest["ob_up"].iat[j])
                        else:
                            if not pivot_low(rest, j, cfg.pivot_lr) or not forward_move(rest, j, "up", cfg.r_react, cfg.n_bars):
                                continue
                            reaction_price = float(rest["low"].iat[j])
                            sloped = float(rest["ob_dn"].iat[j])
                        flat_dist = abs(reaction_price - ob)
                        sloped_dist = abs(reaction_price - sloped)
                        retests.append(
                            {
                                "tag_id": tag_id,
                                "week_start": m.week_start,
                                "side": side,
                                "reaction_bar": int(rest["bar_index"].iat[j]),
                                "reaction_et": rest["et"].iat[j].isoformat(),
                                "reaction_price": reaction_price,
                                "flat_level": ob,
                                "sloped_level": sloped,
                                "flat_abs_dist": flat_dist,
                                "sloped_abs_dist": sloped_dist,
                                "flat_hit": flat_dist <= cfg.tolerance,
                                "sloped_hit": sloped_dist <= cfg.tolerance,
                                "prior_respects_at_tag": prior_respects[side],
                            }
                        )
                skip_until[side] = b + cfg.n_bars
    return pd.DataFrame(tags), pd.DataFrame(retests)


def summarize_distances(df: pd.DataFrame, side_col: str = "side") -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()
    rows = []
    for side, g in list(df.groupby(side_col)) + [("pooled", df)]:
        diff = g["flat_abs_dist"] - g["sloped_abs_dist"]
        rows.append(
            {
                "side": side,
                "reactions": int(len(g)),
                "events": int(g["event_id"].nunique()) if "event_id" in g else int(g["tag_id"].nunique()) if "tag_id" in g else np.nan,
                "flat_median_dist": float(g["flat_abs_dist"].median()),
                "sloped_median_dist": float(g["sloped_abs_dist"].median()),
                "flat_mean_dist": float(g["flat_abs_dist"].mean()),
                "sloped_mean_dist": float(g["sloped_abs_dist"].mean()),
                "flat_closer_pct": float((g["flat_abs_dist"] < g["sloped_abs_dist"]).mean()),
                "flat_hit_rate": float(g["flat_hit"].mean()),
                "sloped_hit_rate": float(g["sloped_hit"].mean()),
                "median_flat_minus_sloped": float(diff.median()),
                "wilcoxon_p_approx": wilcoxon_approx(diff.to_numpy()),
            }
        )
    return pd.DataFrame(rows)


def wilcoxon_approx(diff: np.ndarray) -> float:
    diff = diff[np.isfinite(diff)]
    diff = diff[diff != 0]
    n = len(diff)
    if n < 5:
        return np.nan
    order = np.argsort(np.abs(diff))
    ranks = np.empty(n, dtype=float)
    ranks[order] = np.arange(1, n + 1)
    w_plus = ranks[diff > 0].sum()
    mean = n * (n + 1) / 4
    var = n * (n + 1) * (2 * n + 1) / 24
    z = (w_plus - mean) / math.sqrt(var)
    return float(math.erfc(abs(z) / math.sqrt(2)))


def random_null_distances(reactions: pd.DataFrame, df: pd.DataFrame, samples: int = 500) -> dict[str, float]:
    if reactions.empty:
        return {"null_median_dist": np.nan, "null_mean_dist": np.nan}
    rng = np.random.default_rng(20260619)
    week_ranges = df.groupby("week_start").agg(lo=("low", "min"), hi=("high", "max")).to_dict("index")
    meds = []
    means = []
    for _ in range(samples):
        d = []
        for r in reactions.itertuples(index=False):
            wr = week_ranges.get(r.week_start)
            if not wr:
                continue
            lvl = rng.uniform(wr["lo"], wr["hi"])
            d.append(abs(float(r.reaction_price) - lvl))
        meds.append(np.median(d))
        means.append(np.mean(d))
    return {"null_median_dist": float(np.mean(meds)), "null_mean_dist": float(np.mean(means))}


def phase4_slope(df: pd.DataFrame, models: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    touches = []
    slopes = np.arange(0.5, 1.61, 0.02)
    for m in models.itertuples(index=False):
        wk = df[(df["week_start"] == m.week_start) & (df["model_ready"])].reset_index(drop=True)
        if wk.empty:
            continue
        ph_mask, pl_mask = pivot_masks(wk, cfg.pivot_lr)
        pivot_positions = np.flatnonzero(ph_mask | pl_mask)
        week_touches = []
        for pos in pivot_positions:
            b = int(wk["bar_index"].iat[pos])
            levels = [(m.anchor_high + k * cfg.band_width, m.anchor_high_bar, f"zone_{k}") for k in range(-cfg.z_n, cfg.z_n + 1)]
            levels += [(m.monday_high, m.monday_high_bar, "gold_high"), (m.monday_low, m.monday_low_bar, "gold_low")]
            for anchor, anchor_bar, name in levels:
                level = anchor - cfg.per_bar * (b - anchor_bar)
                if ph_mask[pos]:
                    price = float(wk["high"].iat[pos])
                    reacted = forward_move(wk, pos, "down", cfg.r_react, cfg.n_bars)
                elif pl_mask[pos]:
                    price = float(wk["low"].iat[pos])
                    reacted = forward_move(wk, pos, "up", cfg.r_react, cfg.n_bars)
                else:
                    continue
                if reacted and abs(price - level) <= cfg.tolerance:
                    rec = {"week_start": m.week_start, "bar_index": b, "price": price, "anchor": anchor, "anchor_bar": anchor_bar, "level": name}
                    week_touches.append(rec)
                    touches.append(rec)
                    break
        if not week_touches:
            continue
    touches_df = pd.DataFrame(touches)
    best_rows = []
    if not touches_df.empty:
        for week, g in touches_df.groupby("week_start"):
            errs = []
            for s in slopes:
                per_bar = s / 60.0
                dist = np.abs(g["price"] - (g["anchor"] - per_bar * (g["bar_index"] - g["anchor_bar"])))
                errs.append(float(dist.mean()))
            best_i = int(np.argmin(errs))
            best_rows.append({"week_start": week, "touches": int(len(g)), "best_slope": float(slopes[best_i]), "mean_error": float(errs[best_i]), "error_at_1_04": float(errs[np.argmin(np.abs(slopes - 1.04))])})
    return touches_df, pd.DataFrame(best_rows)


def phase5_entry_bands(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    bands = [(0.5, 0.618, "50-61.8"), (0.618, 0.786, "61.8-78.6"), (0.5, 0.786, "50-78.6")]
    # Keep this directional comparison focused on RTH and the first half of the
    # day. It is a supporting check, not the live engine reproduction.
    mins = df["et"].dt.hour * 60 + df["et"].dt.minute
    test_df = df[(mins >= 9 * 60 + 30) & (mins <= 13 * 60)].reset_index(drop=True)
    for lr in [1, 2, 3]:
        pivots = []
        ph_mask, pl_mask = pivot_masks(test_df, lr)
        for i in np.flatnonzero(ph_mask | pl_mask):
            if pl_mask[i]:
                pivots.append((i, "low", float(test_df["low"].iat[i])))
            if ph_mask[i]:
                pivots.append((i, "high", float(test_df["high"].iat[i])))
        pivots.sort()
        legs = []
        for a, b in zip(pivots, pivots[1:]):
            if a[1] == "low" and b[1] == "high" and b[2] > a[2]:
                legs.append((a[0], b[0], "long", a[2], b[2]))
            elif a[1] == "high" and b[1] == "low" and a[2] > b[2]:
                legs.append((a[0], b[0], "short", b[2], a[2]))
        for near, far, name in bands:
            wins = losses = timeouts = 0
            r_vals = []
            mae_vals = []
            for start_i, end_i, direction, lo, hi in legs[:8000]:
                rng = hi - lo
                if rng <= 0:
                    continue
                if direction == "long":
                    near_price = hi - rng * near
                    far_price = hi - rng * far
                    zone_lo, zone_hi = min(near_price, far_price), max(near_price, far_price)
                    stop = lo
                    target = near_price + 1.5 * rng
                    entry_i = None
                    for j in range(end_i + 1, min(len(test_df), end_i + 181)):
                        if test_df["low"].iat[j] <= zone_hi and test_df["high"].iat[j] >= zone_lo and test_df["close"].iat[j] >= near_price:
                            entry_i = j
                            break
                    if entry_i is None:
                        continue
                    mae = max(0.0, near_price - test_df["low"].iloc[entry_i : min(len(test_df), entry_i + 181)].min())
                    result = None
                    exit_price = None
                    for j in range(entry_i + 1, min(len(test_df), entry_i + 181)):
                        if test_df["high"].iat[j] >= target:
                            result, exit_price = "WIN", target
                            break
                        if test_df["low"].iat[j] <= stop:
                            result, exit_price = "LOSS", stop
                            break
                else:
                    near_price = lo + rng * near
                    far_price = lo + rng * far
                    zone_lo, zone_hi = min(near_price, far_price), max(near_price, far_price)
                    stop = hi
                    target = near_price - 1.5 * rng
                    entry_i = None
                    for j in range(end_i + 1, min(len(test_df), end_i + 181)):
                        if test_df["low"].iat[j] <= zone_hi and test_df["high"].iat[j] >= zone_lo and test_df["close"].iat[j] <= near_price:
                            entry_i = j
                            break
                    if entry_i is None:
                        continue
                    mae = max(0.0, test_df["high"].iloc[entry_i : min(len(test_df), entry_i + 181)].max() - near_price)
                    result = None
                    exit_price = None
                    for j in range(entry_i + 1, min(len(test_df), entry_i + 181)):
                        if test_df["low"].iat[j] <= target:
                            result, exit_price = "WIN", target
                            break
                        if test_df["high"].iat[j] >= stop:
                            result, exit_price = "LOSS", stop
                            break
                risk = abs(near_price - stop)
                if risk <= 0 or entry_i is None:
                    continue
                if result is None:
                    result = "TIMEOUT"
                    exit_price = float(test_df["close"].iat[min(len(test_df) - 1, entry_i + 180)])
                r = (exit_price - near_price) / risk if direction == "long" else (near_price - exit_price) / risk
                wins += result == "WIN"
                losses += result == "LOSS"
                timeouts += result == "TIMEOUT"
                r_vals.append(r)
                mae_vals.append(mae)
            n = wins + losses + timeouts
            rows.append({"pivot_lr": lr, "band": name, "trades": n, "wins": wins, "losses": losses, "timeouts": timeouts, "win_rate": wins / n if n else np.nan, "avg_r": float(np.mean(r_vals)) if r_vals else np.nan, "median_mae_points": float(np.median(mae_vals)) if mae_vals else np.nan})
    return pd.DataFrame(rows)


def phase6_zone_gold(df: pd.DataFrame, models: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    # Zone modulo based on respected touches gathered from model levels.
    touches, _ = phase4_slope(df, models, cfg)
    if not touches.empty:
        touches["mod_34_abs"] = np.minimum(np.mod(touches["price"] - touches["anchor"], cfg.band_width), cfg.band_width - np.mod(touches["price"] - touches["anchor"], cfg.band_width))
    gold_rows = []
    for m in models.itertuples(index=False):
        wk = df[(df["week_start"] == m.week_start) & (df["model_ready"]) & (df["bar_index"] > m.monday_lock_bar)].reset_index(drop=True)
        for side, anchor, anchor_bar in [("gold_high", m.monday_high, m.monday_high_bar), ("gold_low", m.monday_low, m.monday_low_bar)]:
            tags = respects = 0
            for pos in range(cfg.pivot_lr, len(wk) - cfg.pivot_lr):
                b = int(wk["bar_index"].iat[pos])
                level = anchor - cfg.per_bar * (b - anchor_bar)
                if side == "gold_high":
                    tag = wk["high"].iat[pos] >= level - cfg.tolerance and wk["high"].iat[pos] <= level + cfg.tolerance
                    respect = tag and forward_move(wk, pos, "down", cfg.r_react, cfg.n_bars)
                else:
                    tag = wk["low"].iat[pos] <= level + cfg.tolerance and wk["low"].iat[pos] >= level - cfg.tolerance
                    respect = tag and forward_move(wk, pos, "up", cfg.r_react, cfg.n_bars)
                if tag:
                    tags += 1
                    respects += bool(respect)
            gold_rows.append({"week_start": m.week_start, "line": side, "tags": tags, "respects": respects, "respect_rate": respects / tags if tags else np.nan})
    return touches, pd.DataFrame(gold_rows)


def make_svg_hist(path: Path, values_a: Iterable[float], values_b: Iterable[float], label_a: str, label_b: str, title: str) -> None:
    a = np.asarray([v for v in values_a if np.isfinite(v)])
    b = np.asarray([v for v in values_b if np.isfinite(v)])
    if len(a) == 0 or len(b) == 0:
        path.write_text("<svg xmlns='http://www.w3.org/2000/svg' width='900' height='420'><text x='20' y='40'>No data</text></svg>", encoding="utf-8")
        return
    max_v = float(np.nanpercentile(np.concatenate([a, b]), 95))
    bins = np.linspace(0, max(max_v, 1), 22)
    ha, _ = np.histogram(a, bins=bins)
    hb, _ = np.histogram(b, bins=bins)
    mx = max(ha.max(), hb.max(), 1)
    w, h, pad = 900, 420, 60
    bw = (w - 2 * pad) / (len(bins) - 1)
    parts = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}'>", f"<rect width='100%' height='100%' fill='#fffdf7'/>", f"<text x='{pad}' y='32' font-size='20' font-family='Arial'>{title}</text>"]
    for i, (x0, ca, cb) in enumerate(zip(bins[:-1], ha, hb)):
        x = pad + i * bw
        ya = h - pad - (ca / mx) * 280
        yb = h - pad - (cb / mx) * 280
        parts.append(f"<rect x='{x:.1f}' y='{ya:.1f}' width='{bw*0.42:.1f}' height='{h-pad-ya:.1f}' fill='#8b2e2a' opacity='0.75'/>")
        parts.append(f"<rect x='{x+bw*0.45:.1f}' y='{yb:.1f}' width='{bw*0.42:.1f}' height='{h-pad-yb:.1f}' fill='#2f6b3a' opacity='0.75'/>")
    parts.append(f"<text x='{pad}' y='{h-20}' font-size='13' font-family='Arial'>0 to {max_v:.1f} points. Red={label_a}; green={label_b}</text>")
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")


def make_example_svg(path: Path, wk: pd.DataFrame, title: str) -> None:
    if wk.empty:
        return
    sample = wk.iloc[:: max(1, len(wk) // 600)].copy()
    vals = pd.concat([sample["close"], sample["grid"], sample["ob_up"], sample["ob_dn"], sample["gold_high"], sample["gold_low"]]).dropna()
    lo, hi = float(vals.min()), float(vals.max())
    w, h, pad = 1000, 520, 60
    def sx(i: int) -> float:
        return pad + i / max(1, len(sample) - 1) * (w - 2 * pad)
    def sy(v: float) -> float:
        return h - pad - (v - lo) / max(1e-9, hi - lo) * (h - 2 * pad)
    def poly(col: str, color: str, width: int = 2) -> str:
        pts = []
        for i, v in enumerate(sample[col]):
            if np.isfinite(v):
                pts.append(f"{sx(i):.1f},{sy(float(v)):.1f}")
        return f"<polyline points='{' '.join(pts)}' fill='none' stroke='{color}' stroke-width='{width}'/>"
    parts = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}'>", "<rect width='100%' height='100%' fill='#fffdf7'/>", f"<text x='{pad}' y='32' font-size='20' font-family='Arial'>{title}</text>"]
    parts += [poly("close", "#111", 2), poly("grid", "#6e5bb0", 2), poly("ob_up", "#8b2e2a", 2), poly("ob_dn", "#2f6b3a", 2), poly("gold_high", "#b8860b", 1), poly("gold_low", "#b8860b", 1)]
    parts.append(f"<text x='{pad}' y='{h-20}' font-size='13' font-family='Arial'>black price, purple spine, red/green outer boundary, gold Monday high/low</text>")
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")


def sensitivity_phase2(df: pd.DataFrame, models: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for tol in [2.0, 3.0, 5.0]:
        for rr in [10.0, 17.0, 34.0]:
            cfg = Config(tolerance=tol, r_react=rr, n_bars=120)
            ev, re = phase2_breakouts(df, models, cfg)
            s = summarize_distances(re)
            pooled = s[s["side"] == "pooled"]
            if not pooled.empty:
                row = pooled.iloc[0].to_dict()
                row.update({"tolerance": tol, "r_react": rr, "break_events": len(ev)})
                rows.append(row)
    return pd.DataFrame(rows)


def write_report(out: Path, inv: dict[str, object], models: pd.DataFrame, phase2_events: pd.DataFrame, phase2_reactions: pd.DataFrame, p2_summary: pd.DataFrame, p2_null: dict[str, float], tags: pd.DataFrame, retests: pd.DataFrame, p3_summary: pd.DataFrame, slope_touches: pd.DataFrame, slope_weeks: pd.DataFrame, bands: pd.DataFrame, zone_touches: pd.DataFrame, gold: pd.DataFrame, sens: pd.DataFrame) -> None:
    out.mkdir(parents=True, exist_ok=True)
    def md_table(df: pd.DataFrame) -> str:
        return df.to_markdown(index=False) if not df.empty else "No qualifying events."

    pooled = p2_summary[p2_summary["side"] == "pooled"]
    if not pooled.empty:
        pr = pooled.iloc[0]
        build = "flat" if pr["flat_median_dist"] < pr["sloped_median_dist"] else "sloped"
        headline = f"Over {int(pr['events'])} breakout events producing {int(pr['reactions'])} return reactions, reactions sat a median of {pr['flat_median_dist']:.2f} points from the flat printed price and {pr['sloped_median_dist']:.2f} points from the descended price; flat was closer in {pr['flat_closer_pct']*100:.1f}% of cases, so build {build} for breakout rails."
    else:
        headline = "No breakout-return sample was large enough to decide whether breakout rails should be flat or sloped."
    lines = ["# SPY Prophet ES Weekly Level Model Decision Brief", "", f"**Headline verdict:** {headline}", ""]
    lines += [
        "## Operational Definitions",
        "- Break: a close beyond the outer boundary by more than the tolerance.",
        "- Printed breakout extreme: the highest upside wick or lowest downside wick after the arming close, before the first close back inside the boundary or 240 bars.",
        "- Return reaction: a local swing high for upside breaks or swing low for downside breaks followed by a 17-point move away within 120 one-minute bars.",
        "- Tag: a wick within 3 points of the outer boundary without a close beyond it.",
        "- Respect: a tag followed by a 17-point move away within 120 bars.",
        "- Trading-hour clock: bar count multiplied by one minute. The clock freezes automatically through maintenance breaks, weekends, and holidays.",
        "",
        "## Phase 0: Data Inventory And Validation",
        f"- Source: `{inv['source']}`",
        f"- Columns present: `{inv['columns']}`",
        f"- Timestamp column: `{inv['timestamp']}`. {inv['timezone']}",
        f"- Bar granularity: median {inv['bar_minutes_median']:.1f} minute; mode {inv['bar_minutes_mode']:.1f} minute.",
        f"- Date range UTC: {inv['range_utc'][0]} to {inv['range_utc'][1]}.",
        f"- Date range ET: {inv['range_et'][0]} to {inv['range_et'][1]}.",
        f"- Total bars: {inv['rows']:,}. Duplicate timestamps: {inv['duplicates']}. Large gaps: {inv['gap_count']}.",
        f"- Short RTH sessions detected: {inv['short_sessions']}. Examples: `{inv['short_session_examples']}`.",
        f"- Quarterly roll-like gaps over 25 points: {len(inv['roll_like_gaps'])}. They are reported but not treated as breakouts because breakout scans occur inside reconstructed model weeks after prior-period anchoring.",
        "Verdict: data is usable as a UTC 1-minute continuous ES feed; roll handling remains a caveat around quarterly transition weeks.",
        "",
        "## Phase 1: Weekly Level Reconstruction",
        f"- Reconstructed {len(models)} model weeks using prior completed RTH high as the spine anchor.",
        "- Monday gold high/low lock after Monday RTH close. Outer boundary is max upper edge/gold high and min lower edge/gold low.",
        "Verdict: model reconstruction completed with no lookahead in the level formulas.",
        "",
        "## Phase 2: Flat Vs Sloped Breakout Extremes",
        md_table(p2_summary.round(4)),
        f"Random-level null median distance: {p2_null.get('null_median_dist', np.nan):.2f} points; null mean distance: {p2_null.get('null_mean_dist', np.nan):.2f} points.",
        "Sensitivity grid:",
        md_table(sens[["tolerance", "r_react", "break_events", "reactions", "flat_median_dist", "sloped_median_dist", "flat_closer_pct", "flat_hit_rate", "sloped_hit_rate"]].round(4) if not sens.empty else sens),
        f"Verdict: {headline}",
        "",
        "## Phase 3: Respected Outer Edge And Extension",
        f"- Tags: {len(tags)}. Respected tags: {int(tags['respected'].sum()) if not tags.empty else 0}. Retest reactions: {len(retests)}.",
        md_table(p3_summary.round(4)),
    ]
    if not tags.empty:
        rep = tags.assign(group=np.where(tags["prior_respects_same_week"] >= 1, "two_or_more_context", "first_tag_context")).groupby("group").agg(tags=("tag_id", "count"), respect_rate=("respected", "mean")).reset_index()
        lines += ["Repetition test:", md_table(rep.round(4))]
    lines += [
        "Verdict: respected-edge extension is tentative unless the retest count is above 30; use the table above to decide flat/sloped.",
        "",
        "## Phase 4: Slope Validation",
    ]
    if not slope_weeks.empty:
        lines += [
            f"- Respected model touches used for slope fitting: {len(slope_touches)} across {len(slope_weeks)} weeks.",
            f"- Best-fit slope median: {slope_weeks['best_slope'].median():.2f}; IQR {slope_weeks['best_slope'].quantile(.25):.2f} to {slope_weeks['best_slope'].quantile(.75):.2f}.",
            f"- Weeks where best fit is within 0.10 of 1.04: {int((abs(slope_weeks['best_slope'] - 1.04) <= .10).sum())}/{len(slope_weeks)}.",
            "Verdict: keep 1.04 if it sits inside the central cluster; otherwise treat the median above as the candidate retest value.",
        ]
    else:
        lines.append("No enough model touches were found to fit weekly slopes. Verdict: inconclusive.")
    lines += [
        "",
        "## Phase 5: Golden-Pocket Entry Band Comparison",
        md_table(bands.round(4)),
    ]
    if not bands.empty:
        best = bands.sort_values("avg_r", ascending=False).iloc[0]
        lines.append(f"Verdict: best directional band in this simplified test is {best['band']} with pivot left/right {int(best['pivot_lr'])}, average R {best['avg_r']:.2f}, N={int(best['trades'])}.")
    lines += [
        "",
        "## Phase 6: Zone Width And Monday Gold Respect",
    ]
    if not zone_touches.empty:
        near = float((zone_touches["mod_34_abs"] <= 3).mean())
        lines.append(f"- Zone modulo check: {near*100:.1f}% of respected model touches were within 3 points of a 34-point multiple, N={len(zone_touches)}.")
    lines.append(md_table(gold.groupby("line").agg(tags=("tags", "sum"), respects=("respects", "sum"), respect_rate=("respect_rate", "mean")).reset_index().round(4)) if not gold.empty else "No gold tags.")
    lines += [
        "Verdict: Monday golds should stay prominent only if their respect rate beats random-level behavior and has enough tags.",
        "",
        "## Final Build Recommendation",
    ]
    if not pooled.empty:
        rec = "flat" if pooled.iloc[0]["flat_median_dist"] < pooled.iloc[0]["sloped_median_dist"] else "sloped"
        lines.append(f"- Breakout rail: build the {rec} candidate first at a 3-point tolerance, then expose tolerance as a setting.")
    else:
        lines.append("- Breakout rail: inconclusive. Do not ship as a decision rule yet.")
    if not p3_summary.empty:
        p3p = p3_summary[p3_summary["side"] == "pooled"]
        if not p3p.empty:
            rec3 = "flat" if p3p.iloc[0]["flat_median_dist"] < p3p.iloc[0]["sloped_median_dist"] else "sloped"
            lines.append(f"- Respected outer edge: extend {rec3}, but mark tentative if retest N is below 30.")
    lines.append("- Slope: keep 1.04 until more than one year confirms a different median.")
    lines.append("- Entry band: keep 50-61.8 as default unless the Phase 5 table shows golden pocket clearly beating it across pivot settings.")
    lines.append("- ES to SPX500 mapping: report all values in points. Do not assume exact one-to-one because ES carries futures basis.")
    (out / "report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=Path("data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv"))
    parser.add_argument("--out", type=Path, default=Path("outputs/weekly_level_model"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cfg = Config()
    df = read_data(args.csv)
    inv = inventory(df, args.csv)
    modeled, models = build_week_models(df, cfg)
    p2_events, p2_reactions = phase2_breakouts(modeled, models, cfg)
    p2_summary = summarize_distances(p2_reactions)
    p2_null = random_null_distances(p2_reactions, modeled)
    tags, retests = phase3_respected_edges(modeled, models, cfg)
    p3_summary = summarize_distances(retests)
    slope_touches, slope_weeks = phase4_slope(modeled, models, cfg)
    bands = phase5_entry_bands(df)
    zone_touches, gold = phase6_zone_gold(modeled, models, cfg)
    sens = sensitivity_phase2(modeled, models)

    p2_events.to_csv(args.out / "breakout_events.csv", index=False)
    p2_reactions.to_csv(args.out / "return_reactions.csv", index=False)
    tags.to_csv(args.out / "respected_edge_tags.csv", index=False)
    retests.to_csv(args.out / "respected_edge_retests.csv", index=False)
    slope_touches.to_csv(args.out / "slope_touch_events.csv", index=False)
    slope_weeks.to_csv(args.out / "slope_fit_by_week.csv", index=False)
    bands.to_csv(args.out / "entry_band_comparison.csv", index=False)
    sens.to_csv(args.out / "phase2_sensitivity.csv", index=False)
    pd.DataFrame([inv]).to_csv(args.out / "data_inventory.csv", index=False)

    make_svg_hist(args.out / "phase2_flat_vs_sloped_dist.svg", p2_reactions.get("flat_abs_dist", []), p2_reactions.get("sloped_abs_dist", []), "flat", "sloped", "Phase 2 flat vs sloped reaction distance")
    make_svg_hist(args.out / "phase3_flat_vs_sloped_dist.svg", retests.get("flat_abs_dist", []), retests.get("sloped_abs_dist", []), "flat", "sloped", "Phase 3 respected edge flat vs sloped distance")
    random.seed(20260619)
    sample_weeks = random.sample(list(models["week_start"]), min(3, len(models)))
    for i, wk in enumerate(sample_weeks, 1):
        make_example_svg(args.out / f"example_week_{i}_{wk}.svg", modeled[modeled["week_start"] == wk], f"Example week {wk}")
    write_report(args.out, inv, models, p2_events, p2_reactions, p2_summary, p2_null, tags, retests, p3_summary, slope_touches, slope_weeks, bands, zone_touches, gold, sens)
    print(f"Wrote {args.out / 'report.md'}")


if __name__ == "__main__":
    main()
