// State-aware command module for Decision Slate. This is the page's
// visual anchor: a compact trading-desk panel with the current action,
// structure rails, and countdowns in one glance.

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Rewind,
  Activity,
  Target,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  recommendationFor,
  type Recommendation,
} from "@/lib/recommendations";
import { Countdown } from "@/components/decision-slate/Countdown";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { EngineState } from "@/lib/states";
import {
  StructurePathChart,
  type StructureChartData,
} from "./StructurePathChart";
import { ContractProjectionCard } from "@/components/options/ContractProjection";
import type { ContractProjection } from "@/lib/contract-projection";
import { SLATE_COPY } from "@/content/copy";
import { FeedHeartbeat } from "./FeedHealthProvider";
import type { FeedId } from "@/lib/feed-health";
import { VerdictActions } from "./VerdictActions";

const ICONS: Record<Recommendation["id"], LucideIcon> = {
  "live-spy": Activity,
  "live-spx": Activity,
  "options-cockpit": Target,
  "log-replay": Rewind,
  "daily-brief": BookOpen,
};

const COMMAND_COPY: Record<Recommendation["id"], { title: string; posture: string }> = {
  "live-spy": { title: "Track SPY Structure", posture: "SPY LIVE - WATCH STRUCTURE" },
  "live-spx": { title: "Track ES Structure", posture: "ES LIVE - WATCH STRUCTURE" },
  "options-cockpit": { title: "Stage Execution", posture: "ORDER WINDOW - SIZE RISK" },
  "log-replay": { title: "Review The Tape", posture: "SESSION CLOSED - GRADE EXECUTION" },
  "daily-brief": { title: "Stand Aside", posture: "MARKETS QUIET - AWAIT STRUCTURE" },
};

interface Props {
  spyState: EngineState;
  spxState: EngineState;
  spyNextEventISO?: string;
  spxNextEventISO?: string;
  spyEventVerb?: string;
  spxEventVerb?: string;
  spyChart?: StructureChartData | null;
  spxChart?: StructureChartData | null;
  spyProjection?: ContractProjection | null;
  spxProjection?: ContractProjection | null;
  compactHeader?: boolean;
  slateDateLabel?: string;
  sessionDate?: string;
  unifiedChrome?: boolean;
  entryCostInScorecard?: boolean;
  feedId?: FeedId;
  className?: string;
}

export function RecommendedAction({
  spyState,
  spxState,
  spyNextEventISO,
  spxNextEventISO,
  spyEventVerb = "opens",
  spxEventVerb = "opens",
  spyChart,
  spxChart,
  spyProjection,
  spxProjection,
  compactHeader = false,
  slateDateLabel,
  sessionDate,
  unifiedChrome = false,
  entryCostInScorecard = false,
  feedId,
  className,
}: Props) {
  const rec = recommendationFor(spyState, spxState);
  const Icon = ICONS[rec.id];
  const command = COMMAND_COPY[rec.id];
  const showContext = !!(spyNextEventISO || spxNextEventISO);
  const confidence =
    spyState === "GO" || spxState === "GO"
      ? 88
      : spyState === "ARMED" || spxState === "ARMED"
        ? 82
      : 72;
  const activeChart = rec.id === "live-spx" ? spxChart : spyChart ?? spxChart;
  const activeProjection =
    rec.id === "live-spx" ? spxProjection : spyProjection ?? spxProjection;
  const chartAccent =
    rec.id === "live-spx"
      ? "violet"
      : spyState === "GO" || spxState === "GO"
        ? "bull"
        : spyState === "ARMED" || spxState === "ARMED"
          ? "gold"
          : "neutral";

  return (
    <section
      aria-labelledby="recommended-action-heading"
      data-testid="recommended-action"
      className={cn(
        "relative overflow-hidden rounded-[22px] border border-[#C9A227]/75 bg-[#071116] text-paper",
        "shadow-[0_26px_70px_-34px_rgba(7,17,22,0.95),inset_0_1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(201,162,39,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,39,0.10) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative border-b border-paper/10 px-5 py-3 md:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-soft">
              Command workspace
            </span>
            <span aria-hidden className="h-px w-10 bg-gold/45" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/48">
              Decision Slate
            </span>
            {compactHeader && slateDateLabel && (
              <>
                <span aria-hidden className="h-px w-6 bg-paper/18" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/46">
                  {slateDateLabel}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {compactHeader && (
              <InfoTooltip
                label={SLATE_COPY.helpAboutSlate.title}
                content={SLATE_COPY.helpAboutSlate.body}
                placement="bottom"
              >
                <span
                  aria-label="About the Decision Slate"
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    "border border-paper/12 bg-paper/[0.045] text-[11px] font-bold text-paper/70",
                    "transition-colors hover:bg-paper/[0.08] hover:text-paper",
                    "outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
                  )}
                >
                  ?
                </span>
              </InfoTooltip>
            )}
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/46">
              Discipline before conviction
            </div>
            {feedId && <FeedHeartbeat feedId={feedId} />}
          </div>
        </div>
      </div>
      <div className="relative grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.1fr)_230px]">
        <div className="px-6 py-6 md:px-7 md:py-7">
          <p
            id="recommended-action-heading"
            className="font-mono text-[10px] tracking-[0.20em] uppercase text-gold-soft font-semibold"
          >
            Recommended next step
          </p>
          <h2 className="mt-2 font-serif text-[46px] leading-none text-paper md:text-[58px]">
            {command.title}
          </h2>
          <p className="mt-2 font-mono text-[11px] tracking-[0.12em] uppercase text-paper/70">
            {rec.reason} <span className="text-gold">·</span>{" "}
            <span className="text-gold-soft">{command.posture}</span>
          </p>
          <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-paper/78">
            {rec.description}
          </p>
          <Link
            href={rec.href}
            data-recommendation-id={rec.id}
            className={cn(
              "mt-6 inline-flex h-10 items-center gap-2 rounded-pill px-4",
              "bg-paper text-ink transition-colors hover:bg-gold-soft",
              "font-mono text-[12px] tracking-[0.06em] font-semibold",
              "outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071116]",
            )}
          >
            <Icon size={14} aria-hidden />
            {rec.label}
            <ArrowRight size={12} className="opacity-70" aria-hidden />
          </Link>
          <VerdictActions
            verdictState={command.title}
            spyState={spyState}
            spxState={spxState}
            sessionDate={sessionDate ?? new Date().toISOString().slice(0, 10)}
          />

          <div className="mt-7 grid max-w-2xl grid-cols-2 gap-2">
            <HeroMetric label="Confidence" value={`${confidence}%`} tone="text-gold-soft" />
            <HeroMetric label="Risk exposure" value="Low" tone="text-bull-soft" />
            <HeroMetric label="Reward setup" value="Neutral" tone="text-gold-soft" />
            <HeroMetric label="Trend context" value="Range" tone="text-paper" />
          </div>
          {entryCostInScorecard && (
            <div className="mt-2 max-w-2xl">
              <HeroMetric
                label="Entry cost"
                value={entryCostValue(activeProjection)}
                tone={
                  activeProjection
                    ? "text-gold-soft"
                    : "text-paper/72 text-[19px] leading-tight"
                }
                tooltip="Estimates the option debit at the planned entry line from the live chain and Greeks. It stays pending until the chain is usable; no placeholder debit is shown."
                className="min-h-[70px]"
              />
            </div>
          )}
          {!entryCostInScorecard && activeProjection ? (
            <ContractProjectionCard
              projection={activeProjection}
              compact
              className="mt-5 border-paper/15 bg-paper/[0.06] text-paper [&_.text-ink]:!text-paper [&_.text-ink-3]:!text-paper/58 [&_.text-ink-4]:!text-paper/42 [&_.bg-paper]:!bg-paper/[0.08] [&_.bg-paper-2\\/55]:!bg-paper/[0.08]"
            />
          ) : !entryCostInScorecard ? (
            <div className="mt-5 rounded-soft border border-paper/10 bg-paper/[0.045] px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/42">
                Entry cost model
              </p>
              <p className="mt-1 text-[12px] leading-snug text-paper/58">
                Publishes when the live option chain has usable Greeks. No placeholder debit is shown.
              </p>
            </div>
          ) : null}
        </div>

        <CommandRailDiagram
          chart={activeChart}
          accent={chartAccent}
          frameless={unifiedChrome}
        />

        <aside className="border-t border-paper/10 px-6 py-5 lg:border-l lg:border-t-0 lg:px-5 lg:py-7">
          <div className="flex items-center gap-2 text-gold-soft">
            <Hourglass size={15} aria-hidden />
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase font-semibold">
              Next event
            </span>
          </div>
          {showContext && (
            <div
              data-testid="recommended-action-context"
              className="mt-4 space-y-4 font-mono text-meta tabular-nums text-paper/78"
            >
              {spyNextEventISO && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-paper/45">
                    SPY {spyEventVerb}
                  </div>
                  <div className="mt-1 text-paper">
                    <Countdown to={spyNextEventISO} verb="in" />
                  </div>
                </div>
              )}
              {spxNextEventISO && (
                <div className="border-t border-paper/10 pt-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-paper/45">
                    ES {spxEventVerb}
                  </div>
                  <div className="mt-1 text-paper">
                    <Countdown to={spxNextEventISO} verb="in" />
                  </div>
                </div>
              )}
              <div className="border-t border-paper/10 pt-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-paper/45">
                  Data window
                </div>
                <div className="mt-1 text-paper">
                  {activeChart ? `${activeChart.label} ${activeChart.date}` : "Awaiting bars"}
                </div>
              </div>
              <div className="border-t border-paper/10 pt-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-gold-soft">
                  Session posture
                </div>
                <div className="mt-1 text-paper">Neutral</div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  tone,
  tooltip,
  className,
}: {
  label: string;
  value: string;
  tone: string;
  tooltip?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-soft border border-paper/10 bg-paper/[0.045] px-3 py-2.5", className)}>
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-paper/42">
        <span>{label}</span>
        {tooltip && (
          <InfoTooltip label={label} content={tooltip} placement="top">
            <span
              aria-label={`${label} details`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-paper/12 text-[9px] text-paper/58 outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              ?
            </span>
          </InfoTooltip>
        )}
      </div>
      <div className={cn("mt-1 font-serif text-[23px] leading-none", tone)}>
        {value}
      </div>
    </div>
  );
}

function CommandRailDiagram({
  chart,
  accent,
  frameless = false,
}: {
  chart?: StructureChartData | null;
  accent: "bull" | "gold" | "violet" | "neutral";
  frameless?: boolean;
}) {
  if (!chart) {
    return (
      <div className="hidden min-h-[238px] border-t border-paper/10 px-4 py-7 lg:block lg:border-t-0">
        <div
          className={cn(
            "flex h-full min-h-[190px] items-center justify-center px-6 text-center",
            frameless
              ? "rounded-none border-0 bg-transparent"
              : "rounded-[10px] border border-paper/10 bg-paper/[0.035]",
          )}
        >
          <div className="max-w-sm">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-[10px] border border-gold/25 bg-gold-soft/10 text-gold-soft">
              <span className="h-2.5 w-2.5 rounded-full bg-current animate-breathe" />
            </div>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft/72">
              Chart withheld
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-paper/58">
              The slate is standing aside until replay bars and rails resolve into an auditable path.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-paper/42">
              <span className="rounded-soft border border-paper/10 bg-paper/[0.04] px-2 py-2">
                No fake chart
              </span>
              <span className="rounded-soft border border-paper/10 bg-paper/[0.04] px-2 py-2">
                No entry
              </span>
              <span className="rounded-soft border border-paper/10 bg-paper/[0.04] px-2 py-2">
                Brief first
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden min-h-[238px] border-t border-paper/10 px-4 py-7 lg:block lg:border-t-0">
      <div className="relative h-full min-h-[190px]">
        <StructurePathChart
          data={chart}
          variant="dark"
          accent={accent}
          height={190}
          title="recommended path"
          frameless={frameless}
        />
      </div>
    </div>
  );
}

function entryCostValue(projection?: ContractProjection | null): string {
  if (!projection) return "Pending live chain";
  return `$${projection.projectedEntry.debitPerContract}`;
}
