#!/usr/bin/env python3
"""Download Databento OHLCV bars to CSV one chunk at a time.

This is safer for long date ranges than the original downloader because each
successful chunk is appended immediately and logged in a manifest.
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import databento as db
import pandas as pd


def parse_date(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    if "T" not in normalized:
        normalized = f"{normalized}T00:00:00+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="GLBX.MDP3")
    parser.add_argument("--schema", default="ohlcv-1m")
    parser.add_argument("--symbol", default="ES.v.0")
    parser.add_argument("--stype-in", default="continuous")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--chunk-days", type=int, default=90)
    parser.add_argument("--sleep-seconds", type=float, default=0.2)
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not os.environ.get("DATABENTO_API_KEY"):
        raise SystemExit("DATABENTO_API_KEY is not set.")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path = out_path.with_suffix(out_path.suffix + ".manifest.csv")

    start = parse_date(args.start)
    end = parse_date(args.end)
    if end <= start:
        raise SystemExit("--end must be after --start")

    completed: set[tuple[str, str]] = set()
    if args.resume and manifest_path.exists():
        manifest = pd.read_csv(manifest_path)
        completed = set(zip(manifest["start"], manifest["end"]))

    if not args.resume:
        for path in (out_path, manifest_path):
            if path.exists():
                path.unlink()

    client = db.Historical()
    cursor = start
    chunk = timedelta(days=args.chunk_days)
    wrote_header = out_path.exists() and out_path.stat().st_size > 0

    while cursor < end:
        chunk_end = min(cursor + chunk, end)
        key = (cursor.isoformat(), chunk_end.isoformat())
        if key in completed:
            print(f"Skipping completed {key[0]} -> {key[1]}", flush=True)
            cursor = chunk_end
            continue

        print(f"Downloading {args.symbol} {args.schema} {key[0]} -> {key[1]}", flush=True)
        data = client.timeseries.get_range(
            dataset=args.dataset,
            schema=args.schema,
            symbols=args.symbol,
            stype_in=args.stype_in,
            start=cursor.isoformat(),
            end=chunk_end.isoformat(),
        )
        df = data.to_df()
        rows = 0
        if not df.empty:
            df = df.reset_index()
            if "index" in df.columns and "ts_event" not in df.columns:
                df = df.rename(columns={"index": "ts_event"})
            df = df.drop_duplicates(subset=["ts_event", "symbol"], keep="last")
            df = df.sort_values(["ts_event", "symbol"])
            rows = len(df)
            df.to_csv(out_path, mode="a", index=False, header=not wrote_header)
            wrote_header = True

        manifest_row = pd.DataFrame(
            [{"start": key[0], "end": key[1], "rows": rows, "written_at": datetime.now(timezone.utc).isoformat()}],
        )
        manifest_row.to_csv(manifest_path, mode="a", index=False, header=not manifest_path.exists())
        print(f"Wrote chunk rows={rows:,}", flush=True)

        cursor = chunk_end
        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    if not out_path.exists() or out_path.stat().st_size == 0:
        raise SystemExit("No bars returned.")

    print(f"Done: {out_path}", flush=True)


if __name__ == "__main__":
    main()
