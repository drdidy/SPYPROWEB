#!/usr/bin/env python3
"""Download/analyze SPXW 0DTE contracts selected from exact SPX at signal time.

This supersedes the earlier ES-anchored pilot. ES remains the signal source, but
SPXW strikes are selected from exact Polygon I:SPX 1-minute bars.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from pathlib import Path

import databento as db
import numpy as np
import pandas as pd


ET_TZ = "America/New_York"
CT_TZ = "America/Chicago"


def occ_spxw_symbol(expiry: pd.Timestamp, side: str, strike: int) -> str:
    root = "SPXW".ljust(6)
    yymmdd = expiry.strftime("%y%m%d")
    cp = "C" if side.upper() == "CALL" else "P"
    strike_code = f"{int(round(strike * 1000)):08d}"
    return f"{root}{yymmdd}{cp}{strike_code}"


def round_strike(value: float, side: str) -> int:
    return int(math.ceil(value / 5.0) * 5) if side == "CALL" else int(math.floor(value / 5.0) * 5)


def require_key() -> None:
    if not os.environ.get("DATABENTO_API_KEY"):
        raise SystemExit("DATABENTO_API_KEY is not set.")


def parse_offsets(value: str) -> list[int]:
    return sorted({int(v.strip()) for v in value.split(",") if v.strip()})


def load_signals(trades_path: Path, spx_path: Path, limit: int, offsets: list[int], target: float, variant: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    trades = pd.read_csv(trades_path)
    trades = trades[(trades["target"].round(3) == round(target, 3)) & (trades["variant"] == variant)].copy()
    trades["entry_at"] = pd.to_datetime(trades["entryAt"], utc=True)
    trades["exit_at"] = pd.to_datetime(trades["exitAt"], utc=True)
    trades = trades.sort_values("entry_at", ascending=False).head(limit).sort_values("entry_at").reset_index(drop=True)

    spx = pd.read_csv(spx_path)
    spx["spx_ts"] = pd.to_datetime(spx["ts_event"], utc=True)
    spx = spx.rename(columns={"open": "spx_open", "high": "spx_high", "low": "spx_low", "close": "spx_close"})
    joined = pd.merge_asof(
        trades.sort_values("entry_at"),
        spx[["spx_ts", "spx_open", "spx_high", "spx_low", "spx_close"]].sort_values("spx_ts"),
        left_on="entry_at",
        right_on="spx_ts",
        direction="nearest",
        tolerance=pd.Timedelta(minutes=2),
    )
    joined = joined.dropna(subset=["spx_close"]).copy()
    rows: list[dict[str, object]] = []
    candidates: list[dict[str, object]] = []
    for i, row in joined.iterrows():
        entry_et = row.entry_at.tz_convert(ET_TZ)
        entry_ct = row.entry_at.tz_convert(CT_TZ)
        signal_id = f"{entry_et.strftime('%Y%m%d_%H%M')}_{row.direction}_{i}"
        side = "CALL" if row.direction == "long" else "PUT"
        expiry = entry_et.normalize()
        for offset in offsets:
            raw_strike = float(row.spx_close) + offset if side == "CALL" else float(row.spx_close) - offset
            strike = round_strike(raw_strike, side)
            symbol = occ_spxw_symbol(expiry, side, strike)
            actual_offset = strike - float(row.spx_close) if side == "CALL" else float(row.spx_close) - strike
            candidates.append(
                {
                    "signal_id": signal_id,
                    "option_symbol": symbol,
                    "side": side,
                    "strike": strike,
                    "requested_offset": offset,
                    "actual_spx_offset": actual_offset,
                    "entry_at": row.entry_at.isoformat(),
                    "exit_at": max(row.exit_at, row.entry_at + pd.Timedelta(minutes=1)).isoformat(),
                    "entry_ct": entry_ct.isoformat(),
                    "direction": row.direction,
                    "setupType": row.setupType,
                    "confirmationMode": row.confirmationMode,
                    "es_entry": float(row.entryPrice),
                    "spx_entry": float(row.spx_close),
                    "es_spx_basis": float(row.entryPrice) - float(row.spx_close),
                    "underlying_target_es": float(row.targetPrice),
                    "result": row.result,
                    "r": float(row.r),
                }
            )
        rows.append(
            {
                "signal_id": signal_id,
                "entry_at": row.entry_at.isoformat(),
                "entry_ct": entry_ct.isoformat(),
                "exit_at": row.exit_at.isoformat(),
                "direction": row.direction,
                "es_entry": row.entryPrice,
                "spx_entry": row.spx_close,
                "es_spx_basis": float(row.entryPrice) - float(row.spx_close),
                "result": row.result,
                "r": row.r,
            }
        )
    return pd.DataFrame(rows), pd.DataFrame(candidates)


def group_requests(candidates: pd.DataFrame, pad_minutes: int) -> list[dict[str, object]]:
    work = candidates.copy()
    work["entry_at"] = pd.to_datetime(work["entry_at"], utc=True)
    work["exit_at"] = pd.to_datetime(work["exit_at"], utc=True)
    work["date"] = work["entry_at"].dt.tz_convert(ET_TZ).dt.date.astype(str)
    groups = []
    for date, g in work.groupby("date"):
        start = g["entry_at"].min() - pd.Timedelta(minutes=pad_minutes)
        end = g["exit_at"].max() + pd.Timedelta(minutes=pad_minutes)
        if end - start > pd.Timedelta(hours=5):
            end = start + pd.Timedelta(hours=5)
        groups.append({"date": date, "start": start.isoformat(), "end": end.isoformat(), "symbols": sorted(g["option_symbol"].unique()), "symbol_count": int(g["option_symbol"].nunique())})
    return groups


def download(groups: list[dict[str, object]], schema: str, dataset: str, out_path: Path, sleep_seconds: float) -> pd.DataFrame:
    require_key()
    client = db.Historical()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    completed_dates: set[str] = set()
    if out_path.exists() and out_path.stat().st_size > 0:
        existing = pd.read_csv(out_path)
        if not existing.empty:
            frames.append(existing)
            if "ts_event" in existing.columns:
                existing_ts = pd.to_datetime(existing["ts_event"], utc=True, errors="coerce")
                completed_dates = set(existing_ts.dt.tz_convert(ET_TZ).dt.date.dropna().astype(str).unique())
    for group in groups:
        if str(group["date"]) in completed_dates:
            print(f"Skipping {group['date']}: already cached", flush=True)
            continue
        print(f"Downloading {group['date']} {group['symbol_count']} symbols", flush=True)
        try:
            store = client.timeseries.get_range(dataset=dataset, schema=schema, symbols=group["symbols"], stype_in="raw_symbol", stype_out="instrument_id", start=group["start"], end=group["end"])
        except Exception as exc:
            print(f"Skipping {group['date']}: {str(exc).splitlines()[0]}", flush=True)
            continue
        df = store.to_df()
        if not df.empty:
            day = df.reset_index()
            frames.append(day)
            header = not out_path.exists() or out_path.stat().st_size == 0
            day.to_csv(out_path, index=False, mode="a", header=header)
        if sleep_seconds:
            time.sleep(sleep_seconds)
    if not frames:
        empty = pd.DataFrame()
        empty.to_csv(out_path, index=False)
        return empty
    return pd.concat(frames, ignore_index=True).drop_duplicates()


def pct_gain(end: float, start: float) -> float:
    if not np.isfinite(start) or start <= 0:
        return np.nan
    return (end - start) / start * 100.0


def normalize_quotes(raw: pd.DataFrame) -> pd.DataFrame:
    if raw.empty:
        return raw
    df = raw.copy()
    df["ts_event"] = pd.to_datetime(df["ts_event"], utc=True)
    df["bid"] = pd.to_numeric(df["bid_px_00"], errors="coerce")
    df["ask"] = pd.to_numeric(df["ask_px_00"], errors="coerce")
    df["mark"] = (df["bid"] + df["ask"]) / 2
    df["trade_high_proxy"] = df["ask"]
    df["exit_liquidation_proxy"] = df["bid"]
    return df.dropna(subset=["ts_event", "symbol", "mark"]).sort_values(["symbol", "ts_event"])


def analyze(candidates: pd.DataFrame, raw: pd.DataFrame) -> pd.DataFrame:
    q = normalize_quotes(raw)
    c = candidates.copy()
    c["entry_at"] = pd.to_datetime(c["entry_at"], utc=True)
    c["exit_at"] = pd.to_datetime(c["exit_at"], utc=True)
    rows = []
    for row in c.itertuples(index=False):
        sym_q = q[q["symbol"] == row.option_symbol]
        if sym_q.empty:
            rows.append({**row._asdict(), "quote_found": False})
            continue
        after_entry = sym_q[sym_q["ts_event"] >= row.entry_at]
        entry_quote = after_entry.head(1)
        if entry_quote.empty:
            rows.append({**row._asdict(), "quote_found": False})
            continue
        entry = entry_quote.iloc[0]
        exit_candidates = sym_q[sym_q["ts_event"] >= row.exit_at]
        exit_quote = exit_candidates.head(1)
        if exit_quote.empty:
            exit_quote = sym_q[sym_q["ts_event"] <= row.exit_at].tail(1)
        effective_exit_at = exit_quote.iloc[0]["ts_event"] if not exit_quote.empty else row.exit_at
        management = sym_q[(sym_q["ts_event"] >= entry["ts_event"]) & (sym_q["ts_event"] <= effective_exit_at)]
        if management.empty:
            management = entry_quote
        exit_quote = exit_quote.iloc[0] if not exit_quote.empty else management.tail(1).iloc[0]
        entry_mid = float(entry["mark"])
        entry_ask = float(entry["ask"])
        exit_bid = float(exit_quote["exit_liquidation_proxy"])
        max_ask = float(management["trade_high_proxy"].max())
        min_mark = float(management["mark"].min())
        rows.append(
            {
                **row._asdict(),
                "quote_found": True,
                "entry_quote_at": entry["ts_event"].isoformat(),
                "entry_bid": float(entry["bid"]),
                "entry_ask": entry_ask,
                "entry_mid": entry_mid,
                "entry_spread": entry_ask - float(entry["bid"]),
                "exit_quote_at": exit_quote["ts_event"].isoformat(),
                "exit_bid_proxy": exit_bid,
                "max_high_proxy": max_ask,
                "min_mark": min_mark,
                "gain_to_exit_bid_from_ask_pct": pct_gain(exit_bid, entry_ask),
                "max_gain_high_from_ask_pct": pct_gain(max_ask, entry_ask),
                "max_drawdown_mark_pct": pct_gain(min_mark, entry_mid),
                "quote_lag_seconds": (entry["ts_event"] - row.entry_at).total_seconds(),
            }
        )
    return pd.DataFrame(rows)


def write_report(out_dir: Path, analysis: pd.DataFrame) -> None:
    f = analysis[analysis["quote_found"] == True].copy()
    f["entry_at"] = pd.to_datetime(f["entry_at"], utc=True)
    f["entry_ct_dt"] = f["entry_at"].dt.tz_convert(CT_TZ)
    minutes = f["entry_ct_dt"].dt.hour * 60 + f["entry_ct_dt"].dt.minute
    f["entry_time_bucket_ct"] = pd.cut(minutes, bins=[0, 530, 555, 585, 615, 645, 675, 1440], labels=["before 08:50", "08:50-09:15", "09:15-09:45", "09:45-10:15", "10:15-10:45", "10:45-11:15", "after 11:15"], right=False)
    summary = (
        f.groupby(["side", "requested_offset"], observed=True)
        .agg(
            samples=("signal_id", "size"),
            signals=("signal_id", "nunique"),
            median_actual_offset=("actual_spx_offset", "median"),
            median_ask=("entry_ask", "median"),
            median_max_gain_pct=("max_gain_high_from_ask_pct", "median"),
            avg_max_gain_pct=("max_gain_high_from_ask_pct", "mean"),
            hit_20_pct=("max_gain_high_from_ask_pct", lambda s: (s >= 20).mean() * 100),
            median_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "median"),
            median_quote_lag_seconds=("quote_lag_seconds", "median"),
        )
        .round(2)
        .reset_index()
    )
    tod = (
        f.groupby(["entry_time_bucket_ct", "side", "requested_offset"], observed=True)
        .agg(
            samples=("signal_id", "size"),
            signals=("signal_id", "nunique"),
            median_ask=("entry_ask", "median"),
            median_max_gain_pct=("max_gain_high_from_ask_pct", "median"),
            hit_20_pct=("max_gain_high_from_ask_pct", lambda s: (s >= 20).mean() * 100),
            median_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "median"),
        )
        .round(2)
        .reset_index()
    )
    lines = ["# SPXW 0DTE Exact-SPX Strike Ladder", ""]
    lines.append("## Headline")
    lines.append("This is the corrected study: ES provides the signal, exact SPX at the signal minute selects the SPXW strikes, and each option is priced from its own entry-time CBBO quote.")
    lines.append("")
    lines.append("## Data")
    lines.append(f"- Candidate rows with quotes: {len(f)}")
    lines.append(f"- Signals with quotes: {f['signal_id'].nunique()}")
    lines.append(f"- Median quote lag: {f['quote_lag_seconds'].median():.0f} seconds")
    lines.append("")
    lines.append("## Strike Offset Summary")
    lines.append(summary.to_markdown(index=False))
    lines.append("")
    lines.append("## Time of Day by Offset")
    lines.append(tod.to_markdown(index=False))
    lines.append("")
    lines.append("## Production Takeaway")
    lines.append("Build the option ladder from exact SPX at the signal timestamp. The old ES-anchored ladder was not valid for selecting SPXW contracts.")
    (out_dir / "spxw_exact_spx_ladder_report.md").write_text("\n".join(lines), encoding="utf-8")
    f.to_csv(out_dir / "spxw_exact_spx_ladder_analysis_enriched.csv", index=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trades", type=Path, default=Path("outputs/control_grid/ema_fib_options_trades.csv"))
    parser.add_argument("--spx", type=Path, default=Path("data/polygon/I_SPX_1m_2025-06-18_2026-06-17.csv"))
    parser.add_argument("--out", type=Path, default=Path("data/databento/opra_spxw_exact_spx_ladder"))
    parser.add_argument("--dataset", default="OPRA.PILLAR")
    parser.add_argument("--schema", default="cbbo-1m")
    parser.add_argument("--limit", type=int, default=217)
    parser.add_argument("--target", type=float, default=1.5)
    parser.add_argument("--variant", default="baseline")
    parser.add_argument("--offsets", default="0,10,20,30,40,50,60")
    parser.add_argument("--pad-minutes", type=int, default=5)
    parser.add_argument("--sleep-seconds", type=float, default=0.05)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    signals, candidates = load_signals(args.trades, args.spx, args.limit, parse_offsets(args.offsets), args.target, args.variant)
    groups = group_requests(candidates, args.pad_minutes)
    signals.to_csv(args.out / "spxw_exact_spx_ladder_signals.csv", index=False)
    candidates.to_csv(args.out / "spxw_exact_spx_ladder_candidates.csv", index=False)
    (args.out / "spxw_exact_spx_ladder_requests.json").write_text(json.dumps(groups, indent=2), encoding="utf-8")

    raw_path = args.out / f"spxw_exact_spx_ladder_{args.schema}.csv"
    raw = download(groups, args.schema, args.dataset, raw_path, args.sleep_seconds) if args.download else pd.read_csv(raw_path)
    analysis = analyze(candidates, raw)
    analysis.to_csv(args.out / "spxw_exact_spx_ladder_analysis.csv", index=False)
    write_report(args.out, analysis)
    print(args.out)


if __name__ == "__main__":
    main()
