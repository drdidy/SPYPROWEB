import math
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "databento" / "ES_ohlcv-1m_2025-06-18_2026-06-17.csv"
OUT = ROOT / "outputs" / "ema_cross_time_blocks"
CT = "America/Chicago"


def hm(minute: int) -> str:
    minute %= 1440
    return f"{minute // 60:02d}:{minute % 60:02d}"


def in_window(mins: pd.Series, start: int, duration: int) -> pd.Series:
    end = (start + duration) % 1440
    if duration >= 1440:
        return pd.Series(True, index=mins.index)
    if end > start:
        return (mins >= start) & (mins < end)
    return (mins >= start) | (mins < end)


def session_name(minute: int) -> str:
    if 17 * 60 <= minute or minute < 1 * 60 + 30:
        return "Asia"
    if 1 * 60 + 30 <= minute < 8 * 60 + 30:
        return "London"
    if 8 * 60 + 30 <= minute < 15 * 60:
        return "New York"
    return "Late/maintenance"


def load_bars() -> pd.DataFrame:
    df = pd.read_csv(DATA, usecols=["ts_event", "open", "high", "low", "close", "volume"])
    df["ts_event"] = pd.to_datetime(df["ts_event"], utc=True)
    df["ct"] = df["ts_event"].dt.tz_convert(CT)
    df["ct_date"] = df["ct"].dt.date.astype(str)
    df["ct_minute"] = df["ct"].dt.hour * 60 + df["ct"].dt.minute
    df["ema21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema50"] = df["close"].ewm(span=50, adjust=False).mean()
    prev_fast = df["ema21"].shift(1)
    prev_slow = df["ema50"].shift(1)
    df["cross_up"] = (prev_fast <= prev_slow) & (df["ema21"] > df["ema50"])
    df["cross_down"] = (prev_fast >= prev_slow) & (df["ema21"] < df["ema50"])
    df["cross_dir"] = 0
    df.loc[df["cross_up"], "cross_dir"] = 1
    df.loc[df["cross_down"], "cross_dir"] = -1
    return df


def simulate_followthrough(df: pd.DataFrame, target_pts: float, stop_pts: float, max_minutes: int) -> pd.DataFrame:
    crosses = df.index[df["cross_dir"] != 0].tolist()
    rows = []
    for idx in crosses:
        row = df.loc[idx]
        direction = int(row["cross_dir"])
        entry = float(row["close"])
        target = entry + direction * target_pts
        stop = entry - direction * stop_pts
        end_idx = min(len(df) - 1, idx + max_minutes)
        result = "timeout"
        exit_minutes = None
        max_fav = 0.0
        max_adv = 0.0
        for j in range(idx + 1, end_idx + 1):
            bar = df.loc[j]
            if direction == 1:
                max_fav = max(max_fav, float(bar["high"]) - entry)
                max_adv = max(max_adv, entry - float(bar["low"]))
                if float(bar["high"]) >= target:
                    result = "win"
                    exit_minutes = j - idx
                    break
                if float(bar["low"]) <= stop:
                    result = "loss"
                    exit_minutes = j - idx
                    break
            else:
                max_fav = max(max_fav, entry - float(bar["low"]))
                max_adv = max(max_adv, float(bar["high"]) - entry)
                if float(bar["low"]) <= target:
                    result = "win"
                    exit_minutes = j - idx
                    break
                if float(bar["high"]) >= stop:
                    result = "loss"
                    exit_minutes = j - idx
                    break
        rows.append(
            {
                "idx": idx,
                "ct": row["ct"],
                "ct_date": row["ct_date"],
                "ct_minute": int(row["ct_minute"]),
                "session": session_name(int(row["ct_minute"])),
                "direction": "long" if direction == 1 else "short",
                "entry": entry,
                "result": result,
                "exit_minutes": exit_minutes,
                "mfe_pts": max_fav,
                "mae_pts": max_adv,
            }
        )
    return pd.DataFrame(rows)


def cross_density(df: pd.DataFrame) -> pd.DataFrame:
    cross = df[df["cross_dir"] != 0][["ct_date", "ct_minute", "cross_dir"]].copy()
    out = []
    for duration in [30, 45, 60, 90, 120]:
        for start in range(0, 1440, 15):
            if 16 * 60 <= start < 17 * 60:
                continue
            bar_days = df.loc[in_window(df["ct_minute"], start, duration), "ct_date"].nunique()
            mask = in_window(cross["ct_minute"], start, duration)
            w = cross[mask]
            by_day = w.groupby("ct_date")["cross_dir"].agg(
                crosses="count",
                up=lambda s: int((s == 1).sum()),
                down=lambda s: int((s == -1).sum()),
            )
            active_days = int(bar_days)
            if active_days == 0:
                continue
            days_ge2 = int((by_day["crosses"] >= 2).sum()) if len(by_day) else 0
            both_dir = int(((by_day["up"] > 0) & (by_day["down"] > 0)).sum()) if len(by_day) else 0
            total = int(len(w))
            avg = total / active_days
            pct_ge2 = days_ge2 * 100.0 / active_days
            pct_both = both_dir * 100.0 / active_days
            score = pct_both * 2.0 + pct_ge2 + avg * 10.0
            out.append(
                {
                    "session": session_name(start),
                    "window": f"{hm(start)}-{hm(start + duration)}",
                    "start_minute": start,
                    "duration_min": duration,
                    "days": active_days,
                    "total_crosses": total,
                    "avg_crosses_per_day": avg,
                    "pct_days_2plus_crosses": pct_ge2,
                    "pct_days_both_directions": pct_both,
                    "chop_score": score,
                }
            )
    return pd.DataFrame(out).sort_values(["chop_score", "total_crosses"], ascending=False)


def directional_windows(ft: pd.DataFrame, label: str) -> pd.DataFrame:
    out = []
    for duration in [30, 45, 60, 90, 120]:
        for start in range(0, 1440, 15):
            if 16 * 60 <= start < 17 * 60:
                continue
            w = ft[in_window(ft["ct_minute"], start, duration)]
            if len(w) < 30:
                continue
            decided = w[w["result"].isin(["win", "loss"])]
            if len(decided) < 20:
                continue
            wins = int((decided["result"] == "win").sum())
            losses = int((decided["result"] == "loss").sum())
            win_rate = wins * 100.0 / len(decided)
            timeout_rate = (len(w) - len(decided)) * 100.0 / len(w)
            avg_mfe = float(w["mfe_pts"].mean())
            avg_mae = float(w["mae_pts"].mean())
            out.append(
                {
                    "test": label,
                    "session": session_name(start),
                    "window": f"{hm(start)}-{hm(start + duration)}",
                    "start_minute": start,
                    "duration_min": duration,
                    "crosses": int(len(w)),
                    "decided": int(len(decided)),
                    "wins": wins,
                    "losses": losses,
                    "win_rate": win_rate,
                    "timeout_rate": timeout_rate,
                    "avg_mfe_pts": avg_mfe,
                    "avg_mae_pts": avg_mae,
                    "edge_score": win_rate - timeout_rate * 0.25 + math.log(len(decided), 10),
                }
            )
    return pd.DataFrame(out).sort_values(["win_rate", "decided", "edge_score"], ascending=False)


def summarize_session(df: pd.DataFrame, session: str, n: int = 12) -> pd.DataFrame:
    return df[df["session"] == session].head(n)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bars = load_bars()
    density = cross_density(bars)
    ft17 = simulate_followthrough(bars, 17.0, 17.0, 120)
    ft34 = simulate_followthrough(bars, 34.0, 17.0, 180)
    dir17 = directional_windows(ft17, "target17_stop17_120m")
    dir34 = directional_windows(ft34, "target34_stop17_180m")
    directional = pd.concat([dir17, dir34], ignore_index=True).sort_values(
        ["win_rate", "decided", "edge_score"], ascending=False
    )

    density.to_csv(OUT / "cross_density_windows.csv", index=False)
    ft17.to_csv(OUT / "cross_followthrough_17pt.csv", index=False)
    ft34.to_csv(OUT / "cross_followthrough_34pt.csv", index=False)
    directional.to_csv(OUT / "directional_windows.csv", index=False)

    lines = []
    lines.append("# 21/50 EMA Cross Time Block Study")
    lines.append("")
    lines.append(f"Data: `{DATA}`")
    lines.append(f"Bars: {len(bars):,}, CT range {bars['ct'].iloc[0]} to {bars['ct'].iloc[-1]}")
    lines.append("")
    lines.append("Definitions:")
    lines.append("- Cross: 1-minute 21 EMA crosses 50 EMA on ES.")
    lines.append("- Choppy block: high rate of multiple crosses and both-direction crosses inside the same CT clock window.")
    lines.append("- Directional block: raw post-cross follow-through hits target before stop.")
    lines.append("- Directional tests: 17-point target/17-point stop within 120 minutes, and 34-point target/17-point stop within 180 minutes.")
    lines.append("")
    lines.append("## Highest-Chop Windows")
    lines.append(density.head(25).to_markdown(index=False, floatfmt=".2f"))
    lines.append("")
    for sess in ["Asia", "London", "New York", "Late/maintenance"]:
        lines.append(f"## Highest-Chop Windows: {sess}")
        lines.append(summarize_session(density, sess, 12).to_markdown(index=False, floatfmt=".2f"))
        lines.append("")
    lines.append("## Best Directional Windows")
    lines.append(directional.head(30).to_markdown(index=False, floatfmt=".2f"))
    lines.append("")
    for sess in ["Asia", "London", "New York", "Late/maintenance"]:
        lines.append(f"## Best Directional Windows: {sess}")
        lines.append(summarize_session(directional, sess, 12).to_markdown(index=False, floatfmt=".2f"))
        lines.append("")
    (OUT / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:80]))
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
