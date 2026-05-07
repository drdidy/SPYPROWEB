"use client";
// DecisionSlate — the "what to do right now" surface on the Prophet
// Chart hero. Verb, conviction pips, BIAS / QUALITY / WINDOW pills,
// rationale paragraph, expandable WHY, and a quality ring with
// R:R / WIN% / EDGE. Reads everything from snap.decision (live),
// no more hardcoded VERB_DATA mock.
import { useEffect, useState } from "react";
import type { Snapshot, Verb } from "@/lib/types";

const VERB_COLORS: Record<Verb, { color: string; bar: string }> = {
  LONG:  { color: "var(--green)",          bar: "var(--green)" },
  SHORT: { color: "var(--red)",            bar: "var(--red)" },
  WAIT:  { color: "var(--amber)",          bar: "var(--amber)" },
  HOLD:  { color: "var(--amber)",          bar: "var(--amber)" },
  EXIT:  { color: "var(--text-secondary)", bar: "var(--red)" },
};

export function QualityRing({ score, size = 96, stroke = 4 }: { score: number; size?: number; stroke?: number }) {
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setDrawn(score * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const fillC = (drawn / 10) * C;
  const color = score > 7 ? "var(--green)" : score >= 4 ? "var(--amber)" : "var(--text-tertiary)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={stroke}/>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${fillC} ${C}`} strokeLinecap="butt"/>
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div className="t-display-m" style={{ lineHeight: 1 }}>{score.toFixed(1)}</div>
        <div className="t-caption c-tertiary" style={{ marginTop: 2 }}>/ 10</div>
      </div>
    </div>
  );
}

function Pip({ filled }: { filled: boolean }) {
  return (
    <div style={{
      width: 6, height: 6, borderRadius: "50%",
      background: filled ? "var(--green)" : "transparent",
      border: filled ? 0 : "1px solid var(--border-subtle)",
      flexShrink: 0,
    }}/>
  );
}

export function DecisionSlate({ snap }: { snap: Snapshot }) {
  const d = snap.decision;
  const c = VERB_COLORS[d.verb];
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div className="card-elev" style={{ padding: 24, marginBottom: 16 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1.4fr) minmax(280px, 2.6fr) minmax(220px, 1.2fr)",
        gap: 32,
        alignItems: "start",
      }}>
        {/* Verb column */}
        <div style={{ minWidth: 0 }}>
          <div style={{ width: 72, height: 6, background: c.bar, marginBottom: 12, borderRadius: 1 }}/>
          <div key={d.verb} className="t-display-l verb-anim" style={{ color: c.color }}>{d.verb}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <span className="t-label c-tertiary" style={{ whiteSpace: "nowrap" }}>CONVICTION</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((i) => <Pip key={i} filled={i <= d.conviction}/>)}
            </div>
          </div>
        </div>

        {/* Rationale + pills */}
        <div style={{ minWidth: 0 }}>
          <p className="t-body-l c-primary" style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
            {d.rationale}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <span className="pill" style={{ whiteSpace: "nowrap" }}>
              <span className="dot" style={{ background: d.biasColor }}/>
              <span className="c-tertiary">BIAS</span>
              <span style={{ color: "var(--text-primary)", letterSpacing: "0.04em" }}>· {d.bias}</span>
            </span>
            <span className="pill" style={{ whiteSpace: "nowrap" }}>
              <span className="dot" style={{ background: "var(--amber)" }}/>
              <span className="c-tertiary">QUALITY</span>
              <span className="mono" style={{ color: "var(--text-primary)" }}>
                · {d.score.toFixed(1)}/10{d.grade && d.grade !== "—" ? ` ${d.grade}` : ""}
              </span>
            </span>
            <span className="pill" style={{ whiteSpace: "nowrap" }}>
              <span className="dot" style={{ background: "var(--text-tertiary)" }}/>
              <span className="c-tertiary">WINDOW</span>
              <span className="mono" style={{ color: "var(--text-primary)" }}>· {d.window}</span>
            </span>
          </div>
          <button
            onClick={() => setWhyOpen(!whyOpen)}
            style={{
              background: "transparent", border: 0, padding: 0,
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
            }}
          >
            {whyOpen ? "▾ WHY" : "▸ WHY"}
          </button>
          {whyOpen && (
            <div style={{
              marginTop: 8,
              borderLeft: "2px solid var(--amber-muted-strong)",
              paddingLeft: 12,
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}>
              {d.why}
            </div>
          )}
        </div>

        {/* Quality ring + stats */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          justifyContent: "flex-end", minWidth: 0,
        }}>
          <QualityRing score={d.score} size={96}/>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <Stat label="R:R" value={d.rr != null ? `1:${d.rr.toFixed(1)}` : "—"} />
            <Stat label="WIN%" value={d.winPct != null ? String(d.winPct) : "—"} />
            <Stat
              label="EDGE"
              value={d.edgePct != null ? `${d.edgePct >= 0 ? "+" : ""}${d.edgePct.toFixed(2)}%` : "—"}
              color={d.edgePct != null ? (d.edgePct >= 0 ? "var(--green)" : "var(--red)") : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, minWidth: 90 }}>
      <span className="t-caption c-tertiary">{label}</span>
      <span className="t-caption" style={{ color: color ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
