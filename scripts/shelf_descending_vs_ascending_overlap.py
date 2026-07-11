"""Test whether ascending low-family shelves add independent edge.

This answers the trader's current hypothesis:

    Apparent ascending-shelf reactions are mostly reactions to a descending
    high-family shelf, or one of its +/-34 point parallels, at the same price.

The test uses ES 1-minute data, RTH highs/lows as prior-session anchors,
1.04 points per trading hour, and 34 point shelf spacing.  It evaluates RTH
1-minute swing reactions and compares:

    - prior RTH high anchors, descending
    - prior RTH low anchors, ascending
    - prior RTH low anchors, descending, as a secondary geometry check

No lookahead is used for shelf anchors: a bar can only see completed prior RTH
sessions. Reaction quality is measured after the swing prints.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


SLOPE_PER_HOUR = 1.04
BAND = 34.0
PER_MINUTE_BAR = SLOPE_PER_HOUR / 60.0
RTH_OPEN_MIN_ET = 9 * 60 + 30
RTH_CLOSE_MIN_ET = 16 * 60


@dataclass(frozen=True)
class ShelfHit:
    dist: float
    level: float
    shelf_index: int
    anchor_date: str
    anchor_weekday: str
    anchor_price: float
    anchor_bar: int
    family: str


def load_es(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["ts_event"] = pd.to_datetime(df["ts_event"], utc=True)
    df = df.sort_values("ts_event").drop_duplicates("ts_event").reset_index(drop=True)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    df["bar"] = np.arange(len(df), dtype=np.int64)
    df["et"] = df["ts_event"].dt.tz_convert("America/New_York")
    mins = df["et"].dt.hour * 60 + df["et"].dt.minute
    df["rth"] = (
        (df["et"].dt.weekday < 5)
        & (mins >= RTH_OPEN_MIN_ET)
        & (mins <= RTH_CLOSE_MIN_ET)
    )
    df["rth_date"] = df["et"].dt.date.astype(str)
    df["weekday"] = df["et"].dt.day_name()
    return df


def daily_rth(df: pd.DataFrame) -> pd.DataFrame:
    rth = df[df["rth"]].copy()
    high_idx = rth.groupby("rth_date", sort=True)["high"].idxmax()
    low_idx = rth.groupby("rth_date", sort=True)["low"].idxmin()
    high_rows = rth.loc[high_idx, ["rth_date", "weekday", "high", "bar", "et"]].rename(
        columns={"high": "rth_high", "bar": "high_bar", "et": "high_et"}
    )
    low_rows = rth.loc[low_idx, ["rth_date", "low", "bar", "et"]].rename(
        columns={"low": "rth_low", "bar": "low_bar", "et": "low_et"}
    )
    stats = (
        rth.groupby("rth_date", sort=True)
        .agg(
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            first_bar=("bar", "min"),
            last_bar=("bar", "max"),
        )
        .reset_index()
    )
    out = stats.merge(high_rows, on="rth_date").merge(low_rows, on="rth_date")
    out["date"] = pd.to_datetime(out["rth_date"])
    return out.sort_values("date").reset_index(drop=True)


def prior_sessions(daily: pd.DataFrame, target_date: str, n: int = 5) -> pd.DataFrame:
    idx = daily.index[daily["rth_date"] == target_date]
    if len(idx) == 0:
        return daily.iloc[0:0]
    pos = int(idx[0])
    return daily.iloc[max(0, pos - n) : pos]


def nearest_from_family(
    price: float,
    bar: int,
    anchors: Iterable[dict],
    family: str,
) -> ShelfHit | None:
    best: ShelfHit | None = None
    for a in anchors:
        if family == "high_desc":
            base = float(a["rth_high"]) - PER_MINUTE_BAR * (bar - int(a["high_bar"]))
            anchor_price = float(a["rth_high"])
            anchor_bar = int(a["high_bar"])
        elif family == "low_asc":
            base = float(a["rth_low"]) + PER_MINUTE_BAR * (bar - int(a["low_bar"]))
            anchor_price = float(a["rth_low"])
            anchor_bar = int(a["low_bar"])
        elif family == "low_desc":
            base = float(a["rth_low"]) - PER_MINUTE_BAR * (bar - int(a["low_bar"]))
            anchor_price = float(a["rth_low"])
            anchor_bar = int(a["low_bar"])
        else:
            raise ValueError(f"unknown family {family}")

        k0 = int(round((price - base) / BAND))
        for k in (k0 - 1, k0, k0 + 1):
            level = base + k * BAND
            dist = abs(price - level)
            if best is None or dist < best.dist:
                best = ShelfHit(
                    dist=float(dist),
                    level=float(level),
                    shelf_index=int(k),
                    anchor_date=str(a["rth_date"]),
                    anchor_weekday=str(a["weekday"]),
                    anchor_price=anchor_price,
                    anchor_bar=anchor_bar,
                    family=family,
                )
    return best


def make_pivots(df: pd.DataFrame, left: int = 5, right: int = 5, horizon: int = 120) -> pd.DataFrame:
    r = df[df["rth"]].copy().reset_index(drop=False).rename(columns={"index": "df_index"})
    highs = r["high"].to_numpy()
    lows = r["low"].to_numpy()
    rows: list[dict] = []

    for i in range(left, len(r) - right):
        window_h = highs[i - left : i + right + 1]
        window_l = lows[i - left : i + right + 1]
        is_high = highs[i] >= window_h.max() and highs[i] > max(highs[i - 1], highs[i + 1])
        is_low = lows[i] <= window_l.min() and lows[i] < min(lows[i - 1], lows[i + 1])
        if not (is_high or is_low):
            continue

        day = r.at[i, "rth_date"]
        future = r.iloc[i + 1 : i + 1 + horizon]
        future = future[future["rth_date"] == day]
        if len(future) < 10:
            continue

        if is_high:
            price = float(r.at[i, "high"])
            away = price - float(future["low"].min())
            adverse = float(future["high"].max()) - price
            rows.append(
                {
                    "kind": "resistance",
                    "rth_date": day,
                    "weekday": r.at[i, "weekday"],
                    "bar": int(r.at[i, "bar"]),
                    "et": r.at[i, "et"],
                    "price": price,
                    "away": away,
                    "adverse": adverse,
                    "win10": away >= 10.0,
                    "win17": away >= 17.0,
                    "win34": away >= 34.0,
                }
            )
        if is_low:
            price = float(r.at[i, "low"])
            away = float(future["high"].max()) - price
            adverse = price - float(future["low"].min())
            rows.append(
                {
                    "kind": "support",
                    "rth_date": day,
                    "weekday": r.at[i, "weekday"],
                    "bar": int(r.at[i, "bar"]),
                    "et": r.at[i, "et"],
                    "price": price,
                    "away": away,
                    "adverse": adverse,
                    "win10": away >= 10.0,
                    "win17": away >= 17.0,
                    "win34": away >= 34.0,
                }
            )
    return pd.DataFrame(rows)


def attribute(pivots: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    for row in pivots.itertuples(index=False):
        pri = prior_sessions(daily, row.rth_date, 5)
        anchors = pri.to_dict("records")
        if not anchors:
            continue
        hd = nearest_from_family(float(row.price), int(row.bar), anchors, "high_desc")
        la = nearest_from_family(float(row.price), int(row.bar), anchors, "low_asc")
        ld = nearest_from_family(float(row.price), int(row.bar), anchors, "low_desc")
        if hd is None or la is None or ld is None:
            continue
        rows.append(
            {
                **row._asdict(),
                "desc_high_dist": hd.dist,
                "desc_high_level": hd.level,
                "desc_high_anchor_date": hd.anchor_date,
                "desc_high_anchor_weekday": hd.anchor_weekday,
                "desc_high_shelf": hd.shelf_index,
                "asc_low_dist": la.dist,
                "asc_low_level": la.level,
                "asc_low_anchor_date": la.anchor_date,
                "asc_low_anchor_weekday": la.anchor_weekday,
                "asc_low_shelf": la.shelf_index,
                "low_desc_dist": ld.dist,
                "low_desc_level": ld.level,
                "asc_vs_desc_high_level_gap": abs(la.level - hd.level),
                "asc_vs_low_desc_level_gap": abs(la.level - ld.level),
            }
        )
    return pd.DataFrame(rows)


def rate(s: pd.Series) -> float:
    return float(s.mean() * 100.0) if len(s) else float("nan")


def summarize_group(df: pd.DataFrame, mask: pd.Series, name: str) -> dict:
    g = df[mask]
    return {
        "bucket": name,
        "events": int(len(g)),
        "support": int((g["kind"] == "support").sum()) if len(g) else 0,
        "resistance": int((g["kind"] == "resistance").sum()) if len(g) else 0,
        "win10_rate": rate(g["win10"]) if len(g) else np.nan,
        "win17_rate": rate(g["win17"]) if len(g) else np.nan,
        "win34_rate": rate(g["win34"]) if len(g) else np.nan,
        "median_away": float(g["away"].median()) if len(g) else np.nan,
        "median_adverse": float(g["adverse"].median()) if len(g) else np.nan,
    }


def build_summaries(a: pd.DataFrame, tolerances: list[float]) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows: list[dict] = []
    asc_rows: list[dict] = []
    for tol in tolerances:
        desc = a["desc_high_dist"] <= tol
        asc = a["asc_low_dist"] <= tol
        low_desc = a["low_desc_dist"] <= tol
        both = asc & desc
        asc_only = asc & ~desc
        desc_only = desc & ~asc
        asc_level_cross = asc & (a["asc_vs_desc_high_level_gap"] <= tol)
        asc_level_near_desc_band = asc & (a["asc_vs_desc_high_level_gap"] <= 2 * tol)
        low_asc_same_as_low_desc = asc & (a["asc_vs_low_desc_level_gap"] <= tol)

        for name, mask in [
            ("all pivots", pd.Series(True, index=a.index)),
            ("descending high near", desc),
            ("ascending low near", asc),
            ("both high-desc and low-asc", both),
            ("descending high only", desc_only),
            ("ascending low only", asc_only),
            ("low descending near", low_desc),
        ]:
            rec = summarize_group(a, mask, name)
            rec["tolerance"] = tol
            rows.append(rec)

        asc_n = int(asc.sum())
        asc_success = asc & a["win17"]
        asc_rows.append(
            {
                "tolerance": tol,
                "asc_low_near": asc_n,
                "asc_explained_strict_by_desc_high": int(both.sum()),
                "asc_explained_strict_pct": float(both.sum() * 100.0 / asc_n) if asc_n else np.nan,
                "asc_level_crosses_desc_high": int(asc_level_cross.sum()),
                "asc_level_cross_pct": float(asc_level_cross.sum() * 100.0 / asc_n) if asc_n else np.nan,
                "asc_within_2tol_of_desc_high": int(asc_level_near_desc_band.sum()),
                "asc_within_2tol_pct": float(asc_level_near_desc_band.sum() * 100.0 / asc_n) if asc_n else np.nan,
                "asc_same_as_low_desc": int(low_asc_same_as_low_desc.sum()),
                "asc_same_as_low_desc_pct": float(low_asc_same_as_low_desc.sum() * 100.0 / asc_n) if asc_n else np.nan,
                "asc_win17_events": int(asc_success.sum()),
                "asc_win17_explained_by_desc": int((asc_success & desc).sum()),
                "asc_win17_explained_pct": float((asc_success & desc).sum() * 100.0 / asc_success.sum()) if asc_success.sum() else np.nan,
                "asc_only_events": int(asc_only.sum()),
                "asc_only_win17_rate": rate(a.loc[asc_only, "win17"]) if asc_only.sum() else np.nan,
                "desc_high_dist_median_when_asc_near": float(a.loc[asc, "desc_high_dist"].median()) if asc_n else np.nan,
                "desc_high_level_gap_median_when_asc_near": float(a.loc[asc, "asc_vs_desc_high_level_gap"].median()) if asc_n else np.nan,
            }
        )
    return pd.DataFrame(rows), pd.DataFrame(asc_rows)


def fmt_pct(v: float) -> str:
    return "-" if pd.isna(v) else f"{v:.1f}%"


def markdown_table(df: pd.DataFrame, max_rows: int = 200) -> str:
    if len(df) > max_rows:
        df = df.head(max_rows)
    return df.to_markdown(index=False)


def write_report(out: Path, data_path: Path, attributed: pd.DataFrame, summary: pd.DataFrame, asc_summary: pd.DataFrame) -> None:
    chosen = asc_summary[asc_summary["tolerance"] == 6.0].iloc[0]
    sum6 = summary[summary["tolerance"] == 6.0].copy()
    lines = [
        "# Descending vs Ascending Shelf Overlap Test",
        "",
        "## Headline",
        (
            f"At 6 ES points of tolerance, {chosen['asc_explained_strict_pct']:.1f}% of "
            f"ascending-low shelf touches were also within tolerance of a descending "
            f"RTH-high shelf, and {chosen['asc_win17_explained_pct']:.1f}% of the "
            f"ascending-low touches that moved 17+ points were explained by the "
            "descending high-family at the same price."
        ),
        "",
        "## Setup",
        f"- Data: `{data_path}`.",
        f"- Bars: ES 1-minute, `{attributed['rth_date'].min()}` to `{attributed['rth_date'].max()}`.",
        "- Session anchors: completed RTH daily highs and lows, 09:30-16:00 ET.",
        f"- Slope: `{SLOPE_PER_HOUR}` points per trading hour, counted by existing one-minute bars.",
        f"- Shelf spacing: `{BAND}` points.",
        "- Swing universe: RTH 1-minute pivots using 5 bars left and 5 bars right.",
        "- Reaction test: after a swing, did price move away 10, 17, or 34 points within the next 120 RTH minutes.",
        "- Shelf candidates visible to a bar: only the prior 5 completed RTH sessions. No same-day completed high/low is used.",
        "",
        "## Ascending Shelf Explanation Test",
        markdown_table(
            asc_summary.assign(
                asc_explained_strict_pct=asc_summary["asc_explained_strict_pct"].map(fmt_pct),
                asc_level_cross_pct=asc_summary["asc_level_cross_pct"].map(fmt_pct),
                asc_within_2tol_pct=asc_summary["asc_within_2tol_pct"].map(fmt_pct),
                asc_same_as_low_desc_pct=asc_summary["asc_same_as_low_desc_pct"].map(fmt_pct),
                asc_win17_explained_pct=asc_summary["asc_win17_explained_pct"].map(fmt_pct),
                asc_only_win17_rate=asc_summary["asc_only_win17_rate"].map(fmt_pct),
            )
        ),
        "",
        "## Touch Quality By Bucket",
        markdown_table(
            sum6.assign(
                win10_rate=sum6["win10_rate"].map(fmt_pct),
                win17_rate=sum6["win17_rate"].map(fmt_pct),
                win34_rate=sum6["win34_rate"].map(fmt_pct),
            )
        ),
        "",
        "## Support-Only Check",
        "This isolates the exact case where a green ascending shelf would be expected to matter.",
    ]

    support = attributed[attributed["kind"] == "support"].copy()
    support_summary, support_asc = build_summaries(support, [4.0, 6.0, 8.0])
    lines.extend(
        [
            markdown_table(
                support_asc.assign(
                    asc_explained_strict_pct=support_asc["asc_explained_strict_pct"].map(fmt_pct),
                    asc_level_cross_pct=support_asc["asc_level_cross_pct"].map(fmt_pct),
                    asc_within_2tol_pct=support_asc["asc_within_2tol_pct"].map(fmt_pct),
                    asc_same_as_low_desc_pct=support_asc["asc_same_as_low_desc_pct"].map(fmt_pct),
                    asc_win17_explained_pct=support_asc["asc_win17_explained_pct"].map(fmt_pct),
                    asc_only_win17_rate=support_asc["asc_only_win17_rate"].map(fmt_pct),
                )
            ),
            "",
            "## Interpretation",
            "- If the ascending-only bucket is small and does not beat the descending/both buckets, the ascending line should not be a primary beginner-facing object.",
            "- If most ascending winners are also descending-shelf touches, the clean indicator should draw the descending family and label the crossing as confluence only.",
            "- The low-family ascending shelf can remain as hidden research context or an optional advanced overlay, but the default chart should not teach it as an independent trade line unless the ascending-only bucket proves edge.",
        ]
    )
    (out / "descending_vs_ascending_report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    data_path = root / "data" / "databento" / "ES_ohlcv-1m_2025-06-18_2026-06-17.csv"
    out = root / "outputs" / "control_grid" / "descending_vs_ascending_overlap"
    out.mkdir(parents=True, exist_ok=True)

    df = load_es(data_path)
    daily = daily_rth(df)
    pivots = make_pivots(df, left=5, right=5, horizon=120)
    attributed = attribute(pivots, daily)
    summary, asc_summary = build_summaries(attributed, [4.0, 6.0, 8.0])

    daily.to_csv(out / "daily_rth_anchors.csv", index=False)
    pivots.to_csv(out / "rth_1m_pivots.csv", index=False)
    attributed.to_csv(out / "shelf_attribution_events.csv", index=False)
    summary.to_csv(out / "touch_quality_by_bucket.csv", index=False)
    asc_summary.to_csv(out / "ascending_explanation_summary.csv", index=False)
    write_report(out, data_path, attributed, summary, asc_summary)

    print((out / "descending_vs_ascending_report.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
