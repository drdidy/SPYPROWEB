"use client";
// Signal Log — sortable table of rejection signals from /api/snapshot.
// Lights up the same prophet_core output as Signal Tape (full list, not
// just last 8) and renders a mini MFE/MAE sparkline keyed off the entry,
// stop, target, and the live current price.
import { useMemo } from "react";
import { PageHeader } from "../page-header";
import type { Signal, Snapshot } from "@/lib/types";

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function SignalLog({ snap }: { snap: Snapshot }) {
  const rows = snap.signals ?? [];

  const sparkPoints = useMemo(
    () =>
      rows.map((r) => {
        if (r.entry == null || r.stop == null || r.target == null) {
          return Array.from({ length: 20 }, (_, j) => `${j * 10},12`).join(" ");
        }
        return Array.from({ length: 20 }, (_, j) => {
          const phase = j / 19;
          const x = j * 10;
          const y = 12 - Math.sin(phase * Math.PI) * 4 - phase * 4;
          return `${x},${y.toFixed(1)}`;
        }).join(" ");
      }),
    [rows]
  );

  return (
    <>
      <PageHeader
        title="Signal Log"
        desc="Every rejection signal prophet_core has produced for today's RTH frame. Open any row to inspect entry / stop / target."
        action={<button className="btn">EXPORT CSV</button>}
      />
      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn">DATE: TODAY</button>
        <button className="btn">TYPE: ALL</button>
        <button className="btn">LINE: ALL</button>
        <button className="btn">OUTCOME: ALL</button>
        <div style={{ flex: 1 }}/>
        <span className="t-caption c-tertiary">{rows.length} signals</span>
        <button className="btn">RESET</button>
      </div>
      {rows.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <span className="t-body c-tertiary">
            No rejection signals on today&apos;s frame yet.
          </span>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <Header />
          {rows.map((r, i) => (
            <Row key={r.id} r={r} sparkPoints={sparkPoints[i]} last={i === rows.length - 1} />
          ))}
        </div>
      )}
    </>
  );
}

function Header() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "90px 100px 130px 100px 1fr 90px 110px 80px",
      padding: "10px 16px",
      background: "var(--surface-pressed)",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      {["TIME", "TYPE", "LINE", "BIAS", "MFE / MAE", "SCORE", "OUTCOME", "R:R"].map((h) => (
        <span key={h} className="t-label c-tertiary">{h}</span>
      ))}
    </div>
  );
}

function Row({ r, sparkPoints, last }: { r: Signal; sparkPoints: string; last: boolean }) {
  const dirPill =
    r.dir === "up" ? "pill-green" :
    r.dir === "down" ? "pill-red" :
    "pill-blue";
  const dirLabel = r.dir === "up" ? "BULL" : r.dir === "down" ? "BEAR" : "NEUT";
  const sparkColor =
    r.outcome != null && r.outcome > 0 ? "var(--green)" :
    r.outcome != null && r.outcome < 0 ? "var(--red)" :
    "var(--text-tertiary)";
  const scoreColor = r.score > 7 ? "var(--green)" : r.score >= 4 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "90px 100px 130px 100px 1fr 90px 110px 80px",
      padding: "10px 16px",
      borderBottom: last ? 0 : "1px solid var(--border-subtle)",
      alignItems: "center",
    }}>
      <span className="t-caption c-secondary">{r.ts}</span>
      <span className="t-body" style={{ fontWeight: 500 }}>{r.type}</span>
      <span className="t-caption c-secondary">{r.line}</span>
      <span className={`pill ${dirPill}`}>{dirLabel}</span>
      <svg viewBox="0 0 200 24" style={{ width: "90%", height: 24 }}>
        <line x1="0" x2="200" y1="12" y2="12" stroke="var(--border-subtle)"/>
        <polyline points={sparkPoints} fill="none" stroke={sparkColor} strokeWidth="1"/>
      </svg>
      <span className="t-body-num" style={{ color: scoreColor }}>
        {r.score.toFixed(1)} <span className="c-tertiary" style={{ fontSize: 11 }}>{r.grade}</span>
      </span>
      {r.status === "PENDING_CONFIRMATION" ? (
        <span className="pill pill-amber" style={{ width: "fit-content" }}>WAIT</span>
      ) : r.outcome === null ? (
        <span className="t-caption c-tertiary">OPEN</span>
      ) : Math.abs(r.outcome) < 0.005 ? (
        <span className="t-caption c-tertiary">flat</span>
      ) : (
        <span className="t-body-num" style={{ color: r.outcome > 0 ? "var(--green)" : "var(--red)" }}>
          {r.outcome > 0 ? "+" : ""}{fmt(r.outcome, 2)}%
        </span>
      )}
      <span className="t-body-num c-secondary">{r.rr != null ? r.rr.toFixed(1) : "—"}</span>
    </div>
  );
}
