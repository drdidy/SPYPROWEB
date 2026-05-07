// Signal Tape — horizontally scrollable cards for the latest rejection
// signals computed by prophet_core.detect_rejection_signals on today's RTH.
// Falls back to a friendly empty state when no signals have printed yet.
import type { Signal, Snapshot } from "@/lib/types";

const DIR_COLOR = { up: "var(--green)", down: "var(--red)", neutral: "var(--blue)" } as const;

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function SignalTape({ snap }: { snap: Snapshot }) {
  const signals = snap.signals ?? [];
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, padding: "0 4px" }}>
        <span className="t-heading">SIGNAL TAPE</span>
        <div style={{ flex: 1 }}/>
        <span className="t-caption c-tertiary">
          {signals.length > 0 ? `LATEST ${Math.min(8, signals.length)}` : "NO SIGNALS YET"}
        </span>
      </div>
      {signals.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <span className="t-caption c-tertiary">
            No rejection signals on today&apos;s RTH frame yet. The tape lights up once an hourly candle prints a clean rejection at a primary trigger.
          </span>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{
            display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 4,
          }}>
            {signals.slice(0, 8).map((s) => (
              <SignalCard key={s.id} s={s} />
            ))}
          </div>
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 4, width: 48,
            background: "linear-gradient(to right, transparent, var(--bg))",
            pointerEvents: "none",
          }}/>
        </div>
      )}
    </div>
  );
}

function SignalCard({ s }: { s: Signal }) {
  const scoreColor = s.score > 7 ? "var(--green)" : s.score >= 4 ? "var(--amber)" : "var(--red)";
  return (
    <div className="card" style={{
      flex: "0 0 240px", height: 96, padding: 12, scrollSnapAlign: "start",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="dot" style={{ background: DIR_COLOR[s.dir], width: 8, height: 8 }}/>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          {s.type}
        </span>
        <div style={{ flex: 1 }}/>
        <div style={{
          background: "var(--surface-pressed)", borderRadius: 3, padding: "2px 6px",
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: scoreColor, fontWeight: 500,
        }}>{s.score.toFixed(1)} {s.grade}</div>
      </div>
      <div className="t-caption c-secondary" style={{ letterSpacing: "0.04em" }}>{s.line}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="t-caption c-tertiary">{s.ts} CT</span>
        {s.status === "PENDING_CONFIRMATION" ? (
          <span className="pill pill-amber" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>WAIT</span>
        ) : s.outcome === null ? (
          <span className="pill pill-outline" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>OPEN</span>
        ) : Math.abs(s.outcome) < 0.005 ? (
          <span className="t-caption c-tertiary">flat</span>
        ) : (
          <span className="t-caption mono" style={{ color: s.outcome > 0 ? "var(--green)" : "var(--red)" }}>
            {s.outcome > 0 ? "+" : ""}{fmt(s.outcome, 2)}%
          </span>
        )}
      </div>
    </div>
  );
}
