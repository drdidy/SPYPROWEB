"use client";
// SPY Foresight — probability cones + scenario distribution. From 81ed613d*.
import { useMemo } from "react";
import { PageHeader } from "../page-header";

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function Foresight() {
  const candleRects = useMemo(() => {
    const rand = seeded(11);
    return Array.from({ length: 50 }, (_, i) => {
      const up = rand() > 0.5;
      const x = i * 9 + 50;
      const y0 = 130 + rand() * 30;
      return { i, x, y0, up };
    });
  }, []);

  return (
    <>
      <PageHeader
        title="SPY Foresight"
        desc="Probability cones and scenario distribution. A range of outcomes, not a single forecast."
        action={
          <div className="tf-group">
            {["1H", "EOD", "TOMORROW", "THIS WEEK"].map((t, i) => (
              <button key={t} className={`tf-pill ${i === 1 ? "active" : ""}`}>{t}</button>
            ))}
          </div>
        }
      />
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <svg viewBox="0 0 1000 320" style={{ width: "100%", height: 320 }}>
          {[60, 120, 180, 240].map((y) => (
            <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--border-subtle)" strokeOpacity="0.3"/>
          ))}
          <polygon points="500,150 1000,30 1000,90 500,150" fill="rgba(34,197,94,0.08)"/>
          <polygon points="500,150 1000,210 1000,270 500,150" fill="rgba(239,68,68,0.08)"/>
          <polyline points="500,150 700,140 850,120 1000,90" stroke="var(--green)" strokeWidth="1.5" fill="none" strokeOpacity="0.5"/>
          <polyline points="500,150 700,160 850,180 1000,210" stroke="var(--red)"   strokeWidth="1.5" fill="none" strokeOpacity="0.5"/>
          {candleRects.map((c) => (
            <rect key={c.i} x={c.x} y={c.y0} width="4" height="8" fill={c.up ? "var(--green)" : "var(--red)"}/>
          ))}
          <line x1="500" x2="500" y1="0" y2="320" stroke="var(--amber)" strokeWidth="1" strokeDasharray="3 3"/>
          <text x="506" y="14" fill="var(--amber)" fontFamily="var(--font-mono)" fontSize="11">NOW</text>
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { name: "BULLISH", prob: 24, target: "585.40", driver: "CPI miss + dovish Fed read", color: "var(--green)" },
          { name: "BASE",    prob: 52, target: "582.10", driver: "Range continuation", color: "var(--amber)" },
          { name: "BEARISH", prob: 24, target: "579.20", driver: "4H supply rejection holds", color: "var(--red)" },
        ].map((s) => (
          <div key={s.name} className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="t-label" style={{ color: s.color, letterSpacing: "0.08em" }}>{s.name}</span>
              <span className="t-body-num" style={{ color: s.color, fontSize: 16 }}>{s.prob}%</span>
            </div>
            <div className="t-display-s" style={{ margin: "12px 0 4px" }}>{s.target}</div>
            <p className="t-body c-secondary" style={{ margin: 0 }}>{s.driver}</p>
          </div>
        ))}
      </div>
    </>
  );
}
