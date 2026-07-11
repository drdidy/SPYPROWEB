"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CalendarClock, LineChart } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LastSignalRecap } from "./LastSignalRecap";
import { EngineTrackRecord } from "./EngineTrackRecord";
import { Countdown } from "./Countdown";
import { SLATE_COPY } from "@/content/copy";
import { displayEngine } from "@/lib/engine-labels";
import { cn } from "@/lib/utils";
import { FeedHeartbeat } from "./FeedHealthProvider";
import type { LastSignalSummary } from "@/types/decision-slate";
import type { EngineTrackRecord as TrackRecord } from "@/lib/track-record";
import type { FeedId } from "@/lib/feed-health";

interface Engine {
  label: "SPY" | "SPX";
  nextSetupISO: string;
  nextSetupLabel: string;
  lastSignal: LastSignalSummary | null;
  trackRecord: TrackRecord;
  trackFeedId?: FeedId;
  lastSessionFeedId?: FeedId;
}

interface Props {
  spy: Engine;
  spx: Engine;
  className?: string;
}

type BriefingTabKey = "plan" | "form" | "brief";

export function PreConfigBriefing({ spy, spx, className }: Props) {
  const [tab, setTab] = useState<BriefingTabKey>("plan");
  const engines = [spy, spx] as const;

  return (
    <section
      aria-labelledby="pre-config-briefing-title"
      data-testid="pre-config-briefing"
      className={cn(className)}
    >
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

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Quiet market view">
        <BriefingTab active={tab === "plan"} onClick={() => setTab("plan")}>
          Open Plan
        </BriefingTab>
        <BriefingTab active={tab === "form"} onClick={() => setTab("form")}>
          Recent Form
        </BriefingTab>
        <BriefingTab active={tab === "brief"} onClick={() => setTab("brief")}>
          Brief
        </BriefingTab>
      </div>

      {tab === "plan" && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {engines.map((engine) => (
            <EngineBriefing key={engine.label} engine={engine} />
          ))}
        </div>
      )}

      {tab === "form" && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EngineTrackRecord record={spy.trackRecord} feedId={spy.trackFeedId} />
          <EngineTrackRecord record={spx.trackRecord} feedId={spx.trackFeedId} />
        </div>
      )}

      {tab === "brief" && (
        <div className="mt-4 rounded-soft border border-rule bg-paper px-4 py-4 shadow-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-soft border border-rule bg-paper-2 text-gold-ink">
                <BookOpen size={15} aria-hidden />
              </span>
              <div>
                <p className="font-serif text-h3 text-ink tracking-tight">
                  Opening brief
                </p>
                <p className="mt-1 max-w-2xl text-body text-ink-2 leading-snug">
                  {SLATE_COPY.preConfig.watchAtOpen}
                </p>
              </div>
            </div>
            <Link
              href="/brief"
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-pill border border-rule bg-paper-2 px-4",
                "font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2 transition hover:border-rule-strong hover:text-ink",
                "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
              )}
            >
              Open brief
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {engines.map((engine) => (
              <div
                key={engine.label}
                className="rounded-soft border border-rule-soft bg-paper-2/45 px-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <CalendarClock size={14} className="text-ink-3" aria-hidden />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                    {displayEngine(engine.label)} next setup
                  </span>
                </div>
                <div className="mt-2 font-serif text-[22px] leading-none text-ink">
                  {engine.nextSetupLabel}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
                  <LineChart size={13} aria-hidden />
                  <Countdown to={engine.nextSetupISO} verb="opens in" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BriefingTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-9 rounded-pill border px-3 font-mono text-[11px] uppercase tracking-[0.12em] transition",
        "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper text-ink-3 hover:border-rule-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function EngineBriefing({ engine }: { engine: Engine }) {
  const labelTone = engine.label === "SPX" ? "text-violet" : "text-ink-2";
  const display = displayEngine(engine.label);
  return (
    <div className="rounded-soft border border-rule bg-paper px-4 py-4 shadow-card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.18em] uppercase font-bold",
            labelTone,
          )}
        >
          {display}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-meta text-ink-3 tabular-nums">
          {engine.lastSessionFeedId && (
            <FeedHeartbeat feedId={engine.lastSessionFeedId} />
          )}
          Setup {engine.nextSetupLabel} / <Countdown to={engine.nextSetupISO} verb="in" />
        </span>
      </div>
      {engine.lastSignal ? (
        <LastSignalRecap recap={engine.lastSignal} />
      ) : (
        <p className="text-meta text-ink-3 leading-snug">
          Nothing graded yesterday. Recent sessions remain available in Recent Form.
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
