"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { NumberFlash } from "@/components/ui/NumberFlash";
import { Kbd } from "@/components/ui/Kbd";
import { useLiveSPY, useLiveSPX } from "@/lib/use-live-snapshot";
import { cn } from "@/lib/utils";
import { FeedHealthBadge } from "@/components/slate/FeedHealthBadge";
import {
  getSessionInfo,
  priceStalenessLabel,
  renderSessionSegment,
} from "@/lib/sessions";
import type { EngineState } from "@/lib/states";

// ---------------------------------------------------------------------------
// TopBar layout — three-zone flex (chips · ribbon · meta) on a single
// overflow-hidden row. Each zone is shrink-0 + whitespace-nowrap so no
// segment can flex-grow into another. Hide priority below 1024px:
//   VIX delta → VIX label → prices → session line → state pills
// State pills are the slate's most important top-bar surface and survive
// down to 375px.
// ---------------------------------------------------------------------------

const verbPalette: Record<string, string> = {
  WAIT: "text-gold-ink bg-gold-tint shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]",
  LONG: "text-bull-ink bg-bull-tint shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]",
  SHORT: "text-bear-ink bg-bear-tint shadow-[inset_0_0_0_1px_rgba(181,48,30,0.30)]",
  "STAND DOWN": "text-ink-3 bg-paper-2 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]",
  TAKE: "text-bull-ink bg-bull-tint shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]",
  SELECTIVE: "text-gold-ink bg-gold-tint shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]",
  // PRE-CONFIG matches the StateLadder's active-armed palette so the
  // pill, ladder, and card headlines all carry the same tone.
  "PRE-CONFIG":
    "text-state-armed bg-paper-2 shadow-[inset_0_0_0_1px_rgba(10,117,137,0.30)]",
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
  const updatedLabel = formatUpdated(spy.shell.feedHealth.lastTickTs);
  const sessionLine = useSessionLine();
  const staleness = useStalenessLabel();

  const spyState = spy.currentState;
  const spxState = (spxSnapshot.currentState as EngineState | undefined) ?? "STAND_DOWN";

  // ---- SPY pill -------------------------------------------------------
  // In PRE_CONFIG the engine has no conviction and no verb yet — pill
  // reads just "SPY · PRE-CONFIG" with no sub-label. Otherwise show
  // verb + conviction.
  const spyVerb = spyState === "PRE_CONFIG" ? "PRE-CONFIG" : decision.verdict;
  const spyTone = verbPalette[spyVerb] ?? verbPalette["STAND DOWN"];
  const spyMeta =
    spyState === "PRE_CONFIG" ? null : `conviction ${decision.conviction}/5`;

  // ---- SPX pill -------------------------------------------------------
  // PRE_CONFIG drops the OUTSIDE / INSIDE scenario tag. There's no
  // "outside" of a play that hasn't been plotted yet.
  const rawSpxVerb = spxSnapshot.confluence.action.replace(/_/g, " ");
  const spxVerb = spxState === "PRE_CONFIG" ? "PRE-CONFIG" : rawSpxVerb;
  const spxTone = verbPalette[spxVerb] ?? verbPalette["STAND DOWN"];
  const spxMeta =
    spxState === "PRE_CONFIG"
      ? null
      : SPX_SCENARIO_TAG[spxSnapshot.scenario] ?? spxSnapshot.scenario;

  return (
    <header
      className={cn(
        "h-[60px] sticky top-0 z-30 bg-canvas/85 backdrop-blur-md",
        "border-b border-rule",
        // Single flex row, gap-controlled. overflow-hidden + min-w-0
        // is the regression guard — without these, a long session line
        // can push the right cluster off-screen, *visually overlapping*
        // the prices.
        "flex items-center gap-3 md:gap-5 px-3 md:px-5 overflow-hidden min-w-0",
      )}
      data-testid="topbar"
    >
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenNav}
        className="lg:hidden w-9 h-9 grid place-items-center rounded-soft text-ink-2 hover:text-ink hover:bg-paper-2/70 transition-colors shrink-0"
      >
        <Menu size={17} />
      </button>

      {/* ---- ZONE 1: state pills (always visible, highest priority) -- */}
      <div
        data-segment="pills"
        className="flex items-center gap-2 shrink-0 whitespace-nowrap"
      >
        <SymbolChip
          href="/dashboard"
          symbol="SPY"
          verb={spyVerb}
          verbTone={spyTone}
          meta={spyMeta}
        />
        <SymbolChip
          href="/spx"
          symbol="SPX"
          verb={spxVerb}
          verbTone={spxTone}
          meta={spxMeta}
          accent="violet"
        />
      </div>

      {/* ---- ZONE 2: quote ribbon (hidden < md, fluid filler) -------- */}
      {/* flex-1 so it absorbs slack between zone 1 and zone 3 when
          there's room; min-w-0 + overflow-hidden lets it truncate
          gracefully rather than push neighbors. */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-3 lg:gap-5 min-w-0 overflow-hidden">
        <Quote label="SPY" wrapClass="hidden lg:flex">
          <ValueWithStaleness
            staleness={staleness}
            delta={t.change}
            value={
              <NumberFlash value={t.spy} format={(n) => n.toFixed(2)} />
            }
          />
        </Quote>
        <Quote label="SPX" wrapClass="hidden lg:flex">
          <ValueWithStaleness
            staleness={staleness}
            delta={spxSnapshot.price.change}
            value={
              <NumberFlash
                value={spxSnapshot.price.last}
                format={(n) => n.toFixed(2)}
              />
            }
          />
        </Quote>
        <Quote label="VIX">
          <ValueWithStaleness
            staleness={staleness}
            delta={t.vixDelta}
            value={<span data-num>{t.vix.toFixed(2)}</span>}
          />
        </Quote>
      </div>

      {/* ---- ZONE 3: session + updated + feed-health (lg+ only) ------ */}
      <div
        data-segment="meta"
        className="hidden lg:flex items-center gap-3 shrink-0 whitespace-nowrap"
      >
        {sessionLine && (
          <>
            <span className="font-mono text-[10px] text-ink-3 tabular-nums uppercase tracking-[0.06em]">
              {sessionLine}
            </span>
            <span className="h-3 w-px bg-rule" aria-hidden />
          </>
        )}
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          Updated {updatedLabel}
        </span>
        <FeedHealthBadge
          lastTickTs={t.feedHealth.lastTickTs}
          source={t.feedHealth.source}
        />
      </div>

      {/* ---- search + bell (always visible) ------------------------- */}
      <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
        <button
          onClick={onOpenPalette}
          aria-label="Search"
          className="md:flex items-center gap-2 h-8 px-3 rounded-soft bg-paper shadow-rule hover:shadow-rule-strong text-ink-2 hover:text-ink text-xs transition-all hidden whitespace-nowrap shrink-0"
        >
          <Search size={13} className="text-ink-3" />
          <span>Search</span>
          <span className="text-ink-4 hidden xl:inline">levels, signals…</span>
          <Kbd className="ml-2">⌘K</Kbd>
        </button>
        <button
          onClick={onOpenPalette}
          aria-label="Search"
          className="md:hidden w-9 h-9 grid place-items-center rounded-soft hover:bg-paper-2 text-ink-2 transition-colors shrink-0"
        >
          <Search size={15} />
        </button>
        <button
          aria-label="Notifications"
          className="w-9 h-9 grid place-items-center rounded-soft hover:bg-paper-2 text-ink-2 transition-colors shrink-0"
        >
          <Bell size={15} />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------

function SymbolChip({
  href,
  symbol,
  verb,
  verbTone,
  meta,
  accent,
}: {
  href: string;
  symbol: string;
  verb: string;
  verbTone: string;
  meta: string | null;
  accent?: "violet";
}) {
  const accentClass =
    accent === "violet" ? "before:bg-violet/55" : "before:bg-ink/30";
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2 h-8 pl-3 pr-3 rounded-pill transition-all whitespace-nowrap shrink-0",
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
      {meta && (
        <>
          <span className="opacity-30 text-[10px]">·</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.06em] opacity-80">
            {meta}
          </span>
        </>
      )}
    </Link>
  );
}

function Quote({
  label,
  children,
  wrapClass,
}: {
  label: string;
  children: React.ReactNode;
  wrapClass?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-2 whitespace-nowrap shrink-0",
        wrapClass,
      )}
    >
      <span className="eyebrow text-ink-3">{label}</span>
      <span className="text-[13px] font-mono font-semibold text-ink tabular-nums">
        {children}
      </span>
    </div>
  );
}

// Quote value + either the staleness suffix or the signed delta —
// never both. A delta against a non-live reading is misleading, so
// staleness wins when present.
function ValueWithStaleness({
  staleness,
  delta,
  value,
}: {
  staleness: string | null;
  delta: number;
  value: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      {value}
      {staleness ? (
        <span className="hidden xl:inline text-[10px] text-ink-3 italic shrink-0 whitespace-nowrap">
          · {staleness}
        </span>
      ) : (
        <span className="hidden xl:inline-flex shrink-0">
          <DeltaTag value={delta} />
        </span>
      )}
    </span>
  );
}

function DeltaTag({ value }: { value: number }) {
  const tone =
    value > 0
      ? "text-state-bullish"
      : value < 0
        ? "text-state-bearish"
        : "text-state-neutral";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const mag = Math.abs(value).toFixed(2);
  return (
    <span
      className={cn("text-[11px] font-mono font-semibold tabular-nums", tone)}
      data-num
    >
      {sign}
      {mag}
    </span>
  );
}

function useSessionLine(): string | null {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const spy = getSessionInfo("SPY", now);
      const spx = getSessionInfo("SPX", now);
      setLine(renderSessionSegment(spy, spx, now));
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return line;
}

function useStalenessLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLabel(priceStalenessLabel(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

function formatUpdated(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d) + " CT"
    );
  } catch {
    return "—";
  }
}
