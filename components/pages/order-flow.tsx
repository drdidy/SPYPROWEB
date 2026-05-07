"use client";
// Order Flow — live tape + unusual options activity. From 81ed613d*.
import { useMemo } from "react";
import { PageHeader } from "../page-header";

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export function OrderFlow() {
  const prints = useMemo(() => {
    const rand = seeded(53);
    return Array.from({ length: 14 }, (_, i) => ({
      ts: `11:${String(48 - i).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`,
      price: (582 + rand() * 1.4).toFixed(2),
      size: Math.round(200 + rand() * 8000),
      side: rand() > 0.5 ? "B" : "S",
    }));
  }, []);

  const unusual = [
    { strike: "584C", side: "BUY",  prem: "$2.4M", iv: 82 },
    { strike: "580P", side: "BUY",  prem: "$1.8M", iv: 74 },
    { strike: "585C", side: "SELL", prem: "$960K", iv: 68 },
    { strike: "581P", side: "BUY",  prem: "$720K", iv: 81 },
    { strike: "582C", side: "BUY",  prem: "$540K", iv: 54 },
  ];

  return (
    <>
      <PageHeader
        title="Order Flow"
        desc="Live tape and unusual options activity. Where institutional size is hitting and where premium is concentrating."
      />
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="t-label c-tertiary" style={{ marginBottom: 8 }}>AGGREGATE FLOW · TODAY</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="t-body-num c-green">CALLS  +$182M</span>
          <div style={{ flex: 1, height: 8, background: "var(--surface-pressed)", display: "flex" }}>
            <div style={{ width: "58%", background: "var(--green)" }}/>
            <div style={{ width: "42%", background: "var(--red)" }}/>
          </div>
          <span className="t-body-num c-red">PUTS  -$132M</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16 }}>
        <div className="card">
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="t-heading">LIVE TAPE</span>
          </div>
          {prints.map((p, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "90px 80px 1fr 32px",
              padding: "8px 16px",
              borderBottom: i === prints.length - 1 ? 0 : "1px solid var(--border-subtle)",
              alignItems: "center",
              background: p.size > 5000 ? (p.side === "B" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)") : "transparent",
            }}>
              <span className="t-caption c-tertiary">{p.ts}</span>
              <span className="t-body-num">{p.price}</span>
              <span className="t-body-num" style={{
                textAlign: "right",
                color: p.size > 5000 ? (p.side === "B" ? "var(--green)" : "var(--red)") : "var(--text-primary)",
              }}>{p.size.toLocaleString()}</span>
              <span className="t-caption" style={{ textAlign: "right", color: p.side === "B" ? "var(--green)" : "var(--red)" }}>{p.side}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="t-heading">UNUSUAL ACTIVITY</span>
          </div>
          {unusual.map((u, i) => (
            <div key={i} style={{ padding: "12px 16px", borderBottom: i === unusual.length - 1 ? 0 : "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="t-body-num" style={{ fontSize: 15, fontWeight: 700 }}>{u.strike}</span>
                <span className={`pill ${u.side === "BUY" ? "pill-green" : "pill-red"}`}>{u.side}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="t-caption c-tertiary">{u.prem} premium</span>
                <span className="t-caption c-secondary">IV-rank {u.iv}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
