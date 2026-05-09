import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StateLadder } from "@/components/slate/StateLadder";
import { TimelineStrip } from "@/components/slate/TimelineStrip";
import { ConvictionMeter } from "@/components/slate/ConvictionMeter";
import { ScoreTrack } from "@/components/slate/ScoreTrack";
import { EnvelopeBar } from "@/components/slate/EnvelopeBar";
import { StatusGlyph, type StatusGlyphKind } from "@/components/slate/StatusGlyph";
import { HelpHint } from "@/components/slate/HelpHint";
import { SessionCountdown } from "@/components/slate/SessionCountdown";
import { AsOfTicker } from "@/components/slate/AsOfTicker";
import { SetAlertButton } from "@/components/slate/SetAlertButton";
import { WhyThisStateLink } from "@/components/slate/WhyThisStateLink";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { DynamicLine, SPXSnapshot, SPXLine } from "@/lib/types";
import {
  type EngineState,
  SPY_DISTANCE_PROXIMITY,
  SPX_DISTANCE_PROXIMITY,
} from "@/lib/states";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  // Both engines are independent fetches. Run them in parallel — the
  // slate is meant to be read in one glance, so a slow side shouldn't
  // hold up the other.
  const [{ data: spy, source: spySource, error: spyError }, spxLoaded] =
    await Promise.all([loadLiveSnapshot(), loadSpxSnapshot()]);
  const spx = spxLoaded.snap;
  const spxSource = spxLoaded.source;

  return (
    <div className="max-w-[1440px] mx-auto pb-16 space-y-10">
      <header className="flex flex-col gap-3 pt-2 pb-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              Decision Slate · session today
            </span>
            <span className="h-px w-10 bg-rule-strong hidden sm:block" />
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              {todayLabel()}
            </span>
            <SourceBadge label="SPY" source={spySource} error={spyError} />
            <SourceBadge label="SPX" source={spxSource === "live" ? "live" : "mock"} />
          </div>
          <h1 className="mt-3 text-display font-serif tracking-tight text-ink">
            The trading day,{" "}
            <span className="text-ink-3 italic font-light">read aloud.</span>
          </h1>
        </div>
      </header>

      <EngineLadders
        spyState={spy.currentState}
        spxState={(spx.currentState as EngineState | undefined) ?? "STAND_DOWN"}
      />

      <SectionLabel>Today's plays</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SpyVerdictCard snap={spy} />
        <SpxVerdictCard snap={spx} />
      </div>

      <TimelineRow
        spyHistory={spy.stateHistory}
        spxHistory={spx.stateHistory ?? []}
      />

      <SectionLabel>The read</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SpyReadCard snap={spy} />
        <SpxReadCard snap={spx} />
      </div>
    </div>
  );
}

// TimelineRow renders one TimelineStrip per engine, side-by-side at lg+
// and stacked below. Each strip self-hides when its history is empty,
// so an early-session SPX with no transitions stays out of the way
// while SPY's timeline appears solo.
function TimelineRow({
  spyHistory,
  spxHistory,
}: {
  spyHistory: { ts: string; state: EngineState }[];
  spxHistory: { ts: string; state: EngineState }[];
}) {
  if (spyHistory.length === 0 && spxHistory.length === 0) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <TimelineStrip engine="SPY" history={spyHistory} />
      <TimelineStrip engine="SPX" history={spxHistory} />
    </div>
  );
}

// State ladders sit immediately under the page header and above the
// "Today's plays" section. Compact: one row per engine, mono labels.
function EngineLadders({
  spyState,
  spxState,
}: {
  spyState: EngineState;
  spxState: EngineState;
}) {
  return (
    <div className="rounded-card border border-rule bg-paper-2/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
          SPY
        </span>
        <StateLadder engine="SPY" current={spyState} />
      </div>
      <div className="hidden sm:block h-3 w-px bg-rule" aria-hidden />
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] tracking-[0.16em] text-violet uppercase">
          SPX
        </span>
        <StateLadder engine="SPX" current={spxState} />
      </div>
    </div>
  );
}

// ---- SPY ----

function SpyVerdictCard({ snap }: { snap: AdaptedSnapshot }) {
  const { decision, signal, quality, currentPrice } = snap;
  const headline = spyHeadline(snap.currentState, decision.verdict);
  const closestLine = nearestLine(snap.lines);
  const alertLevel = closestLine ? closestLine.currentValue : currentPrice;
  const alertContext = closestLine
    ? `Track ${snap.currentState === "STAND_DOWN" ? "the closest primary line" : "this trigger"} (${closestLine.name}) at ${closestLine.currentValue.toFixed(2)}.`
    : undefined;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="SPY"
        title={
          <span className="flex items-baseline gap-3 flex-wrap">
            <span className="font-serif text-display tracking-tight">
              {headline}
            </span>
            <span className="font-mono text-sm text-ink-3 tabular-nums">
              {currentPrice.toFixed(2)}
            </span>
          </span>
        }
      />
      <CardBody className="space-y-4">
        <SessionCountdown />
        <p className="text-[14px] text-ink-2 leading-relaxed">
          {decision.finalExplanation || snap.bias.explanation || "Engine is initializing."}
        </p>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-rule">
          <MetricCol label="Conviction">
            <ConvictionMeter value={decision.conviction} />
          </MetricCol>
          <MetricCol label="Bias">
            <BiasValue bias={snap.bias.bias} />
          </MetricCol>
          <MetricCol label="Grade">
            <GradeValue grade={signal && quality ? quality.grade : null} />
          </MetricCol>
        </div>
        <FlipsLine condition={snap.flipCondition} />
        <InvalidationLine invalidation={snap.invalidation} />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SetAlertButton symbol="SPY" level={alertLevel} context={alertContext} />
          <Link
            href="/spy"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-paper-2 text-ink-2 hover:text-ink hover:bg-paper-2/70 font-mono text-[11px] uppercase tracking-[0.10em] transition-colors"
          >
            View SPY Channel
            <ArrowRight size={11} className="text-ink-3" />
          </Link>
        </div>
        <CardFooterRow asOfIso={snap.asOf}>
          <WhyThisStateLink
            engine="SPY"
            trace={snap.decisionTrace}
            flipCondition={snap.flipCondition}
            currentStateLabel={snap.currentState.replace(/_/g, " ")}
          />
        </CardFooterRow>
      </CardBody>
    </Card>
  );
}

function SpyReadCard({ snap }: { snap: AdaptedSnapshot }) {
  const armed = snap.lines
    .filter((l) => l.isPrimary)
    .slice()
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))
    .slice(0, 4);
  return (
    <Card>
      <ReadCardHeader
        engine="SPY"
        count={armed.length}
        plottedAt={snap.asOf}
      />
      <CardBody className="px-0 pb-0">
        {armed.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-ink-3">
            No primary lines active yet.
          </div>
        ) : (
          <>
            <ColumnHeaderRow />
            <ul className="divide-y divide-rule">
              {armed.map((l) => (
                <TriggerRow
                  key={l.name}
                  label={spyLineLabel(l.name)}
                  fullName={spyLineFullName(l.name)}
                  hint={spyLineHint(l.name)}
                  level={l.currentValue}
                  distance={l.distanceFromPrice}
                  proximity={SPY_DISTANCE_PROXIMITY}
                  glyph="armed"
                />
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---- SPX ----

function SpxVerdictCard({ snap }: { snap: SPXSnapshot }) {
  const action = snap.confluence.action;
  const score = Math.round(snap.confluence.score);
  const change = snap.price.change;
  const headline = spxHeadline((snap.currentState as EngineState | undefined) ?? "STAND_DOWN", action);
  const isOutside = snap.scenario === "OUTSIDE_PLAY";

  const closestLine = nearestSpxLine(snap.lines);
  const alertLevel = closestLine ? closestLine.currentValue : snap.price.last;
  const alertContext = closestLine
    ? `Track ${spxLineLabel(closestLine.kind)} at ${closestLine.currentValue.toFixed(2)}.`
    : undefined;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="SPX"
        title={
          <span className="flex items-baseline gap-3 flex-wrap">
            <span className="font-serif text-display tracking-tight">
              {headline}
            </span>
            {isOutside && (
              <HelpHint
                label="Outside play"
                hint="Price has left the planned envelope between the prev-RTH high and low. The engine stands down until price re-enters."
              />
            )}
            <span className="font-mono text-sm text-ink-3 tabular-nums">
              {snap.price.last.toFixed(2)}
            </span>
          </span>
        }
      />
      <CardBody className="space-y-4">
        <SessionCountdown />
        <p className="text-[14px] text-ink-2 leading-relaxed">
          {snap.scenarioExplanation || snap.channel.reason || "Channel is initializing."}
        </p>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-rule">
          <MetricCol label="Score">
            <div className="flex flex-col gap-1.5 w-full">
              <ScoreTrack value={score} bands={normalizedBands(snap.scoreBands)} />
              <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                {score}/100
              </span>
            </div>
          </MetricCol>
          <MetricCol label="Channel">
            <span className="font-mono text-[13px] font-semibold text-ink tabular-nums" data-num>
              {snap.channel.direction}
            </span>
          </MetricCol>
          <MetricCol label="Δ today">
            <DeltaCell value={change} />
          </MetricCol>
        </div>
        <FlipsLine condition={snap.flipCondition} />
        <InvalidationLine invalidation={snap.invalidation ?? null} />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SetAlertButton symbol="SPX" level={alertLevel} context={alertContext} />
          <Link
            href="/spx"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-paper-2 text-ink-2 hover:text-ink hover:bg-paper-2/70 font-mono text-[11px] uppercase tracking-[0.10em] transition-colors"
          >
            View SPX Channel
            <ArrowRight size={11} className="text-ink-3" />
          </Link>
        </div>
        <CardFooterRow asOfIso={snap.asOf}>
          <WhyThisStateLink
            engine="SPX"
            trace={snap.decisionTrace ?? []}
            flipCondition={snap.flipCondition}
            currentStateLabel={
              (snap.currentState as string | undefined)?.replace(/_/g, " ")
            }
          />
        </CardFooterRow>
      </CardBody>
    </Card>
  );
}

function SpxReadCard({ snap }: { snap: SPXSnapshot }) {
  const sorted = [...snap.lines].sort(
    (a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
  );
  const top = sorted.slice(0, 4);
  const empty = top.length === 0;
  return (
    <Card>
      <ReadCardHeader
        engine="SPX"
        count={snap.lines.length}
        plottedAt={snap.asOf}
      />
      <CardBody className={empty ? "px-5 py-6" : "px-0 pb-0"}>
        {empty ? (
          snap.plannedEnvelope ? (
            <EnvelopeBar
              low={snap.plannedEnvelope.low}
              high={snap.plannedEnvelope.high}
              last={snap.price.last}
              unit="pts"
            />
          ) : (
            <p className="text-[13px] text-ink-3">
              0 lines active. Channel resolves on the first qualifying overnight pivot.
            </p>
          )
        ) : (
          <>
            <ColumnHeaderRow />
            <ul className="divide-y divide-rule">
              {top.map((l) => (
                <TriggerRow
                  key={l.kind}
                  label={spxLineLabel(l.kind)}
                  fullName={spxLineLabel(l.kind)}
                  hint={spxLineHint(l.kind)}
                  level={l.currentValue}
                  distance={l.distanceFromPrice}
                  proximity={SPX_DISTANCE_PROXIMITY}
                  glyph="armed"
                />
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---- shared bits ----

function MetricCol({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-1">{label}</div>
      <div className="min-h-[28px] flex items-end">{children}</div>
    </div>
  );
}

function BiasValue({ bias }: { bias: string }) {
  const tone =
    bias === "BULLISH"
      ? "text-state-bullish"
      : bias === "BEARISH"
        ? "text-state-bearish"
        : "text-state-neutral";
  return (
    <span
      className={`font-mono text-[13px] font-semibold tabular-nums ${tone}`}
      data-num
    >
      {bias}
    </span>
  );
}

function GradeValue({ grade }: { grade: string | null }) {
  if (!grade || grade === "—") {
    return (
      <span
        title="Grade is assigned post-trigger."
        className="font-mono text-[12px] text-ink-3"
      >
        Grade — pending
      </span>
    );
  }
  return (
    <span className="font-mono text-[13px] font-semibold tabular-nums text-ink" data-num>
      {grade}
    </span>
  );
}

// Signed change cell for the SPX "Δ today" metric. Neutral grey when
// |value| == 0 — never bull green.
function DeltaCell({ value }: { value: number }) {
  const isZero = Math.abs(value) < 0.005;
  const tone = isZero
    ? "text-state-neutral"
    : value > 0
      ? "text-state-bullish"
      : "text-state-bearish";
  const sign = isZero ? "" : value > 0 ? "+" : "−";
  const mag = Math.abs(value).toFixed(2);
  return (
    <span className={`font-mono text-[13px] font-semibold tabular-nums ${tone}`} data-num>
      {sign}
      {mag}
    </span>
  );
}

function FlipsLine({ condition }: { condition?: string }) {
  if (!condition) return null;
  return (
    <div className="rounded-soft border border-rule bg-paper-2/40 px-3 py-2.5">
      <span className="eyebrow text-ink-3">Flips to GO on:</span>
      <p className="text-[13px] text-ink leading-snug mt-1">{condition}</p>
    </div>
  );
}

// Invalidation line. CRITICAL: this surfaces "where the read is wrong"
// — not where to place a stop. Phrasing is intentionally indirect.
function InvalidationLine({
  invalidation,
}: {
  invalidation: { level: number; stopOffset: number } | null;
}) {
  if (!invalidation) {
    return (
      <p className="text-[11px] text-ink-3 font-mono">
        Invalidation: pending trigger
      </p>
    );
  }
  return (
    <p className="text-[11px] text-ink-3 font-mono tabular-nums">
      Invalidation level: {invalidation.level.toFixed(2)} · Suggested stop reference:
      {" "}
      {invalidation.stopOffset.toFixed(2)} below trigger
    </p>
  );
}

function CardFooterRow({
  children,
  asOfIso,
}: {
  children: React.ReactNode;
  asOfIso: string;
}) {
  return (
    <div className="pt-3 border-t border-rule flex items-center justify-between gap-3">
      {children}
      <AsOfTicker iso={asOfIso} />
    </div>
  );
}

// ---- structure list bits ----

function ReadCardHeader({
  engine,
  count,
  plottedAt,
}: {
  engine: "SPY" | "SPX";
  count: number;
  plottedAt: string;
}) {
  const plotted = formatHM(plottedAt);
  return (
    <CardHeader
      eyebrow={`${engine} · structure`}
      title={
        <span className="flex items-center gap-2 flex-wrap">
          <span>{count} line{count === 1 ? "" : "s"} active</span>
          <HelpHint
            label="Primary line"
            hint="A tradable level the engine watches for rejection or break — anchored on prior-day pivots and projected forward."
          />
        </span>
      }
      meta={`Plotted ${plotted} CT · refreshes on close`}
    />
  );
}

function ColumnHeaderRow() {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-rule px-5 py-2 bg-paper-2/30">
      <span className="eyebrow text-ink-3">Level</span>
      <span className="eyebrow text-ink-3 text-right">Price</span>
      <span className="eyebrow text-ink-3 text-right min-w-[64px]">Distance</span>
    </div>
  );
}

function TriggerRow({
  label,
  fullName,
  hint,
  level,
  distance,
  proximity,
  glyph,
}: {
  label: string;
  fullName: string;
  hint: string;
  level: number;
  distance: number;
  proximity: number;
  glyph: StatusGlyphKind;
}) {
  const isClose = Math.abs(distance) <= proximity;
  const tone = isClose ? "text-state-armed" : "text-state-neutral";
  const isZero = Math.abs(distance) < 0.005;
  const sign = isZero ? "" : distance > 0 ? "+" : "−";
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3 text-[13px]">
      <span className="flex items-center gap-2.5 min-w-0" title={`${fullName} — ${hint}`}>
        <StatusGlyph kind={glyph} label={`${fullName} ${glyph}`} />
        <span className="font-mono text-ink truncate">{label}</span>
      </span>
      <span className="font-mono tabular-nums text-ink text-right">
        {level.toFixed(2)}
      </span>
      <span className={`font-mono tabular-nums text-right min-w-[64px] ${tone}`} data-num>
        {sign}
        {Math.abs(distance).toFixed(2)}
      </span>
    </li>
  );
}

// ---- helpers ----

function nearestLine(lines: DynamicLine[]): DynamicLine | null {
  const primary = lines.filter((l) => l.isPrimary);
  if (primary.length === 0) return null;
  return primary.reduce(
    (best, l) =>
      Math.abs(l.distanceFromPrice) < Math.abs(best.distanceFromPrice) ? l : best,
    primary[0],
  );
}

function nearestSpxLine(lines: SPXLine[]): SPXLine | null {
  if (lines.length === 0) return null;
  return lines.reduce(
    (best, l) =>
      Math.abs(l.distanceFromPrice) < Math.abs(best.distanceFromPrice) ? l : best,
    lines[0],
  );
}

function normalizedBands(
  bands: SPXSnapshot["scoreBands"],
):
  | undefined
  | {
      standDown: readonly [number, number];
      watch: readonly [number, number];
      go: readonly [number, number];
    } {
  if (!bands) return undefined;
  return {
    standDown: [bands.standDown[0], bands.standDown[1]] as const,
    watch: [bands.watch[0], bands.watch[1]] as const,
    go: [bands.go[0], bands.go[1]] as const,
  };
}

function SourceBadge({
  label,
  source,
  error,
}: {
  label: string;
  source: "live" | "degraded" | "seed" | "mock" | "error";
  error?: string;
}) {
  const live = source === "live";
  const degraded = source === "degraded";
  const cls = live
    ? "bg-bull-tint text-bull-ink shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]"
    : degraded
      ? "bg-gold-tint text-gold-ink shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]"
      : "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]";
  return (
    <span
      title={error || `${label}: ${source}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${live ? "bg-bull animate-breathe" : degraded ? "bg-gold" : "bg-ink-4"}`}
      />
      {label} {source}
    </span>
  );
}

function todayLabel(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

function formatHM(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "—";
  }
}

function spyHeadline(state: EngineState, verdict: string): string {
  const v = (verdict || "").toUpperCase();
  if (v === "LONG") return "Leaning long";
  if (v === "SHORT") return "Leaning short";
  if (v === "HOLD") return "Holding position";
  if (state === "STAND_DOWN" || v === "STAND DOWN") return "Standing down";
  if (state === "ARMED") return "Armed for entry";
  if (state === "GO") return "Trade allowed";
  return "Waiting for rejection";
}

function spxHeadline(state: EngineState, action: string): string {
  if (action === "TAKE") return "Take the channel";
  if (action === "SELECTIVE") return "Trading selectively";
  if (state === "GO") return "Trade allowed";
  if (state === "ARMED") return "Armed for entry";
  if (state === "STAND_DOWN" || action === "STAND_DOWN") return "Standing down";
  return "Watching the channel";
}

// SPY line-name labels + hover hints. Names from the engine carry forms
// like "UA-1", "UD-2" — expand to readable English on first render.
function spyLineLabel(name: string): string {
  if (name.startsWith("UA")) return "Upper Ascending Trendline";
  if (name.startsWith("UD")) return "Upper Descending Trendline";
  if (name.startsWith("LA")) return "Lower Ascending Trendline";
  if (name.startsWith("LD")) return "Lower Descending Trendline";
  if (name.includes("PDH")) return "Prior Day High";
  if (name.includes("PDL")) return "Prior Day Low";
  if (name.includes("OPEN")) return "Day Open";
  return name;
}

function spyLineFullName(name: string): string {
  return spyLineLabel(name);
}

function spyLineHint(name: string): string {
  if (name.startsWith("UA")) return "Ascending line projected up from yesterday's high pivot.";
  if (name.startsWith("UD")) return "Descending line projected down from yesterday's high pivot.";
  if (name.startsWith("LA")) return "Ascending line projected up from yesterday's low pivot.";
  if (name.startsWith("LD")) return "Descending line projected down from yesterday's low pivot.";
  if (name.includes("PDH")) return "Yesterday's regular-session high.";
  if (name.includes("PDL")) return "Yesterday's regular-session low.";
  if (name.includes("OPEN")) return "Today's regular-session open price.";
  return "Engine-generated primary trigger line.";
}

function spxLineLabel(kind: string): string {
  const m: Record<string, string> = {
    CHANNEL_CEILING: "Channel Ceiling",
    CHANNEL_FLOOR: "Channel Floor",
    PREV_RTH_HIGH_ASC: "Prev RTH High · Asc",
    PREV_RTH_LOW_DESC: "Prev RTH Low · Desc",
  };
  return m[kind] || kind;
}

function spxLineHint(kind: string): string {
  const m: Record<string, string> = {
    CHANNEL_CEILING: "Top rail of the overnight channel, projected forward.",
    CHANNEL_FLOOR: "Bottom rail of the overnight channel, projected forward.",
    PREV_RTH_HIGH_ASC: "Yesterday's RTH high, projected upward.",
    PREV_RTH_LOW_DESC: "Yesterday's RTH low, projected downward.",
  };
  return m[kind] || "Engine-generated SPX reference line.";
}
