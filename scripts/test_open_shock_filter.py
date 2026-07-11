#!/usr/bin/env python3
"""Test open-shock countertrend block for the SPY Prophet engine.

Rule idea:
- If the market dumps hard from the RTH open and price is still below the open,
  skip early long reversal entries.
- If the market rips hard from the RTH open and price is still above the open,
  skip early short reversal entries.

This lets the next valid trade in the same day be taken, which matches the
human decision on 2026-06-25: ignore the long after the opening liquidation,
then take the short continuation.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from analyze_today_spx_engine import Config, add_indicators, load, replay


def load_many(paths: list[Path]) -> pd.DataFrame:
    frames = [load(p) for p in paths if p.exists()]
    if not frames:
        raise SystemExit("No input files.")
    out = pd.concat(frames, ignore_index=True)
    out = out.drop_duplicates("timestamp").sort_values("timestamp").reset_index(drop=True)
    out["bar_index"] = range(len(out))
    return out


def day_replay(day: pd.DataFrame, cfg: Config) -> list[dict]:
    local = day.reset_index(drop=True).copy()
    local["bar_index"] = range(len(local))
    add_indicators(local, cfg)
    return replay(local, cfg)


def should_skip(trade: dict, day: pd.DataFrame, threshold: float, cutoff_mins: int, mode: str = "cutoff") -> bool:
    if trade.get("entry_index") is None:
        return False
    entry_i = int(trade["entry_index"])
    entry_mins = int(day.iloc[entry_i].ct_minutes)
    if mode == "cutoff" and entry_mins > cutoff_mins:
        return False
    rth = day[day["ct_minutes"] >= 8 * 60 + 30]
    if rth.empty:
        return False
    open_i = int(rth.index[0])
    if entry_i < open_i:
        return False
    open_price = float(day.iloc[open_i].open)
    pre = day.iloc[open_i : entry_i + 1]
    down_shock = open_price - float(pre.low.min())
    up_shock = float(pre.high.max()) - open_price
    entry_close = float(day.iloc[entry_i].close)
    if trade["direction"] == "long" and down_shock >= threshold and entry_close < open_price:
        return True
    if trade["direction"] == "short" and up_shock >= threshold and entry_close > open_price:
        return True
    return False


def summarize(selected: list[dict]) -> dict:
    decided = [t for t in selected if t.get("result") in {"win", "loss"}]
    wins = sum(t["result"] == "win" for t in decided)
    losses = sum(t["result"] == "loss" for t in decided)
    avg_r = sum(float(t.get("r_result", 0)) for t in decided) / len(decided) if decided else 0
    return {
        "trades": len(selected),
        "decided": len(decided),
        "wins": wins,
        "losses": losses,
        "timeouts": sum(t.get("result") == "timeout" for t in selected),
        "win_rate": wins / len(decided) if decided else 0,
        "avg_r": avg_r,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("outputs/open_shock_filter"))
    ap.add_argument("files", nargs="+", type=Path)
    args = ap.parse_args()
    cfg = Config()
    df = load_many(args.files)
    add_indicators(df, cfg)
    rows = []
    selected_rows = []
    by_day = [(str(date), g.reset_index(drop=True).copy()) for date, g in df.groupby(df["ct"].dt.date)]
    day_cache = []
    for date, day in by_day:
        if day.empty or day.iloc[0].ct_minutes > 8 * 60 + 40:
            continue
        trades = [t for t in day_replay(day, cfg) if t.get("entry_index") is not None]
        if trades:
            day_cache.append((date, day, trades))
    variants = []
    for threshold in [40, 50, 60, 70, 80, 90]:
        for cutoff in [9 * 60 + 45, 10 * 60, 10 * 60 + 30, 11 * 60, 11 * 60 + 50, 12 * 60]:
            variants.append((threshold, cutoff, "cutoff"))
        variants.append((threshold, 0, "until_open_reclaim"))
    for threshold, cutoff, mode in variants:
            baseline = []
            filtered = []
            skipped = 0
            today_pick = None
            for date, day, trades in day_cache:
                baseline.append({**trades[0], "date": date, "variant": "baseline"})
                chosen = None
                for t in trades:
                    if should_skip(t, day, threshold, cutoff, mode):
                        skipped += 1
                        continue
                    chosen = t
                    break
                if chosen is not None:
                    chosen_row = {**chosen, "date": date, "variant": f"shock_{threshold}_{mode}_{cutoff}"}
                    filtered.append(chosen_row)
                    if date == "2026-06-25":
                        today_pick = chosen_row
            b = summarize(baseline)
            f = summarize(filtered)
            rows.append(
                {
                    "threshold": threshold,
                    "mode": mode,
                    "cutoff_ct": "open_reclaim" if mode == "until_open_reclaim" else f"{cutoff//60:02d}:{cutoff%60:02d}",
                    "skipped": skipped,
                    **{f"base_{k}": v for k, v in b.items()},
                    **{f"filter_{k}": v for k, v in f.items()},
                    "today_pick": "" if today_pick is None else f"{today_pick['direction']} {today_pick.get('entry_time')} {today_pick.get('result')}",
                }
            )
            selected_rows.extend(filtered)
    out = pd.DataFrame(rows).sort_values(["filter_win_rate", "filter_avg_r", "filter_decided"], ascending=[False, False, False])
    args.out.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out / "open_shock_filter_results.csv", index=False)
    pd.DataFrame(selected_rows).to_csv(args.out / "open_shock_filter_selected_trades.csv", index=False)
    report = ["# Open Shock Filter Results", "", out.head(20).to_markdown(index=False, floatfmt=".3f")]
    (args.out / "report.md").write_text("\n".join(report), encoding="utf-8")
    print("\n".join(report))


if __name__ == "__main__":
    main()
