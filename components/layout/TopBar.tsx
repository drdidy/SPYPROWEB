"use client";
import Link from "next/link";
import { Bell, Menu, Search } from "lucide-react";
import { NumberFlash } from "@/components/ui/NumberFlash";
import { Kbd } from "@/components/ui/Kbd";
import { useLiveSPY, useLiveSPX } from "@/lib/use-live-snapshot";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Action vocabulary palettes — shared between SPY & SPX so the chip stays
// visually parallel even though each engine produces its own verb.
// ---------------------------------------------------------------------------

const verbPalette: Record<string, string> = {
  // SPY verdicts
  WAIT: "text-gold-ink bg-gold-tint shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]",
  LONG: "text-bull-ink bg-bull-tint shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]",
  SHORT: "text-bear-ink bg-bear-tint shadow-[inset_0_0_0_1px_rgba(181,48,30,0.30)]",
  "STAND DOWN":
    "text-ink-3 bg-paper-2 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]",
  // SPX actions
  TAKE: "text-bull-ink bg-bull-tint shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]",
  SELECTIVE: "text-gold-ink bg-gold-tint shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]",
};

const SPX_SCENARIO_TAG: Record<string, string> = {
  ABOVE_ASCENDING: "ABOVE · ASC",
  INSIDE_ASCENDING: "INSIDE · ASC",
  BELOW_ASCENDING: "BELOW · ASC",
  ABOVE_DESCENDING: "ABOVE · DESC",
  INSIDE_DESCENDING: "INSIDE · DESC",
  BELOW_DESCENDING: "BELOW · DESC",
  OUTSIDE_PLAY: "OUTSIDE",
};

export function TopBar({
  onOpenPalette,
  onOpenNav,
}: {
  onOpenPalette: () => void;
  onOpenNav?: () => void;
}) {
  const spy = useLiveSPY();
  const spxSnapshot = useLiveSPX();
  const decision = spy.decision;
  const t = spy.shell;
  const isLive = spy.source === "live";
  const spxVerb = spxSnapshot.confluence.action.replace(/_/g, " ");
  const asOf = new Date(spxSnapshot.asOf);
  const asOfLabel = `${String(asOf.getHours()).padStart(2, "0")}:${String(
    asOf.getMinutes(),
  ).padStart(2, "0")} CT`;

  return (
    <header className="h-[60px] sticky top-0 z-30 bg-canvas/85 backdrop-blur-md border-b border-rule flex items-center px-3 md:px-5 gap-2 md:gap-3">
      {/* Hamburger — mobile only; sidebar is permanent at lg+. */}
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenNav}
        className="lg:hidden w-9 h-9 grid place-items-center rounded-soft text-ink-2 hover:text-ink hover:bg-paper-2/70 transition-colors"
      >
        <Menu size={17} />
      </button>
      {/* Dual symbol chips — SPY first, SPX second */}
      <SymbolChip
        href="/dashboard"
        symbol="SPY"
        verb={decision.verdict}
        verbTone={verbPalette[decision.verdict]}
        score={decision.conviction}
        meta={decision.windowET}
      />
      <SymbolChip
        href="/spx"
        symbol="SPX"
        verb={spxVerb}
        verbTone={verbPalette[spxVerb] ?? verbPalette["STAND DOWN"]}
        score={Math.round(spxSnapshot.confluence.score)}
        meta={SPX_SCENARIO_TAG[spxSnapshot.scenario]}
        accent="violet"
      />

      {/* Quote ribbon — hidden on small screens to avoid wrap chaos */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-4 lg:gap-6 min-w-0">
        <Quote label="SPY">
          <NumberFlash value={t.spy} format={(n) => n.toFixed(2)} />
        </Quote>
        <Quote label="SPX">
          <NumberFlash
            value={spxSnapshot.price.last}
            format={(n) => n.toFixed(2)}
          />
        </Quote>
        <Quote label="VIX">
          <span data-num>{t.vix.toFixed(2)}</span>
        </Quote>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            {isLive && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-50 animate-breathe" />
            )}
            <span
              className={cn(
                "relative inline-flex rounded-full h-1.5 w-1.5",
                isLive ? "bg-bull" : "bg-ink-4",
              )}
            />
          </span>
          <span className="eyebrow text-ink-2">
            {isLive ? "LIVE" : "CLOSED"}
          </span>
          <span className="text-[10px] text-ink-4 font-mono tabular-nums ml-1">
            · as of {asOfLabel}
          </span>
        </div>
      </div>

      {/* Spacer to push search/bell right when quote ribbon hidden */}
      <div className="flex-1 md:hidden" />
      {/* Search + bell */}
      <button
        onClick={onOpenPalette}
        aria-label="Search"
        className="md:flex items-center gap-2 h-8 px-3 rounded-soft bg-paper shadow-rule hover:shadow-rule-strong text-ink-2 hover:text-ink text-xs transition-all hidden"
      >
        <Search size={13} className="text-ink-3" />
        <span>Search</span>
        <span className="text-ink-4 hidden lg:inline">levels, signals…</span>
        <Kbd className="ml-2">⌘K</Kbd>
      </button>
      <button
        onClick={onOpenPalette}
        aria-label="Search"
        className="md:hidden w-9 h-9 grid place-items-center rounded-soft hover:bg-paper-2 text-ink-2 transition-colors"
      >
        <Search size={15} />
      </button>
      <button
        aria-label="Notifications"
        className="w-9 h-9 grid place-items-center rounded-soft hover:bg-paper-2 text-ink-2 transition-colors"
      >
        <Bell size={15} />
      </button>
    </header>
  );
}

function SymbolChip({
  href,
  symbol,
  verb,
  verbTone,
  score,
  meta,
  accent,
}: {
  href: string;
  symbol: string;
  verb: string;
  verbTone: string;
  score: number;
  meta: string;
  accent?: "violet";
}) {
  const accentClass =
    accent === "violet" ? "before:bg-violet/55" : "before:bg-ink/30";
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2 h-8 pl-3 pr-3 rounded-pill transition-all",
        "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full",
        accentClass,
        verbTone,
        "hover:translate-y-[-0.5px] hover:shadow-card",
      )}
    >
      <span className="text-[10px] font-mono font-bold tracking-[0.16em] opacity-70">
        {symbol}
      </span>
      <span className="opacity-30 text-[10px]">·</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
        {verb}
      </span>
      <span className="opacity-30 text-[10px]">·</span>
      <span className="text-[11px] font-mono font-semibold tabular-nums">
        {score}
      </span>
      <span className="opacity-30 text-[10px]">·</span>
      <span className="text-[10px] font-mono uppercase tracking-[0.06em] opacity-80">
        {meta}
      </span>
    </Link>
  );
}

function Quote({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="eyebrow text-ink-3">{label}</span>
      <span className="text-[13px] font-mono font-semibold text-ink tabular-nums">
        {children}
      </span>
    </div>
  );
}
