#!/usr/bin/env python3
"""Write time-of-day breakdown for SPXW 0DTE contract selection."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


IN = Path("data/databento/opra_spxw_year_cbbo/spxw_pilot_analysis_with_exact_spx.csv")
OUT = Path("data/databento/opra_spxw_year_cbbo/spxw_exact_spx_time_of_day_report.md")


def add_time_buckets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["entry_at"] = pd.to_datetime(df["entry_at"], utc=True)
    df["entry_quote_at"] = pd.to_datetime(df["entry_quote_at"], utc=True, errors="coerce")
    df["entry_ct"] = df["entry_at"].dt.tz_convert("America/Chicago")
    minutes = df["entry_ct"].dt.hour * 60 + df["entry_ct"].dt.minute
    bins = [0, 8 * 60 + 50, 9 * 60 + 15, 9 * 60 + 45, 10 * 60 + 15, 10 * 60 + 45, 11 * 60 + 15, 24 * 60]
    labels = ["before 08:50", "08:50-09:15", "09:15-09:45", "09:45-10:15", "10:15-10:45", "10:45-11:15", "after 11:15"]
    df["entry_time_bucket_ct"] = pd.cut(minutes, bins=bins, labels=labels, right=False)
    df["quote_lag_seconds"] = (df["entry_quote_at"] - df["entry_at"]).dt.total_seconds()
    return df


def summarize(df: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    return (
        df.groupby(group_cols, observed=True)
        .agg(
            samples=("signal_id", "size"),
            signals=("signal_id", "nunique"),
            median_spx=("spx_close", "median"),
            median_offset=("actual_spx_offset", "median"),
            median_ask=("entry_ask", "median"),
            avg_ask=("entry_ask", "mean"),
            median_spread=("entry_spread", "median"),
            avg_max_gain_pct=("max_gain_high_from_ask_pct", "mean"),
            median_max_gain_pct=("max_gain_high_from_ask_pct", "median"),
            hit_20_pct=("max_gain_high_from_ask_pct", lambda s: (s >= 20).mean() * 100),
            avg_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "mean"),
            median_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "median"),
            median_quote_lag_seconds=("quote_lag_seconds", "median"),
        )
        .round(2)
        .reset_index()
    )


def main() -> None:
    df = pd.read_csv(IN)
    df = add_time_buckets(df)
    found = df[df["quote_found"] == True].copy()
    signal_rows = found.drop_duplicates("signal_id").copy()

    lines: list[str] = []
    lines.append("# SPXW 0DTE Contract Selection by Entry Time")
    lines.append("")
    lines.append("## Headline")
    lines.append(
        "The study does use the actual option quote at each signal time, so a 20-point OTM contract at 09:00 CT is not treated the same as a 20-point OTM contract at 09:45 CT. This report makes that time decay and intraday repricing visible."
    )
    lines.append("")
    lines.append("## Data Integrity")
    lines.append(f"- Signals with exact SPX minute: {signal_rows['spx_close'].notna().sum()} of {signal_rows['signal_id'].nunique()}")
    lines.append(f"- Candidate option rows with quotes: {len(found)}")
    lines.append(f"- Median option quote lag from signal: {found['quote_lag_seconds'].median():.0f} seconds")
    lines.append(f"- 90th percentile option quote lag: {found['quote_lag_seconds'].quantile(0.90):.0f} seconds")
    lines.append("- Entry ask, max gain, and exit gain are all measured from the option quote at that signal's own timestamp.")
    lines.append("")
    lines.append("## Time Bucket Summary")
    lines.append(summarize(found, ["entry_time_bucket_ct"]).to_markdown(index=False))
    lines.append("")
    lines.append("## Time Bucket by Side")
    lines.append(summarize(found, ["entry_time_bucket_ct", "side"]).to_markdown(index=False))
    lines.append("")
    lines.append("## Time Bucket by Actual SPX Moneyness")
    lines.append(summarize(found, ["entry_time_bucket_ct", "side", "actual_spx_offset_bucket"]).to_markdown(index=False))
    lines.append("")
    lines.append("## Production Rule Update")
    lines.append("1. Contract selection must run at the signal timestamp, not precompute from 09:00 CT.")
    lines.append("2. Use exact SPX at entry time to build the strike ladder.")
    lines.append("3. Re-price the candidate SPXW contracts at the entry timestamp before sending Telegram.")
    lines.append("4. Add a time-decay guard: the same moneyness later in the window should require better spread and premium quality.")
    lines.append("5. The app should log entryTimeCT, SPX at entry, chosen strike, ask, spread, VIX, and moneyness for every alert.")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    found.to_csv(OUT.with_suffix(".csv"), index=False)
    print(OUT)


if __name__ == "__main__":
    main()
