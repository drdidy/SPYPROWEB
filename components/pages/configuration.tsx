"use client";
// Configuration — sectioned settings page. From 81ed613d*.
import { useState } from "react";
import { PageHeader } from "../page-header";

function Toggle({ on: initial }: { on: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button
      onClick={() => setOn(!on)}
      style={{
        width: 36, height: 20, padding: 0,
        background: on ? "var(--amber-muted)" : "var(--surface-pressed)",
        border: `1px solid ${on ? "var(--amber)" : "var(--border-subtle)"}`,
        borderRadius: 10, position: "relative", transition: "all 120ms",
      }}
    >
      <span style={{
        position: "absolute", top: 1, left: on ? 17 : 1,
        width: 16, height: 16, borderRadius: "50%",
        background: on ? "var(--amber)" : "var(--text-tertiary)",
        transition: "left 120ms ease-out",
      }}/>
    </button>
  );
}

const SECTIONS = ["Profile", "Data Sources", "Signals", "Notifications", "API Keys", "Theme"];

export function Configuration() {
  const [section, setSection] = useState("Profile");
  return (
    <>
      <PageHeader title="Configuration"
        desc="Account, data sources, signal preferences, notifications, and credentials."/>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 8, height: "fit-content" }}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              style={{
                padding: "10px 12px",
                fontSize: 13, fontWeight: 500,
                color: section === s ? "var(--text-primary)" : "var(--text-secondary)",
                background: section === s ? "var(--surface-elev)" : "transparent",
                border: "0",
                borderLeftWidth: 2, borderLeftStyle: "solid",
                borderLeftColor: section === s ? "var(--amber)" : "transparent",
                width: "100%", textAlign: "left",
                display: "block",
              }}
            >{s}</button>
          ))}
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div className="t-heading" style={{ marginBottom: 16 }}>{section}</div>
          {[
            {
              l: "Display Name",
              c: (
                <input
                  defaultValue="didy"
                  style={{
                    background: "var(--surface-pressed)", border: "1px solid var(--border-subtle)",
                    borderRadius: 6, padding: "8px 12px", color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)", fontSize: 13, width: 240, outline: "none",
                  }}
                />
              ),
            },
            { l: "Trader Tier", c: <span className="pill pill-amber">PRO</span> },
            {
              l: "Default Timeframe",
              c: (
                <div className="tf-group">
                  {["1m", "5m", "15m"].map((t, i) => (
                    <button key={t} className={`tf-pill ${i === 1 ? "active" : ""}`}>{t}</button>
                  ))}
                </div>
              ),
            },
            { l: "Sound Alerts", c: <Toggle on={true}/> },
            { l: "Push Notifications", c: <Toggle on={false}/> },
            { l: "API Key (mask)", c: <span className="t-body-num c-tertiary">•••• •••• •••• 7c42</span> },
          ].map((row, i, arr) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr",
              alignItems: "center",
              padding: "14px 0",
              borderBottom: i === arr.length - 1 ? 0 : "1px solid var(--border-subtle)",
              gap: 24,
            }}>
              <span className="t-body c-secondary">{row.l}</span>
              <span>{row.c}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
