import { AnchorSlate } from "@/components/channel/AnchorSlate";
import { ChannelLiveBadge, LastUpdatedAge } from "@/components/channel/ChannelLiveBadge";
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
  } = data.snap;
  const now = new Date();
  const serverNowISO = now.toISOString();
  const session = getSessionInfo(engine === "spy" ? "SPY" : "SPX", now);
  const feeds = buildChannelFeedSeeds(
    data,
    serverNowISO,
    session.nextSignificantEvent.at,
  );

  return (
    <FeedHealthProvider serverNowISO={serverNowISO} feeds={feeds}>
      <div className="w-full max-w-[1440px] space-y-10 pb-16">
      {/* Editorial header - matches the previous /spy surface exactly. */}
      <header className="relative overflow-hidden rounded-[18px] border border-[#D6BC75]/45 bg-[#071116] px-5 py-5 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-7 md:py-6">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
        />
        <div
          aria-hidden
          className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-gold/20"
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
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
              <SourceBadge source={data.source} error={data.error} />
            </div>
            <h1 className="mt-3 text-[36px] font-serif leading-none tracking-tight text-paper md:text-[46px]">
              {copy.hero.titleLead}{" "}
              <span className="text-gold-soft/72 italic font-light">
                {copy.hero.titleEmphasis}
              </span>
            </h1>
          </div>
          <div className="hidden md:flex items-center gap-6 text-right">
            <Stat label="Bias" value={bias.bias} highlight={bias.bias} />
            <Stat label="Window" value={decision.windowET || "—"} />
            <Stat
              label="Last"
              value={currentPrice.toFixed(2)}
              support={<LastUpdatedAge />}
            />
          </div>
        </div>
      </header>

      <DegradedModeBanner className="-mt-6" />

      <AnchorSlate engine={engine} snap={data.snap} />

      <section className="space-y-5">
        <SectionLabel number={copy.sections.plays.number}>
          {config.sections.plays}
        </SectionLabel>
        <OptionsIntelligence
          intel={optionsIntel}
          strikes={strikes}
          spy={currentPrice}
        />
      </section>

      <section className="space-y-5">
        <SectionLabel number={copy.sections.lines.number}>
          {config.sections.lines}
        </SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <TriggerMap lines={lines} />
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

      <footer className="pt-6 mt-6 border-t border-rule flex items-center justify-between text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em]">
        <span>{copy.footer.left}</span>
        <span>{copy.footer.right}</span>
      </footer>
      </div>
    </FeedHealthProvider>
  );
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
      failAfterMs: 30_000,
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
    <div>
      <div className="eyebrow text-paper/45 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[13px] font-semibold tabular-nums ${
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
