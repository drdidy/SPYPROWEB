#!/usr/bin/env python3
"""Join SPY*10 cash proxy basis to SPXW option candidate analysis.

The strategy signals are ES-derived. SPXW contracts settle on SPX cash, so a
strike ladder built directly from ES can be materially shifted by the futures
basis. This script does not pretend SPY*10 is exact SPX, but it is a same-minute
cash-market proxy and is much closer to the SPX option underlier than ES alone.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


ANALYSIS_IN = Path("data/databento/opra_spxw_year_cbbo/spxw_pilot_analysis_with_vix.csv")
SPY_BARS = Path("data/databento/SPY_EQUS_MINI_ohlcv-1m_2025-06-18_2026-06-17.csv")
OUT = Path("data/databento/opra_spxw_year_cbbo/spxw_pilot_analysis_with_spy_cash_proxy.csv")
REPORT = Path("data/databento/opra_spxw_year_cbbo/spxw_cash_proxy_basis_report.md")


def nearest_join(options: pd.DataFrame, spy: pd.DataFrame) -> pd.DataFrame:
    options = options.sort_values("entry_at").copy()
    spy = spy.sort_values("spy_ts").copy()
    return pd.merge_asof(
        options,
        spy,
        left_on="entry_at",
        right_on="spy_ts",
        direction="nearest",
        tolerance=pd.Timedelta(minutes=2),
    )


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


def add_cash_proxy(options: pd.DataFrame, spy: pd.DataFrame) -> pd.DataFrame:
    options["entry_at"] = pd.to_datetime(options["entry_at"], utc=True)
    spy["spy_ts"] = pd.to_datetime(spy["ts_event"], utc=True)
    spy = spy.rename(columns={"open": "spy_open", "high": "spy_high", "low": "spy_low", "close": "spy_close", "volume": "spy_volume"})
    joined = nearest_join(options, spy[["spy_ts", "spy_open", "spy_high", "spy_low", "spy_close", "spy_volume"]])
    joined["spx_cash_proxy"] = joined["spy_close"] * 10.0
    joined["es_to_spx_proxy_basis"] = joined["underlying_entry"] - joined["spx_cash_proxy"]
    joined["abs_basis"] = joined["es_to_spx_proxy_basis"].abs()
    joined["actual_cash_offset"] = np.where(
        joined["side"].eq("CALL"),
        joined["strike"] - joined["spx_cash_proxy"],
        joined["spx_cash_proxy"] - joined["strike"],
    )
    joined["actual_cash_offset_abs"] = joined["actual_cash_offset"].abs()
    joined["actual_cash_offset_bucket"] = joined["actual_cash_offset"].map(bucket_offset)
    joined["spy_match_lag_seconds"] = (joined["entry_at"] - joined["spy_ts"]).dt.total_seconds().abs()
    return joined


def summary_table(df: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    found = df[df["quote_found"] == True].copy()
    return (
        found.groupby(group_cols, observed=True)
        .agg(
            samples=("signal_id", "size"),
            signals=("signal_id", "nunique"),
            median_basis=("es_to_spx_proxy_basis", "median"),
            median_actual_offset=("actual_cash_offset", "median"),
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
    actual = summary_table(found, ["side", "actual_cash_offset_bucket"])
    regime = summary_table(found, ["vix_regime", "actual_cash_offset_bucket"])

    lines: list[str] = []
    lines.append("# SPXW Contract Selection With ES to Cash Proxy Basis")
    lines.append("")
    lines.append("## Headline")
    lines.append(
        "Yes, the strike ladder should be anchored to SPX cash, not ES. Using ES directly shifted the selected SPXW contracts by the futures basis. SPY*10 is not exact SPX, but it gives a same-minute cash proxy that materially improves the moneyness classification."
    )
    lines.append("")
    lines.append("## Basis Summary")
    lines.append(f"- Signals with matched SPY minute: {signals['spy_close'].notna().sum()} of {signals['signal_id'].nunique()}")
    lines.append(f"- Median ES minus SPY*10 basis: {signals['es_to_spx_proxy_basis'].median():.2f} points")
    lines.append(f"- Mean ES minus SPY*10 basis: {signals['es_to_spx_proxy_basis'].mean():.2f} points")
    lines.append(f"- 10th to 90th percentile basis: {signals['es_to_spx_proxy_basis'].quantile(0.10):.2f} to {signals['es_to_spx_proxy_basis'].quantile(0.90):.2f} points")
    lines.append(f"- Max absolute basis in sample: {signals['abs_basis'].max():.2f} points")
    lines.append("")
    lines.append("## Why This Matters")
    lines.append(
        "A 20-point ES-based call can become a much farther OTM SPXW call if ES is trading above cash by 20 to 40 points. That is exactly why some cheap contracts looked dead even when the underlying idea was right."
    )
    lines.append("")
    lines.append("## Original Fixed Offset Results Reclassified")
    lines.append(fixed.to_markdown(index=False))
    lines.append("")
    lines.append("## Actual Cash-Proxy Moneyness Results")
    lines.append(actual.to_markdown(index=False))
    lines.append("")
    lines.append("## Actual Moneyness by VIX Regime")
    lines.append(regime.to_markdown(index=False))
    lines.append("")
    lines.append("## Production Update")
    lines.append("1. Keep ES for signal detection if that is where the edge lives.")
    lines.append("2. At signal time, read SPX cash or the best available cash proxy.")
    lines.append("3. Build SPXW strikes from cash, not ES.")
    lines.append("4. Choose the final contract by cash moneyness, ask premium, spread, and VIX regime.")
    lines.append("5. Replace SPY*10 with exact SPX index when a reliable intraday SPX source is added.")
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    options = pd.read_csv(ANALYSIS_IN)
    spy = pd.read_csv(SPY_BARS)
    out = add_cash_proxy(options, spy)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    write_report(out)
    print(OUT)
    print(REPORT)


if __name__ == "__main__":
    main()
