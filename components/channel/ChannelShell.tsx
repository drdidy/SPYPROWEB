import { AnchorSlate } from "@/components/channel/AnchorSlate";
import { ChannelLiveBadge } from "@/components/channel/ChannelLiveBadge";
import { ChannelStateRail } from "@/components/channel/ChannelStateRail";
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
import {
  formatDirectionLabel,
  formatEngineStateLabel,
  formatSentenceState,
} from "@/lib/display-labels";
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
    signalTicks,
    signal,
  } = data.snap;
  const now = new Date();
  const serverNowISO = now.toISOString();
  const session = getSessionInfo(engine === "spy" ? "SPY" : "SPX", now);
  const displayedState = displayedChannelState(data.snap);
  const lastDisplay = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice.toFixed(2) : "--";
  const feeds = buildChannelFeedSeeds(
    data,
    serverNowISO,
    session.nextSignificantEvent.at,
  );

  if (engine === "spy") {
    return (
      <FeedHealthProvider serverNowISO={serverNowISO} feeds={feeds}>
        <div className="w-full max-w-[1440px] space-y-8 pb-16">
          <header className="contrast-dark relative overflow-hidden rounded-[18px] border border-[#C9A227]/55 bg-[#071116] px-5 py-4 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-6 md:py-5">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
            />
            <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft/82">
                    SPY Channel
                  </span>
                  <span className="hidden h-px w-10 bg-gold/45 sm:inline-block" />
                  <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-paper/48">
                    {todayLabel()}
                  </span>
                  <ChannelLiveBadge />
                </div>
                <h1 className="mt-2 text-[34px] font-serif leading-none tracking-tight text-paper md:text-[42px]">
                  Today&apos;s SPY{" "}
                  <span className="text-gold-soft/72 italic font-light">
                    Control Map.
                  </span>
                </h1>
                <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-paper/72">
                  {heroSynthesis(data.snap)}
                </p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/48 tabular-nums">
                  {freshnessLine(data.source, data.snap.asOf, session.nextSignificantEvent.at)}
                </p>
              </div>
              <div className="hidden md:flex items-center gap-6 text-right">
                <Stat label="Last" value={lastDisplay} />
                <Stat label="Control Line" value={spyControlLineValue(data.snap)} />
                <Stat label="Location" value={spyLocationLabel(data.snap)} highlight={bias.bias} />
              </div>
            </div>
          </header>

          <DegradedModeBanner />

          <section className="space-y-5">
            <SectionLabel number="01">Control Map</SectionLabel>
            <AnchorSlate engine={engine} snap={data.snap} />
          </section>

          <section className="space-y-5">
            <SectionLabel number="02">Trade Plan</SectionLabel>
            <SpyTradePlanCard
              state={displayedState}
              decision={decision}
              signal={signal}
              currentPrice={currentPrice}
              nextEventISO={session.nextSignificantEvent.at.toISOString()}
              nextEventLabel={session.nextSignificantEvent.label}
            />
          </section>

          <section className="space-y-5">
            <SectionLabel number="03">Session Timing</SectionLabel>
            <SpySessionTimingCard
              nextEventISO={session.nextSignificantEvent.at.toISOString()}
              nextEventLabel={session.nextSignificantEvent.label}
            />
          </section>

          <EsContextStrip snap={data.snap} />

          <details className="group rounded-card border border-rule bg-paper shadow-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              Advanced review
              <span className="text-ink-4 transition group-open:rotate-45">+</span>
            </summary>
            <div className="space-y-5 border-t border-rule p-5">
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 xl:col-span-7">
                  <TriggerMap lines={lines} currentPrice={currentPrice} />
                </div>
                <div className="col-span-12 xl:col-span-5">
                  <PreOpenBias state={bias} />
                </div>
              </div>
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 xl:col-span-7">
                  <SignalTape ticks={signalTicks} />
                </div>
                <div className="col-span-12 xl:col-span-5">
                  <RiskGuardrails state={guardrails} />
                </div>
              </div>
            </div>
          </details>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            <span>Not financial advice. Decision-support only.</span>
            <span className="flex flex-wrap items-center gap-3">
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/risk" className="hover:text-ink">Risk</Link>
              <Link href="/contact" className="hover:text-ink">Contact</Link>
            </span>
          </footer>
        </div>
      </FeedHealthProvider>
    );
  }

  return (
    <FeedHealthProvider serverNowISO={serverNowISO} feeds={feeds}>
      <div className="w-full max-w-[1440px] space-y-10 pb-16">
      <header className="contrast-dark relative overflow-hidden rounded-[22px] border border-[#C9A227]/55 bg-[#071116] px-5 py-5 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-7 md:py-6">
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
            <Stat label="Bias" value={formatDirectionLabel(bias.bias)} highlight={bias.bias} />
            <Stat label="Map" value={decision.windowET || "--"} />
            <Stat
              label="Last"
              value={lastDisplay}
            />
          </div>
        </div>
      </header>

      <DegradedModeBanner className="-mt-6" />

      <ChannelStateRail
        engine="ES"
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
        <ExecutionFocus
          state={displayedState}
          decision={decision}
          signal={signal}
          guardrails={guardrails}
          currentPrice={currentPrice}
          nextEventISO={session.nextSignificantEvent.at.toISOString()}
          nextEventLabel={session.nextSignificantEvent.label}
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
        <span>Not financial advice. Historical and live outputs are decision-support only.</span>
        <span className="flex flex-wrap items-center gap-3">
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/risk" className="hover:text-ink">Risk</Link>
          <Link href="/contact" className="hover:text-ink">Contact</Link>
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
      className="group flex flex-wrap items-center justify-between gap-3 rounded-card border border-rule bg-paper px-4 py-3 text-[12px] text-ink-2 shadow-card transition-colors hover:bg-paper-tier2"
      title="Open the ES Channel for the companion Control Map."
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        Companion ES Read
      </span>
      <span className="flex items-center gap-2">
        Open the futures Control Map before acting on a SPY setup.
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
          SPY {formatEngineStateLabel(displayedChannelState(snap))}
        </span>
      </span>
    </Link>
  );
}

function SpySessionTimingCard({
  nextEventISO,
  nextEventLabel,
}: {
  nextEventISO: string;
  nextEventLabel: string;
}) {
  const rows = [
    {
      label: "Morning read",
      time: "08:30 CT",
      detail: "Opening location frames whether SPY is above or below the Control Line.",
    },
    {
      label: "Control Map",
      time: "09:00 CT",
      detail: "The Control Line and gates become the operating map for the session.",
    },
    {
      label: "Decision window",
      time: "09:00-12:00 CT",
      detail: "Touch and close at a gate sets the next qualified candle read.",
    },
  ];

  return (
    <div className="rounded-[18px] border border-rule bg-paper p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-ink-3">Session Timing</div>
          <h2 className="mt-2 font-serif text-[28px] leading-none text-ink md:text-[34px]">
            Wait for the map to declare itself.
          </h2>
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-2 px-4 py-3 text-right">
          <div className="eyebrow text-ink-3">Next</div>
          <div className="mt-1 font-mono text-[15px] font-semibold text-ink tabular-nums">
            {formatTimeLabel(nextEventISO, nextEventLabel)}
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-[14px] border border-rule bg-paper-2/70 px-4 py-3">
            <div className="eyebrow text-ink-3">{row.label}</div>
            <div className="mt-1 font-mono text-[16px] font-semibold text-ink tabular-nums">
              {row.time}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{row.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function spyControlLineValue(snap: AdaptedSnapshot): string {
  const control =
    snap.lines.find((line) => String(line.kind) === "SPY_CONTROL" || line.name === "Control Line") ??
    snap.lines.find((line) => line.name.toLowerCase().includes("control"));
  const value = control?.entryValue ?? control?.currentValue;
  return Number.isFinite(value ?? NaN) ? Number(value).toFixed(2) : "Resolving";
}

function spyLocationLabel(snap: AdaptedSnapshot): string {
  const nearest = snap.lines
    .slice()
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];
  if (!nearest) return "Resolving";
  return nearest.name
    .replace(/\bMain\b/g, "Control Line")
    .replace(/\+3\.4\b/g, "North Gate I")
    .replace(/-3\.4\b/g, "South Gate I");
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
    : "the SPY Control Map";
  const lineValue = closest ? closest.entryValue ?? closest.currentValue : null;
  const signedDistance = lineValue === null ? null : lineValue - snap.currentPrice;
  const distanceText = closest
    ? `${Math.abs(signedDistance ?? closest.distanceFromPrice).toFixed(2)} pts ${(signedDistance ?? closest.distanceFromPrice) >= 0 ? "above" : "below"}`
    : "away from";
  const action =
    displayedState === "WAIT" || displayedState === "WATCH"
      ? "Waiting for qualified confirmation."
      : displayedState === "STAND_DOWN"
        ? "Standing down until structure reactivates."
        : displayedState === "PRE_CONFIG"
          ? "Awaiting the setup window."
          : "Tracking the current state.";
  const priceText = Number.isFinite(snap.currentPrice) && snap.currentPrice > 0 ? snap.currentPrice.toFixed(2) : "--";
  if (!closest || priceText === "--") {
    return `${capitalize(bias)} lean, engine ${state}; the Control Room is resolving. ${action}`;
  }
  return `${capitalize(bias)} lean, engine ${state}; SPY ${priceText} sits ${distanceText} the Control Room ${lineText}. ${action}`;
}

function cleanSpyExplanation(text: string, spot: number): string {
  if (!text || !Number.isFinite(spot) || spot <= 0) return text;
  const gammaFlip = /(?:\s*)dealer gamma (?:positive|negative|flat) with flip near ([0-9]+(?:\.[0-9]+)?)(?:\.|,)?/i;
  const match = text.match(gammaFlip);
  if (!match) return text;
  const cleaned = text.replace(gammaFlip, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || "Extra context is withheld until the session read is clean.";
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
  return formatSentenceState(state);
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

function SpyTradePlanCard({
  state,
  decision,
  signal,
  currentPrice,
  nextEventISO,
  nextEventLabel,
}: {
  state: AdaptedSnapshot["currentState"];
  decision: AdaptedSnapshot["decision"];
  signal: AdaptedSnapshot["signal"];
  currentPrice: number;
  nextEventISO: string;
  nextEventLabel: string;
}) {
  const standDown = state === "STAND_DOWN" || !signal;
  const title =
    state === "GO" && signal
      ? `${signal.type === "CALL" ? "Calls" : "Puts"} active`
      : state === "ARMED"
        ? "Setup armed"
        : state === "WAIT" || state === "WATCH"
          ? "Wait for confirmation"
          : state === "STAND_DOWN"
            ? "Stand down today"
            : "Prepare the map";
  const priceText = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice.toFixed(2) : "--";
  const side = signal?.type === "CALL" ? "BUY" : signal?.type === "PUT" ? "SELL" : "WAIT";

  return (
    <div className="rounded-[14px] border border-rule-tier2 bg-paper shadow-card">
      <div className="flex items-start justify-between gap-4 border-b border-rule px-5 pb-3 pt-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-ink/80">
            Trade Plan
          </div>
          <div className="mt-1.5 font-serif text-title tracking-tight text-ink">
            {standDown ? title : "Primary setup"}
          </div>
          <div className="mt-1 text-xs text-ink-3">
            {standDown
              ? "No trade until SPY confirms at a qualified gate."
              : "Entry and exit are tied to the current Control Map."}
          </div>
        </div>
        <div className="rounded-[12px] border border-rule bg-paper-2 px-3 py-2 text-right">
          <div className="eyebrow text-ink-3">SPY</div>
          <div className="font-mono text-[16px] font-semibold text-ink tabular-nums" data-num>
            {priceText}
          </div>
        </div>
      </div>
      {standDown ? (
        <div className="px-5 py-8 text-center">
          <div className="font-serif text-display text-ink-3 italic font-light">
            No play
          </div>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-3">
            The SPY Control Map does not have a clean trade here. Wait for price
            to return to a gate and close with confirmation.
          </p>
        </div>
      ) : (
        <div className="grid gap-0 divide-y divide-rule px-0 py-0 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="eyebrow text-ink-3">Primary</span>
              <span className={`rounded-pill px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
                side === "BUY" ? "bg-bull-tint text-bull-ink" : "bg-bear-tint text-bear-ink"
              }`}>
                {side}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TradePlanCell label="Entry" value={signal.entryPrice.toFixed(2)} detail="Qualified gate" />
              <TradePlanCell label="Exit" value={signal.targetPrice.toFixed(2)} detail="Next boundary" />
            </div>
            <div className="mt-5 hr-rule" />
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <span className="text-ink-3">Stop</span>
              <span className="font-mono font-semibold tabular-nums text-gold-ink" data-num>
                {signal.stopPrice.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="eyebrow text-ink-3">Decision</div>
            <div className="mt-2 font-serif text-[28px] leading-none text-ink">
              {title}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              {decision.finalExplanation || "Manage the setup from the Control Map only."}
            </p>
            <div className="mt-4 rounded-soft border border-rule bg-paper-2/60 px-3 py-3">
              <div className="eyebrow text-ink-3">Next</div>
              <div className="mt-1 font-mono text-[13px] font-semibold text-ink tabular-nums">
                {formatTimeLabel(nextEventISO, nextEventLabel)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TradePlanCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-1">{label}</div>
      <div className="font-serif text-headline tabular-nums text-ink" data-num>
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-ink-3">{detail}</div>
    </div>
  );
}

function ExecutionFocus({
  state,
  decision,
  signal,
  guardrails,
  currentPrice,
  nextEventISO,
  nextEventLabel,
}: {
  state: AdaptedSnapshot["currentState"];
  decision: AdaptedSnapshot["decision"];
  signal: AdaptedSnapshot["signal"];
  guardrails: AdaptedSnapshot["guardrails"];
  currentPrice: number;
  nextEventISO: string;
  nextEventLabel: string;
}) {
  const action =
    state === "GO" && signal
      ? `${signal.type === "CALL" ? "Calls" : "Puts"} active`
      : state === "ARMED"
        ? "Setup armed"
        : state === "WAIT" || state === "WATCH"
          ? "Wait for confirmation"
          : state === "STAND_DOWN"
            ? "Stand down"
            : "Prepare the read";
  const riskReady = Object.values(guardrails).filter((item) => item.status === "OK" || item.status === "INTACT").length;
  const riskTotal = Object.values(guardrails).length;
  const target = signal ? signal.targetPrice.toFixed(2) : "Pending";
  const stop = signal ? signal.stopPrice.toFixed(2) : "Pending";
  const priceText = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice.toFixed(2) : "--";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
      <div className="relative overflow-hidden rounded-[18px] border border-rule bg-paper px-5 py-5 shadow-soft">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(14,124,80,0.72),rgba(201,162,39,0.78),rgba(181,48,30,0.72))]"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-ink-3">Execution Focus</div>
            <h2 className="mt-2 font-serif text-[30px] leading-none text-ink md:text-[36px]">
              {action}
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-2">
              {decision.finalExplanation || "The slate is waiting for a cleaner read before committing."}
            </p>
          </div>
          <div className="rounded-[14px] border border-rule bg-paper-2 px-4 py-3 text-right">
            <div className="eyebrow text-ink-3">SPY</div>
            <div className="font-mono text-[24px] font-semibold text-ink tabular-nums" data-num>
              {priceText}
            </div>
            <div className="mt-1 text-[11px] text-ink-3">{formatTimeLabel(nextEventISO, nextEventLabel)}</div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ExecutionMetric label="Verdict" value={decision.verdict} tone={decision.verdict === "LONG" ? "bull" : decision.verdict === "SHORT" ? "bear" : "ink"} />
          <ExecutionMetric label="Target" value={target} tone="teal" />
          <ExecutionMetric label="Stop" value={stop} tone="gold" />
        </div>
      </div>

      <div className="contrast-dark rounded-[18px] border border-rule bg-[#071116] p-5 text-paper shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow text-paper/45">Trade checks</div>
            <div className="mt-2 font-serif text-[26px] leading-none text-paper">
              {riskReady}/{riskTotal} checks clean
            </div>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-full border border-gold/40 bg-paper/[0.06] font-mono text-[13px] text-gold-soft">
            {decision.conviction}
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {Object.entries(guardrails).map(([key, item]) => (
            <div key={key} className="flex items-start justify-between gap-3 border-t border-paper/10 pt-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                  {formatGuardrailName(key)}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-paper/66">{item.detail}</p>
              </div>
              <span className="shrink-0 rounded-full border border-paper/12 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-paper/72">
                {formatSentenceState(item.status)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExecutionMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "bull" | "bear" | "gold" | "teal" | "ink";
}) {
  const toneClass =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : tone === "gold"
          ? "text-gold-ink"
          : tone === "teal"
            ? "text-ink"
            : "text-ink";
  return (
    <div className="rounded-[14px] border border-rule bg-paper-2/70 px-4 py-3">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className={`mt-1 font-mono text-[18px] font-semibold tabular-nums ${toneClass}`} data-num>
        {value}
      </div>
    </div>
  );
}

function formatGuardrailName(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimeLabel(iso: string, label: string): string {
  return `${label} ${formatHM(iso)}`;
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
