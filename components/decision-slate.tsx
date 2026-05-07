"use client";
// DecisionSlate + QualityRing + NumberFlow ported from d2950c19* in the
// design bundle. The slate is the core "what to do right now" surface:
// verb (LONG/SHORT/WAIT/HOLD/EXIT), rationale, BIAS/QUALITY/WINDOW pills,
// expandable "WHY", and a quality ring with R:R / WIN% / EDGE.
import { useEffect, useRef, useState } from "react";

export type Verb = "LONG" | "SHORT" | "WAIT" | "HOLD" | "EXIT";

const VERB_COLORS: Record<Verb, { color: string; bar: string }> = {
  LONG:  { color: "var(--green)",          bar: "var(--green)" },
  SHORT: { color: "var(--red)",            bar: "var(--red)" },
  WAIT:  { color: "var(--amber)",          bar: "var(--amber)" },
  HOLD:  { color: "var(--amber)",          bar: "var(--amber)" },
  EXIT:  { color: "var(--text-secondary)", bar: "var(--red)" },
};

interface VerbDatum {
  rationale: string;
  bias: string;
  biasColor: string;
  score: number;
  conviction: number;
  window: string;
  why: string;
}

export const VERB_DATA: Record<Verb, VerbDatum> = {
  LONG: {
    rationale: "Pivot reclaim at 581.85 confirmed by broadening breadth; bias has flipped bullish into the close.",
    bias: "BULLISH", biasColor: "var(--green)",
    score: 7.4, conviction: 4,
    window: "14:30–15:15",
    why: "Three of five trigger lines now align long. Advancers above 70%; VIX compressing through 15.",
  },
  SHORT: {
    rationale: "Price rejected the 4H supply line at 583.40 with a clean wick; bias has flipped bearish into the close.",
    bias: "BEARISH", biasColor: "var(--red)",
    score: 8.2, conviction: 4,
    window: "14:30–15:15",
    why: "Rejection volume printed 1.4× average; sellers stepped in within two ticks of the level. Historical follow-through: 64%.",
  },
  WAIT: {
    rationale: "Price is consolidating between 582.40 and 583.40 on declining volume; no qualified setup — await a directional break.",
    bias: "NEUTRAL", biasColor: "var(--text-secondary)",
    score: 3.1, conviction: 2,
    window: "— —",
    why: "Distance to the nearest level is 0.43 points; range is too tight for a qualified entry. Patience required.",
  },
  HOLD: {
    rationale: "Open long working into target; no new entry. Hold for trail to 583.20 or scale 50% at 583.00.",
    bias: "BULLISH", biasColor: "var(--green)",
    score: 6.8, conviction: 3,
    window: "until 15:00",
    why: "Open position at 581.92, +1.05R. Trail tightens at 582.40. Scale 50% on first 4H supply touch.",
  },
  EXIT: {
    rationale: "Bias has flipped against the position; trigger conditions invalidated. Exit at market and reset.",
    bias: "NEUTRAL", biasColor: "var(--text-tertiary)",
    score: 2.4, conviction: 1,
    window: "now",
    why: "Two stop conditions met. Plan dictated exit if 582.40 broke; it broke. Execute without hesitation.",
  },
};

export function NumberFlow({
  value,
  decimals = 2,
  prefix = "",
  suffix = "",
  className = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current;
    const end = value;
    const t0 = performance.now();
    const dur = 180;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = start + (end - start) * (1 - Math.pow(1 - k, 3));
      setDisplayed(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else prev.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{prefix}{displayed.toFixed(decimals)}{suffix}</span>;
}

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
  const color = score > 7 ? "var(--green)" : score >= 4 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${fillC} ${C}`} strokeLinecap="butt" />
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
    }}/>
  );
}

export function DecisionSlate({ verb, mobile = false }: { verb: Verb; mobile?: boolean }) {
  const c = VERB_COLORS[verb];
  const d = VERB_DATA[verb];
  const [whyOpen, setWhyOpen] = useState(false);
  const verbSize = mobile ? "t-display-m" : "t-display-l";

  return (
    <div className="card-elev" style={{ padding: mobile ? 20 : 24, marginBottom: 16 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: mobile ? "1fr" : "minmax(220px, 5fr) minmax(0, 4fr) minmax(0, 3fr)",
        gap: mobile ? 20 : 24,
        alignItems: "start",
      }}>
        {/* Verb column */}
        <div>
          <div style={{ width: mobile ? 56 : 72, height: 6, background: c.bar, marginBottom: 12, borderRadius: 1 }}/>
          <div key={verb} className={`${verbSize} verb-anim`} style={{ color: c.color }}>{verb}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <span className="t-label c-tertiary">DIRECTIONAL CONVICTION</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((i) => <Pip key={i} filled={i <= d.conviction} />)}
            </div>
          </div>
        </div>

        {/* Rationale + pills */}
        <div>
          <p className="t-body-l c-primary" style={{ margin: "0 0 16px", maxWidth: 480 }}>{d.rationale}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <span className="pill">
              <span className="dot" style={{ background: d.biasColor }}/>
              <span className="c-tertiary">BIAS</span>
              <span style={{ color: "var(--text-primary)", letterSpacing: "0.04em" }}>· {d.bias}</span>
            </span>
            <span className="pill">
              <span className="dot" style={{ background: "var(--amber)" }}/>
              <span className="c-tertiary">QUALITY</span>
              <span className="mono" style={{ color: "var(--text-primary)" }}>· {d.score.toFixed(1)}/10</span>
            </span>
            <span className="pill">
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
          justifyContent: mobile ? "flex-start" : "flex-end",
        }}>
          <QualityRing score={d.score} size={mobile ? 72 : 96} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, minWidth: 90 }}>
              <span className="t-caption c-tertiary">R:R</span>
              <span className="t-caption c-primary">1:2.4</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span className="t-caption c-tertiary">WIN%</span>
              <span className="t-caption c-primary">64</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span className="t-caption c-tertiary">EDGE</span>
              <span className="t-caption" style={{ color: "var(--green)" }}>+0.42%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
