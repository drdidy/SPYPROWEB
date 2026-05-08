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
  ChevronsLeft,
  Columns3,
} from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { shellState } from "@/lib/mock-data";

const sections = [
  {
    label: "Workspace",
    items: [
      { icon: LineChart, label: "Decision Slate", href: "/dashboard" },
      { icon: Columns3, label: "SPX Channel", href: "/spx" },
      { icon: Layers, label: "Structure Read", href: "/structure" },
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
      { icon: Activity, label: "Order Flow", href: "/flow" },
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

export function Sidebar() {
  const pathname = usePathname() || "/";
  return (
    <aside className="w-[224px] shrink-0 h-screen sticky top-0 bg-paper border-r border-rule flex flex-col">
      <Link
        href="/"
        className="h-[60px] flex items-center px-5 border-b border-rule hover:bg-paper-2/40 transition-colors"
      >
        <Wordmark />
      </Link>

      <div className="px-4 py-3 border-b border-rule">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-50 animate-breathe" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-bull" />
          </span>
          <span className="text-ink-2 font-medium">{shellState.sessionLabel}</span>
          <span className="text-ink-3 ml-auto font-mono">{shellState.sessionCloses}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((s) => (
          <div key={s.label} className="mt-3 first:mt-1">
            <div className="px-5 mb-1.5 eyebrow text-ink-3">{s.label}</div>
            {s.items.map((it) => {
              const Icon = it.icon;
              const isActive = pathname === it.href;
              return (
                <a
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "flex items-center gap-2.5 mx-3 px-2.5 h-8 rounded-soft text-[13px] transition-all duration-150 ease-swift relative",
                    isActive
                      ? "bg-paper-2 text-ink font-medium"
                      : "text-ink-2 hover:text-ink hover:bg-paper-2/60",
                  )}
                >
                  {isActive && (
                    <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-4 w-[2px] bg-gold rounded-r" />
                  )}
                  <Icon size={14} className={cn(isActive ? "text-gold" : "text-ink-3")} />
                  {it.label}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-rule flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-gold-tint grid place-items-center text-[11px] font-serif font-semibold text-gold-ink shadow-rule">
          d
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-xs font-medium text-ink truncate">Trader</div>
          <div className="text-[10px] text-ink-3 truncate font-mono">closed beta</div>
        </div>
        <button
          className="w-7 h-7 grid place-items-center rounded-soft text-ink-3 hover:text-ink hover:bg-paper-2/70 transition-colors"
          aria-label="Collapse sidebar"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>
    </aside>
  );
}
