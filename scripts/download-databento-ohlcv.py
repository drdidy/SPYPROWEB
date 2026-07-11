#!/usr/bin/env python3
"""Download Databento OHLCV bars into a local CSV cache.

The script intentionally reads the API key from DATABENTO_API_KEY only. Do not
commit keys or pass them on the command line.
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import databento as db
import pandas as pd


def main() -> None:
    args = parse_args()
    if not os.environ.get("DATABENTO_API_KEY"):
        raise SystemExit("DATABENTO_API_KEY is not set.")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    start = parse_date(args.start)
    end = parse_date(args.end)
    if end <= start:
        raise SystemExit("--end must be after --start")

    client = db.Historical()
    frames: list[pd.DataFrame] = []
    cursor = start
    chunk = timedelta(days=args.chunk_days)

    while cursor < end:
        chunk_end = min(cursor + chunk, end)
        print(
            f"Downloading {args.symbol} {args.schema} "
            f"{cursor.isoformat()} -> {chunk_end.isoformat()}",
            flush=True,
        )
        data = client.timeseries.get_range(
            dataset=args.dataset,
            schema=args.schema,
            symbols=args.symbol,
            stype_in=args.stype_in,
            start=cursor.isoformat(),
            end=chunk_end.isoformat(),
        )
        df = data.to_df()
        if not df.empty:
            df = df.reset_index()
            if "index" in df.columns and "ts_event" not in df.columns:
                df = df.rename(columns={"index": "ts_event"})
            frames.append(df)
        cursor = chunk_end
        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    if not frames:
        raise SystemExit("No bars returned.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset=["ts_event", "symbol"], keep="last")
    combined = combined.sort_values(["ts_event", "symbol"])
    combined.to_csv(out_path, index=False)
    print(f"Wrote {len(combined):,} bars to {out_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="GLBX.MDP3")
    parser.add_argument("--schema", default="ohlcv-1m")
    parser.add_argument("--symbol", default="ES.v.0")
    parser.add_argument("--stype-in", default="continuous")
    parser.add_argument("--start", required=True, help="UTC date/time, e.g. 2025-06-18")
    parser.add_argument("--end", required=True, help="UTC date/time, exclusive")
    parser.add_argument("--out", default="data/databento/ES_ohlcv-1m.csv")
    parser.add_argument("--chunk-days", type=int, default=31)
    parser.add_argument("--sleep-seconds", type=float, default=0.2)
    return parser.parse_args()


def parse_date(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    if "T" not in normalized:
        normalized = f"{normalized}T00:00:00+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


if __name__ == "__main__":
    main()
