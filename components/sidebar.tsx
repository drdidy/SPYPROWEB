// Sidebar with section glyphs lifted from 00bb0246* in the design bundle.
// Uses .sidebar / .nav-item classes from globals.css to match the bundle's
// pixel measurements exactly.
import type { ReactNode } from "react";

const ANALYSIS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="14" width="3" height="7" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="10.5" y="9" width="3" height="12" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="18" y="4" width="3" height="17" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);
const EXECUTION = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);
const INTELLIGENCE = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="13" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="3" y="13" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="13" y="13" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);
const JOURNAL = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="3" width="16" height="18" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

export interface NavItem { id: string; label: string }
export interface NavSection { title: string; glyph: ReactNode; items: NavItem[] }

export const NAV: NavSection[] = [
  { title: "ANALYSIS", glyph: ANALYSIS, items: [
    { id: "chart", label: "Prophet Chart" },
    { id: "trigger", label: "Trigger Map" },
    { id: "structure", label: "Structure Read" },
    { id: "foresight", label: "SPY Foresight" },
  ]},
  { title: "EXECUTION", glyph: EXECUTION, items: [
    { id: "signal", label: "Signal Tape" },
    { id: "options", label: "Options Cockpit" },
    { id: "replay", label: "Replay Lab" },
  ]},
  { title: "INTELLIGENCE", glyph: INTELLIGENCE, items: [
    { id: "context", label: "Market Context" },
    { id: "flow", label: "Order Flow" },
    { id: "brief", label: "Daily Brief" },
    { id: "learning", label: "Learning Panel" },
  ]},
  { title: "JOURNAL", glyph: JOURNAL, items: [
    { id: "log", label: "Signal Log" },
    { id: "analytics", label: "Analytics" },
    { id: "config", label: "Configuration" },
  ]},
];

interface SidebarProps {
  page: string;
  onNav: (id: string) => void;
}

export function Sidebar({ page, onNav }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div style={{ padding: "20px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="t-caption c-tertiary" style={{ letterSpacing: "0.2em", marginBottom: 4 }}>SPY</div>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>
          PROPHET
        </div>
      </div>
      <nav style={{ flex: 1, overflowY: "auto", paddingTop: 12 }}>
        {NAV.map((section) => (
          <div key={section.title} style={{ paddingBottom: 14 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 16px",
              color: "var(--text-tertiary)",
            }}>
              <span style={{ opacity: 0.6 }}>{section.glyph}</span>
              <span className="t-label">{section.title}</span>
            </div>
            {section.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onNav(item.id)}
                className={`nav-item ${page === item.id ? "active" : ""}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-subtle)" }}>
        <span className="t-caption c-tertiary" style={{ letterSpacing: "0.14em" }}>v0 · PREVIEW</span>
      </div>
    </aside>
  );
}
