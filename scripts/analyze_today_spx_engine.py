#!/usr/bin/env python3
"""Replay SPY Prophet EMA/Fib engine on one SPX 1-minute day.

This is a focused diagnostic script, not the production backtester. It keeps the
current production defaults and reports all setups for the day so failed first
trade days can be studied against the later trades a human actually took.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


CT = "America/Chicago"


@dataclass
class Config:
    fast: int = 21
    slow: int = 50
    pivot_left: int = 1
    pivot_right: int = 1
    require_candle_color: bool = True
    cross_slope_bars: int = 3
    lookback: int = 20
    wait_after_cross: int = 3
    retest_bars: int = 72
    session_start: int = 8 * 60 + 50
    session_end: int = 15 * 60
    manage_end: int = 12 * 60
    shallow: float = 0.5
    deep: float = 0.786
    target: float = 1.618
    stop_minutes: int = 32


def load(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    ts_col = "ts_event" if "ts_event" in df.columns else "timestamp"
    df[ts_col] = pd.to_datetime(df[ts_col], utc=True)
    df = df.rename(columns={ts_col: "timestamp"}).sort_values("timestamp").reset_index(drop=True)
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    df["ct"] = df["timestamp"].dt.tz_convert(CT)
    df["ct_time"] = df["ct"].dt.strftime("%H:%M")
    df["ct_minutes"] = df["ct"].dt.hour * 60 + df["ct"].dt.minute
    df["bar_index"] = np.arange(len(df))
    return df


def add_indicators(df: pd.DataFrame, cfg: Config) -> None:
    df["ema_fast"] = df["close"].ewm(span=cfg.fast, adjust=False).mean()
    df["ema_slow"] = df["close"].ewm(span=cfg.slow, adjust=False).mean()
    df["ema_slow_slope3"] = df["ema_slow"] - df["ema_slow"].shift(cfg.cross_slope_bars)
    typical = (df["high"] + df["low"] + df["close"]) / 3
    pv = typical * df.get("volume", pd.Series(np.ones(len(df)))).fillna(1)
    vol = df.get("volume", pd.Series(np.ones(len(df)))).fillna(1).replace(0, 1)
    df["vwap_proxy"] = pv.cumsum() / vol.cumsum()
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - df["close"].shift()).abs(),
            (df["low"] - df["close"].shift()).abs(),
        ],
        axis=1,
    ).max(axis=1)
    df["atr14"] = tr.rolling(14, min_periods=1).mean()


def pivots(df: pd.DataFrame, cfg: Config) -> tuple[list[dict], list[dict]]:
    lows: list[dict] = []
    highs: list[dict] = []
    for i in range(1, len(df) - 1):
        row = df.iloc[i]
        if row.low < df.iloc[i - 1].low and row.low <= df.iloc[i + 1].low:
            lows.append({"index": i, "value": float(row.low), "open": float(row.open), "time": row.ct_time})
        if row.high > df.iloc[i - 1].high and row.high >= df.iloc[i + 1].high:
            highs.append({"index": i, "value": float(row.high), "open": float(row.open), "time": row.ct_time})
    return lows, highs


def last_pivot_before(pivs: list[dict], boundary: int, session_start: int, cfg: Config, predicate) -> dict | None:
    found = None
    for p in pivs:
        if p["index"] >= session_start and p["index"] < boundary and boundary - p["index"] <= cfg.lookback and predicate(p):
            found = p
    return found


def first_pivot_after(pivs: list[dict], boundary: int, max_index: int, predicate) -> dict | None:
    for p in pivs:
        if p["index"] >= boundary and p["index"] <= max_index and predicate(p):
            return p
    return None


def target_from_range(lo: float, hi: float, direction: str, mult: float) -> float:
    r = hi - lo
    return hi + r * (mult - 1.0) if direction == "long" else lo - r * (mult - 1.0)


def simulate(df: pd.DataFrame, setup: dict, cfg: Config) -> dict:
    direction = setup["direction"]
    zone_low = min(setup["fib_near"], setup["fib_deep"])
    zone_high = max(setup["fib_near"], setup["fib_deep"])
    entry_i = None
    for i in range(setup["armed_index"] + 1, min(len(df), setup["armed_index"] + cfg.retest_bars + 1)):
        row = df.iloc[i]
        if row.ct_minutes >= cfg.session_end:
            break
        touched = row.low <= zone_high and row.high >= zone_low
        if not touched:
            continue
        if direction == "long":
            ok = row.close >= setup["fib_near"] and row.close < setup["target"] and (not cfg.require_candle_color or row.close > row.open)
        else:
            ok = row.close <= setup["fib_near"] and row.close > setup["target"] and (not cfg.require_candle_color or row.close < row.open)
        if ok:
            entry_i = i
            break
    if entry_i is None:
        return {**setup, "entry_index": None, "result": "no_entry"}

    stop_counter = 0
    inv_bucket = None
    result = "timeout"
    exit_i = None
    exit_price = float(df.iloc[min(len(df) - 1, entry_i)].close)
    for i in range(entry_i + 1, len(df)):
        row = df.iloc[i]
        if direction == "long" and row.high >= setup["target"]:
            result, exit_i, exit_price = "win", i, setup["target"]
            break
        if direction == "short" and row.low <= setup["target"]:
            result, exit_i, exit_price = "win", i, setup["target"]
            break
        # Clock-hour 32m close approximation, same idea as existing JS backtest.
        bucket = int(row.ct_minutes // cfg.stop_minutes)
        beyond = row.close < setup["stop"] if direction == "long" else row.close > setup["stop"]
        if inv_bucket is None:
            inv_bucket = bucket
        if bucket != inv_bucket:
            prev = df.iloc[i - 1]
            prev_beyond = prev.close < setup["stop"] if direction == "long" else prev.close > setup["stop"]
            if prev_beyond:
                result, exit_i, exit_price = "loss", i - 1, float(prev.close)
                break
            inv_bucket = bucket
        if row.ct_minutes >= cfg.manage_end:
            result, exit_i, exit_price = "timeout", i, float(row.close)
            break
    risk = abs(setup["fib_near"] - setup["stop"])
    r_result = np.nan if risk == 0 else ((exit_price - setup["fib_near"]) / risk if direction == "long" else (setup["fib_near"] - exit_price) / risk)
    mfe = (df.iloc[entry_i : (exit_i or len(df) - 1) + 1]["high"].max() - setup["fib_near"]) if direction == "long" else (setup["fib_near"] - df.iloc[entry_i : (exit_i or len(df) - 1) + 1]["low"].min())
    return {
        **setup,
        "entry_index": entry_i,
        "entry_time": df.iloc[entry_i].ct_time,
        "entry_close": float(df.iloc[entry_i].close),
        "result": result,
        "exit_index": exit_i,
        "exit_time": df.iloc[exit_i].ct_time if exit_i is not None else "",
        "exit_price": exit_price,
        "r_result": r_result,
        "mfe_points": float(mfe),
    }


def replay(df: pd.DataFrame, cfg: Config) -> list[dict]:
    lows, highs = pivots(df, cfg)
    session_start_index = 0
    pending = None
    last_price_up = None
    last_price_down = None
    trades: list[dict] = []
    for i in range(1, len(df)):
        row = df.iloc[i]
        prev = df.iloc[i - 1]
        in_session = cfg.session_start <= row.ct_minutes < cfg.session_end
        if prev.close <= prev.ema_slow and row.close > row.ema_slow:
            last_price_up = i
        if prev.close >= prev.ema_slow and row.close < row.ema_slow:
            last_price_down = i
        cross_up = prev.ema_fast <= prev.ema_slow and row.ema_fast > row.ema_slow
        cross_down = prev.ema_fast >= prev.ema_slow and row.ema_fast < row.ema_slow
        if in_session and cross_up and last_price_up is not None:
            pending = {"direction": "long", "cross_index": i, "price_cross": last_price_up}
        if in_session and cross_down and last_price_down is not None:
            pending = {"direction": "short", "cross_index": i, "price_cross": last_price_down}
        if pending is None:
            continue
        if i - pending["cross_index"] > cfg.wait_after_cross or not in_session:
            pending = None
            continue
        boundary = pending["price_cross"]
        if pending["direction"] == "long":
            p0 = last_pivot_before(lows, boundary, session_start_index, cfg, lambda p: p["open"] < df.iloc[p["index"]].ema_slow)
            p1 = first_pivot_after(highs, boundary, i, lambda p: p["open"] > df.iloc[p["index"]].ema_slow)
            trend_ok = row.ema_slow > df.iloc[max(0, i - cfg.cross_slope_bars)].ema_slow
        else:
            p0 = last_pivot_before(highs, boundary, session_start_index, cfg, lambda p: p["open"] > df.iloc[p["index"]].ema_slow)
            p1 = first_pivot_after(lows, boundary, i, lambda p: p["open"] < df.iloc[p["index"]].ema_slow)
            trend_ok = row.ema_slow < df.iloc[max(0, i - cfg.cross_slope_bars)].ema_slow
        if p0 is None:
            pending = None
            continue
        if p1 is None:
            continue
        if not trend_ok:
            pending = None
            continue
        lo = p0["value"] if pending["direction"] == "long" else p1["value"]
        hi = p1["value"] if pending["direction"] == "long" else p0["value"]
        if hi <= lo:
            pending = None
            continue
        rng = hi - lo
        if pending["direction"] == "long":
            near = hi - rng * cfg.shallow
            deep = hi - rng * cfg.deep
            stop = lo
        else:
            near = lo + rng * cfg.shallow
            deep = lo + rng * cfg.deep
            stop = hi
        setup = {
            "direction": pending["direction"],
            "cross_index": pending["cross_index"],
            "cross_time": df.iloc[pending["cross_index"]].ct_time,
            "price_cross_index": boundary,
            "price_cross_time": df.iloc[boundary].ct_time,
            "armed_index": i,
            "armed_time": row.ct_time,
            "pivot0_time": p0["time"],
            "pivot1_time": p1["time"],
            "pivot_low": lo,
            "pivot_high": hi,
            "range": rng,
            "fib_near": near,
            "fib_deep": deep,
            "target": target_from_range(lo, hi, pending["direction"], cfg.target),
            "stop": stop,
            "ema_slow_slope3": float(row.ema_slow_slope3),
        }
        trades.append(simulate(df, setup, cfg))
        pending = None
    return trades


def context_stats(df: pd.DataFrame) -> dict:
    open_bar = df.iloc[0]
    first_hour = df[df["ct_minutes"] <= 9 * 60 + 30]
    pre_924 = df[df["ct_minutes"] <= 9 * 60 + 24]
    return {
        "rth_open": float(open_bar.open),
        "low_to_0924": float(pre_924.low.min()),
        "drop_to_0924": float(open_bar.open - pre_924.low.min()),
        "high_to_0924": float(pre_924.high.max()),
        "first_hour_range": float(first_hour.high.max() - first_hour.low.min()),
        "close_0924": float(df[df["ct_time"] == "09:24"].iloc[0].close) if not df[df["ct_time"] == "09:24"].empty else np.nan,
        "close_1004": float(df[df["ct_time"] == "10:04"].iloc[0].close) if not df[df["ct_time"] == "10:04"].empty else np.nan,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("outputs/today_spx_engine_diagnostic"))
    args = ap.parse_args()
    cfg = Config()
    df = load(args.data)
    add_indicators(df, cfg)
    trades = replay(df, cfg)
    out = pd.DataFrame(trades)
    args.out.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out / "today_all_engine_setups.csv", index=False)
    ctx = context_stats(df)
    report = ["# Today SPX Engine Diagnostic", "", "## Context", ""]
    report += [f"- {k}: {v:.2f}" for k, v in ctx.items()]
    report += ["", "## Setups", "", out.to_markdown(index=False, floatfmt=".2f") if not out.empty else "No setups found."]
    (args.out / "report.md").write_text("\n".join(report), encoding="utf-8")
    print("\n".join(report))


if __name__ == "__main__":
    main()
