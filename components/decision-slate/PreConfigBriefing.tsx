"use client";

// "Markets quiet" briefing — shown only when both engines are in
// PRE_CONFIG. v2 collapses the v1 outer-card-around-inner-cards
// nesting: the briefing is now a section (heading, subtitle,
// hairline, grid of inner cards), so the inner cards are the only
// bordered surfaces. The redundant "Next setup (SPX) opens in 1d 2h"
// header line is dropped — the per-engine state pipelines above the
// briefing already render that countdown.

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { LastSignalRecap } from "./LastSignalRecap";
import { EngineTrackRecord } from "./EngineTrackRecord";
import { Countdown } from "./Countdown";
import { SLATE_COPY } from "@/content/copy";
import { displayEngine } from "@/lib/engine-labels";
import { cn } from "@/lib/utils";
import type { LastSignalSummary } from "@/types/decision-slate";
import type { EngineTrackRecord as TrackRecord } from "@/lib/track-record";

interface Engine {
  label: "SPY" | "SPX";
  /** Next config-window start ISO. */
  nextSetupISO: string;
  /** Human label e.g. "Mon 03:00 CT". */
  nextSetupLabel: string;
  lastSignal: LastSignalSummary | null;
  /** Last N sessions' outcomes from replay endpoints. */
  trackRecord: TrackRecord;
}

interface Props {
  spy: Engine;
  spx: Engine;
  className?: string;
}

export function PreConfigBriefing({ spy, spx, className }: Props) {
  return (
    <section
      aria-labelledby="pre-config-briefing-title"
      data-testid="pre-config-briefing"
      className={cn(className)}
    >
      {/* Section header — heading + one-line subtitle + hairline. */}
      <header className="space-y-1">
        <div className="flex items-baseline gap-3">
          <h2
            id="pre-config-briefing-title"
            className="font-serif text-h2 text-ink tracking-tight"
          >
            {SLATE_COPY.preConfig.title}
          </h2>
          <span aria-hidden className="h-px flex-1 bg-rule" />
        </div>
        <p className="text-body text-ink-2 leading-relaxed max-w-2xl">
          {SLATE_COPY.preConfig.body}
        </p>
      </header>

      {/* v10 P1-12: 16px rhythm — h2 → first row of cards. */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EngineTrackRecord record={spy.trackRecord} />
        <EngineTrackRecord record={spx.trackRecord} />
      </div>

      {/* v10 P1-12: 16px rhythm — row → next row. */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EngineBriefing engine={spy} />
        <EngineBriefing engine={spx} />
      </div>

      {/* v10 P1-12: 24px rhythm — last card row → "What to watch".
          v10 P1-3: tier-3 surface (faint cream, top divider only,
          no border). */}
      <div className="mt-6 pt-4 border-t border-rule bg-paper-tier3 px-4 py-4 rounded-soft flex items-start gap-3">
        <BookOpen size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        <div className="space-y-1">
          {/* v10 P1-11: editorial section title → serif. */}
          <p className="font-serif text-h3 text-ink tracking-tight">What to watch at the open</p>
          <p className="text-body text-ink-2 leading-snug">
            {SLATE_COPY.preConfig.watchAtOpen}
          </p>
        </div>
      </div>
    </section>
  );
}

function EngineBriefing({ engine }: { engine: Engine }) {
  const labelTone = engine.label === "SPX" ? "text-violet" : "text-ink-2";
  // v8 P1-2: SPX renders as "ES" everywhere on /dashboard. The
  // engine.label prop stays as the wire identifier so the data
  // path keeps working.
  const display = displayEngine(engine.label);
  return (
    // v10 P1-3: tier-3 surface — faint cream, top divider only.
    <div className="rounded-soft bg-paper-tier3 border-t border-rule px-4 py-3 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.18em] uppercase font-bold",
            labelTone,
          )}
        >
          {display}
        </span>
        <span className="font-mono text-meta text-ink-3 tabular-nums">
          Setup {engine.nextSetupLabel} ·{" "}
          <Countdown to={engine.nextSetupISO} verb="in" />
        </span>
      </div>
      {engine.lastSignal ? (
        <LastSignalRecap recap={engine.lastSignal} />
      ) : (
        <p className="text-meta text-ink-3 leading-snug">
          Nothing graded yesterday. Recent sessions are in the dot row above.
        </p>
      )}
      <Link
        href={engine.label === "SPY" ? "/spy" : "/es"}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2.5 rounded-pill",
          "bg-paper-2/60 text-ink-2 hover:text-ink hover:bg-paper-2",
          "border border-rule transition-colors",
          "text-[11px] tracking-[0.02em] font-medium",
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        Open {display} channel
        <ArrowRight size={11} className="text-ink-4" aria-hidden />
      </Link>
    </div>
  );
}
