"use client";
// Trigger Map page from e108b48a* in the design bundle. Full version with
// expandable rows, ARMED/BREACHED counts, and per-row anchor detail.
import { useState } from "react";
import type { Snapshot, Trigger, TriggerStatus } from "@/lib/types";

const STATUS_PILL: Record<TriggerStatus, string> = {
  ARMED: "pill pill-amber",
  WATCHING: "pill pill-outline",
  BREACHED: "pill pill-red",
  STALE: "pill pill-stale",
};

function BiasBar({ value }: { value: number }) {
  const pct = Math.max(-100, Math.min(100, value));
  const w = Math.abs(pct) / 2;
  const color = pct >= 0 ? "var(--green)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ flex: 1, height: 4, background: "var(--surface-pressed)", position: "relative", borderRadius: 2 }}>
        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "var(--border-emphasis)" }}/>
        <div style={{
          position: "absolute",
          left: pct >= 0 ? "50%" : `${50 - w}%`,
          top: 0, height: "100%",
          width: `${w}%`,
          background: color,
          borderRadius: 1,
        }}/>
      </div>
      <span className="t-caption mono" style={{ minWidth: 32, textAlign: "right", color }}>
        {pct > 0 ? "+" : ""}{pct}
      </span>
    </div>
  );
}

export function TriggerMap({ snap }: { snap: Snapshot }) {
  const rows = snap.triggers;
  const armed = rows.filter((r) => r.status === "ARMED").length;
  const breached = rows.filter((r) => r.status === "BREACHED").length;
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{
        height: 48, display: "flex", alignItems: "center",
        padding: "0 20px", borderBottom: "1px solid var(--border-subtle)", gap: 16,
      }}>
        <span className="t-heading">TRIGGER MAP</span>
        <span className="t-caption c-tertiary">{armed} ARMED · {breached} BREACHED</span>
        <div style={{ flex: 1 }}/>
        <button className="btn" style={{ height: 24, fontSize: 11 }}>by distance ▾</button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "15% 15% 20% 25% 15% 10%",
        padding: "8px 20px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--surface-pressed)",
      }}>
        <span className="t-label c-tertiary">Line</span>
        <span className="t-label c-tertiary" style={{ textAlign: "right" }}>Level</span>
        <span className="t-label c-tertiary" style={{ textAlign: "right" }}>Distance</span>
        <span className="t-label c-tertiary">Bias contribution</span>
        <span className="t-label c-tertiary">Status</span>
        <span/>
      </div>

      {rows.map((r, i) => (
        <div key={r.line}>
          <div
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{
              display: "grid",
              gridTemplateColumns: "15% 15% 20% 25% 15% 10%",
              padding: "10px 20px",
              alignItems: "center",
              borderBottom: i === rows.length - 1 ? 0 : "1px solid var(--border-subtle)",
              cursor: "pointer",
              minHeight: 40,
            }}
          >
            <span className="t-body c-primary">{r.line}</span>
            <span className="t-body-num c-primary" style={{ textAlign: "right" }}>{r.level.toFixed(2)}</span>
            <span className="t-body-num" style={{ textAlign: "right", color: r.dist >= 0 ? "var(--green)" : "var(--red)" }}>
              {r.dist >= 0 ? "+" : ""}{r.dist.toFixed(2)}
            </span>
            <BiasBar value={r.bias}/>
            <span className={`${STATUS_PILL[r.status]} ${r.status === "ARMED" ? "pill-armed-anim" : ""}`}>{r.status}</span>
            <span className="c-tertiary" style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {expanded === i ? "▾" : "▸"}
            </span>
          </div>
          {expanded === i && (
            <RowDetail row={r} snap={snap} last={i === rows.length - 1} />
          )}
        </div>
      ))}
    </div>
  );
}

function RowDetail({ row, snap, last }: { row: Trigger; snap: Snapshot; last: boolean }) {
  const isUpper = /Upper/i.test(row.line);
  const isLower = /Lower/i.test(row.line);
  let anchor: string;
  if (row.line === "PDH") {
    anchor = `Yesterday's RTH high (${snap.pivots.structureDay ?? "—"}).`;
  } else if (row.line === "PDL") {
    anchor = `Yesterday's RTH low (${snap.pivots.structureDay ?? "—"}).`;
  } else if (row.line === "Day Open") {
    anchor = `Today's RTH open print at 08:30 CT (${snap.pivots.signalDay ?? "—"}).`;
  } else if (isUpper && snap.pivots.high) {
    const ts = snap.pivots.high.anchorTime
      ? new Date(snap.pivots.high.anchorTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "—";
    anchor = `Anchored at the ${snap.pivots.high.price.toFixed(2)} high pivot ${ts} CT on ${snap.pivots.structureDay ?? "—"}, projected forward at ${snap.pivots.slope.toFixed(2)}/h.`;
  } else if (isLower && snap.pivots.low) {
    const ts = snap.pivots.low.anchorTime
      ? new Date(snap.pivots.low.anchorTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "—";
    anchor = `Anchored at the ${snap.pivots.low.price.toFixed(2)} low pivot ${ts} CT on ${snap.pivots.structureDay ?? "—"}, projected forward at ${snap.pivots.slope.toFixed(2)}/h.`;
  } else {
    anchor = "Anchor metadata unavailable.";
  }

  return (
    <div style={{
      padding: "14px 20px 16px",
      background: "var(--surface-pressed)",
      borderBottom: last ? 0 : "1px solid var(--border-subtle)",
      display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 720 }}>
        <span className="t-caption c-tertiary">ANCHOR</span>
        <span className="t-body c-secondary">{anchor}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: "auto" }}>
        <span className="t-caption c-tertiary">PROJECTED LEVEL</span>
        <span className="t-body-num c-primary">{row.level.toFixed(2)}</span>
        <span className="t-caption c-tertiary" style={{ marginTop: 6 }}>DISTANCE</span>
        <span className="t-body-num" style={{ color: row.dist >= 0 ? "var(--green)" : "var(--red)" }}>
          {row.dist >= 0 ? "+" : ""}{row.dist.toFixed(2)} pts
        </span>
      </div>
    </div>
  );
}
