import { AnchorSlate } from "@/components/channel/AnchorSlate";
import { ChannelLiveBadge } from "@/components/channel/ChannelLiveBadge";
import { ChannelStateRail } from "@/components/channel/ChannelStateRail";
import { OptionsIntelligence } from "@/components/channel/OptionsIntelligence";
import { PreOpenBias } from "@/components/channel/PreOpenBias";
import { RiskGuardrails } from "@/components/channel/RiskGuardrails";
import { SignalTape } from "@/components/channel/SignalTape";
import { TriggerMap } from "@/components/channel/TriggerMap";
import {
  DegradedModeBanner,
  FeedHealthProvider,
} from "@/components/decision-slate/FeedHealthProvider";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CHANNEL_COPY } from "@/content/channel";
import { getChannelConfig } from "@/lib/channel/config";
import type { Engine } from "@/lib/contracts/channel";
import {
  buildFeedSeed,
  FEED_DEFAULTS,
  type FeedHealthSeed,
  type FeedStatus,
} from "@/lib/feed-health";
import { getSessionInfo } from "@/lib/sessions";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { LiveSnapshotSource } from "@/lib/snapshot-fetch";
import type { ReactNode } from "react";
import Link from "next/link";

export interface ChannelShellData {
  snap: AdaptedSnapshot;
  source: LiveSnapshotSource;
  error?: string;
}

export function ChannelShell({
  engine,
  data,
}: {
  engine: Engine;
  data: ChannelShellData;
}) {
  const config = getChannelConfig(engine);
  const copy = CHANNEL_COPY[engine];
  const {
    decision,
    lines,
    currentPrice,
    bias,
    guardrails,
    optionsIntel,
    strikes,
    signalTicks,
    signal,
    optionsChain,
  } = data.snap;
  const now = new Date();
  const serverNowISO = now.toISOString();
  const session = getSessionInfo(engine === "spy" ? "SPY" : "SPX", now);
  const displayedState = displayedChannelState(data.snap);
  const feeds = buildChannelFeedSeeds(
    data,
    serverNowISO,
    session.nextSignificantEvent.at,
  );

  return (
    <FeedHealthProvider serverNowISO={serverNowISO} feeds={feeds}>
      <div className="w-full max-w-[1440px] space-y-10 pb-16">
      {engine === "spy" && <EsContextStrip snap={data.snap} />}

      <header className="relative overflow-hidden rounded-[22px] border border-[#C9A227]/55 bg-[#071116] px-5 py-5 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-7 md:py-6">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
        />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-gold-soft/82 tracking-[0.20em] uppercase">
                {copy.hero.eyebrow}
              </span>
              <span className="h-px w-10 bg-gold/45 hidden sm:block" />
              <span className="font-mono text-[10px] text-paper/48 tracking-[0.20em] uppercase">
                {todayLabel()}
              </span>
              <ChannelLiveBadge />
            </div>
            <h1 className="mt-3 text-[36px] font-serif leading-none tracking-tight text-paper md:text-[46px]">
              {copy.hero.titleLead}{" "}
              <span className="text-gold-soft/72 italic font-light">
                {copy.hero.titleEmphasis}
              </span>
            </h1>
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-paper/72">
              {heroSynthesis(data.snap)}
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/46 tabular-nums">
              {freshnessLine(data.source, data.snap.asOf, session.nextSignificantEvent.at)}
            </p>
          </div>
          <div className="hidden md:grid grid-cols-3 gap-2 text-right">
            <Stat label="Bias" value={bias.bias} highlight={bias.bias} />
            <Stat label="Window" value={decision.windowET || "—"} />
            <Stat
              label="Last"
              value={currentPrice.toFixed(2)}
            />
          </div>
        </div>
      </header>

      <DegradedModeBanner className="-mt-6" />

      <ChannelStateRail
        engine={engine === "spy" ? "SPY" : "ES"}
        current={displayedState}
        nextEventISO={session.nextSignificantEvent.at.toISOString()}
        nextEventLabel={session.nextSignificantEvent.label}
        condition={data.snap.flipCondition}
      />

      <AnchorSlate engine={engine} snap={data.snap} />

      <section className="space-y-5">
        <SectionLabel number={copy.sections.plays.number}>
          {config.sections.plays}
        </SectionLabel>
        <OptionsIntelligence
          intel={optionsIntel}
          strikes={strikes}
          spy={currentPrice}
          chain={optionsChain}
          signal={signal}
          snap={data.snap}
        />
      </section>

      <section className="space-y-5">
        <SectionLabel number={copy.sections.lines.number}>
          {config.sections.lines}
        </SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <TriggerMap lines={lines} currentPrice={currentPrice} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <PreOpenBias state={bias} />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionLabel number={copy.sections.tape.number}>
          {config.sections.tape}
        </SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <SignalTape ticks={signalTicks} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <RiskGuardrails state={guardrails} />
          </div>
        </div>
      </section>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        <span>Not financial advice · Historical and live outputs are decision-support only.</span>
        <span className="flex flex-wrap items-center gap-3">
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/risk" className="hover:text-ink">Options risk</Link>
          <span>Build 0.9.7</span>
          <span>Rules v1.0.0</span>
          <Link href="/contact" className="hover:text-ink">Report an issue</Link>
        </span>
      </footer>
      </div>
    </FeedHealthProvider>
  );
}

function EsContextStrip({ snap }: { snap: AdaptedSnapshot }) {
  return (
    <Link
      href="/es"
      className="block rounded-card border border-rule bg-paper px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 shadow-card transition-colors hover:border-rule-strong hover:text-ink"
      title="Open the ES Channel for the companion overnight-channel read."
    >
      ES context · open ES Channel · SPY decisions should be checked against the futures read
      <span className="ml-2 text-ink-4">SPY {displayedChannelState(snap).replace(/_/g, " ")}</span>
    </Link>
  );
}

function heroSynthesis(snap: AdaptedSnapshot): string {
  const bias = snap.bias.bias.toLowerCase();
  const displayedState = displayedChannelState(snap);
  const state = statePhrase(displayedState);
  const engineCondition = cleanSpyExplanation(snap.flipCondition, snap.currentPrice);
  if (
    engineCondition &&
    (displayedState === "ARMED" || displayedState === "GO" || displayedState === "COOLDOWN")
  ) {
    return `${capitalize(bias)} lean, engine ${state}; ${engineCondition}`;
  }
  const closest = snap.lines
    .slice()
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];
  const lineText = closest
    ? `${closest.name} (${(closest.entryValue ?? closest.currentValue).toFixed(2)})`
    : "a qualified SPY rail";
  const lineValue = closest ? closest.entryValue ?? closest.currentValue : null;
  const signedDistance = lineValue === null ? null : lineValue - snap.currentPrice;
  const distanceText = closest
    ? `${Math.abs(signedDistance ?? closest.distanceFromPrice).toFixed(2)} pts ${(signedDistance ?? closest.distanceFromPrice) >= 0 ? "above" : "below"}`
    : "away from";
  const flowTail = snap.flow
    ? ` Options flow ${snap.flow.lean.toLowerCase()} (${snap.flow.bullishCount} bull / ${snap.flow.bearishCount} bear).`
    : "";
  const action =
    displayedState === "WAIT" || displayedState === "WATCH"
      ? "Waiting for qualified confirmation."
      : displayedState === "STAND_DOWN"
        ? "Standing down until structure reactivates."
        : displayedState === "PRE_CONFIG"
          ? "Awaiting the setup window."
          : "Tracking the current state.";
  return `${capitalize(bias)} lean, engine ${state}; SPY ${snap.currentPrice.toFixed(2)} sits ${distanceText} the 08:00 reference ${lineText}. ${action}${flowTail}`;
}

function cleanSpyExplanation(text: string, spot: number): string {
  if (!text || !Number.isFinite(spot) || spot <= 0) return text;
  const gammaFlip = /(?:\s*)dealer gamma (?:positive|negative|flat) with flip near ([0-9]+(?:\.[0-9]+)?)(?:\.|,)?/i;
  const match = text.match(gammaFlip);
  if (!match) return text;
  const flip = Number(match[1]);
  if (!Number.isFinite(flip)) return text;
  if (Math.abs(flip - spot) / spot <= 0.12) return text;
  const cleaned = text.replace(gammaFlip, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || "Options context is withheld until the live chain is inside a realistic SPY range.";
}

function freshnessLine(source: LiveSnapshotSource, asOf: string, next: Date): string {
  const state =
    source === "live" ? "live" : source === "degraded" || source === "seed" ? "stale" : "offline";
  return `${state} | updated ${formatHM(asOf)} CT | next ${formatHM(next.toISOString())} CT`;
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

function statePhrase(state: string): string {
  return state.replace(/_/g, " ").toLowerCase();
}

function displayedChannelState(snap: AdaptedSnapshot): AdaptedSnapshot["currentState"] {
  return snap.currentState;
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function buildChannelFeedSeeds(
  data: ChannelShellData,
  serverNowISO: string,
  nextExpectedAt: Date,
): FeedHealthSeed[] {
  const snap = data.snap;
  const sourceStatus = statusFromSource(data.source);
  const failedAt = sourceStatus === "failed" ? serverNowISO : null;
  const nextIso = nextExpectedAt.toISOString();
  const structureStatus =
    sourceStatus === "failed"
      ? "failed"
      : sourceStatus === "stale"
        ? "stale"
        : undefined;
  const panelStatus = sourceStatus === "failed" ? "failed" : undefined;
  const priceUpdatedAt = snap.shellState.feedHealth.lastTickTs || snap.asOf;
  const optionsReady = Boolean(snap.optionsIntel && snap.strikes);

  return [
    buildFeedSeed("price-tick", {
      lastUpdatedAt: priceUpdatedAt,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.priceTickMs,
      failAfterMs: 5 * 60_000,
      critical: true,
      failedAt,
      initialStatus: sourceStatus,
    }),
    buildFeedSeed("anchor-levels", {
      lastUpdatedAt: snap.asOf,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.channelStructureMs,
      failAfterMs: 10 * 60_000,
      critical: true,
      failedAt,
      initialStatus: structureStatus,
    }),
    buildFeedSeed("trigger-lines", {
      lastUpdatedAt: snap.asOf,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.channelStructureMs,
      failAfterMs: 10 * 60_000,
      failedAt,
      initialStatus: structureStatus,
    }),
    buildFeedSeed("pre-open-bias", {
      lastUpdatedAt: snap.asOf,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.channelPanelMs,
      failAfterMs: 30 * 60_000,
      failedAt,
      initialStatus: panelStatus,
    }),
    buildFeedSeed("options-chain", {
      lastUpdatedAt: optionsReady ? snap.asOf : null,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.channelPanelMs,
      failAfterMs: 30 * 60_000,
      failedAt,
      initialStatus:
        sourceStatus === "failed" ? "failed" : optionsReady ? undefined : "loading",
    }),
    buildFeedSeed("signal-tape", {
      lastUpdatedAt: snap.asOf,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.channelPanelMs,
      failAfterMs: 30 * 60_000,
      critical: true,
      failedAt,
      initialStatus: panelStatus,
    }),
    buildFeedSeed("risk-guardrails", {
      lastUpdatedAt: snap.asOf,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.channelPanelMs,
      failAfterMs: 30 * 60_000,
      failedAt,
      initialStatus: panelStatus,
    }),
    buildFeedSeed("session-clock", {
      lastUpdatedAt: serverNowISO,
      nextExpectedAt: nextIso,
      staleAfterMs: FEED_DEFAULTS.marketClockMs,
      failAfterMs: 5 * 60_000,
      critical: true,
    }),
  ];
}

function statusFromSource(source: LiveSnapshotSource): FeedStatus | undefined {
  if (source === "error") return "failed";
  if (source === "live") return undefined;
  return "stale";
}

function SourceBadge({
  source,
  error,
}: {
  source: LiveSnapshotSource;
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
      title={error || `Source: ${source}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${live ? "bg-bull animate-breathe" : degraded ? "bg-gold" : "bg-ink-4"}`}
      />
      {source}
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

function Stat({
  label,
  value,
  highlight,
  support,
}: {
  label: string;
  value: string;
  highlight?: string;
  support?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-paper/10 bg-paper/[0.045] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="eyebrow text-paper/45 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[15px] font-semibold tabular-nums ${
          highlight === "BULLISH"
            ? "text-bull-ink"
            : highlight === "BEARISH"
              ? "text-bear-ink"
              : "text-paper"
        }`}
        data-num
      >
        {value}
      </div>
      {support}
    </div>
  );
}
