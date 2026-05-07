"use client";
// Options Cockpit — strike ladder + greeks + payoff. Renders live Tastytrade
// chain when /api/snapshot supplies one; falls back to a seeded ladder so
// the page still demos when secrets aren't configured.
import { useMemo } from "react";
import { PageHeader } from "../page-header";
import type { OptionRow, Snapshot } from "@/lib/types";

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface MockRow extends OptionRow { putBid: number; putAsk: number }

function mockLadder(): MockRow[] {
  const rand = seeded(31);
  const atm = 583;
  const out: MockRow[] = [];
  for (let k = atm - 7; k <= atm + 7; k++) {
    const itm = Math.abs(k - 582.97);
    out.push({
      strike: k,
      bid: Math.max(0.05, 4 - itm + rand() * 0.3),
      ask: Math.max(0.06, 4 - itm + 0.05 + rand() * 0.3),
      iv: 12.4 + Math.abs(k - 583) * 0.18,
      delta: Math.tanh((583 - k) / 3) * 0.5 + 0.5,
      gamma: 0.04 - Math.abs(k - 583) * 0.003,
      oi: Math.round(8000 + rand() * 15000),
      volume: Math.round(400 + rand() * 4500),
      putBid: 0,
      putAsk: 0,
    });
  }
  return out;
}

export function OptionsCockpit({ snap }: { snap: Snapshot }) {
  const live = snap.options;
  const data = useMemo(() => {
    if (live && live.calls.length > 0) {
      const byStrike = new Map<number, OptionRow>();
      for (const c of live.calls) byStrike.set(c.strike, c);
      return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
    }
    return mockLadder();
  }, [live]);

  const atm = live?.atm ?? 583;
  const maxVol = Math.max(1, ...data.map((d) => d.volume || 0));
  const expirationLabel = live?.expiration ?? "0DTE (seed)";
  const sourceLabel = live ? "TASTYTRADE" : "MOCK";

  return (
    <>
      <PageHeader
        title="Options Cockpit"
        desc="Strike ladder, greeks, and contract construction. Build, price, and stage the order before you send."
        action={<button className="btn btn-primary">SEND ORDER</button>}
      />

      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span className="t-label c-tertiary">EXPIRATION</span>
        <span className="t-body-num c-primary">{expirationLabel}</span>
        <span className={`pill ${live ? "pill-green" : "pill-outline"}`}>{sourceLabel}</span>
        <div className="tf-group">
          {["LONG", "SHORT"].map((d, i) => (
            <button key={d} className={`tf-pill ${i === 0 ? "active" : ""}`}>{d}</button>
          ))}
        </div>
        <div className="tf-group">
          {["CALL", "PUT"].map((d, i) => (
            <button key={d} className={`tf-pill ${i === 0 ? "active" : ""}`}>{d}</button>
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
            <div key={d.strike} style={{
              display: "grid",
              gridTemplateColumns: "80px repeat(7, 1fr)",
              padding: "8px 16px",
              borderBottom: i === data.length - 1 ? 0 : "1px solid var(--border-subtle)",
              background: d.strike === atm ? "var(--amber-muted)" : "transparent",
              alignItems: "center",
            }}>
              <span className="t-body-num" style={{ color: d.strike === atm ? "var(--amber)" : "var(--text-primary)", fontWeight: d.strike === atm ? 700 : 500 }}>{d.strike}</span>
              <span className="t-body-num" style={{ textAlign: "right", color: "var(--green)" }}>{fmt(d.bid)}</span>
              <span className="t-body-num" style={{ textAlign: "right", color: "var(--red)" }}>{fmt(d.ask)}</span>
              <span className="t-body-num" style={{ textAlign: "right" }}>{fmt(d.iv, 1)}</span>
              <span className="t-body-num c-secondary" style={{ textAlign: "right" }}>{fmt(d.delta, 2)}</span>
              <span className="t-body-num c-secondary" style={{ textAlign: "right" }}>{fmt(d.gamma, 3)}</span>
              <span className="t-body-num c-secondary" style={{ textAlign: "right" }}>{Number.isFinite(d.oi) ? d.oi.toLocaleString() : "—"}</span>
              <span style={{
                textAlign: "right",
                fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500,
                background: `linear-gradient(to right, transparent ${100 - ((d.volume || 0) / maxVol) * 100}%, var(--blue-muted) ${100 - ((d.volume || 0) / maxVol) * 100}%)`,
                padding: "4px 8px", marginRight: -8,
              }}>{Number.isFinite(d.volume) ? d.volume.toLocaleString() : "—"}</span>
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
