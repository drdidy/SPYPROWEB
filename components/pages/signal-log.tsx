"use client";
// Signal Log — sortable signals table with mini-MFE/MAE sparklines. From 81ed613d*.
import { useMemo } from "react";
import { PageHeader } from "../page-header";
import { SIGNALS_DATA } from "../signal-tape";

export function SignalLog() {
  const rows = useMemo(() => SIGNALS_DATA.concat(SIGNALS_DATA).slice(0, 12), []);

  const sparkPoints = useMemo(
    () =>
      rows.map((_, i) =>
        Array.from({ length: 20 }, (_, j) => `${j * 10},${12 - Math.sin((i + j) * 0.7) * 8}`).join(" ")
      ),
    [rows]
  );

  return (
    <>
      <PageHeader
        title="Signal Log"
        desc="Every signal, sortable and filterable. Open any row to inspect the chart at the moment of trigger."
        action={<button className="btn">EXPORT CSV</button>}
      />
      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn">DATE: TODAY</button>
        <button className="btn">TYPE: ALL</button>
        <button className="btn">LINE: ALL</button>
        <button className="btn">OUTCOME: ALL</button>
        <div style={{ flex: 1 }}/>
        <button className="btn">RESET</button>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "90px 110px 110px 130px 1fr 90px 80px 80px",
          padding: "10px 16px",
          background: "var(--surface-pressed)",
          borderBottom: "1px solid var(--border-subtle)",
        }}>
          {["TIME", "TYPE", "LINE", "BIAS", "MFE / MAE", "SCORE", "OUTCOME", "R"].map((h) => (
            <span key={h} className="t-label c-tertiary">{h}</span>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "90px 110px 110px 130px 1fr 90px 80px 80px",
            padding: "10px 16px",
            borderBottom: i === rows.length - 1 ? 0 : "1px solid var(--border-subtle)",
            alignItems: "center",
          }}>
            <span className="t-caption c-secondary">{r.ts}</span>
            <span className="t-body" style={{ fontWeight: 500 }}>{r.type}</span>
            <span className="t-caption c-secondary">{r.line}</span>
            <span className={`pill ${r.dir === "up" ? "pill-green" : r.dir === "down" ? "pill-red" : "pill-blue"}`}>
              {r.dir === "up" ? "BULL" : r.dir === "down" ? "BEAR" : "NEUT"}
            </span>
            <svg viewBox="0 0 200 24" style={{ width: "90%", height: 24 }}>
              <line x1="0" x2="200" y1="12" y2="12" stroke="var(--border-subtle)"/>
              <polyline
                points={sparkPoints[i]}
                fill="none"
                stroke={r.outcome != null && r.outcome > 0 ? "var(--green)" : r.outcome != null && r.outcome < 0 ? "var(--red)" : "var(--text-tertiary)"}
                strokeWidth="1"
              />
            </svg>
            <span className="t-body-num" style={{ color: r.score > 7 ? "var(--green)" : r.score >= 4 ? "var(--amber)" : "var(--red)" }}>
              {r.score.toFixed(1)}
            </span>
            {r.outcome === null ? (
              <span className="t-caption c-tertiary">OPEN</span>
            ) : r.outcome === 0 ? (
              <span className="t-caption c-tertiary">flat</span>
            ) : (
              <span className="t-body-num" style={{ color: r.outcome > 0 ? "var(--green)" : "var(--red)" }}>
                {r.outcome > 0 ? "+" : ""}{r.outcome.toFixed(2)}%
              </span>
            )}
            <span className="t-body-num c-secondary">{r.outcome === null ? "—" : (r.outcome / 0.3).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
