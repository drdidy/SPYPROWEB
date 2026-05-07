"use client";
// Analytics — KPIs + equity curve + win-rate breakdown + heatmap. From 81ed613d*.
import { useMemo } from "react";
import { PageHeader } from "../page-header";

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function Analytics() {
  const sparkPoints = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) =>
        Array.from({ length: 24 }, (_, j) => `${j * 8.5},${16 - Math.sin((i + j) * 0.5) * 8 - j * 0.3}`).join(" ")
      ),
    []
  );

  const equityPoints = useMemo(
    () =>
      Array.from({ length: 80 }, (_, j) => `${j * 12.5},${180 - j * 1.6 - Math.sin(j * 0.4) * 10}`).join(" "),
    []
  );

  const heatmap = useMemo(() => {
    const rand = seeded(101);
    return Array.from({ length: 5 * 13 }, (_, i) => {
      const v = Math.sin(i * 0.7) * 0.5 + rand() * 0.5;
      const op = Math.abs(v);
      const color = v > 0 ? `rgba(34,197,94,${op})` : `rgba(239,68,68,${op * 0.8})`;
      return color;
    });
  }, []);

  return (
    <>
      <PageHeader title="Analytics"
        desc="Performance, edge, and decay. Identify the regimes where the system performs and the ones where it does not."/>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { l: "Win Rate", v: "64%",  s: "+2 vs L30" },
          { l: "Avg R",    v: "1.42", s: "stable" },
          { l: "Sharpe",   v: "2.81", s: "+0.4 YTD" },
          { l: "Profit Factor", v: "2.14", s: "-0.1 vs L30" },
        ].map((k, i) => (
          <div key={k.l} className="card" style={{ padding: 20 }}>
            <div className="t-label c-tertiary">{k.l}</div>
            <div className="t-display-m" style={{ margin: "12px 0 4px" }}>{k.v}</div>
            <div className="t-caption c-secondary">{k.s}</div>
            <svg viewBox="0 0 200 32" style={{ width: "100%", height: 32, marginTop: 12 }}>
              <polyline points={sparkPoints[i]} fill="none" stroke="var(--green)" strokeWidth="1"/>
            </svg>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="t-heading" style={{ marginBottom: 16 }}>EQUITY CURVE</div>
        <svg viewBox="0 0 1000 200" style={{ width: "100%", height: 200 }}>
          {[40, 80, 120, 160].map((y) => (
            <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--border-subtle)" strokeOpacity="0.3"/>
          ))}
          <polyline points={equityPoints} fill="none" stroke="var(--green)" strokeWidth="1.5"/>
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="t-heading" style={{ marginBottom: 16 }}>WIN RATE BY SIGNAL TYPE</div>
          {[
            { name: "REJECTION",  v: 72 },
            { name: "CONFLUENCE", v: 68 },
            { name: "BREAK",      v: 54 },
            { name: "TAG",        v: 48 },
          ].map((b) => (
            <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span className="t-caption c-secondary" style={{ width: 100 }}>{b.name}</span>
              <div style={{ flex: 1, height: 6, background: "var(--surface-pressed)" }}>
                <div style={{ width: `${b.v}%`, height: "100%", background: b.v > 60 ? "var(--green)" : "var(--amber)" }}/>
              </div>
              <span className="t-body-num" style={{ width: 36, textAlign: "right" }}>{b.v}%</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div className="t-heading" style={{ marginBottom: 16 }}>EXPECTANCY HEATMAP</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 2 }}>
            {heatmap.map((color, i) => (
              <div key={i} style={{ aspectRatio: "1", background: color, borderRadius: 1 }}/>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span className="t-caption c-tertiary">08:30</span>
            <span className="t-caption c-tertiary">15:00</span>
          </div>
        </div>
      </div>
    </>
  );
}
