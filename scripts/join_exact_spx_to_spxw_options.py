#!/usr/bin/env python3
"""Join exact Polygon I:SPX 1-minute bars to SPXW option candidate analysis."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


ANALYSIS_IN = Path("data/databento/opra_spxw_year_cbbo/spxw_pilot_analysis_with_vix.csv")
SPX_BARS = Path("data/polygon/I_SPX_1m_2025-06-18_2026-06-17.csv")
OUT = Path("data/databento/opra_spxw_year_cbbo/spxw_pilot_analysis_with_exact_spx.csv")
REPORT = Path("data/databento/opra_spxw_year_cbbo/spxw_exact_spx_basis_report.md")


def bucket_offset(value: float) -> str:
    if not np.isfinite(value):
        return "missing"
    if value < -20:
        return "ITM >20"
    if value < -5:
        return "ITM 5-20"
    if value <= 5:
        return "ATM +/-5"
    if value <= 20:
        return "OTM 5-20"
    if value <= 40:
        return "OTM 20-40"
    if value <= 60:
        return "OTM 40-60"
    return "OTM >60"


def add_exact_spx(options: pd.DataFrame, spx: pd.DataFrame) -> pd.DataFrame:
    options["entry_at"] = pd.to_datetime(options["entry_at"], utc=True)
    spx["spx_ts"] = pd.to_datetime(spx["ts_event"], utc=True)
    spx = spx.rename(columns={"open": "spx_open", "high": "spx_high", "low": "spx_low", "close": "spx_close", "volume": "spx_volume"})
    joined = pd.merge_asof(
        options.sort_values("entry_at"),
        spx[["spx_ts", "spx_open", "spx_high", "spx_low", "spx_close", "spx_volume"]].sort_values("spx_ts"),
        left_on="entry_at",
        right_on="spx_ts",
        direction="nearest",
        tolerance=pd.Timedelta(minutes=2),
    )
    joined["es_to_spx_basis"] = joined["underlying_entry"] - joined["spx_close"]
    joined["abs_basis"] = joined["es_to_spx_basis"].abs()
    joined["actual_spx_offset"] = np.where(
        joined["side"].eq("CALL"),
        joined["strike"] - joined["spx_close"],
        joined["spx_close"] - joined["strike"],
    )
    joined["actual_spx_offset_abs"] = joined["actual_spx_offset"].abs()
    joined["actual_spx_offset_bucket"] = joined["actual_spx_offset"].map(bucket_offset)
    joined["spx_match_lag_seconds"] = (joined["entry_at"] - joined["spx_ts"]).dt.total_seconds().abs()
    return joined


def summary_table(df: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    found = df[df["quote_found"] == True].copy()
    return (
        found.groupby(group_cols, observed=True)
        .agg(
            samples=("signal_id", "size"),
            signals=("signal_id", "nunique"),
            median_basis=("es_to_spx_basis", "median"),
            median_actual_offset=("actual_spx_offset", "median"),
            median_ask=("entry_ask", "median"),
            avg_max_gain_pct=("max_gain_high_from_ask_pct", "mean"),
            median_max_gain_pct=("max_gain_high_from_ask_pct", "median"),
            hit_20_pct=("max_gain_high_from_ask_pct", lambda s: (s >= 20).mean() * 100),
            avg_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "mean"),
            median_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "median"),
        )
        .round(2)
        .reset_index()
    )


def write_report(df: pd.DataFrame) -> None:
    found = df[df["quote_found"] == True].copy()
    signals = found.drop_duplicates("signal_id").copy()
    fixed = summary_table(found, ["side", "offset"])
    actual = summary_table(found, ["side", "actual_spx_offset_bucket"])
    regime = summary_table(found, ["vix_regime", "actual_spx_offset_bucket"])

    lines: list[str] = []
    lines.append("# SPXW Contract Selection With Exact SPX")
    lines.append("")
    lines.append("## Headline")
    lines.append("The paid Polygon/Massive Indices entitlement fixed the main precision problem. We can now keep ES for signal detection while selecting SPXW contracts from exact same-minute SPX cash.")
    lines.append("")
    lines.append("## Basis Summary")
    lines.append(f"- Signals with matched SPX minute: {signals['spx_close'].notna().sum()} of {signals['signal_id'].nunique()}")
    lines.append(f"- Median ES minus SPX basis: {signals['es_to_spx_basis'].median():.2f} points")
    lines.append(f"- Mean ES minus SPX basis: {signals['es_to_spx_basis'].mean():.2f} points")
    lines.append(f"- 10th to 90th percentile basis: {signals['es_to_spx_basis'].quantile(0.10):.2f} to {signals['es_to_spx_basis'].quantile(0.90):.2f} points")
    lines.append(f"- Max absolute basis in sample: {signals['abs_basis'].max():.2f} points")
    lines.append(f"- Median SPX match lag: {signals['spx_match_lag_seconds'].median():.0f} seconds")
    lines.append("")
    lines.append("## Original ES-Based Offset Results Reclassified")
    lines.append("Note: negative values in the moneyness tables do not mean SPX was above ES. Basis is always computed as ES entry minus SPX. Negative moneyness means the selected put strike was in-the-money versus SPX.")
    lines.append(fixed.to_markdown(index=False))
    lines.append("")
    lines.append("## Actual SPX Moneyness Results")
    lines.append(actual.to_markdown(index=False))
    lines.append("")
    lines.append("## Actual SPX Moneyness by VIX Regime")
    lines.append(regime.to_markdown(index=False))
    lines.append("")
    lines.append("## Production Update")
    lines.append("1. ES remains the signal source.")
    lines.append("2. SPX exact minute close becomes the contract-selection anchor.")
    lines.append("3. Strike ladder should be built from SPX, then filtered by premium, spread, and VIX regime.")
    lines.append("4. The app should label moneyness as SPX-based, not ES-based.")
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    options = pd.read_csv(ANALYSIS_IN)
    spx = pd.read_csv(SPX_BARS)
    out = add_exact_spx(options, spx)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    write_report(out)
    print(OUT)
    print(REPORT)


if __name__ == "__main__":
    main()
