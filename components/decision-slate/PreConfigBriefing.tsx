"use client";

// Hero empty state shown only when BOTH engines are in PRE_CONFIG.
// Replaces the prior triple-redundant idle messaging with one
// composition: state, countdown, last-session recap, last-N record,
// and a teaching preview of what populates at setup.

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { LiveCountdown } from "./LiveCountdown";
import { LastSignalRecap } from "./LastSignalRecap";
import { EngineTrackRecord } from "./EngineTrackRecord";
import { SLATE_COPY } from "@/content/copy";
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
}

export function PreConfigBriefing({ spy, spx }: Props) {
  // Whichever engine wakes up first leads the countdown headline.
  const lead =
    Date.parse(spy.nextSetupISO) <= Date.parse(spx.nextSetupISO) ? spy : spx;

  return (
    <section
      aria-labelledby="pre-config-briefing-title"
      data-testid="pre-config-briefing"
      className="rounded-card border border-rule bg-paper-2/30 p-5 md:p-6 space-y-5"
    >
      <header className="flex items-baseline gap-3 flex-wrap">
        <h2
          id="pre-config-briefing-title"
          className="font-serif text-h2 text-ink tracking-tight"
        >
          {SLATE_COPY.preConfig.title}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-rule" />
        <span className="font-mono text-meta tabular-nums text-ink-2">
          Next setup ({lead.label})
          {" "}
          <LiveCountdown
            to={lead.nextSetupISO}
            verb="opens in"
            className="text-ink"
          />
        </span>
      </header>

      <p className="text-body text-ink-2 leading-relaxed max-w-2xl">
        {SLATE_COPY.preConfig.body}
      </p>

      {/* Per-engine track record. Lets the user see at a glance how
          the engine has been performing across recent sessions. The
          dots → Replay link is the validation path. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <EngineTrackRecord record={spy.trackRecord} />
        <EngineTrackRecord record={spx.trackRecord} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <EngineBriefing engine={spy} />
        <EngineBriefing engine={spx} />
      </div>

      {/* Teaching preview — single calm box. No more developer-y
          "integration pending" placeholder. */}
      <div className="rounded-soft border border-rule bg-paper px-4 py-3 flex items-start gap-3">
        <BookOpen size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        <div className="space-y-1">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
            What to watch at the open
          </p>
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
  return (
    <div className="rounded-soft border border-rule bg-paper px-4 py-3 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`font-mono text-[10px] tracking-[0.18em] uppercase font-bold ${labelTone}`}
        >
          {engine.label}
        </span>
        <span className="font-mono text-meta text-ink-3 tabular-nums">
          Setup {engine.nextSetupLabel} ·{" "}
          <LiveCountdown to={engine.nextSetupISO} verb="in" />
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
        href={engine.label === "SPY" ? "/spy" : "/spx"}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-3 hover:text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-soft"
      >
        Open {engine.label} channel
        <ArrowRight size={11} className="text-ink-4" aria-hidden />
      </Link>
    </div>
  );
}
