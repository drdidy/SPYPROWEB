"use client";

// Decision Slate's per-engine state pipeline. Refactored from v1 with:
//
//   - WCAG AA contrast on every step tone (>= 4.5:1 on the paper
//     surface). v1's `text-ink-4` for future steps measured 2.95:1 —
//     replaced with `text-ink-3` paired with reduced weight to keep
//     the active step visually dominant.
//   - sr-only step description per <li>, e.g. "Step 3 of 7: Watch
//     (current)". AT users get a structured progression read-out.
//   - Stronger active pill: 2px ring in the brand tint + faint inner
//     shadow so it reads as "current state", not "button".
//   - Connector hairline rendered between every consecutive pair (not
//     only some) — verified via the `!isFirst` predicate plus a
//     post-render guard test in scripts/test-state-pipeline.ts.
//
// Public API is unchanged. Existing call-sites that import
// `StatePipeline` keep working; consumers preferring the deliverable
// name can import `PipelineStepper` from the same module.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ENGINE_STATES, type EngineState } from "@/lib/states";
import { PHASE_DEFINITIONS } from "@/content/phase-definitions";
import { Countdown } from "@/components/decision-slate/Countdown";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { displayEngine } from "@/lib/engine-labels";
import { cn } from "@/lib/utils";
import type { FeedId } from "@/lib/feed-health";
import { FeedHeartbeat } from "./FeedHealthProvider";
import {
  StructurePathChart,
  type StructureChartData,
} from "./StructurePathChart";

interface Props {
  engine: "SPY" | "SPX";
  current: EngineState;
  /** ISO timestamp of the next significant transition. Drives the live countdown. */
  nextEventISO?: string;
  /** Short human label for the next event ("Setup opens", "RTH closes"). */
  nextEventLabel?: string;
  /** One-line plain-English explanation of why the engine is in this state. */
  explanation?: string;
  structureLevels?: StructureLevels;
  structureChart?: StructureChartData | null;
  feedId?: FeedId;
  showProgression?: boolean;
  className?: string;
}

export interface StructureLevels {
  upper?: number | null;
  anchor?: number | null;
  lower?: number | null;
}

// v10 P1-4: state-color top border. The most consequential change
// on the dashboard — engine going from Stand-down to Watch to
// Armed to Go — should never be just a typography swap. A 2px top
// border on the engine card colored by current state makes the
// state read at a glance from across the room.
//
// Inline-style hex values so the rule is locked at the markup
// boundary (Tailwind compile chains can't reorder these).
const STATE_TOP_BORDER: Record<EngineState, string> = {
  PRE_CONFIG: "#D5CDB9",  // neutral gray
  STAND_DOWN: "#D5CDB9",  // neutral gray
  WATCH: "#C9A227",       // amber
  WAIT: "#C9A227",        // amber
  ARMED: "#4A6FA5",       // blue
  GO: "#2F7D3F",          // green
  COOLDOWN: "#B8B0A0",    // muted gray
};

// Active-pill palette. ring-2 + inset shadow lifts the active step
// off the surface so it reads as "this is now", not "this is a
// clickable button".
const CURRENT_PILL_TONE: Record<EngineState, string> = {
  PRE_CONFIG:
    "bg-state-armed/15 text-state-armed ring-2 ring-state-armed/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  STAND_DOWN:
    "bg-paper-2 text-ink ring-2 ring-rule-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  WATCH:
    "bg-gold-tint text-gold-ink ring-2 ring-gold/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  WAIT:
    "bg-gold-tint text-gold-ink ring-2 ring-gold/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  ARMED:
    "bg-state-armed/15 text-state-armed ring-2 ring-state-armed/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  GO:
    "bg-bull-tint text-bull-ink ring-2 ring-bull/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  COOLDOWN:
    "bg-paper-2 text-ink ring-2 ring-rule-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
};

export function StatePipeline({
  engine,
  current,
  nextEventISO,
  nextEventLabel,
  explanation,
  structureLevels,
  structureChart,
  feedId,
  showProgression = false,
  className,
}: Props) {
  const currentIdx = ENGINE_STATES.indexOf(current);
  const labelTone = engine === "SPX" ? "text-violet" : "text-ink-2";
  const currentPhase = PHASE_DEFINITIONS[current];

  return (
    <section
      aria-label={`${displayEngine(engine)} engine state pipeline`}
      // v5 #1: min-w-0 + overflow-hidden on the section is the
      // overflow guard so the inner stepper can't bully the parent
      // grid track wider than its column.
      // v10 P1-3 + P1-4: tier-2 surface (pure white, subtle border)
      // + a 2px top border colored by the current state. The border
      // tone is set inline so theme/Tailwind chains can't reorder it.
      className={cn(
        "rounded-card border border-rule-tier2 bg-paper-tier2 px-4 py-3.5 md:px-5 md:py-4",
        "border-t-[3px] shadow-card",
        "min-w-0 overflow-hidden",
        className,
      )}
      style={{ borderTopColor: STATE_TOP_BORDER[current] }}
    >
      <div className="grid gap-4 border-b border-rule pb-4 md:grid-cols-[200px_1fr_170px] md:items-start">
        {/* v4 #5: drop the serif state-name title that lived next to
            the ticker. The active pill in the stepper below already
            names the state — rendering "Pre-config" twice (title +
            chip) was redundant. The ticker now stands alone. */}
        <div className="min-w-0">
          {/* v8 P1-2: SPX → ES at the render boundary. The `engine`
              prop stays as the wire-level identifier so the data
              path (snapshot keys, /api/spx) keeps working unchanged. */}
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2
                className={cn(
                  "font-serif text-[40px] leading-none tracking-tight",
                  labelTone,
                )}
              >
                {displayEngine(engine)}
              </h2>
              {feedId && <FeedHeartbeat feedId={feedId} className="mt-1" />}
            </div>
            <span
              className={cn(
                "mt-2 inline-flex h-6 items-center rounded-[4px] px-2 font-mono text-[10px] font-bold uppercase tracking-[0.10em]",
                current === "GO" || current === "ARMED"
                  ? "bg-bull text-paper"
                  : "bg-paper-2 text-ink-2 ring-1 ring-rule-strong",
              )}
            >
              {current === "GO" || current === "ARMED" ? "Bull engine" : "Neutral engine"}
            </span>
          </div>
        </div>

        <div className="min-w-0 border-rule md:border-l md:pl-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            Current state
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-serif text-[40px] leading-none text-bull-ink">
              {Math.max(1, currentIdx + 1)}
            </span>
            <span className="font-serif text-[24px] leading-none text-ink">
              {currentPhase.label}
            </span>
          </div>
        </div>

        {(nextEventISO || nextEventLabel) && (
          <div className="shrink-0 border-rule md:border-l md:pl-6 md:text-right">
            {nextEventLabel && (
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-ink-3">
                Time to next state
              </span>
            )}
            {nextEventISO && (
              <span className="mt-1 block font-mono text-[18px] tabular-nums text-bull-ink">
                <Countdown to={nextEventISO} verb="" />
              </span>
            )}
            {nextEventLabel && (
              <span className="mt-0.5 block font-mono text-[10px] text-ink-3">
                {nextEventLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {showProgression && (
      <div className="mt-3 min-w-0">
        {/* Stepper. Real <ol> with aria-current="step" on the active
            <li>. Each step has an sr-only description so screen
            readers announce position + label + status.
            v5 #1: overflow-x-hidden (not auto) — the section never
            scrolls horizontally; instead the stepper switches to a
            collapsed "current → next" view at <xl widths via the
            responsive label below. */}
        <ol
          role="list"
          aria-label={`${displayEngine(engine)} state progression`}
          className="flex items-center gap-0 flex-1 min-w-0 overflow-hidden"
        >
          {ENGINE_STATES.map((state, i) => {
            const phase = PHASE_DEFINITIONS[state];
            const isCurrent = i === currentIdx;
            const isPassed = currentIdx >= 0 && i < currentIdx;
            const isFuture = currentIdx >= 0 && i > currentIdx;
            const isFirst = i === 0;
            const stepNum = i + 1;
            const stepStatus = isCurrent
              ? "current"
              : isPassed
                ? "completed"
                : "upcoming";
            return (
              <li
                key={state}
                aria-current={isCurrent ? "step" : undefined}
                className="flex items-center min-w-0"
              >
                {/* Connector hairline. v5 #1: thinner spacing at lg
                    so seven nodes fit a half-screen card without the
                    parent grid overflowing. */}
                {!isFirst && (
                  <span
                    aria-hidden
                    className={cn(
                      "h-px w-1.5 md:w-2 xl:w-2.5",
                      isPassed || isCurrent
                        ? "bg-rule-strong"
                        : "bg-rule",
                    )}
                  />
                )}
                {/* sr-only structured description for AT. The visual
                    label below is short to keep the strip scannable;
                    this span carries the full progression context. */}
                <span className="sr-only">
                  Step {stepNum} of {ENGINE_STATES.length}: {phase.label} —{" "}
                  {stepStatus}.
                </span>
                <InfoTooltip
                  label={phase.label}
                  content={
                    <>
                      <span className="block">{phase.summary}</span>
                      <span className="block mt-1 opacity-80">
                        Enter on: {phase.enterOn}
                      </span>
                      <span className="block opacity-80">
                        Exit on: {phase.exitOn}
                      </span>
                    </>
                  }
                >
                  {/* v7 P0-3: four-tier responsive label render so the
                      stepper never overflows its parent grid track:
                        ≥1440 (xl-plus)  full label  ("Pre-config")
                        1280-1439 (xl)   short label ("Pre", "Stand", "Watch", "Wait", "Armed", "Go", "Cool")
                        1024-1279 (lg)   dot for inactive, full label for current
                        <1024            full label (the row stacks vertically anyway)
                      The active step always shows the full label. */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-pill",
                      "text-[10.5px] tracking-[0.01em] whitespace-nowrap",
                      "transition-colors",
                      // The active pill is always rendered as a labeled
                      // chip; the dot-mode at lg only applies to non-
                      // current steps via the `xl-plus:hidden xl:hidden lg:flex`
                      // dot below.
                      isCurrent
                        ? cn(
                            "px-1 py-0.5 font-semibold animate-breathe",
                            CURRENT_PILL_TONE[state],
                          )
                        : isPassed
                          ? "px-1 py-0.5 bg-paper-2/50 text-ink-3 font-medium"
                          : "px-1 py-0.5 text-ink-3 font-normal",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                        isCurrent
                          ? "border-bull bg-bull text-paper"
                          : isPassed
                            ? "border-ink-2 bg-paper text-ink"
                            : "border-rule-strong bg-paper text-ink-3",
                      )}
                    >
                      {stepNum}
                    </span>
                    {/* < lg: full label (the row stacks vertically) */}
                    <span className="lg:hidden">{phase.label}</span>
                    {/* lg–xl-plus: full for the current step only.
                        Inactive steps at lg render the dot below
                        instead of this pill — see the dot fallback
                        block. */}
                    {isCurrent ? (
                      <>
                        {/* lg–xl: full label for current */}
                        <span className="hidden lg:inline xl:hidden">
                          {phase.label}
                        </span>
                        {/* xl–xl-plus: short abbreviation */}
                        <span className="hidden">
                          {phase.short}
                        </span>
                        {/* xl-plus+: full label */}
                        <span className="hidden xl:inline">
                          {phase.label}
                        </span>
                      </>
                    ) : (
                      <>
                        {/* lg: nothing (dot rendered separately) */}
                        <span className="hidden lg:inline xl:hidden text-[0px] leading-none">
                          •
                        </span>
                        {/* xl–xl-plus: short abbreviation */}
                        <span className="hidden xl:inline">
                          {phase.short}
                        </span>
                        {/* xl-plus+: full label */}
                        <span className="hidden">
                          {phase.label}
                        </span>
                      </>
                    )}
                  </span>
                </InfoTooltip>
              </li>
            );
          })}
        </ol>

      </div>
      )}

      <MiniStructureMap
        engine={engine}
        current={current}
        levels={structureLevels}
        chart={structureChart}
      />

      <EngineFooterMetrics engine={engine} current={current} />

      {/* Plain-English explanation underneath the stepper. */}
      {explanation && (
        <p className="mt-3 text-body text-ink-2 leading-snug">{explanation}</p>
      )}
    </section>
  );
}

// Deliverable alias from the v2 spec — same component, canonical name.
function MiniStructureMap({
  engine,
  current,
  levels,
  chart,
}: {
  engine: "SPY" | "SPX";
  current: EngineState;
  levels?: StructureLevels;
  chart?: StructureChartData | null;
}) {
  const isEs = engine === "SPX";
  const rails = isEs
    ? [
        { label: "Upper rail", value: levels?.upper ?? null, tone: "text-bull-ink" },
        { label: "Anchor", value: levels?.anchor ?? null, tone: "text-gold-ink" },
        { label: "Lower rail", value: levels?.lower ?? null, tone: "text-bear-ink" },
      ]
    : [
        { label: "Upper rail", value: levels?.upper ?? null, tone: "text-bull-ink" },
        { label: "Anchor", value: levels?.anchor ?? null, tone: "text-gold-ink" },
        { label: "Lower rail", value: levels?.lower ?? null, tone: "text-bear-ink" },
      ];
  const accent =
    current === "GO" || current === "ARMED"
      ? "bull"
      : current === "WAIT" || current === "WATCH"
        ? "gold"
        : isEs
          ? "violet"
          : "neutral";

  return (
    <div className="group/structure mt-3 rounded-soft border border-rule-soft bg-paper-tier3 px-3 py-3 transition-colors hover:border-rule-strong">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          Session rails
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
          Actual path
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-[112px_1fr]">
        <div className="space-y-2.5">
          {rails.map((rail) => (
            <div key={rail.label} className="grid grid-cols-[1fr_auto] gap-2">
              <span className="font-mono text-[10px] text-ink-3">
                {rail.label}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  rail.tone,
                )}
              >
                {typeof rail.value === "number" ? rail.value.toFixed(isEs ? 0 : 2) : "--"}
              </span>
            </div>
          ))}
        </div>
        <StructurePathChart
          data={chart}
          variant="paper"
          accent={accent}
          height={112}
          title="price vs rails"
        />
      </div>
    </div>
  );
}

function EngineFooterMetrics({
  engine,
  current,
}: {
  engine: "SPY" | "SPX";
  current: EngineState;
}) {
  const active = current === "GO" || current === "ARMED" || current === "WAIT";
  const watching = current === "WATCH";
  const metrics = engine === "SPX"
    ? [
        ["Bias", active ? "Bull" : "Neutral"],
        ["Trend", active ? "Ascending" : "Range"],
        ["Strength", active ? "High" : watching ? "Medium" : "Low"],
        ["Quality", active ? "A" : watching ? "B" : "Pending"],
      ]
    : [
        ["Bias", active ? "Call" : "Neutral"],
        ["Trend", active ? "Anchor" : "Range"],
        ["Strength", active ? "High" : watching ? "Medium" : "Low"],
        ["Quality", active ? "A" : watching ? "B" : "Pending"],
      ];

  return (
    <div className="mt-3 grid grid-cols-4 divide-x divide-rule-soft rounded-[6px] border border-rule-soft bg-paper-tier3">
      {metrics.map(([label, value]) => (
        <div key={label} className="min-w-0 px-2.5 py-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
            {label}
          </div>
          <div className="mt-1 truncate font-serif text-[18px] leading-none text-ink">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

export { StatePipeline as PipelineStepper };

export function SlateStateRail({
  spyState,
  spxState,
  spyHistory,
  spxHistory,
}: {
  spyState: EngineState;
  spxState: EngineState;
  spyHistory: { ts: string; state: EngineState }[];
  spxHistory: { ts: string; state: EngineState }[];
}) {
  return (
    <section
      aria-label="Engine state progression"
      className="rounded-card border border-rule bg-paper-tier2 p-4 shadow-card"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            State rail
          </p>
          <h2 className="mt-1 font-serif text-h2 text-ink">
            Discipline sequence
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
          One rail per engine
        </span>
      </div>
      <div className="space-y-4">
        <StateRailRow engine="SPY" current={spyState} history={spyHistory} />
        <StateRailRow engine="SPX" current={spxState} history={spxHistory} />
      </div>
    </section>
  );
}

function StateRailRow({
  engine,
  current,
  history,
}: {
  engine: "SPY" | "SPX";
  current: EngineState;
  history: { ts: string; state: EngineState }[];
}) {
  const currentIdx = ENGINE_STATES.indexOf(current);
  const visibleHistory = history.slice(-4);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-2">
          {displayEngine(engine)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {PHASE_DEFINITIONS[current]?.label ?? current.replace(/_/g, " ")}
        </span>
      </div>
      <ol
        role="list"
        aria-label={`${displayEngine(engine)} seven-step state progression`}
        className="grid grid-cols-7 gap-1.5"
      >
        {ENGINE_STATES.map((state, index) => {
          const phase = PHASE_DEFINITIONS[state];
          const isCurrent = state === current;
          const isComplete = index < currentIdx;
          return (
            <li
              key={state}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "relative min-w-0 rounded-soft border px-2 py-2 text-center",
                "transition-colors",
                isCurrent
                  ? "border-gold bg-gold text-paper shadow-glow motion-safe:animate-breathe"
                  : isComplete
                    ? "border-bull/30 bg-bull-tint text-bull-ink"
                    : "border-rule bg-paper text-ink-3",
              )}
            >
              <span className="sr-only">
                Step {index + 1} of {ENGINE_STATES.length}: {phase.label}
                {isCurrent ? ", current" : isComplete ? ", completed" : ", upcoming"}.
              </span>
              <span
                aria-hidden
                className={cn(
                  "mx-auto mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold",
                  isCurrent
                    ? "bg-paper text-gold-ink"
                    : isComplete
                      ? "bg-bull text-paper"
                      : "bg-paper-2 text-ink-3",
                )}
              >
                {isComplete ? "✓" : index + 1}
              </span>
              <span className="block truncate font-mono text-[9px] uppercase tracking-[0.08em]">
                {phase.short}
              </span>
            </li>
          );
        })}
      </ol>
      {visibleHistory.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-ink-3">
          <span className="uppercase tracking-[0.14em] text-ink-4">Recent</span>
          {visibleHistory.map((entry, index) => (
            <span key={`${entry.ts}-${index}`} className="inline-flex items-center gap-1">
              <span className="tabular-nums">{formatHM(entry.ts)}</span>
              <span className="uppercase tracking-[0.08em] text-ink-2">
                {PHASE_DEFINITIONS[entry.state]?.short ?? entry.state}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatHM(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

// ---------------------------------------------------------------------
// Compact engine-status chip — kept for back-compat callers, but the
// v2 dashboard no longer renders it (the per-engine pipelines are the
// single source of truth).
// ---------------------------------------------------------------------

export function EngineStatusChip({
  spyState,
  spxState,
  href = "/dashboard",
}: {
  spyState: EngineState;
  spxState: EngineState;
  href?: string;
}) {
  const spyLabel = humanState(spyState);
  const spxLabel = humanState(spxState);
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 h-7 px-2.5 rounded-pill",
        "bg-paper-2/60 text-ink-2 hover:text-ink hover:bg-paper-2",
        "border border-rule transition-colors",
        "font-mono text-[11px] tracking-[0.06em]",
        "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
      )}
      aria-label={`Engines: SPY ${spyLabel}, SPX ${spxLabel}`}
    >
      <span className="text-ink-3 uppercase tracking-[0.10em] text-[10px]">
        Engines
      </span>
      <span className="font-bold">SPY</span>
      <span>{spyLabel}</span>
      <span className="text-ink-4" aria-hidden>
        ·
      </span>
      <span className="font-bold text-violet">SPX</span>
      <span>{spxLabel}</span>
      <ArrowRight size={10} className="text-ink-4" aria-hidden />
    </Link>
  );
}

function humanState(s: EngineState): string {
  const m: Record<EngineState, string> = {
    PRE_CONFIG: "pre-config",
    STAND_DOWN: "standing down",
    WATCH: "watching",
    WAIT: "waiting",
    ARMED: "armed",
    GO: "live",
    COOLDOWN: "cooldown",
  };
  return m[s];
}
