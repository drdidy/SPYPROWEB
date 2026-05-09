import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusPill } from "@/components/ui/StatusPill";
import { StateLadder } from "@/components/slate/StateLadder";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { SPXSnapshot } from "@/lib/types";
import type { EngineState } from "@/lib/states";
import { ArrowRight, Crosshair } from "lucide-react";

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

      <SectionLabel number="01">Today's plays</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SpyVerdictCard snap={spy} />
        <SpxVerdictCard snap={spx} />
      </div>

      <SectionLabel number="02">The read</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SpyReadCard snap={spy} />
        <SpxReadCard snap={spx} />
      </div>

      <footer className="pt-6 mt-6 border-t border-rule flex items-center justify-between text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em]">
        <span>Prophet · dual-engine slate</span>
        <span>End of slate</span>
      </footer>
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
  const verdict = decision.verdict;
  const tone = verdictTone(verdict);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="SPY"
        title={
          <span className="flex items-baseline gap-3 flex-wrap">
            <span className="font-serif text-display tracking-tight">
              {verbLabel(verdict)}
            </span>
            <span className="font-mono text-sm text-ink-3 tabular-nums">
              {currentPrice.toFixed(2)}
            </span>
          </span>
        }
        meta={decision.windowET || undefined}
        action={<StatusPill variant={tone}>{verdict}</StatusPill>}
      />
      <CardBody className="space-y-4">
        <p className="text-[14px] text-ink-2 leading-relaxed">
          {decision.finalExplanation || snap.bias.explanation || "Engine is initializing."}
        </p>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-rule">
          <Stat label="Conviction" value={`${decision.conviction}/5`} />
          <Stat
            label="Bias"
            value={snap.bias.bias}
            highlight={snap.bias.bias}
          />
          <Stat
            label="Grade"
            value={signal && quality ? quality.grade : "—"}
          />
        </div>
        <Link
          href="/spy"
          className="flex items-center justify-between text-[12px] text-ink-2 hover:text-ink transition-colors pt-2"
        >
          <span className="font-mono uppercase tracking-[0.14em]">
            Open SPY Channel
          </span>
          <ArrowRight size={13} className="text-ink-3" />
        </Link>
      </CardBody>
    </Card>
  );
}

function SpyReadCard({ snap }: { snap: AdaptedSnapshot }) {
  const armed = snap.lines.filter((l) => l.isPrimary).slice(0, 4);
  return (
    <Card>
      <CardHeader
        eyebrow="SPY · structure"
        title={`${armed.length} primary line${armed.length === 1 ? "" : "s"} carrying`}
        meta={`Last ${snap.currentPrice.toFixed(2)}`}
      />
      <CardBody className="px-0 pb-0">
        {armed.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-ink-3">
            No primary lines resolved yet.
          </div>
        ) : (
          <ul className="divide-y divide-rule border-t border-rule">
            {armed.map((l) => (
              <li
                key={l.name}
                className="flex items-baseline justify-between px-5 py-3 text-[13px]"
              >
                <span className="flex items-center gap-2.5">
                  <Crosshair size={12} className="text-ink-3" />
                  <span className="font-mono text-ink">{l.name}</span>
                </span>
                <span className="font-mono tabular-nums text-ink-2">
                  {l.currentValue.toFixed(2)}{" "}
                  <span
                    className={
                      l.distanceFromPrice >= 0 ? "text-bull-ink" : "text-bear-ink"
                    }
                  >
                    ({l.distanceFromPrice >= 0 ? "+" : ""}
                    {l.distanceFromPrice.toFixed(2)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---- SPX ----

function SpxVerdictCard({ snap }: { snap: SPXSnapshot }) {
  const action = snap.confluence.action;
  const tone = spxActionTone(action);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="SPX"
        title={
          <span className="flex items-baseline gap-3 flex-wrap">
            <span className="font-serif text-display tracking-tight">
              {spxActionLabel(action)}
            </span>
            <span className="font-mono text-sm text-ink-3 tabular-nums">
              {snap.price.last.toFixed(2)}
            </span>
          </span>
        }
        meta={snap.scenario.replace(/_/g, " ")}
        action={<StatusPill variant={tone}>{action.replace(/_/g, " ")}</StatusPill>}
      />
      <CardBody className="space-y-4">
        <p className="text-[14px] text-ink-2 leading-relaxed">
          {snap.scenarioExplanation || snap.channel.reason || "Channel is initializing."}
        </p>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-rule">
          <Stat label="Score" value={`${Math.round(snap.confluence.score)}/100`} />
          <Stat label="Channel" value={snap.channel.direction} />
          <Stat
            label="Δ today"
            value={`${snap.price.change >= 0 ? "+" : ""}${snap.price.change.toFixed(2)}`}
            highlight={snap.price.change >= 0 ? "BULLISH" : "BEARISH"}
          />
        </div>
        <Link
          href="/spx"
          className="flex items-center justify-between text-[12px] text-ink-2 hover:text-ink transition-colors pt-2"
        >
          <span className="font-mono uppercase tracking-[0.14em]">
            Open SPX Channel
          </span>
          <ArrowRight size={13} className="text-ink-3" />
        </Link>
      </CardBody>
    </Card>
  );
}

function SpxReadCard({ snap }: { snap: SPXSnapshot }) {
  const sorted = [...snap.lines].sort(
    (a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
  );
  const top = sorted.slice(0, 4);
  return (
    <Card>
      <CardHeader
        eyebrow="SPX · structure"
        title={`${snap.lines.length} line${snap.lines.length === 1 ? "" : "s"} active`}
        meta={`Last ${snap.price.last.toFixed(2)}`}
      />
      <CardBody className="px-0 pb-0">
        {top.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-ink-3">
            Channel hasn't resolved yet.
          </div>
        ) : (
          <ul className="divide-y divide-rule border-t border-rule">
            {top.map((l) => (
              <li
                key={l.kind}
                className="flex items-baseline justify-between px-5 py-3 text-[13px]"
              >
                <span className="flex items-center gap-2.5">
                  <Crosshair size={12} className="text-ink-3" />
                  <span className="font-mono text-ink">
                    {spxLineLabel(l.kind)}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-ink-2">
                  {l.currentValue.toFixed(2)}{" "}
                  <span
                    className={
                      l.distanceFromPrice >= 0 ? "text-bull-ink" : "text-bear-ink"
                    }
                  >
                    ({l.distanceFromPrice >= 0 ? "+" : ""}
                    {l.distanceFromPrice.toFixed(2)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---- bits ----

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[13px] font-semibold tabular-nums ${
          highlight === "BULLISH"
            ? "text-bull-ink"
            : highlight === "BEARISH"
              ? "text-bear-ink"
              : "text-ink"
        }`}
        data-num
      >
        {value}
      </div>
    </div>
  );
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

function verbLabel(v: string): string {
  if (v === "WAIT") return "Waiting";
  if (v === "STAND DOWN") return "Standing down";
  return `Lean ${v.toLowerCase()}`;
}

function verdictTone(v: string): "confirmed" | "watching" | "breached" | "stale" {
  if (v === "LONG") return "confirmed";
  if (v === "SHORT") return "breached";
  if (v === "WAIT") return "watching";
  return "stale";
}

function spxActionLabel(a: string): string {
  if (a === "TAKE") return "Take the channel";
  if (a === "SELECTIVE") return "Selective";
  return "Standing down";
}

function spxActionTone(a: string): "confirmed" | "watching" | "stale" {
  if (a === "TAKE") return "confirmed";
  if (a === "SELECTIVE") return "watching";
  return "stale";
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
