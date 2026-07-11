#!/usr/bin/env python3
"""Download Polygon/Massive I:SPX 1-minute aggregate bars.

Reads POLYGON_API_KEY from the environment only.
"""

from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

import pandas as pd
import requests


BASE_URL = "https://api.polygon.io/v2/aggs/ticker/I:SPX/range/1/minute"


def require_key() -> str:
    key = os.environ.get("POLYGON_API_KEY")
    if not key:
        raise SystemExit("POLYGON_API_KEY is not set.")
    return key


def fetch_day(day: pd.Timestamp, key: str) -> pd.DataFrame:
    date = day.date().isoformat()
    url = f"{BASE_URL}/{date}/{date}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000, "apiKey": key}
    response = requests.get(url, params=params, timeout=60)
    data = response.json()
    if response.status_code != 200:
        raise RuntimeError(f"{date} {response.status_code}: {data.get('message', str(data))}")
    rows = data.get("results") or []
    if not rows:
        return pd.DataFrame(columns=["ts_event", "open", "high", "low", "close", "volume", "ticker"])
    df = pd.DataFrame(rows)
    df["ts_event"] = pd.to_datetime(df["t"], unit="ms", utc=True)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"})
    df["ticker"] = "I:SPX"
    keep = ["ts_event", "open", "high", "low", "close", "volume", "ticker"]
    for col in keep:
        if col not in df.columns:
            df[col] = pd.NA
    return df[keep]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2025-06-18")
    parser.add_argument("--end", default="2026-06-17")
    parser.add_argument("--out", type=Path, default=Path("data/polygon/I_SPX_1m_2025-06-18_2026-06-17.csv"))
    parser.add_argument("--sleep", type=float, default=0.15)
    args = parser.parse_args()

    key = require_key()
    days = pd.date_range(args.start, args.end, freq="D")
    frames: list[pd.DataFrame] = []
    for day in days:
        if day.weekday() >= 5:
            continue
        try:
            df = fetch_day(day, key)
        except Exception as exc:
            print(f"Skipping {day.date()}: {exc}", flush=True)
            continue
        if not df.empty:
            frames.append(df)
            print(f"{day.date()} {len(df)} bars", flush=True)
        if args.sleep:
            time.sleep(args.sleep)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    if frames:
        out = pd.concat(frames, ignore_index=True).drop_duplicates(subset=["ts_event"]).sort_values("ts_event")
    else:
        out = pd.DataFrame(columns=["ts_event", "open", "high", "low", "close", "volume", "ticker"])
    out.to_csv(args.out, index=False)
    print(args.out)
    print(out.shape)


if __name__ == "__main__":
    main()
