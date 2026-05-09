"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { NumberFlash } from "@/components/ui/NumberFlash";
import { Kbd } from "@/components/ui/Kbd";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useLiveSPY, useLiveSPX } from "@/lib/use-live-snapshot";
import { cn } from "@/lib/utils";
import { FreshnessPill } from "@/components/decision-slate/FreshnessPill";
import {
  getSessionInfo,
  priceStalenessLabel,
  renderSessionSegment,
} from "@/lib/sessions";
import { formatNumber, isLoadedNumber } from "@/lib/format-number";
import type { EngineState } from "@/lib/states";

// ---------------------------------------------------------------------------
// TopBar layout — five-cluster row separated by 1px vertical dividers.
//
//   [menu] | [SPY · SPX state]  | [SPY/SPX/VIX prices] | [next setup · freshness] | [search][bell]
//
// Each cluster is shrink-0 + whitespace-nowrap so no segment can
// flex-grow into another. Hide priority below 1024px:
//   prices ribbon → next-setup line → engines cluster → state pills
// State chips and freshness pill survive down to 375px.
//
// v4 fixes:
//   - Inline "· Fri close" suffix removed (it clipped to "ri close"
//     at lg widths). Staleness is now an InfoTooltip on the price
//     value, with the exact close timestamp as the tooltip content.
//   - VIX renders a skeleton bar when the value isn't loaded yet,
//     instead of "1" (the leading character of an unset number that
//     was getting clipped).
//   - The two state chips are wrapped in an "Engines" cluster with
//     a leading label so the row reads as structured groups, not an
//     unstructured ribbon of metadata.
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
  const sessionLine = useSessionLine();
  const staleness = useStalenessLabel();
  const stalenessAt = useStalenessTimestamp();

  const spyState = spy.currentState;
  const spxState = (spxSnapshot.currentState as EngineState | undefined) ?? "STAND_DOWN";

  const spyVerb = spyState === "PRE_CONFIG" ? "PRE-CONFIG" : decision.verdict;
  const spyTone = verbPalette[spyVerb] ?? verbPalette["STAND DOWN"];
  const spyMeta =
    spyState === "PRE_CONFIG" ? null : `conviction ${decision.conviction}/5`;

  const rawSpxVerb = spxSnapshot.confluence.action.replace(/_/g, " ");
  const spxVerb = spxState === "PRE_CONFIG" ? "PRE-CONFIG" : rawSpxVerb;
  const spxTone = verbPalette[spxVerb] ?? verbPalette["STAND DOWN"];
  const spxMeta =
    spxState === "PRE_CONFIG"
      ? null
      : SPX_SCENARIO_TAG[spxSnapshot.scenario] ?? spxSnapshot.scenario;

  // v5 #2: routed through isLoadedNumber so the contract for "value
  // is renderable" lives in one place. 0 is treated as unloaded for
  // VIX/SPY/SPX since 0 is never a real reading on those tickers.
  const vixLoaded = isLoadedNumber(t.vix);
  const spyLoaded = isLoadedNumber(t.spy);
  const spxLoaded = isLoadedNumber(spxSnapshot.price.last);

  return (
    <header
      className={cn(
        "h-[60px] sticky top-0 z-30 bg-canvas/85 backdrop-blur-md",
        "border-b border-rule",
        "flex items-center gap-3 md:gap-4 px-3 md:px-5 overflow-hidden min-w-0",
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

      {/* CLUSTER 1: Engines status — the SPY/SPX state chips with a
          leading "Engines" label so the cluster reads as one
          structured group rather than two floating chips. */}
      <div
        data-segment="pills"
        data-cluster="engines"
        className="flex items-center gap-2 shrink-0 whitespace-nowrap"
      >
        <span className="hidden md:inline font-mono text-[9px] tracking-[0.18em] uppercase text-ink-3">
          Engines
        </span>
        <SymbolChip
          href="/dashboard"
          symbol="SPY"
          verb={spyVerb}
          verbTone={spyTone}
          meta={spyMeta}
        />
        <span aria-hidden className="text-ink-4 text-[10px]">
          ·
        </span>
        <SymbolChip
          href="/spx"
          symbol="SPX"
          verb={spxVerb}
          verbTone={spxTone}
          meta={spxMeta}
          accent="violet"
        />
      </div>

      <Divider className="hidden md:block" />

      {/* CLUSTER 2: Quote ribbon — SPY / SPX / VIX. Each value gets a
          tooltip with the exact close-or-update timestamp so the
          old inline "· Fri close" suffix isn't needed. flex-1 +
          min-w-0 lets the ribbon absorb slack and truncate
          gracefully when there isn't room. */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-3 lg:gap-4 min-w-0 overflow-hidden">
        <Quote label="SPY" wrapClass="hidden lg:flex">
          <ValueWithTooltip
            staleness={staleness}
            stalenessAt={stalenessAt}
            delta={t.change}
            loaded={spyLoaded}
            value={
              <NumberFlash value={t.spy} format={(n) => formatNumber(n)} />
            }
          />
        </Quote>
        <Quote label="SPX" wrapClass="hidden lg:flex">
          <ValueWithTooltip
            staleness={staleness}
            stalenessAt={stalenessAt}
            delta={spxSnapshot.price.change}
            loaded={spxLoaded}
            value={
              <NumberFlash
                value={spxSnapshot.price.last}
                format={(n) => formatNumber(n)}
              />
            }
          />
        </Quote>
        <Quote label="VIX">
          <ValueWithTooltip
            staleness={staleness}
            stalenessAt={stalenessAt}
            delta={t.vixDelta}
            loaded={vixLoaded}
            value={<span data-num>{formatNumber(t.vix)}</span>}
          />
        </Quote>
      </div>

      <Divider className="hidden lg:block" />

      {/* CLUSTER 3: session line + freshness pill (lg+). */}
      <div
        data-segment="meta"
        data-cluster="session"
        className="hidden lg:flex items-center gap-3 shrink-0 whitespace-nowrap"
      >
        {sessionLine && (
          <span className="font-mono text-[10px] text-ink-3 tabular-nums uppercase tracking-[0.06em]">
            {sessionLine}
          </span>
        )}
        <FreshnessPill
          freshnessISO={t.feedHealth.lastTickTs}
          source={t.feedHealth.source}
        />
      </div>

      {/* CLUSTER 4: search + bell. ml-auto keeps them flush right when
          earlier clusters wrap or hide. */}
      <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
        <Divider className="hidden md:block" />
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

function Divider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("h-4 w-px bg-rule shrink-0", className)}
    />
  );
}

function SymbolChip({
  href,
  symbol,
  verb,
  meta,
  accent,
}: {
  href: string;
  symbol: string;
  verb: string;
  // Retained for callers; the chip itself stays tone-agnostic so
  // engine-state hue lives in the dashboard pipelines.
  verbTone?: string;
  meta: string | null;
  accent?: "violet";
}) {
  const symbolTone = accent === "violet" ? "text-violet" : "text-ink-2";
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-1.5 rounded-soft whitespace-nowrap shrink-0",
        "text-ink-2 hover:text-ink transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
      )}
    >
      <span
        className={cn(
          "text-[10px] font-mono font-bold tracking-[0.16em]",
          symbolTone,
        )}
      >
        {symbol}
      </span>
      <span className="text-ink-4 text-[10px]" aria-hidden>
        ·
      </span>
      <span className="text-[11px] tracking-[0.02em] lowercase">
        {verb.toLowerCase()}
      </span>
      {meta && (
        <span className="text-[10px] font-mono text-ink-3 lowercase tracking-[0.02em]">
          · {meta.toLowerCase()}
        </span>
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

// Quote value + delta (signed change). Staleness moves to a tooltip
// on the value so it can never get clipped at the right edge of the
// ribbon (the v3 "ri close" bug). The tooltip carries both the
// human label ("Fri close") and the precise CT timestamp.
function ValueWithTooltip({
  staleness,
  stalenessAt,
  delta,
  value,
  loaded,
}: {
  staleness: string | null;
  stalenessAt: string | null;
  delta: number;
  value: React.ReactNode;
  loaded: boolean;
}) {
  const valueNode = loaded ? (
    value
  ) : (
    // Skeleton placeholder. Width matches a typical 2-decimal price
    // so the ribbon doesn't reflow on first paint.
    <span
      aria-hidden
      className="inline-block h-3 w-9 rounded-pill bg-paper-2/80 animate-pulse"
    />
  );

  // Tooltip body: when stale, show the staleness phrase + CT
  // timestamp. When live, show "Live · updated <time>".
  const tooltipBody = staleness
    ? `Reflects ${staleness}${stalenessAt ? ` (${stalenessAt})` : ""}.`
    : "Live — last updated moments ago.";

  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <InfoTooltip
        label={staleness ? "Stale price" : "Live price"}
        content={tooltipBody}
      >
        <span
          className={cn(
            "cursor-help",
            // Visually mark stale prices so the user notices without
            // needing the tooltip — italic + muted ink.
            staleness ? "italic text-ink-3" : "text-ink",
          )}
        >
          {valueNode}
        </span>
      </InfoTooltip>
      {!staleness && loaded && (
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

// Renders the precise CT timestamp matching the staleness label, so
// the tooltip can show "Reflects Fri close (Fri 15:00 CT)" rather
// than just the human phrase.
function useStalenessTimestamp(): string | null {
  const [ts, setTs] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const spy = getSessionInfo("SPY", now);
      // rthClose carries the most recent (or upcoming) RTH close;
      // when staleness is present, that's the moment the price
      // reflects. Format in CT for unambiguous reference.
      try {
        const formatted = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Chicago",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(spy.rthClose);
        setTs(`${formatted} CT`);
      } catch {
        setTs(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return ts;
}
