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
import { cn } from "@/lib/utils";

interface Props {
  engine: "SPY" | "SPX";
  current: EngineState;
  /** ISO timestamp of the next significant transition. Drives the live countdown. */
  nextEventISO?: string;
  /** Short human label for the next event ("Setup opens", "RTH closes"). */
  nextEventLabel?: string;
  /** One-line plain-English explanation of why the engine is in this state. */
  explanation?: string;
  className?: string;
}

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
  className,
}: Props) {
  const currentIdx = ENGINE_STATES.indexOf(current);
  const labelTone = engine === "SPX" ? "text-violet" : "text-ink-2";
  const def = PHASE_DEFINITIONS[current];

  return (
    <section
      aria-label={`${engine} engine state pipeline`}
      className={cn(
        "rounded-card border border-rule bg-paper px-4 py-3 md:px-5 md:py-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        {/* Ticker badge — engine identity, accent-tinted. */}
        <div
          className={cn(
            "shrink-0 inline-flex items-center gap-2 self-start",
          )}
        >
          <span
            className={cn(
              "font-mono text-[11px] tracking-[0.18em] uppercase font-bold",
              labelTone,
            )}
          >
            {engine}
          </span>
          <span aria-hidden className="h-3 w-px bg-rule" />
          <span className="text-h3 font-serif text-ink tracking-tight">
            {def.label}
          </span>
        </div>

        {/* Stepper. Real <ol> with aria-current="step" on the active
            <li>. Each step has an sr-only description so screen
            readers announce position + label + status. */}
        <ol
          role="list"
          aria-label={`${engine} state progression`}
          className="flex items-center gap-0 flex-1 min-w-0 overflow-x-auto"
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
                className="flex items-center shrink-0"
              >
                {/* Connector hairline between consecutive nodes. */}
                {!isFirst && (
                  <span
                    aria-hidden
                    className={cn(
                      "h-px w-4 md:w-6",
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
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-pill",
                      "text-[11px] tracking-[0.01em] whitespace-nowrap",
                      "transition-colors",
                      isCurrent &&
                        cn(
                          "font-semibold animate-breathe",
                          CURRENT_PILL_TONE[state],
                        ),
                      // ink-3 (#6B7280) on paper (#FFFFFF) = 4.83:1 (AA pass).
                      // Distinguished from passed via lower weight + no fill.
                      isPassed && "bg-paper-2/50 text-ink-3 font-medium",
                      isFuture && "text-ink-3 font-normal",
                    )}
                  >
                    {phase.label}
                  </span>
                </InfoTooltip>
              </li>
            );
          })}
        </ol>

        {/* Right-rail meta column. Stacks below stepper on mobile. */}
        {(nextEventISO || nextEventLabel) && (
          <div className="shrink-0 self-start md:self-center md:text-right md:min-w-[160px] flex flex-col gap-0.5">
            {nextEventLabel && (
              <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-ink-3">
                {nextEventLabel}
              </span>
            )}
            {nextEventISO && (
              <span className="font-mono text-meta tabular-nums text-ink">
                <Countdown to={nextEventISO} verb="in" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Plain-English explanation underneath the stepper. */}
      {explanation && (
        <p className="mt-3 text-body text-ink-2 leading-snug">{explanation}</p>
      )}
    </section>
  );
}

// Deliverable alias from the v2 spec — same component, canonical name.
export { StatePipeline as PipelineStepper };

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
