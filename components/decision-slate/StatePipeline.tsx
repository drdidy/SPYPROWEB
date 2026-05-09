"use client";

// Slate's redesigned state-pipeline stepper. Replaces the flat
// horizontal phase rail (<StateLadder />) on the dashboard. Every
// engine renders one strip with:
//
//   [ticker]  ●─●─●━●━○━○━○        Standing down — markets quiet
//                ↑ current               12h 04m to next setup
//
//   - filled pill on the current step (semantic-colored)
//   - solid line behind completed steps; hairline behind future
//   - tap / focus any step to read its definition (via InfoTooltip)
//   - real <ol> with aria-current="step" on the active node
//
// The strip carries the engine's current-state name in a readable
// size, a one-line plain-English explanation, and a live countdown
// to the next session transition.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ENGINE_STATES, type EngineState } from "@/lib/states";
import { PHASE_DEFINITIONS } from "@/content/phase-definitions";
import { LiveCountdown } from "@/components/decision-slate/LiveCountdown";
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

const CURRENT_PILL_TONE: Record<EngineState, string> = {
  PRE_CONFIG:
    "bg-state-armed/15 text-state-armed ring-1 ring-state-armed/30",
  STAND_DOWN:
    "bg-paper-2 text-ink-2 ring-1 ring-rule-strong",
  WATCH:
    "bg-gold-tint text-gold-ink ring-1 ring-gold/30",
  WAIT:
    "bg-gold-tint text-gold-ink ring-1 ring-gold/30",
  ARMED:
    "bg-state-armed/15 text-state-armed ring-1 ring-state-armed/30",
  GO:
    "bg-bull-tint text-bull-ink ring-1 ring-bull/30",
  COOLDOWN:
    "bg-paper-2 text-ink-2 ring-1 ring-rule-strong",
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

        {/* Stepper. Real <ol> with aria-current="step" so AT can read
            the progression. Visual treatment is decoupled into
            connecting hairlines + colored pills. */}
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
            return (
              <li
                key={state}
                aria-current={isCurrent ? "step" : undefined}
                className="flex items-center shrink-0"
              >
                {/* Connector to previous node — full color when both
                    sides are reached, hairline otherwise. */}
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
                      isPassed && "bg-paper-2/40 text-ink-3 font-medium",
                      isFuture && "text-ink-4",
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
                <LiveCountdown to={nextEventISO} verb="in" />
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

// ---------------------------------------------------------------------
// Compact dashboard-header chip used to replace the duplicate
// "SPY PRE-CONFIG / SPX PRE-CONFIG" pill buttons in the top header.
// One-line, neutral surface, navigates nowhere — purely informational.
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
