// Section glyphs lifted from 00bb0246* (Shared UI) in the design bundle.
import type { ReactNode } from "react";

const ANALYSIS = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="14" width="3" height="7" stroke="currentColor" strokeWidth="1.5" />
    <rect x="10.5" y="9" width="3" height="12" stroke="currentColor" strokeWidth="1.5" />
    <rect x="18" y="4" width="3" height="17" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const EXECUTION = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const INTELLIGENCE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1.5" />
    <rect x="13" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1.5" />
    <rect x="3" y="13" width="8" height="8" stroke="currentColor" strokeWidth="1.5" />
    <rect x="13" y="13" width="8" height="8" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const JOURNAL = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="3" width="16" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" />
    <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" />
    <line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

interface NavItem { id: string; label: string }
interface NavSection { title: string; glyph: ReactNode; items: NavItem[] }

export const NAV: NavSection[] = [
  { title: "ANALYSIS", glyph: ANALYSIS, items: [
    { id: "chart", label: "Prophet Chart" },
    { id: "trigger", label: "Trigger Map" },
    { id: "structure", label: "Structure Read" },
  ]},
  { title: "EXECUTION", glyph: EXECUTION, items: [
    { id: "signal", label: "Signal Tape" },
    { id: "decision", label: "Decision Quality" },
  ]},
  { title: "INTELLIGENCE", glyph: INTELLIGENCE, items: [
    { id: "options", label: "Premium Flow" },
    { id: "learning", label: "Learning Panel" },
  ]},
  { title: "JOURNAL", glyph: JOURNAL, items: [
    { id: "journal", label: "Trade Journal" },
  ]},
];

interface SidebarProps {
  page: string;
  onNav: (id: string) => void;
}

export function Sidebar({ page, onNav }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col h-screen">
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[10px] tracking-[0.2em] text-text-dim uppercase">SPY</div>
        <div className="text-base font-semibold tracking-tight">Prophet</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV.map((section) => (
          <div key={section.title} className="px-3 pb-3">
            <div className="flex items-center gap-2 px-2 pb-1.5 text-text-dim">
              <span className="opacity-70">{section.glyph}</span>
              <span className="text-[10px] tracking-[0.15em] uppercase font-semibold">{section.title}</span>
            </div>
            <div className="flex flex-col">
              {section.items.map((it) => {
                const active = page === it.id;
                return (
                  <button
                    key={it.id}
                    onClick={() => onNav(it.id)}
                    className={`text-left text-[12.5px] px-3 py-1.5 rounded-md transition-colors ${
                      active
                        ? "bg-surface-pressed text-text-primary"
                        : "text-text-muted hover:bg-surface-2 hover:text-text-primary"
                    }`}
                  >
                    {it.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-border text-[10px] text-text-dim tracking-wider uppercase">
        v0 · preview
      </div>
    </aside>
  );
}
