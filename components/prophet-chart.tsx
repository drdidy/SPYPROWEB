"use client";
// ProphetChart SVG candlestick from d2950c19* in the design bundle. Uses a
// deterministic seeded random generator so the candles render identically
// on server/client (avoiding hydration mismatch).
import { useMemo } from "react";

interface ChartLine {
  label: string;
  value: number;
  color: string;
  dash?: boolean;
  opacity?: number;
  armed?: boolean;
  width?: number;
}

interface Candle { o: number; h: number; l: number; c: number }

function genCandles(seed = 42, n = 80): Candle[] {
  let rnd = seed;
  const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
  let price = 580.20;
  const candles: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const o = price;
    const drift = (rand() - 0.48) * 0.6;
    const c = o + drift;
    const h = Math.max(o, c) + rand() * 0.35;
    const l = Math.min(o, c) - rand() * 0.35;
    candles.push({ o, h, l, c });
    price = c;
  }
  const last = candles[candles.length - 1];
  last.c = 582.97;
  last.h = Math.max(last.h, last.c + 0.05);
  return candles;
}

export function ProphetChart() {
  const candles = useMemo(() => genCandles(7, 80), []);
  const W = 1100;
  const H = 480;
  const padL = 8, padR = 80, padT = 16, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const lines: ChartLine[] = [
    { label: "4H SUPPLY", value: 583.40, color: "var(--red)", dash: false, opacity: 0.7 },
    { label: "PIVOT LOW", value: 581.85, color: "var(--blue)", dash: false, opacity: 0.7 },
    { label: "OPEN",      value: 582.40, color: "var(--text-secondary)", dash: true,  opacity: 0.5 },
    { label: "TRIGGER",   value: 583.40, color: "var(--amber)", dash: false, opacity: 1, armed: true, width: 1.5 },
  ];

  const allHighs = candles.map((c) => c.h);
  const allLows  = candles.map((c) => c.l);
  const yMin = Math.min(...allLows, ...lines.map((l) => l.value)) - 0.4;
  const yMax = Math.max(...allHighs, ...lines.map((l) => l.value)) + 0.4;
  const y = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * innerH;
  const candleW = innerW / candles.length;
  const bodyW = Math.max(3, candleW * 0.65);
  const currentPrice = candles[candles.length - 1].c;

  const gridLines: number[] = [];
  for (let p = Math.ceil(yMin); p <= Math.floor(yMax); p++) gridLines.push(p);

  const times = ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00"];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 40, marginBottom: 8,
      }}>
        <div className="tf-group">
          {["1m", "5m", "15m", "1h", "4h"].map((tf) => (
            <button key={tf} className={`tf-pill ${tf === "5m" ? "active" : ""}`}>{tf}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-icon" title="Lines">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="3"   width="10" height="1.5" fill="currentColor"/>
              <rect x="2" y="6.5" width="10" height="1.5" fill="currentColor"/>
              <rect x="2" y="10"  width="10" height="1.5" fill="currentColor"/>
            </svg>
          </button>
          <button className="btn btn-icon" title="Indicators">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 11l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
          <button className="btn btn-icon" title="Fullscreen">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 5V2h3M9 2h3v3M2 9v3h3M12 9v3H9" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
          {gridLines.map((p) => (
            <line key={`hg${p}`} x1={padL} x2={W - padR} y1={y(p)} y2={y(p)}
              stroke="var(--border-subtle)" strokeOpacity="0.3" strokeWidth="1"/>
          ))}
          {Array.from({ length: Math.floor(candles.length / 6) + 1 }).map((_, i) => (
            <line key={`vg${i}`}
              x1={padL + i * 6 * candleW} x2={padL + i * 6 * candleW}
              y1={padT} y2={H - padB}
              stroke="var(--border-subtle)" strokeOpacity="0.3" strokeWidth="1"/>
          ))}

          {lines.map((ln, i) => (
            <g key={`ln${i}`} opacity={ln.opacity}>
              <line x1={padL} x2={W - padR} y1={y(ln.value)} y2={y(ln.value)}
                stroke={ln.color} strokeWidth={ln.width || 1}
                strokeDasharray={ln.dash ? "4 3" : undefined}/>
            </g>
          ))}

          {candles.map((c, i) => {
            const x = padL + i * candleW + candleW / 2;
            const up = c.c >= c.o;
            const color = up ? "var(--green)" : "var(--red)";
            const bodyTop = y(Math.max(c.o, c.c));
            const bodyBot = y(Math.min(c.o, c.c));
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1"/>
                <rect x={x - bodyW / 2} y={bodyTop}
                  width={bodyW} height={Math.max(1, bodyBot - bodyTop)}
                  fill={color}/>
              </g>
            );
          })}

          <line className="price-pulse"
            x1={padL} x2={W - padR} y1={y(currentPrice)} y2={y(currentPrice)}
            stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 3"/>

          {lines.map((ln, i) => (
            <g key={`lbl${i}`}>
              <rect x={W - padR + 4} y={y(ln.value) - 9} width={70} height={18}
                fill="var(--surface-pressed)" stroke={ln.color} strokeOpacity="0.6" rx="3"/>
              <text x={W - padR + 8} y={y(ln.value) + 3}
                fontFamily="var(--font-mono)" fontSize="10"
                fill={ln.color} fontWeight="500">
                {ln.value.toFixed(2)}
              </text>
            </g>
          ))}

          <g transform={`translate(${W - padR - 70}, ${y(583.40) - 24})`}>
            <rect width="56" height="18" fill="var(--amber-muted)" stroke="var(--amber)" strokeOpacity="0.4" rx="3">
              <animate attributeName="stroke-opacity" values="0.4;0.9;0.4" dur="2.4s" repeatCount="indefinite"/>
            </rect>
            <text x="6" y="13" fontFamily="var(--font-ui)" fontSize="10" fontWeight="500"
              fill="var(--amber)" letterSpacing="0.08em">ARMED</text>
          </g>

          <g transform={`translate(${W - padR + 4}, ${y(currentPrice) - 9})`}>
            <rect width="70" height="18" fill="var(--surface-elev)" stroke="var(--border-emphasis)" rx="3"/>
            <text x="6" y="13" fontFamily="var(--font-mono)" fontSize="11"
              fill="var(--text-primary)" fontWeight="500">{currentPrice.toFixed(2)}</text>
          </g>

          {times.map((t, i) => (
            <text key={t}
              x={padL + (i * 8) * candleW + 4} y={H - padB + 18}
              fontFamily="var(--font-mono)" fontSize="10"
              fill="var(--text-tertiary)">{t}</text>
          ))}

          <g transform={`translate(${padL + 4}, ${padT + 8})`}>
            {[
              { label: "4H Supply", color: "var(--red)", dash: false },
              { label: "Pivot Low", color: "var(--blue)", dash: false },
              { label: "Open", color: "var(--text-secondary)", dash: true },
              { label: "Live Trigger", color: "var(--amber)", dash: false },
            ].map((l, i) => (
              <g key={l.label} transform={`translate(${i * 110}, 0)`}>
                <line x1="0" x2="14" y1="6" y2="6"
                  stroke={l.color} strokeWidth="1.5"
                  strokeDasharray={l.dash ? "3 2" : undefined}/>
                <text x="18" y="10" fontFamily="var(--font-mono)" fontSize="10"
                  fill="var(--text-tertiary)">{l.label}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div style={{
        marginTop: 12, height: 24,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <span className="t-caption c-tertiary">RTH 08:30 — 15:00 CT</span>
        <div style={{ flex: 1, height: 2, background: "var(--surface-pressed)", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "72%", background: "var(--amber)" }}/>
        </div>
        <span className="pill pill-amber">AFTERNOON</span>
      </div>
    </div>
  );
}
