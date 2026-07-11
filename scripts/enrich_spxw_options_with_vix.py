#!/usr/bin/env python3
"""Join VIX context to the SPXW 0DTE option-selection pilot."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import yfinance as yf


DEFAULT_IN = Path("data/databento/opra_spxw_year_cbbo/spxw_pilot_analysis.csv")
DEFAULT_OUT = Path("data/databento/opra_spxw_year_cbbo/spxw_pilot_analysis_with_vix.csv")
DEFAULT_REPORT = Path("data/databento/opra_spxw_year_cbbo/spxw_vix_contract_selection_summary.md")
ET_TZ = "America/New_York"
CBOE_VIX_HISTORY_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"


def flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    return df


def fetch_vix(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    # Daily VIX history is available over the full sample. Intraday Yahoo VIX is
    # not consistently available for one year, so this is session-regime context.
    try:
        raw = pd.read_csv(CBOE_VIX_HISTORY_URL)
        raw["trade_date"] = pd.to_datetime(raw["DATE"], format="%m/%d/%Y").dt.date.astype(str)
        raw = raw.rename(columns={"OPEN": "vix_open", "HIGH": "vix_high", "LOW": "vix_low", "CLOSE": "vix_close"})
        return raw[["trade_date", "vix_open", "vix_high", "vix_low", "vix_close"]]
    except Exception:
        raw = yf.download(
            "^VIX",
            start=start.date().isoformat(),
            end=(end + pd.Timedelta(days=2)).date().isoformat(),
            interval="1d",
            auto_adjust=False,
            progress=False,
        )
        if raw.empty:
            raise SystemExit("Could not download VIX daily history.")
        raw = flatten_columns(raw).reset_index()
        raw["trade_date"] = pd.to_datetime(raw["Date"]).dt.date.astype(str)
        raw = raw.rename(
            columns={
                "Open": "vix_open",
                "High": "vix_high",
                "Low": "vix_low",
                "Close": "vix_close",
                "Volume": "vix_volume",
            }
        )
        keep = ["trade_date", "vix_open", "vix_high", "vix_low", "vix_close", "vix_volume"]
        return raw[keep]


def add_regime(df: pd.DataFrame) -> pd.DataFrame:
    bins = [-float("inf"), 15, 20, 25, float("inf")]
    labels = ["low <15", "normal 15-20", "elevated 20-25", "high >25"]
    df["vix_regime"] = pd.cut(df["vix_open"], bins=bins, labels=labels)
    return df


def table(df: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    return (
        df.groupby(group_cols, observed=True)
        .agg(
            samples=("signal_id", "size"),
            signals=("signal_id", "nunique"),
            median_vix_open=("vix_open", "median"),
            median_ask=("entry_ask", "median"),
            avg_spread=("entry_spread", "mean"),
            avg_max_gain_pct=("max_gain_high_from_ask_pct", "mean"),
            median_max_gain_pct=("max_gain_high_from_ask_pct", "median"),
            hit_20_pct=("max_gain_high_from_ask_pct", lambda s: (s >= 20).mean() * 100),
            hit_50_pct=("max_gain_high_from_ask_pct", lambda s: (s >= 50).mean() * 100),
            avg_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "mean"),
            median_exit_gain_pct=("gain_to_exit_bid_from_ask_pct", "median"),
            median_drawdown_pct=("max_drawdown_mark_pct", "median"),
        )
        .round(2)
        .reset_index()
    )


def write_report(df: pd.DataFrame, report_path: Path) -> None:
    found = df[df["quote_found"] == True].copy()
    found["ask_band"] = pd.cut(
        found["entry_ask"],
        bins=[0, 0.5, 1, 2, 5, 10, 20, 50, 999],
        labels=["<=0.50", "0.50-1", "1-2", "2-5", "5-10", "10-20", "20-50", "50+"],
        include_lowest=True,
    )

    lines: list[str] = []
    lines.append("# SPXW 0DTE Contract Selection With VIX")
    lines.append("")
    lines.append("## Headline")
    lines.append(
        "Yes, volatility changes the contract choice. In this sample, VIX mainly explains why the same point-distance contract can have a very different ask price. The production selector should use distance plus live premium plus VIX regime, not distance alone."
    )
    lines.append("")
    lines.append("## Data")
    lines.append(f"- Option candidate rows with quotes: {len(found)}")
    lines.append(f"- Signals with quotes: {found['signal_id'].nunique()}")
    lines.append(f"- VIX source: Cboe daily VIX history, joined by trade date.")
    lines.append(f"- VIX date coverage: {found['trade_date'].min()} to {found['trade_date'].max()}")
    lines.append("")
    lines.append("## VIX Regime Results")
    lines.append(table(found, ["vix_regime"]).to_markdown(index=False))
    lines.append("")
    lines.append("## VIX Regime by Side")
    lines.append(table(found, ["side", "vix_regime"]).to_markdown(index=False))
    lines.append("")
    lines.append("## VIX Regime by Premium Band")
    lines.append(table(found, ["vix_regime", "ask_band"]).to_markdown(index=False))
    lines.append("")
    lines.append("## VIX Regime by Fixed Offset")
    lines.append(table(found, ["vix_regime", "side", "offset"]).to_markdown(index=False))
    lines.append("")
    lines.append("## Production Rule Update")
    lines.append("1. Keep the premium filter. The strongest practical band remains roughly $2 to $10 ask.")
    lines.append("2. Add VIX as a context adjustment. When VIX is elevated, expect the same strike distance to cost more, so choose by premium band first and offset second.")
    lines.append("3. On low-VIX days, avoid going too far OTM just to make the contract cheap. Cheap contracts below $0.50 still behaved poorly.")
    lines.append("4. On high-VIX days, allow a wider strike offset only if the ask and spread stay inside the executable band.")
    lines.append("5. The next upgrade is exact intraday VIX or VX futures at entry time. Daily VIX is enough for regime, not minute-by-minute pricing.")
    report_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    df = pd.read_csv(DEFAULT_IN)
    df["entry_at"] = pd.to_datetime(df["entry_at"], utc=True)
    df["entry_et"] = df["entry_at"].dt.tz_convert(ET_TZ)
    df["trade_date"] = df["entry_et"].dt.date.astype(str)
    vix = fetch_vix(df["entry_at"].min(), df["entry_at"].max())
    out = df.merge(vix, on="trade_date", how="left")
    out = add_regime(out)
    DEFAULT_OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(DEFAULT_OUT, index=False)
    vix.to_csv(DEFAULT_OUT.with_name("vix_daily_cboe.csv"), index=False)
    write_report(out, DEFAULT_REPORT)
    print(DEFAULT_OUT)
    print(DEFAULT_REPORT)


if __name__ == "__main__":
    main()
