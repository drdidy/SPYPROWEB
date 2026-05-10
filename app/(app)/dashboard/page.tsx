import { CardBody } from "@/components/ui/Card";
import { TimelineStrip } from "@/components/slate/TimelineStrip";
import { ConvictionTrack } from "@/components/slate/ConvictionTrack";
import { EnvelopeBar } from "@/components/slate/EnvelopeBar";
import { StatusGlyph, type StatusGlyphKind } from "@/components/slate/StatusGlyph";
import { SetAlertButton } from "@/components/slate/SetAlertButton";
import { WhyThisStateLink } from "@/components/slate/WhyThisStateLink";
import { NextEventCallout } from "@/components/slate/NextEventLine";
import { MetricSlot } from "@/components/decision-slate/MetricSlot";
import { WhyChips } from "@/components/decision-slate/WhyChips";
import { LastSignalRecap } from "@/components/decision-slate/LastSignalRecap";
import { EngineTrackRecord } from "@/components/decision-slate/EngineTrackRecord";
import { PreConfigBriefing } from "@/components/decision-slate/PreConfigBriefing";
import {
  StatePipeline,
  type StructureLevels,
} from "@/components/decision-slate/StatePipeline";
import { EngineCard } from "@/components/decision-slate/EngineCard";
import { RecommendedAction } from "@/components/decision-slate/RecommendedAction";
import { PreviewState } from "@/components/decision-slate/PreviewState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ErrorState } from "@/components/ui/ErrorState";
import { SpxProvenanceBadge } from "@/components/decision-slate/SpxProvenance";
import { deriveProvenance } from "@/lib/spx-provenance";
import { SLATE_COPY } from "@/content/copy";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import { fetchLastSessionRecaps } from "@/lib/last-session-recap";
import { fetchTrackRecord } from "@/lib/track-record";
import { getSessionInfo } from "@/lib/sessions";
import { relabelDashboardString } from "@/lib/engine-labels";
import { cn } from "@/lib/utils";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { DynamicLine, SPXSnapshot, SPXLine } from "@/lib/types";
import {
  type EngineState,
  SPY_DISTANCE_PROXIMITY,
  SPX_DISTANCE_PROXIMITY,
} from "@/lib/states";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  // Both engines are independent fetches. Run them in parallel — the
  // slate is meant to be read in one glance, so a slow side shouldn't
  // hold up the other.
  const [
    { data: spy, source: spySource, error: spyError },
    spxLoaded,
    recaps,
    spyTrack,
    spxTrack,
  ] = await Promise.all([
    loadLiveSnapshot(),
    loadSpxSnapshot(),
    fetchLastSessionRecaps(),
    fetchTrackRecord("SPY"),
    fetchTrackRecord("SPX"),
  ]);
  const spx = spxLoaded.snap;
  const spxSource = spxLoaded.source;

  // Source badges intentionally not rendered here — feed health lives
  // in the TopBar and any error/seed mode degrades the FreshnessPill.
  void spySource;
  void spxSource;

  const spyState = spy.currentState;
  const spxState = (spx.currentState as EngineState | undefined) ?? "STAND_DOWN";
  const bothPreConfig = spyState === "PRE_CONFIG" && spxState === "PRE_CONFIG";
  const now = new Date();
  const spySession = getSessionInfo("SPY", now);
  const spxSession = getSessionInfo("SPX", now);

  // Per-card error state. We render the error inside the engine's
  // section instead of replacing the whole page so a partial outage
  // (e.g. SPX up, SPY down) leaves the working side intact.
  const spyHardError = spyError != null && spy.shellState.spy === 0;

  return (
    // v10 P1-12: explicit vertical rhythm on the 4 / 8 / 16 / 24 /
    // 48 token scale. Per the spec:
    //   header → hero               24 (mt-6 on hero)
    //   hero → engine row           24 (mt-6 on engines)
    //   engine row → "Markets quiet" h2 inside briefing  48 (mt-12)
    //   h2 → first row of briefing cards   16 (handled inside briefing)
    //   row → row inside briefing   16 (handled inside briefing)
    //   last card → "What to watch" 24 (handled inside briefing)
    //   briefing → preview          24 (mt-6 on preview)
    <div className="w-full max-w-[1440px] pb-12 pt-6 anim-rise">
      <PageHeader />

      {/* v4 #3 + v10 P1-12: Recommended Action page hero. 24px
          rhythm between the header and the hero. */}
      <RecommendedAction
        className="mt-6"
        spyState={spyState}
        spxState={spxState}
        spyNextEventISO={spySession.nextSignificantEvent.at.toISOString()}
        spxNextEventISO={spxSession.nextSignificantEvent.at.toISOString()}
        // v10 P1-8: extract the verb from the session label
        // ("SPY setup opens" → "setup opens"). Keeps wording in
        // sync with the engine pipeline countdowns.
        spyEventVerb={spySession.nextSignificantEvent.label
          .replace(/^SPY\s+/, "")
          .toLowerCase()}
        spxEventVerb={relabelDashboardString(
          spxSession.nextSignificantEvent.label,
        )
          .replace(/^ES\s+/, "")
          .toLowerCase()}
      />

      {/* v4 #6 + v5 #8 + v10 P1-12: engines row. 24px rhythm
          between hero and engine row. Outer padding matches
          every other top-level section. */}
      <section
        aria-label="Engine states"
        className="mt-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 [grid-template-columns:1fr] lg:[grid-template-columns:1fr_1fr] min-w-0">
          <StatePipeline
            engine="SPY"
            current={spyState}
            nextEventISO={spySession.nextSignificantEvent.at.toISOString()}
            nextEventLabel={spySession.nextSignificantEvent.label}
            explanation={spyExplanation(spyState, spy)}
            structureLevels={spyStructureLevels(spy)}
          />
          <StatePipeline
            engine="SPX"
            current={spxState}
            nextEventISO={spxSession.nextSignificantEvent.at.toISOString()}
            // v8 P1-2: lib/sessions.ts produces "SPX setup opens" /
            // "SPX RTH closes". /dashboard relabels to "ES" at the
            // render boundary; the underlying session source stays
            // as SPX for /spx and other consumers.
            nextEventLabel={relabelDashboardString(spxSession.nextSignificantEvent.label)}
            explanation={spxExplanation(spxState, spx)}
            structureLevels={spxStructureLevels(spx)}
          />
        </div>
      </section>

      {bothPreConfig ? (
        <>
          {/* v10 P1-12: 48px rhythm between the engine row and the
              "Markets quiet" briefing heading (mt-12). */}
          <PreConfigBriefing
            className="mt-12"
            spy={{
              label: "SPY",
              nextSetupISO: spySession.configWindowStart.toISOString(),
              nextSetupLabel: formatDayHM(spySession.configWindowStart),
              lastSignal: recaps.spy,
              trackRecord: spyTrack,
            }}
            spx={{
              label: "SPX",
              nextSetupISO: spxSession.configWindowStart.toISOString(),
              nextSetupLabel: formatDayHM(spxSession.configWindowStart),
              lastSignal: recaps.spx,
              trackRecord: spxTrack,
            }}
          />
          {/* v4 #13 + v10 P1-12: PreviewState self-hides via
              localStorage. 24px rhythm between briefing and preview. */}
          <PreviewState className="mt-6" />
        </>
      ) : (
        <>
          <Section title="Today's read">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {spyHardError ? (
                <ErrorState
                  title="SPY data unavailable"
                  message="The live SPY snapshot didn't return. The SPX side is rendering normally below."
                />
              ) : (
                <SpyVerdictCard snap={spy} lastSignal={recaps.spy} />
              )}
              <SpxVerdictCard snap={spx} lastSignal={recaps.spx} />
            </div>
            <div className="mt-5 rounded-card border border-rule bg-paper-tier3 p-4 shadow-card">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                    Engine track record
                  </p>
                  <p className="mt-1 font-serif text-h3 text-ink">
                    Last five sessions
                  </p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
                  Replay scored
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <EngineTrackRecord record={spyTrack} />
                <EngineTrackRecord record={spxTrack} />
              </div>
            </div>
          </Section>

          <TimelineRow
            spyHistory={spy.stateHistory}
            spxHistory={spx.stateHistory ?? []}
          />

          <Section title="Active levels">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {spyHardError ? null : <SpyReadCard snap={spy} />}
              <SpxReadCard snap={spx} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Page header — v2 #5: small eyebrow + h1 ~24px + About affordance
// to its right. v1's giant serif "Decision Slate" hero reclaimed
// ~80px of above-the-fold space for actual data.
// ---------------------------------------------------------------------

function PageHeader() {
  // v10 P1-5: date stamp under the H1. Trader needs to know which
  // session they're looking at without going hunting. Computed at
  // render time on the server (page is force-dynamic), so the date
  // matches the current trading day in the user's locale.
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  return (
    <header className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0 md:flex md:items-end md:gap-5">
        <h1 className="font-serif text-[42px] leading-none text-ink tracking-tight">
          Decision Slate
        </h1>
        {/* v10 P1-5: subtle session-date stamp directly under the
            H1. ~14px sans, muted ink. */}
        <p className="mt-1 border-rule text-[14px] text-ink-3 leading-snug md:mt-0 md:border-l md:pl-5">
          {/* "Friday, May 9, 2026" → "Friday · May 9, 2026"
              (one replace = first comma only). */}
          {dateLabel.replace(",", " ·")}
        </p>
      </div>
      {/* v10 P1-9: About → ? icon-button at the top-right, matching
          the search/notification icon language in the TopBar.
          Single-character ?, circular, ghost surface. */}
      <InfoTooltip
        label={SLATE_COPY.helpAboutSlate.title}
        content={SLATE_COPY.helpAboutSlate.body}
        placement="bottom"
      >
        <span
          aria-label="About this page"
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0",
            "bg-paper-2/60 text-ink-3 hover:text-ink hover:bg-paper-2",
            "border border-rule transition-colors cursor-help",
            "text-[12px] font-bold tabular-nums",
          )}
        >
          ?
        </span>
      </InfoTooltip>
    </header>
  );
}

// ---------------------------------------------------------------------
// Per-engine plain-English explanation. Pure functions so we can keep
// the dashboard's main render flat.
// ---------------------------------------------------------------------

function spyExplanation(state: EngineState, snap: AdaptedSnapshot): string {
  if (state === "PRE_CONFIG") {
    return "Lines plot during the 03:00–07:00 CT premarket window. No active triggers yet.";
  }
  if (state === "STAND_DOWN") {
    return "Setup is plotted, but conditions aren't favoring a trade right now.";
  }
  if (state === "WATCH") {
    return "Price is approaching a primary trigger. Watching for a rejection candle.";
  }
  if (state === "WAIT") {
    return "Rejection candle printed. Waiting for confirmation on the next bar.";
  }
  if (state === "ARMED") {
    return "Confirmation in. The entry trigger is armed.";
  }
  if (state === "GO") {
    return "Trigger fired. The setup is live for the rest of the session.";
  }
  if (state === "COOLDOWN") {
    return "Trade has resolved. No new signals until the next session.";
  }
  return snap.bias.explanation || "";
}

function spxExplanation(state: EngineState, snap: SPXSnapshot): string {
  if (state === "PRE_CONFIG") {
    return "Channel forms during the 17:00–02:00 CT overnight window. No envelope yet.";
  }
  if (state === "STAND_DOWN") {
    return "Channel is plotted, but price isn't sitting where a setup can qualify.";
  }
  if (state === "WATCH") {
    return "Price is approaching the channel rail. Watching for a rejection.";
  }
  if (state === "WAIT") {
    return "Rejection candle printed. Waiting for confirmation.";
  }
  if (state === "ARMED") {
    return "Confirmation in. The entry trigger is armed at the channel rail.";
  }
  if (state === "GO") {
    return "Trigger fired. The channel trade is live.";
  }
  if (state === "COOLDOWN") {
    return "Trade has resolved. No new signals until the next overnight window.";
  }
  return snap.scenarioExplanation || snap.channel.reason || "";
}

function spyStructureLevels(snap: AdaptedSnapshot): StructureLevels {
  const primaryAnchor = snap.anchor?.primary;
  const upper = primaryAnchor?.bands.upper.currentValue;
  const anchor = primaryAnchor?.bands.main.currentValue;
  const lower = primaryAnchor?.bands.lower.currentValue;
  if (
    typeof upper === "number" ||
    typeof anchor === "number" ||
    typeof lower === "number"
  ) {
    return { upper, anchor, lower };
  }

  const sorted = snap.lines
    .slice()
    .sort((a, b) => a.currentValue - b.currentValue);
  if (sorted.length === 0) {
    const biasRails = [
      snap.bias.ua.value,
      snap.bias.ud.value,
      snap.bias.la.value,
      snap.bias.ld.value,
    ].filter((value) => Number.isFinite(value) && value > 0);
    if (biasRails.length === 0) return {};
    const upperBias = Math.max(...biasRails);
    const lowerBias = Math.min(...biasRails);
    return {
      upper: upperBias,
      anchor: (upperBias + lowerBias) / 2,
      lower: lowerBias,
    };
  }
  const below = sorted.filter((l) => l.currentValue <= snap.currentPrice).at(-1);
  const above = sorted.find((l) => l.currentValue >= snap.currentPrice);
  const nearest =
    sorted
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a.currentValue - snap.currentPrice) -
          Math.abs(b.currentValue - snap.currentPrice),
      )[0] ?? null;
  return {
    upper: above?.currentValue ?? sorted.at(-1)?.currentValue ?? null,
    anchor: nearest?.currentValue ?? null,
    lower: below?.currentValue ?? sorted[0]?.currentValue ?? null,
  };
}

function spxStructureLevels(snap: SPXSnapshot): StructureLevels {
  const ceiling = snap.lines.find((line) => line.kind === "CHANNEL_CEILING");
  const floor = snap.lines.find((line) => line.kind === "CHANNEL_FLOOR");
  const upper = ceiling?.currentValue ?? snap.overnight.high.price ?? null;
  const lower = floor?.currentValue ?? snap.overnight.low.price ?? null;
  const anchor =
    typeof upper === "number" && typeof lower === "number"
      ? (upper + lower) / 2
      : null;

  return { upper, anchor, lower };
}

// ---------------------------------------------------------------------
// Section primitive — one tier of section eyebrow above grids.
// ---------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h2 className="font-serif text-h2 text-ink tracking-tight">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-rule" />
      </div>
      {children}
    </section>
  );
}

function formatDayHM(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d) + " CT";
}

// TimelineRow — one TimelineStrip per engine. Stacks below at <lg.
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

// ---- SPY ----

function SpyVerdictCard({
  snap,
  lastSignal,
}: {
  snap: AdaptedSnapshot;
  lastSignal: import("@/types/decision-slate").LastSignalSummary | null;
}) {
  const { decision, signal, quality, currentPrice } = snap;
  const isPreConfig = snap.currentState === "PRE_CONFIG";
  const headline = isPreConfig
    ? "Awaiting setup"
    : spyHeadline(snap.currentState, decision.verdict);
  const closestLine = nearestLine(snap.lines);
  const alertLevel = closestLine ? closestLine.currentValue : currentPrice;
  const alertContext = closestLine
    ? `Track ${snap.currentState === "STAND_DOWN" ? "the closest primary line" : "this trigger"} (${closestLine.name}) at ${closestLine.currentValue.toFixed(2)}.`
    : undefined;
  const change = decision.conviction != null ? snap.shellState.change : 0;

  return (
    <EngineCard
      engine="SPY"
      section="today's read"
      title={
        <span className="flex items-baseline gap-3 flex-wrap">
          <span className="font-serif text-display tracking-tight">
            {headline}
          </span>
          {!isPreConfig && (
            <PriceWithDelta price={currentPrice} change={change} />
          )}
        </span>
      }
      asOfIso={snap.asOf}
      footerLeft={
        <WhyThisStateLink
          engine="SPY"
          trace={snap.decisionTrace}
          flipCondition={snap.flipCondition}
          currentStateLabel={snap.currentState.replace(/_/g, " ").toLowerCase()}
        />
      }
    >
      <p className="text-meta text-ink-3 -mt-2">{SLATE_COPY.spySubtitle}</p>
      <p className="text-body text-ink-2 leading-relaxed">
        {decision.finalExplanation ||
          snap.bias.explanation ||
          (isPreConfig
            ? "No active triggers yet — bias and conviction populate when the setup window opens."
            : "Engine is initializing.")}
      </p>
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-rule">
        <MetricSlot
          label="Conviction"
          hint={SLATE_COPY.metric.conviction.spy}
          example={SLATE_COPY.metricExample.conviction}
          helperWhenEmpty={SLATE_COPY.metricEmptyHelper.conviction}
        >
          {!isPreConfig && (
            <ConvictionTrack
              value={decision.conviction}
              max={5}
              label={`${decision.conviction}/5`}
            />
          )}
        </MetricSlot>
        <MetricSlot
          label="Bias"
          hint={SLATE_COPY.metric.bias}
          example={SLATE_COPY.metricExample.bias}
          helperWhenEmpty={SLATE_COPY.metricEmptyHelper.bias}
        >
          {!isPreConfig && <BiasValue bias={snap.bias.bias} />}
        </MetricSlot>
        <MetricSlot
          label="Grade"
          hint={SLATE_COPY.metric.grade}
          example={SLATE_COPY.metricExample.grade}
          helperWhenEmpty={SLATE_COPY.metricEmptyHelper.grade}
        >
          {!isPreConfig && (
            <GradeValue grade={signal && quality ? quality.grade : null} />
          )}
        </MetricSlot>
      </div>
      {(isPreConfig ||
        snap.currentState === "STAND_DOWN" ||
        snap.currentState === "COOLDOWN") && (
        <LastSignalRecap recap={lastSignal} />
      )}
      {isPreConfig ? (
        <NextEventCallout engine="SPY" />
      ) : (
        <>
          <FlipsLine condition={snap.flipCondition} />
          <InvalidationLine invalidation={snap.invalidation} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!isPreConfig && (
          <SetAlertButton
            symbol="SPY"
            level={alertLevel}
            context={alertContext}
          />
        )}
      </div>
      {!isPreConfig && (
        <WhyChips trace={snap.decisionTrace} className="pt-2" />
      )}
    </EngineCard>
  );
}

function SpyReadCard({ snap }: { snap: AdaptedSnapshot }) {
  const armed = snap.lines
    .filter((l) => l.isPrimary)
    .slice()
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))
    .slice(0, 4);
  return (
    <EngineCard
      engine="SPY"
      section="active levels"
      title={
        <span className="flex items-center gap-2 flex-wrap">
          <span>{armed.length === 0 ? "No active levels" : `${armed.length} active level${armed.length === 1 ? "" : "s"}`}</span>
          <InfoTooltip
            label="Primary line"
            content="A tradable level the engine watches for rejection or break — anchored on prior-day pivots and projected forward."
          />
        </span>
      }
      headerMeta={
        <span className="font-mono text-meta tabular-nums text-ink-3">
          Plotted {formatHM(snap.asOf)} CT
          <InfoTooltip
            label="Refresh cadence"
            content="Lines refresh on each bar close during the engine's session. Between sessions, the last plot stays on screen."
            className="ml-1.5"
          />
        </span>
      }
      asOfIso={null}
    >
      <div className="-mx-5 -mb-5">
        <div className="min-h-[180px] flex flex-col">
          {armed.length === 0 ? (
            <div className="px-5 py-8 text-body text-ink-3">
              {SLATE_COPY.structureEmpty.spy}
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
        </div>
      </div>
    </EngineCard>
  );
}

// ---- SPX ----

function SpxVerdictCard({
  snap,
  lastSignal,
}: {
  snap: SPXSnapshot;
  lastSignal: import("@/types/decision-slate").LastSignalSummary | null;
}) {
  const action = snap.confluence.action;
  const score = Math.round(snap.confluence.score);
  const change = snap.price.change;
  const state = (snap.currentState as EngineState | undefined) ?? "STAND_DOWN";
  const isPreConfig = state === "PRE_CONFIG";
  const headline = isPreConfig ? "Awaiting setup" : spxHeadline(state, action);
  const isOutside = snap.scenario === "OUTSIDE_PLAY";

  const closestLine = nearestSpxLine(snap.lines);
  const alertLevel = closestLine ? closestLine.currentValue : snap.price.last;
  const alertContext = closestLine
    ? `Track ${spxLineLabel(closestLine.kind)} at ${closestLine.currentValue.toFixed(2)}.`
    : undefined;

  return (
    <EngineCard
      engine="SPX"
      section="today's read"
      title={
        <span className="flex items-baseline gap-3 flex-wrap">
          <span className="font-serif text-display tracking-tight">
            {headline}
          </span>
          {!isPreConfig && isOutside && (
            <InfoTooltip
              label="Outside play"
              content="The last print sits outside today's planned play envelope. No qualifying setup until price re-enters the envelope."
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 cursor-help">
                Outside play
              </span>
            </InfoTooltip>
          )}
          {!isPreConfig && (
            <PriceWithDelta price={snap.price.last} change={change} />
          )}
          {/* P0-4: SPX is synthetic (ES + basis). Surface the
              derivation tier next to the price so a wrong-looking
              number is never silent. */}
          {!isPreConfig && (
            <SpxProvenanceBadge provenance={deriveProvenance(snap._meta)} />
          )}
        </span>
      }
      asOfIso={snap.asOf}
      footerLeft={
        <WhyThisStateLink
          engine="SPX"
          trace={snap.decisionTrace ?? []}
          flipCondition={snap.flipCondition}
          currentStateLabel={state.replace(/_/g, " ").toLowerCase()}
        />
      }
    >
      <p className="text-meta text-ink-3 -mt-2">{SLATE_COPY.spxSubtitle}</p>
      <p className="text-body text-ink-2 leading-relaxed">
        {snap.scenarioExplanation ||
          snap.channel.reason ||
          (isPreConfig
            ? "Channel and confluence populate when the overnight window opens."
            : "Channel is initializing.")}
      </p>
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-rule">
        <MetricSlot
          label="Conviction"
          hint={SLATE_COPY.metric.conviction.spx}
          example={SLATE_COPY.metricExample.convictionSpx}
          helperWhenEmpty={SLATE_COPY.metricEmptyHelper.conviction}
        >
          {!isPreConfig && (
            <ConvictionTrack
              value={score}
              max={100}
              label={`${score}/100`}
              bands={normalizedBands(snap.scoreBands)}
            />
          )}
        </MetricSlot>
        <MetricSlot
          label="Channel"
          hint={SLATE_COPY.metric.channel}
          example={SLATE_COPY.metricExample.channel}
          helperWhenEmpty={SLATE_COPY.metricEmptyHelper.channel}
        >
          {!isPreConfig && <ChannelValue direction={snap.channel.direction} />}
        </MetricSlot>
        <MetricSlot
          label="Grade"
          hint={SLATE_COPY.metric.grade}
          example={SLATE_COPY.metricExample.grade}
          helperWhenEmpty={SLATE_COPY.metricEmptyHelper.grade}
        >
          {!isPreConfig && <SpxGradeValue action={action} />}
        </MetricSlot>
      </div>
      {(isPreConfig || state === "STAND_DOWN" || state === "COOLDOWN") && (
        <LastSignalRecap recap={lastSignal} />
      )}
      {isPreConfig ? (
        <NextEventCallout engine="SPX" />
      ) : (
        <>
          <FlipsLine condition={snap.flipCondition} />
          <InvalidationLine invalidation={snap.invalidation ?? null} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!isPreConfig && (
          <SetAlertButton symbol="SPX" level={alertLevel} context={alertContext} />
        )}
      </div>
      {!isPreConfig && (
        <WhyChips trace={snap.decisionTrace ?? []} className="pt-2" />
      )}
    </EngineCard>
  );
}

function SpxReadCard({ snap }: { snap: SPXSnapshot }) {
  const sorted = [...snap.lines].sort(
    (a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
  );
  const top = sorted.slice(0, 4);
  const empty = top.length === 0;
  return (
    <EngineCard
      engine="SPX"
      section="active levels"
      title={
        <span className="flex items-center gap-2 flex-wrap">
          <span>{empty ? "No active levels" : `${top.length} active level${top.length === 1 ? "" : "s"}`}</span>
          <InfoTooltip
            label="Channel rail"
            content="A primary rail of the overnight channel projected into RTH — used for rejection / break confirmation."
          />
        </span>
      }
      headerMeta={
        <span className="font-mono text-meta tabular-nums text-ink-3">
          Plotted {formatHM(snap.asOf)} CT
        </span>
      }
      asOfIso={null}
    >
      <div className="-mx-5 -mb-5">
        <CardBody
          className={empty ? "px-5 py-6 min-h-[180px]" : "px-0 pb-0 min-h-[180px]"}
        >
          {empty ? (
            snap.plannedEnvelope ? (
              <EnvelopeBar
                low={snap.plannedEnvelope.low}
                high={snap.plannedEnvelope.high}
                last={snap.price.last}
                unit="pts"
              />
            ) : (
              <p className="text-body text-ink-3">
                {SLATE_COPY.structureEmpty.spx}
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
      </div>
    </EngineCard>
  );
}

// ---- shared bits ----

function ChannelValue({ direction }: { direction: string }) {
  if (direction === "NONE" || !direction) {
    return (
      <InfoTooltip
        label="Channel"
        content="The channel forms after the first qualifying overnight pivot."
      >
        <span className="text-meta text-state-neutral italic cursor-help">
          not yet formed
        </span>
      </InfoTooltip>
    );
  }
  return (
    <span
      className="font-mono text-meta font-semibold text-ink tabular-nums"
      data-num
    >
      {direction.toLowerCase()}
    </span>
  );
}

function BiasValue({ bias }: { bias: string }) {
  const tone =
    bias === "BULLISH"
      ? "text-bull-ink"
      : bias === "BEARISH"
        ? "text-bear-ink"
        : "text-ink-2";
  return (
    <span
      className={`font-mono text-meta font-semibold tabular-nums ${tone}`}
      data-num
    >
      {bias.toLowerCase()}
    </span>
  );
}

function GradeValue({ grade }: { grade: string | null }) {
  if (!grade || grade === "—") {
    return (
      <InfoTooltip
        label="Grade"
        content="Grade is assigned post-trigger."
      >
        <span className="font-mono text-meta text-ink-3 cursor-help">
          pending
        </span>
      </InfoTooltip>
    );
  }
  return (
    <span
      className="font-mono text-meta font-semibold tabular-nums text-ink"
      data-num
    >
      {grade}
    </span>
  );
}

function PriceWithDelta({ price, change }: { price: number; change: number }) {
  const isZero = Math.abs(change) < 0.005;
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span className="font-mono text-meta text-ink-3 tabular-nums">
        {price.toFixed(2)}
      </span>
      {!isZero && (
        <span
          className={`font-mono text-[11px] tabular-nums ${
            change > 0 ? "text-bull-ink" : "text-bear-ink"
          }`}
          data-num
        >
          {change > 0 ? "+" : "−"}
          {Math.abs(change).toFixed(2)}
        </span>
      )}
    </span>
  );
}

function SpxGradeValue({ action }: { action: string }) {
  const grade =
    action === "TAKE"
      ? "A"
      : action === "SELECTIVE"
        ? "B"
        : action === "STAND_DOWN"
          ? "C"
          : null;
  if (!grade) {
    return (
      <InfoTooltip label="Grade" content="Grade is assigned post-trigger.">
        <span className="font-mono text-meta text-ink-3 cursor-help">
          pending
        </span>
      </InfoTooltip>
    );
  }
  const tone =
    grade === "A"
      ? "text-bull-ink"
      : grade === "B"
        ? "text-gold-ink"
        : "text-ink-2";
  return (
    <span
      className={`font-mono text-meta font-semibold tabular-nums ${tone}`}
      data-num
    >
      {grade}
    </span>
  );
}

function FlipsLine({ condition }: { condition?: string }) {
  if (!condition) return null;
  return (
    <div className="rounded-soft border border-rule bg-paper-2/40 px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
        Flips to go on
      </span>
      <p className="text-body text-ink leading-snug mt-1">{condition}</p>
    </div>
  );
}

function InvalidationLine({
  invalidation,
}: {
  invalidation: { level: number; stopOffset: number } | null;
}) {
  if (!invalidation) {
    return (
      <p className="text-meta text-ink-3 font-mono">
        Invalidation: pending trigger
      </p>
    );
  }
  return (
    <p className="text-meta text-ink-3 font-mono tabular-nums">
      Invalidation level {invalidation.level.toFixed(2)} · suggested stop{" "}
      {invalidation.stopOffset.toFixed(2)} below trigger
    </p>
  );
}

// ---- structure list bits ----

function ColumnHeaderRow() {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-rule px-5 py-2 bg-paper-2/30">
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
        Level
      </span>
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3 text-right">
        Price
      </span>
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3 text-right min-w-[64px]">
        Distance
      </span>
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
  const tone = isClose ? "text-state-armed" : "text-ink-2";
  const isZero = Math.abs(distance) < 0.005;
  const sign = isZero ? "" : distance > 0 ? "+" : "−";
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3 text-body">
      <span
        className="flex items-center gap-2.5 min-w-0"
        title={`${fullName} — ${hint}`}
      >
        <StatusGlyph kind={glyph} label={`${fullName} ${glyph}`} />
        <span className="font-mono text-ink truncate">{label}</span>
      </span>
      <span className="font-mono tabular-nums text-ink text-right">
        {level.toFixed(2)}
      </span>
      <span
        className={`font-mono tabular-nums text-right min-w-[64px] ${tone}`}
        data-num
      >
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

// SPY line-name labels + hover hints.
function spyLineLabel(name: string): string {
  if (name.startsWith("UA")) return "Upper ascending trendline";
  if (name.startsWith("UD")) return "Upper descending trendline";
  if (name.startsWith("LA")) return "Lower ascending trendline";
  if (name.startsWith("LD")) return "Lower descending trendline";
  if (name.includes("PDH")) return "Prior day high";
  if (name.includes("PDL")) return "Prior day low";
  if (name.includes("OPEN")) return "Day open";
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
    CHANNEL_CEILING: "Channel ceiling",
    CHANNEL_FLOOR: "Channel floor",
    PREV_RTH_HIGH_ASC: "Prev RTH high · ascending",
    PREV_RTH_LOW_DESC: "Prev RTH low · descending",
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
