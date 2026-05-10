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
        "w-[180px] shrink-0 h-screen border-r border-[#C9A227]/45 flex flex-col",
        "bg-[#FFF9EC] text-ink shadow-[inset_-1px_0_0_rgba(201,162,39,0.18)]",
        "fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-swift",
        open ? "translate-x-0" : "-translate-x-full",
        // Desktop (lg+): permanent sticky sidebar, always visible.
        "lg:sticky lg:top-0 lg:translate-x-0 lg:transition-none lg:z-auto",
      )}
    >
      <Link
        href="/"
        className="h-[82px] flex items-start px-5 pt-4 border-b border-[#E1C98F]/50 hover:bg-[#F8EDCF]/45 transition-colors"
      >
        <div className="leading-none">
          <div className="font-serif text-[22px] leading-[0.92] tracking-[0.05em] text-ink">
            SPY PROPHET
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-gold-ink/75">
            Options intelligence
          </div>
        </div>
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="ml-auto w-7 h-7 grid place-items-center rounded-soft text-ink-3 hover:text-ink hover:bg-paper-2/70 transition-colors lg:hidden"
        >
          <X size={14} />
        </button>
      </Link>

      <nav className="relative flex-1 overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <div key={s.label} className="mt-5 first:mt-0">
            <div className="px-5 mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
              {s.label}
            </div>
            {s.items.map((it) => {
              const Icon = it.icon;
              const isActive = pathname === it.href;
              return (
                <a
                  key={it.href}
                  href={it.href}
                  // v7 P1-5: stronger active state. The previous
                  // 2px sidebar-edge accent was easy to miss. Now
                  // a 3px brand-tinted left bar runs the full row
                  // height + a 4% paper-2 fill. Both visible at
                  // WCAG AA on the cream canvas.
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 mx-2 px-3 h-[42px] rounded-[4px] text-[13px] transition-all duration-150 ease-swift relative",
                    "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF9EC]",
                    isActive
                      ? "bg-[#071116] text-gold-soft font-semibold shadow-[0_10px_28px_-18px_rgba(7,17,22,0.85),inset_0_1px_0_rgba(255,255,255,0.10)]"
                      : "text-ink-2 hover:text-ink hover:bg-[#F5E8C6]/65",
                  )}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="grid h-5 w-5 place-items-center rounded-[3px] border border-gold/45 text-gold"
                    >
                      <Grid2X2 size={13} strokeWidth={2.1} />
                    </span>
                  ) : (
                    <Icon size={15} strokeWidth={1.65} className="text-ink-2" />
                  )}
                  {it.label}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="pointer-events-none relative mx-5 mb-5 h-28 shrink-0 opacity-[0.12]">
        <CompassMark />
      </div>

      <div className="mx-2 mb-2 rounded-[5px] border border-[#D7B764] bg-[#FFF6DE] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[4px] border border-[#D7B764] bg-[#F8E7B8] text-gold-ink">
            <ShieldCheck size={15} />
          </span>
          <div className="min-w-0">
            <div className="font-serif text-[13px] leading-none tracking-[0.04em] text-gold-ink">
              CLOSED BETA
            </div>
            <div className="mt-1 font-mono text-[9px] text-ink-3">
              {BUILD_LABEL}
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
