"use client";
// Options Cockpit — strike ladder + greeks + payoff. From 81ed613d*.
import { useMemo } from "react";
import { PageHeader } from "../page-header";

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function OptionsCockpit() {
  const data = useMemo(() => {
    const rand = seeded(31);
    const atm = 583;
    const strikes: number[] = [];
    for (let s = atm - 7; s <= atm + 7; s++) strikes.push(s);
    return strikes.map((k) => {
      const itm = Math.abs(k - 582.97);
      const iv = (12.4 + Math.abs(k - 583) * 0.18).toFixed(1);
      const delta = (Math.tanh((583 - k) / 3) * 0.5 + 0.5).toFixed(2);
      const gamma = (0.04 - Math.abs(k - 583) * 0.003).toFixed(3);
      const oi  = Math.round(8000 + rand() * 15000);
      const vol = Math.round(400 + rand() * 4500);
      return {
        k,
        bid: Math.max(0.05, 4 - itm + rand() * 0.3).toFixed(2),
        ask: Math.max(0.06, 4 - itm + 0.05 + rand() * 0.3).toFixed(2),
        iv, delta, gamma, oi, vol,
      };
    });
  }, []);
  const maxVol = Math.max(...data.map((d) => d.vol));

  return (
    <>
      <PageHeader
        title="Options Cockpit"
        desc="Strike ladder, greeks, and contract construction. Build, price, and stage the order before you send."
        action={<button className="btn btn-primary">SEND ORDER</button>}
      />

      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div className="tf-group">
          {["0DTE", "1D", "7D", "21D", "45D"].map((d, i) => (
            <button key={d} className={`tf-pill ${i === 0 ? "active" : ""}`}>{d}</button>
          ))}
        </div>
        <div className="tf-group">
          {["LONG", "SHORT"].map((d, i) => (
            <button key={d} className={`tf-pill ${i === 0 ? "active" : ""}`}>{d}</button>
          ))}
        </div>
        <div className="tf-group">
          {["CALL", "PUT"].map((d, i) => (
            <button key={d} className={`tf-pill ${i === 1 ? "active" : ""}`}>{d}</button>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="t-label c-tertiary">QTY</span>
          <button className="btn btn-icon">−</button>
          <span className="t-body-num" style={{ minWidth: 32, textAlign: "center" }}>5</span>
          <button className="btn btn-icon">+</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "80px repeat(7, 1fr)",
            padding: "10px 16px",
            background: "var(--surface-pressed)",
            borderBottom: "1px solid var(--border-subtle)",
          }}>
            {["STRIKE", "BID", "ASK", "IV", "Δ", "Γ", "OI", "VOL"].map((h) => (
              <span key={h} className="t-label c-tertiary" style={{ textAlign: h === "STRIKE" ? "left" : "right" }}>{h}</span>
            ))}
          </div>
          {data.map((d, i) => (
            <div key={d.k} style={{
              display: "grid",
              gridTemplateColumns: "80px repeat(7, 1fr)",
              padding: "8px 16px",
              borderBottom: i === data.length - 1 ? 0 : "1px solid var(--border-subtle)",
              background: d.k === 583 ? "var(--amber-muted)" : "transparent",
              alignItems: "center",
            }}>
              <span className="t-body-num" style={{ color: d.k === 583 ? "var(--amber)" : "var(--text-primary)", fontWeight: d.k === 583 ? 700 : 500 }}>{d.k}</span>
              <span className="t-body-num" style={{ textAlign: "right", color: "var(--green)" }}>{d.bid}</span>
              <span className="t-body-num" style={{ textAlign: "right", color: "var(--red)" }}>{d.ask}</span>
              <span className="t-body-num" style={{ textAlign: "right" }}>{d.iv}</span>
              <span className="t-body-num c-secondary" style={{ textAlign: "right" }}>{d.delta}</span>
              <span className="t-body-num c-secondary" style={{ textAlign: "right" }}>{d.gamma}</span>
              <span className="t-body-num c-secondary" style={{ textAlign: "right" }}>{d.oi.toLocaleString()}</span>
              <span style={{
                textAlign: "right",
                fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500,
                background: `linear-gradient(to right, transparent ${100 - (d.vol / maxVol) * 100}%, var(--blue-muted) ${100 - (d.vol / maxVol) * 100}%)`,
                padding: "4px 8px", marginRight: -8,
              }}>{d.vol.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignContent: "flex-start" }}>
          {[
            { l: "Δ", v: "+0.42", sub: "delta" },
            { l: "Γ", v: "+0.038", sub: "gamma" },
            { l: "Θ", v: "-0.18", sub: "theta" },
            { l: "ν", v: "+0.24", sub: "vega" },
          ].map((g) => (
            <div key={g.l} className="card" style={{ padding: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700 }}>{g.l}</div>
              <div className="t-body-num" style={{ marginTop: 8, fontSize: 18 }}>{g.v}</div>
              <div className="t-caption c-tertiary" style={{ marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="t-heading" style={{ marginBottom: 16 }}>P&amp;L AT EXPIRY</div>
        <svg viewBox="0 0 800 200" style={{ width: "100%", height: 200 }}>
          <line x1="0" x2="800" y1="120" y2="120" stroke="var(--border-subtle)"/>
          <line x1="400" x2="400" y1="0" y2="200" stroke="var(--border-emphasis)" strokeDasharray="2 3"/>
          <polyline points="0,120 380,120 580,40 800,40" fill="none" stroke="var(--green)" strokeWidth="1.5"/>
          <polyline points="0,120 380,120 580,40" fill="rgba(34,197,94,0.1)" stroke="none"/>
          <text x="404" y="14" fill="var(--amber)" fontFamily="var(--font-mono)" fontSize="11">BE 583.42</text>
        </svg>
      </div>
    </>
  );
}
