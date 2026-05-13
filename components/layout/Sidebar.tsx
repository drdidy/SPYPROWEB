"use client";
import {
  LineChart,
  Layers,
  Eye,
  Target,
  Globe,
  Activity,
  FileText,
  GraduationCap,
  History,
  Settings,
  X,
  Columns3,
  Rewind,
  Grid2X2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const sections = [
  {
    label: "Workspace",
    items: [
      { icon: LineChart, label: "Decision Slate", href: "/dashboard" },
      { icon: Activity, label: "SPY Channel", href: "/spy" },
      { icon: Columns3, label: "ES Channel", href: "/es" },
      { icon: Rewind, label: "Replay", href: "/replay" },
      { icon: Eye, label: "Foresight", href: "/foresight" },
    ],
  },
  {
    label: "Execution",
    items: [{ icon: Target, label: "Options Cockpit", href: "/options" }],
  },
  {
    label: "Intelligence",
    items: [
      { icon: Globe, label: "Market Context", href: "/context" },
      { icon: Layers, label: "Order Flow", href: "/flow" },
      { icon: FileText, label: "Daily Brief", href: "/brief" },
      { icon: GraduationCap, label: "Learning", href: "/learn" },
    ],
  },
  {
    label: "Journal",
    items: [
      { icon: History, label: "Signal Log", href: "/log" },
      { icon: Settings, label: "Configuration", href: "/settings" },
    ],
  },
];

const BUILD_LABEL = "Build 0.9.7";

export function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
} = {}) {
  const pathname = usePathname() || "/";
  return (
    <aside
      className={cn(
        // Mobile: fixed off-canvas drawer that slides in.
        "w-[196px] shrink-0 h-screen border-r border-[#C9A227]/30 flex flex-col",
        "bg-[#071116] text-paper shadow-[inset_-1px_0_0_rgba(244,228,192,0.08),18px_0_55px_-42px_rgba(0,0,0,0.92)]",
        "fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-swift",
        open ? "translate-x-0" : "-translate-x-full",
        // Desktop (lg+): permanent sticky sidebar, always visible.
        "lg:sticky lg:top-0 lg:translate-x-0 lg:transition-none lg:z-auto",
      )}
    >
      <Link
        href="/"
        className="relative h-[92px] flex items-start px-5 pt-5 border-b border-gold/25 hover:bg-paper/[0.035] transition-colors overflow-hidden"
      >
        <div
          aria-hidden
          className="absolute -right-12 -top-12 h-32 w-32 rounded-full border border-gold/20"
        />
        <div className="leading-none">
          <div className="font-serif text-[22px] leading-[0.92] tracking-[0.05em] text-paper">
            SPY PROPHET
          </div>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.22em] text-gold-soft/78">
            Options intelligence
          </div>
          <div className="mt-3 h-1 w-16 rounded-full bg-gradient-to-r from-gold-soft via-gold to-transparent" />
        </div>
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="ml-auto w-7 h-7 grid place-items-center rounded-soft text-paper/55 hover:text-paper hover:bg-paper/10 transition-colors lg:hidden"
        >
          <X size={14} />
        </button>
      </Link>

      <nav className="relative flex-1 overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <div key={s.label} className="mt-5 first:mt-0">
            <div className="px-5 mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-gold-soft/45">
              {s.label}
            </div>
            {s.items.map((it) => {
              const Icon = it.icon;
              const isActive = pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  prefetch
                  // v7 P1-5: stronger active state. The previous
                  // 2px sidebar-edge accent was easy to miss. Now
                  // a 3px brand-tinted left bar runs the full row
                  // height + a 4% paper-2 fill. Both visible at
                  // WCAG AA on the cream canvas.
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 mx-2 px-3 h-[42px] rounded-[8px] text-[13px] transition-all duration-150 ease-swift relative",
                    "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071116]",
                    isActive
                      ? "bg-[linear-gradient(135deg,rgba(244,228,192,0.18),rgba(255,255,255,0.055))] text-gold-soft font-semibold shadow-[0_14px_34px_-24px_rgba(244,228,192,0.28),inset_0_1px_0_rgba(255,255,255,0.13)] ring-1 ring-gold/35"
                      : "text-paper/62 hover:text-paper hover:bg-paper/[0.055]",
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-soft shadow-[0_0_18px_rgba(244,228,192,0.45)]"
                    />
                  )}
                  {isActive ? (
                    <span
                      aria-hidden
                      className="grid h-5 w-5 place-items-center rounded-[5px] border border-gold/45 bg-[#071116]/70 text-gold-soft"
                    >
                      <Grid2X2 size={13} strokeWidth={2.1} />
                    </span>
                  ) : (
                    <Icon size={15} strokeWidth={1.65} className="text-paper/42 transition-colors group-hover:text-gold-soft/80" />
                  )}
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="pointer-events-none relative mx-5 mb-4 h-28 shrink-0 opacity-[0.22]">
        <CompassMark />
      </div>

      <div className="mx-2 mb-2 rounded-[10px] border border-gold/30 bg-paper/[0.055] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[6px] border border-gold/35 bg-gold-soft/10 text-gold-soft">
            <ShieldCheck size={15} />
          </span>
          <div className="min-w-0">
            <div className="font-serif text-[13px] leading-none tracking-[0.04em] text-paper">
              {BUILD_LABEL}
            </div>
            <div className="mt-1 font-mono text-[9px] text-paper/45">
              Production workspace
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function CompassMark() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full text-gold-ink" aria-hidden>
      <circle cx="60" cy="60" r="43" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" strokeWidth="0.6" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        const r1 = i % 3 === 0 ? 35 : 40;
        const r2 = 48;
        return (
          <line
            key={i}
            x1={60 + Math.cos(a) * r1}
            y1={60 + Math.sin(a) * r1}
            x2={60 + Math.cos(a) * r2}
            y2={60 + Math.sin(a) * r2}
            stroke="currentColor"
            strokeWidth={i % 3 === 0 ? 0.9 : 0.45}
          />
        );
      })}
      <path d="M60 14 68 60 60 106 52 60Z" fill="currentColor" opacity="0.28" />
      <path d="M14 60 60 52 106 60 60 68Z" fill="currentColor" opacity="0.18" />
    </svg>
  );
}
