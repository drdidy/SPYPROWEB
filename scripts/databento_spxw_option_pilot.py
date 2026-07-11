#!/usr/bin/env python3
"""Targeted Databento OPRA pull for SPXW 0DTE option behavior.

This is intentionally event-driven. It does not download full chains. It takes
historical EMA-Fib signals, builds a small strike ladder around each entry,
estimates Databento cost, optionally downloads 1-minute option data, then
measures which SPXW contract would have moved best before the underlying exit.

The script reads the API key from DATABENTO_API_KEY only. Do not pass secrets
on the command line and do not commit downloaded proprietary data.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import databento as db
import numpy as np
import pandas as pd


ET_TZ = "America/New_York"


@dataclass(frozen=True)
class Candidate:
    signal_id: str
    option_symbol: str
    side: str
    strike: int
    offset: int
    entry_at: pd.Timestamp
    exit_at: pd.Timestamp
    direction: str
    underlying_entry: float
    underlying_target: float
    result: str
    r: float


def occ_spxw_symbol(expiry: pd.Timestamp, side: str, strike: int) -> str:
    # OCC/OSI raw symbols are 21 chars: six-char root + YYMMDD + C/P + 8 digit strike*1000.
    root = "SPXW".ljust(6)
    yymmdd = expiry.strftime("%y%m%d")
    cp = "C" if side.upper() == "CALL" else "P"
    strike_code = f"{int(round(strike * 1000)):08d}"
    return f"{root}{yymmdd}{cp}{strike_code}"


def round_strike(value: float, side: str) -> int:
    if side == "CALL":
        return int(math.ceil(value / 5.0) * 5)
    return int(math.floor(value / 5.0) * 5)


def load_signals(path: Path, limit: int, basis: float, offsets: list[int]) -> tuple[pd.DataFrame, pd.DataFrame]:
    trades = pd.read_csv(path)
    trades = trades[(trades["target"] == 1.5) & (trades["variant"] == "baseline")].copy()
    trades["entry_ts"] = pd.to_datetime(trades["entryAt"], utc=True)
    trades["exit_ts"] = pd.to_datetime(trades["exitAt"], utc=True)
    trades["entry_et"] = trades["entry_ts"].dt.tz_convert(ET_TZ)
    trades["exit_et"] = trades["exit_ts"].dt.tz_convert(ET_TZ)
    trades = trades.sort_values("entry_ts", ascending=False).head(limit).sort_values("entry_ts").reset_index(drop=True)
    rows: list[dict[str, object]] = []
    candidates: list[Candidate] = []
    for i, row in trades.iterrows():
        signal_id = f"{row.entry_et.strftime('%Y%m%d_%H%M')}_{row.direction}_{i}"
        option_side = "CALL" if row.direction == "long" else "PUT"
        spx_entry = float(row.entryPrice) + basis
        target = float(row.targetPrice) + basis
        expiry = row.entry_et.normalize()
        for offset in offsets:
            raw_strike = spx_entry + offset if option_side == "CALL" else spx_entry - offset
            strike = round_strike(raw_strike, option_side)
            symbol = occ_spxw_symbol(expiry, option_side, strike)
            candidates.append(
                Candidate(
                    signal_id=signal_id,
                    option_symbol=symbol,
                    side=option_side,
                    strike=strike,
                    offset=offset,
                    entry_at=row.entry_ts,
                    exit_at=max(row.exit_ts, row.entry_ts + pd.Timedelta(minutes=1)),
                    direction=row.direction,
                    underlying_entry=spx_entry,
                    underlying_target=target,
                    result=row.result,
                    r=float(row.r),
                )
            )
        rows.append(
            {
                "signal_id": signal_id,
                "entry_at": row.entry_ts.isoformat(),
                "entry_et": row.entry_et.isoformat(),
                "exit_at": row.exit_ts.isoformat(),
                "direction": row.direction,
                "underlying_entry_es": row.entryPrice,
                "underlying_target_es": row.targetPrice,
                "basis_points": basis,
                "underlying_entry_spx_proxy": spx_entry,
                "underlying_target_spx_proxy": target,
                "result": row.result,
                "r": row.r,
            }
        )
    candidate_df = pd.DataFrame([c.__dict__ for c in candidates])
    for col in ["entry_at", "exit_at"]:
        candidate_df[col] = candidate_df[col].map(lambda x: x.isoformat())
    return pd.DataFrame(rows), candidate_df


def group_requests(candidates: pd.DataFrame, pad_minutes: int) -> list[dict[str, object]]:
    work = candidates.copy()
    work["entry_at"] = pd.to_datetime(work["entry_at"], utc=True)
    work["exit_at"] = pd.to_datetime(work["exit_at"], utc=True)
    work["date"] = work["entry_at"].dt.tz_convert(ET_TZ).dt.date.astype(str)
    groups = []
    for date, g in work.groupby("date"):
        start = g["entry_at"].min() - pd.Timedelta(minutes=pad_minutes)
        end = g["exit_at"].max() + pd.Timedelta(minutes=pad_minutes)
        # Avoid requesting whole-day chains. Cap at the max observed management window.
        if end - start > pd.Timedelta(hours=5):
            end = start + pd.Timedelta(hours=5)
        groups.append(
            {
                "date": date,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "symbols": sorted(g["option_symbol"].unique().tolist()),
                "symbol_count": int(g["option_symbol"].nunique()),
            }
        )
    return groups


def require_key() -> None:
    if not os.environ.get("DATABENTO_API_KEY"):
        raise SystemExit("DATABENTO_API_KEY is not set in this shell. Set it locally, then rerun with --estimate-cost or --download.")


def estimate_cost(groups: list[dict[str, object]], schema: str, dataset: str) -> tuple[float, list[dict[str, object]]]:
    require_key()
    client = db.Historical()
    details = []
    total = 0.0
    for group in groups:
        try:
            cost = float(
                client.metadata.get_cost(
                    dataset=dataset,
                    schema=schema,
                    symbols=group["symbols"],
                    stype_in="raw_symbol",
                    start=group["start"],
                    end=group["end"],
                )
            )
        except Exception as exc:
            details.append({**group, "estimated_cost": np.nan, "resolvable": False, "skip_reason": str(exc).splitlines()[0]})
            continue
        details.append({**group, "estimated_cost": cost, "resolvable": True, "skip_reason": ""})
        total += cost
    return total, details


def download(groups: list[dict[str, object]], schema: str, dataset: str, out_path: Path, sleep_seconds: float) -> pd.DataFrame:
    require_key()
    client = db.Historical()
    frames = []
    out_path.parent.mkdir(parents=True, exist_ok=True)
    for group in groups:
        if group.get("resolvable") is False:
            print(f"Skipping {group['date']} unresolved symbols: {group.get('skip_reason', '')}", flush=True)
            continue
        print(f"Downloading {group['date']} {schema} {group['symbol_count']} symbols", flush=True)
        try:
            store = client.timeseries.get_range(
                dataset=dataset,
                schema=schema,
                symbols=group["symbols"],
                stype_in="raw_symbol",
                # OPRA supports raw_symbol input, but not raw_symbol -> raw_symbol
                # output. Databento still includes the readable raw symbol in the
                # returned dataframe while mapping internally to instrument_id.
                stype_out="instrument_id",
                start=group["start"],
                end=group["end"],
            )
        except Exception as exc:
            print(f"Skipping {group['date']} download error: {str(exc).splitlines()[0]}", flush=True)
            continue
        df = store.to_df()
        if not df.empty:
            df = df.reset_index()
            if "index" in df.columns and "ts_event" not in df.columns:
                df = df.rename(columns={"index": "ts_event"})
            frames.append(df)
        if sleep_seconds:
            time.sleep(sleep_seconds)
    if not frames:
        empty = pd.DataFrame()
        empty.to_csv(out_path, index=False)
        return empty
    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates()
    combined.to_csv(out_path, index=False)
    return combined


def normalize_quotes(raw: pd.DataFrame) -> pd.DataFrame:
    if raw.empty:
        return raw
    df = raw.copy()
    ts_col = "ts_event" if "ts_event" in df.columns else "timestamp" if "timestamp" in df.columns else df.columns[0]
    df["ts_event"] = pd.to_datetime(df[ts_col], utc=True)
    if "symbol" not in df.columns and "raw_symbol" in df.columns:
        df["symbol"] = df["raw_symbol"]
    bid_cols = [c for c in df.columns if c.startswith("bid_px")]
    ask_cols = [c for c in df.columns if c.startswith("ask_px")]
    if bid_cols and ask_cols:
        df["bid"] = pd.to_numeric(df[bid_cols[0]], errors="coerce")
        df["ask"] = pd.to_numeric(df[ask_cols[0]], errors="coerce")
        df["mark"] = (df["bid"] + df["ask"]) / 2
        df["trade_high_proxy"] = df["ask"]
        df["exit_liquidation_proxy"] = df["bid"]
    elif {"open", "high", "low", "close"}.issubset(df.columns):
        df["bid"] = np.nan
        df["ask"] = np.nan
        df["mark"] = pd.to_numeric(df["close"], errors="coerce")
        df["trade_high_proxy"] = pd.to_numeric(df["high"], errors="coerce")
        df["exit_liquidation_proxy"] = pd.to_numeric(df["close"], errors="coerce")
    else:
        price_cols = [c for c in df.columns if "price" in c or c in {"price", "px"}]
        if not price_cols:
            raise ValueError(f"Could not identify price columns in option data: {df.columns.tolist()}")
        df["bid"] = np.nan
        df["ask"] = np.nan
        df["mark"] = pd.to_numeric(df[price_cols[0]], errors="coerce")
        df["trade_high_proxy"] = df["mark"]
        df["exit_liquidation_proxy"] = df["mark"]
    return df.dropna(subset=["ts_event", "symbol", "mark"]).sort_values(["symbol", "ts_event"])


def analyze(candidates: pd.DataFrame, quotes: pd.DataFrame) -> pd.DataFrame:
    if quotes.empty:
        return pd.DataFrame()
    q = normalize_quotes(quotes)
    c = candidates.copy()
    c["entry_at"] = pd.to_datetime(c["entry_at"], utc=True)
    c["exit_at"] = pd.to_datetime(c["exit_at"], utc=True)
    rows = []
    for row in c.itertuples(index=False):
        sym_q = q[q["symbol"] == row.option_symbol].copy()
        if sym_q.empty:
            rows.append({**row._asdict(), "quote_found": False})
            continue
        window = sym_q[(sym_q["ts_event"] >= row.entry_at - pd.Timedelta(minutes=1)) & (sym_q["ts_event"] <= row.exit_at + pd.Timedelta(minutes=5))]
        after_entry = sym_q[sym_q["ts_event"] >= row.entry_at]
        entry_quote = after_entry.head(1)
        if entry_quote.empty or window.empty:
            rows.append({**row._asdict(), "quote_found": False})
            continue
        entry = entry_quote.iloc[0]
        management = sym_q[(sym_q["ts_event"] >= entry["ts_event"]) & (sym_q["ts_event"] <= row.exit_at)]
        if management.empty:
            management = entry_quote
        exit_quote = management.tail(1).iloc[0]
        entry_mid = float(entry["mark"])
        entry_ask = float(entry["ask"]) if pd.notna(entry["ask"]) else entry_mid
        exit_mark = float(exit_quote["mark"])
        exit_bid = float(exit_quote["exit_liquidation_proxy"]) if pd.notna(exit_quote["exit_liquidation_proxy"]) else exit_mark
        max_mark = float(management["mark"].max())
        max_high = float(management["trade_high_proxy"].max())
        min_mark = float(management["mark"].min())
        spread = float(entry["ask"] - entry["bid"]) if pd.notna(entry["ask"]) and pd.notna(entry["bid"]) else np.nan
        rows.append(
            {
                **row._asdict(),
                "quote_found": True,
                "entry_quote_at": entry["ts_event"].isoformat(),
                "entry_mid": entry_mid,
                "entry_ask": entry_ask,
                "entry_bid": float(entry["bid"]) if pd.notna(entry["bid"]) else np.nan,
                "entry_spread": spread,
                "exit_quote_at": exit_quote["ts_event"].isoformat(),
                "exit_mark": exit_mark,
                "exit_bid_proxy": exit_bid,
                "max_mark": max_mark,
                "max_high_proxy": max_high,
                "min_mark": min_mark,
                "gain_to_exit_mark_pct": pct_gain(exit_mark, entry_mid),
                "gain_to_exit_bid_from_ask_pct": pct_gain(exit_bid, entry_ask),
                "max_gain_mark_pct": pct_gain(max_mark, entry_mid),
                "max_gain_high_from_ask_pct": pct_gain(max_high, entry_ask),
                "max_drawdown_mark_pct": pct_gain(min_mark, entry_mid),
            }
        )
    return pd.DataFrame(rows)


def pct_gain(end: float, start: float) -> float:
    if not np.isfinite(start) or start <= 0:
        return np.nan
    return (end - start) / start * 100.0


def write_report(out_dir: Path, signals: pd.DataFrame, candidates: pd.DataFrame, groups: list[dict[str, object]], analysis: pd.DataFrame | None, cost: float | None = None) -> None:
    lines = ["# SPXW 0DTE Databento Pilot Plan", ""]
    lines.append(f"- Signals selected: {len(signals)}")
    lines.append(f"- Candidate contracts: {len(candidates)}")
    lines.append(f"- Request groups: {len(groups)}")
    if cost is not None:
        lines.append(f"- Estimated Databento cost: ${cost:.4f}")
    lines.append("")
    lines.append("## Request Groups")
    lines.append(pd.DataFrame(groups).drop(columns=["symbols"], errors="ignore").to_markdown(index=False) if groups else "No groups.")
    if analysis is not None and not analysis.empty:
        found = analysis[analysis["quote_found"] == True].copy()
        lines.append("")
        lines.append("## Contract Selection Summary")
        if found.empty:
            lines.append("No quotes found for candidate contracts.")
        else:
            summary = found.groupby(["side", "offset"]).agg(
                samples=("quote_found", "size"),
                avg_entry_ask=("entry_ask", "mean"),
                median_entry_ask=("entry_ask", "median"),
                avg_spread=("entry_spread", "mean"),
                avg_max_gain_pct=("max_gain_high_from_ask_pct", "mean"),
                median_max_gain_pct=("max_gain_high_from_ask_pct", "median"),
                avg_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "mean"),
                median_drawdown_pct=("max_drawdown_mark_pct", "median"),
            ).reset_index()
            lines.append(summary.round(3).to_markdown(index=False))
            best = summary.sort_values("avg_max_gain_pct", ascending=False).head(5)
            lines.append("")
            lines.append("Top offsets by average max gain:")
            lines.append(best.round(3).to_markdown(index=False))
    (out_dir / "spxw_option_pilot_report.md").write_text("\n".join(lines), encoding="utf-8")


def parse_offsets(value: str) -> list[int]:
    return sorted({int(v.strip()) for v in value.split(",") if v.strip()})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trades", type=Path, default=Path("outputs/control_grid/ema_fib_options_trades.csv"))
    parser.add_argument("--out", type=Path, default=Path("data/databento/opra_spxw_pilot"))
    parser.add_argument("--dataset", default="OPRA.PILLAR")
    parser.add_argument("--schema", default="cbbo-1m", help="Try cbbo-1m first; use ohlcv-1m as cheaper/fallback if needed.")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--basis-points", type=float, default=0.0, help="SPX proxy = ES entry + this basis. Use 0 for broad exploratory strike ladder.")
    parser.add_argument("--offsets", default="0,10,20,30,40,50,60")
    parser.add_argument("--pad-minutes", type=int, default=5)
    parser.add_argument("--estimate-cost", action="store_true")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--skip-cost-estimate", action="store_true", help="Use only for small, targeted CBBO pilots after a representative estimate.")
    parser.add_argument("--max-cost", type=float, default=15.0)
    parser.add_argument("--sleep-seconds", type=float, default=0.15)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    signals, candidates = load_signals(args.trades, args.limit, args.basis_points, parse_offsets(args.offsets))
    groups = group_requests(candidates, args.pad_minutes)
    signals.to_csv(args.out / "spxw_pilot_signals.csv", index=False)
    candidates.to_csv(args.out / "spxw_pilot_candidates.csv", index=False)
    (args.out / "spxw_pilot_requests.json").write_text(json.dumps(groups, indent=2), encoding="utf-8")

    cost = None
    cost_details = None
    if (args.estimate_cost or args.download) and not args.skip_cost_estimate:
        cost, cost_details = estimate_cost(groups, args.schema, args.dataset)
        pd.DataFrame(cost_details).drop(columns=["symbols"], errors="ignore").to_csv(args.out / "spxw_pilot_cost_estimate.csv", index=False)
        if cost > args.max_cost:
            write_report(args.out, signals, candidates, cost_details or groups, None, cost)
            raise SystemExit(f"Estimated cost ${cost:.4f} exceeds --max-cost ${args.max_cost:.2f}. Not downloading.")

    analysis = None
    if args.download:
        raw = download(cost_details or groups, args.schema, args.dataset, args.out / f"spxw_pilot_{args.schema}.csv", args.sleep_seconds)
        analysis = analyze(candidates, raw)
        analysis.to_csv(args.out / "spxw_pilot_analysis.csv", index=False)
    write_report(args.out, signals, candidates, cost_details or groups, analysis, cost)
    print(f"Wrote pilot plan to {args.out}")


if __name__ == "__main__":
    main()
