"use client";

// Single hero verdict card with explicit states. Replaces the inline
// card markup in HeroSection so reasoning lives in one place and
// every state has a known render path. The card always reserves the
// same dimensions to prevent CLS on state transitions.
//
// State precedence (highest first):
//   error    : snapshot threw or returned source: "error"
//   loading  : initial SSR pass before client hydrates
//   stale    : snapshot ts > 5 min old
//   weekend  : SPY session phase CLOSED_WEEKEND
//   holiday  : SPY session phase CLOSED_HOLIDAY
//   closed   : POST_RTH or PRE_CONFIG outside RTH
//   pre-open : CONFIG_WINDOW or POST_CONFIG before RTH
//   live     : RTH_OPEN with a valid decision
//
// aria-live="polite" wraps the value region; we throttle announcements
// so screen readers aren't spammed by every 30s poll — only verdict
// changes are announced.

import { useEffect, useRef, useState } from "react";
import { useLiveSPY } from "@/lib/use-live-snapshot";
import { getSessionInfo } from "@/lib/sessions";
import { JargonTooltip } from "./JargonTooltip";
import type { DecisionState } from "@/lib/types";

export type VerdictCardState =
  | "loading"
  | "error"
  | "stale"
  | "weekend"
  | "holiday"
  | "closed"
  | "pre-open"
  | "live";

interface Props {
  decision?: DecisionState;
  quote?: { spy: number; change: number; changePct: number; vix: number };
  initialLive?: boolean;
}

const STALE_MS = 5 * 60_000;

export function HeroVerdictCard({
  decision: serverDecision,
  quote: serverQuote,
  initialLive,
}: Props) {
  const live = useLiveSPY({
    decision: serverDecision,
    shell: serverQuote
      ? {
          spy: serverQuote.spy,
          change: serverQuote.change,
          changePct: serverQuote.changePct,
          vix: serverQuote.vix,
          vixDelta: 0,
          isLive: !!initialLive,
          sessionLabel: "",
          sessionCloses: "",
          feedHealth: { lastTickTs: new Date().toISOString(), source: "server" },
        }
      : undefined,
    source: initialLive ? "live" : undefined,
  });

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const state = resolveState({
    source: live.source,
    feedTs: live.shell.feedHealth.lastTickTs,
    nowMs: now,
  });
  const decision = live.decision;
  const t = live.shell;

  // Throttled aria-live: only announce when the verdict text changes.
  const lastAnnouncedRef = useRef<string>("");
  const announce =
    state === "live" && decision.verdict !== lastAnnouncedRef.current
      ? decision.verdict
      : "";
  if (announce) lastAnnouncedRef.current = announce;

  // Sample badge — shown when state isn't live, since the values on
  // screen are either stale closes or seed data.
  const isSample = state !== "live";

  return (
    <div
      role="region"
      aria-label="Live verdict card"
      // Reserved height keeps the hero from shifting between states.
      className="surface rounded-card overflow-hidden min-h-[224px] md:min-h-[180px]"
      data-state={state}
    >
      <div className="grid grid-cols-12">
        <VerdictPane
          state={state}
          decision={decision}
          announceText={announce}
        />
        <RationalePane state={state} decision={decision} />
        <QuotesPane t={t} state={state} />
      </div>
      {isSample && (
        <div className="border-t border-rule px-6 py-2 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] text-ink-3 tracking-[0.16em] uppercase">
            Sample · refreshes during market hours
          </span>
          <SampleBadge state={state} />
        </div>
      )}
    </div>
  );
}

function VerdictPane({
  state,
  decision,
  announceText,
}: {
  state: VerdictCardState;
  decision: DecisionState;
  announceText: string;
}) {
  const eyebrow = EYEBROW[state];
  const verdict = state === "loading" ? "—" : decision.verdict;
  const conviction = state === "loading" ? null : decision.conviction;
  return (
    <div className="col-span-12 md:col-span-3 p-6 border-b md:border-b-0 md:border-r border-rule">
      <div className="eyebrow text-ink-3 mb-2">{eyebrow}</div>
      <div className="flex items-baseline gap-2">
        <span
          aria-live="polite"
          aria-atomic="true"
          className="text-headline font-serif text-gold-ink"
        >
          {verdict}
        </span>
        <span className="font-mono text-sm text-ink-3 tabular-nums">
          {conviction == null ? "—" : `${conviction}/100`}
        </span>
        <span className="sr-only">{announceText}</span>
      </div>
      <div className="mt-3 h-1 bg-paper-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-ink rounded-full transition-[width] duration-500"
          style={{ width: `${conviction ?? 0}%` }}
        />
      </div>
      <div className="mt-3 text-[11px] text-ink-3 font-mono">
        {state === "loading" ? "loading…" : decision.windowET}
      </div>
    </div>
  );
}

function RationalePane({
  state,
  decision,
}: {
  state: VerdictCardState;
  decision: DecisionState;
}) {
  return (
    <div className="col-span-12 md:col-span-6 p-6 border-b md:border-b-0 md:border-r border-rule flex flex-col justify-center">
      <div className="eyebrow text-ink-3 mb-2">Rationale</div>
      <p className="text-[14px] text-ink-2 leading-relaxed">
        {state === "loading" || state === "error"
          ? RATIONALE[state]
          : state === "live"
            ? decorateJargon(decision.finalExplanation)
            : RATIONALE[state]}
      </p>
    </div>
  );
}

function QuotesPane({
  t,
  state,
}: {
  t: { spy: number; change: number; vix: number };
  state: VerdictCardState;
}) {
  const stale = state !== "live";
  return (
    <div className="col-span-12 md:col-span-3 p-6 grid grid-cols-3 md:grid-cols-1 gap-4">
      <Quote label="SPY" value={t.spy.toFixed(2)} />
      <Quote
        label="CHG"
        value={
          stale
            ? "—"
            : `${t.change >= 0 ? "+" : ""}${t.change.toFixed(2)}`
        }
        tone={stale ? "ink" : t.change >= 0 ? "bull" : "bear"}
      />
      <Quote label="VIX" value={t.vix.toFixed(2)} />
    </div>
  );
}

function Quote({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls =
    tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink";
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-1">{label}</div>
      <div className={`font-mono text-base font-semibold tabular-nums ${cls}`} data-num>
        {value}
      </div>
    </div>
  );
}

// Wraps known jargon phrases in <JargonTooltip> by tokenizing the
// rationale string. Keeps the surface honest — every term flagged
// here should also exist on /methodology.
const JARGON: Array<{ pattern: RegExp; hint: string }> = [
  {
    pattern: /\bUpper Descending(?: Trendline)?\b/g,
    hint:
      "A line projected downward from yesterday's high pivot — a level the engine watches for rejection.",
  },
  {
    pattern: /\bLower Descending(?: Trendline)?\b/g,
    hint:
      "A line projected downward from yesterday's low pivot — a level the engine watches for rejection.",
  },
  {
    pattern: /\bqualified rejection\b/g,
    hint:
      "A candle that touches a line and closes back away from it — the signal the engine waits for.",
  },
  {
    pattern: /\bConfirmed rejection\b/g,
    hint:
      "A qualified structural condition followed by confirmation.",
  },
];

function decorateJargon(text: string): React.ReactNode {
  if (!text) return text;
  // Naive tokenizer: walk JARGON in order, splitting on the first
  // pattern that matches. Sufficient for marketing copy; not meant
  // to be a general parser.
  for (const { pattern, hint } of JARGON) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (!m) continue;
    const before = text.slice(0, m.index);
    const matched = m[0];
    const after = text.slice(m.index + matched.length);
    return (
      <>
        {before}
        <JargonTooltip term={matched} hint={hint} />
        {decorateJargon(after)}
      </>
    );
  }
  return text;
}

function resolveState({
  source,
  feedTs,
  nowMs,
}: {
  source: string;
  feedTs: string;
  nowMs: number | null;
}): VerdictCardState {
  if (source === "error") return "error";
  if (nowMs == null) return "loading";

  const ts = Date.parse(feedTs);
  if (Number.isFinite(ts) && nowMs - ts > STALE_MS) return "stale";

  const session = getSessionInfo("SPY", new Date(nowMs));
  switch (session.phase) {
    case "RTH_OPEN":
      return "live";
    case "CLOSED_WEEKEND":
      return "weekend";
    case "CLOSED_HOLIDAY":
      return "holiday";
    case "CONFIG_WINDOW":
    case "POST_CONFIG":
      return "pre-open";
    case "POST_RTH":
    case "PRE_CONFIG":
      return "closed";
  }
}

const EYEBROW: Record<VerdictCardState, string> = {
  loading: "Loading · today's verdict",
  error: "Verdict unavailable",
  stale: "Stale · last seen",
  weekend: "Markets closed · weekend",
  holiday: "Markets closed · holiday",
  closed: "Between sessions",
  "pre-open": "Pre-market",
  live: "Live · today's verdict",
};

const RATIONALE: Record<VerdictCardState, string> = {
  loading: "Loading the most recent read.",
  error:
    "We couldn't reach the data feed. The slate will populate as soon as the feed recovers.",
  stale:
    "The most recent snapshot is over five minutes old. Numbers below may not reflect the current market.",
  weekend:
    "US equity markets are closed. The slate populates again at the next overnight configuration window.",
  holiday:
    "US equity markets are closed for a market holiday. The slate populates again at the next session.",
  closed:
    "Between sessions. The most recent close is shown; the slate's full reasoning resumes during the next configuration window.",
  "pre-open":
    "Pre-market window. The engine is observing premarket levels; the slate's full reasoning resumes at the open.",
  live: "",
};

function SampleBadge({ state }: { state: VerdictCardState }) {
  const tone =
    state === "stale" || state === "error"
      ? "text-state-bearish"
      : "text-ink-3";
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone}`}
    >
      {state.replace("-", " ")}
    </span>
  );
}

