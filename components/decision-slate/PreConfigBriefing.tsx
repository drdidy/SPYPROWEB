"use client";

// Shown only when BOTH engines are in PRE_CONFIG. Gives the user
// real signal of value during the deadest hours: per-engine track
// record from the past N sessions (so they can see "is the engine
// any good?"), the previous session's actual recap, and a live
// countdown to the next setup window.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
      aria-label="Pre-config briefing"
      data-testid="pre-config-briefing"
      className="rounded-card border border-rule bg-paper-2/30 p-5 space-y-5"
    >
      <header className="flex items-baseline gap-3 flex-wrap">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
          {SLATE_COPY.preConfig.title}
        </span>
        <span className="h-px flex-1 bg-rule" aria-hidden />
        <span className="font-mono text-[11px] text-ink-2 tabular-nums">
          {lead.label} setup{" "}
          <LiveCountdown to={lead.nextSetupISO} verb="opens in" className="text-ink" />
        </span>
      </header>

      <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl">
        {SLATE_COPY.preConfig.body}
      </p>

      {/* Per-engine track record: lets the user see at a glance how
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

      <div className="rounded-soft border border-rule bg-paper px-3 py-2.5">
        <div className="eyebrow text-ink-3 mb-1">What to watch at the open</div>
        <p className="text-[12px] text-ink-3 leading-snug">
          {SLATE_COPY.preConfig.watchAtOpen}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link
          href="/replay"
          className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-paper-2 text-ink-2 hover:text-ink hover:bg-paper-2/70 font-mono text-[11px] uppercase tracking-[0.10em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          Replay last session
          <ArrowRight size={11} className="text-ink-3" />
        </Link>
        <Link
          href="/brief"
          className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-paper-2 text-ink-2 hover:text-ink hover:bg-paper-2/70 font-mono text-[11px] uppercase tracking-[0.10em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          Daily Brief
          <ArrowRight size={11} className="text-ink-3" />
        </Link>
      </div>
    </section>
  );
}

function EngineBriefing({ engine }: { engine: Engine }) {
  const labelTone = engine.label === "SPX" ? "text-violet" : "text-ink-3";
  return (
    <div className="rounded-soft border border-rule bg-paper px-3 py-3 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-mono text-[10px] tracking-[0.16em] uppercase ${labelTone}`}>
          {engine.label}
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          setup {engine.nextSetupLabel} ·{" "}
          <LiveCountdown to={engine.nextSetupISO} verb="in" />
        </span>
      </div>
      {engine.lastSignal ? (
        <LastSignalRecap recap={engine.lastSignal} />
      ) : (
        <p className="text-[11px] text-ink-3">
          Engine had no graded signal yesterday. Track-record dots above show
          recent days.
        </p>
      )}
    </div>
  );
}
