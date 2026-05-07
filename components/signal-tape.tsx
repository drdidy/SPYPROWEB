// Signal Tape from e108b48a* in the design bundle: horizontal scrollable
// cards of recent signals with score, line, timestamp, outcome.

const SIGNALS = [
  { type: "REJECTION",  line: "4H SUPPLY",   ts: "11:42:18", score: 8.2, dir: "down" as const,   outcome: null },
  { type: "BREAK",      line: "PIVOT LOW",   ts: "11:18:04", score: 6.4, dir: "down" as const,   outcome: -0.34 },
  { type: "TAG",        line: "OPEN",        ts: "10:58:31", score: 5.1, dir: "neutral" as const, outcome: 0 },
  { type: "CONFLUENCE", line: "1H VWAP",     ts: "10:42:09", score: 7.8, dir: "up" as const,     outcome: 0.82 },
  { type: "REJECTION",  line: "PDH",         ts: "10:24:55", score: 7.0, dir: "down" as const,   outcome: 0.41 },
  { type: "BREAK",      line: "GLOBEX HIGH", ts: "10:08:12", score: 5.6, dir: "up" as const,     outcome: 0.18 },
  { type: "TAG",        line: "PIVOT LOW",   ts: "09:54:48", score: 4.2, dir: "neutral" as const, outcome: 0 },
  { type: "CONFLUENCE", line: "OPEN",        ts: "09:36:02", score: 6.9, dir: "up" as const,     outcome: 0.55 },
];
const DIR_COLOR = { up: "var(--green)", down: "var(--red)", neutral: "var(--blue)" };

export function SignalTape() {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, padding: "0 4px" }}>
        <span className="t-heading">SIGNAL TAPE</span>
        <div style={{ flex: 1 }}/>
        <span className="t-caption c-tertiary">LAST 8</span>
      </div>
      <div style={{ position: "relative" }}>
        <div style={{
          display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 4,
        }}>
          {SIGNALS.map((s, i) => (
            <div key={i} className="card" style={{
              flex: "0 0 240px", height: 96, padding: 12, scrollSnapAlign: "start",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="dot" style={{ background: DIR_COLOR[s.dir], width: 8, height: 8 }}/>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{s.type}</span>
                <div style={{ flex: 1 }}/>
                <div style={{
                  background: "var(--surface-pressed)", borderRadius: 3, padding: "2px 6px",
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: s.score > 7 ? "var(--green)" : s.score >= 4 ? "var(--amber)" : "var(--red)",
                  fontWeight: 500,
                }}>{s.score.toFixed(1)}</div>
              </div>
              <div className="t-caption c-secondary" style={{ letterSpacing: "0.04em" }}>{s.line}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="t-caption c-tertiary">{s.ts} CT</span>
                {s.outcome === null ? (
                  <span className="pill pill-outline" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>OPEN</span>
                ) : s.outcome === 0 ? (
                  <span className="t-caption c-tertiary">flat</span>
                ) : (
                  <span className="t-caption mono" style={{ color: s.outcome > 0 ? "var(--green)" : "var(--red)" }}>
                    {s.outcome > 0 ? "+" : ""}{s.outcome.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 4, width: 48,
          background: "linear-gradient(to right, transparent, var(--bg))",
          pointerEvents: "none",
        }}/>
      </div>
    </div>
  );
}

export const SIGNALS_DATA = SIGNALS;
