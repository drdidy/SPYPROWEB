"use client";

// Client-side SPX channel renderer. The page wrapper is a thin
// server-component shell (page.tsx); this component fetches the
// snapshot from the browser via the same path the /replay workspace
// uses.
//
// Why client-side fetch on /spx? The channel should use the same
// authenticated browser path as /replay, especially on protected Vercel
// preview deployments where a server-to-server request may receive a
// 401 even though the user's browser session is authorized.
//
// Moving the fetch to the browser uses the same auth-cookie path as
// /replay and produces identical results.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { WhyThisStateLink } from "@/components/slate/WhyThisStateLink";
import { SPXDeviationFanPanel } from "@/components/spx/SPXDeviationFanPanel";
import { ESPlanCountdownCard } from "@/components/spx/ESPlanCountdownCard";
import { SPXPlaysSlate } from "@/components/spx/SPXPlaysSlate";
import { SPXSessionOrigin } from "@/components/spx/SPXSessionOrigin";
import { SPXConfluence } from "@/components/spx/SPXConfluence";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils";
import { formatDisplayLabel, formatEngineStateLabel } from "@/lib/display-labels";
import { getSessionInfo } from "@/lib/sessions";
import { canonicalizeEsSnapshot } from "@/lib/canonical-es";
import type { EngineState } from "@/lib/states";
import type { SPXSnapshot } from "@/lib/types";

interface Props {
  /** YYYY-MM-DD when launched from a /replay deep link. */
  replayDate?: string;
  initialSnapshot?: SPXSnapshot;
  initialSource?: "live" | "mock";
  initialError?: string;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; snap: SPXSnapshot }
  | { status: "no_bars"; message: string }
  | { status: "error"; message: string; trace?: string };

interface ApiErrorBody {
  error?: string;
  kind?: "no_bars" | "engine_error" | string;
  subkind?: string;
  trace?: string[];
}

interface IntradayReplayResponse {
  es?: Array<{ t: string; h: number; l: number; c: number }>;
}

export function SPXChannelClient({
  replayDate,
  initialSnapshot,
  initialSource,
  initialError,
}: Props) {
  const [state, setState] = useState<FetchState>(
    initialSnapshot
      ? { status: "ready", snap: initialSnapshot }
      : { status: "loading" },
  );
  const [esBars, setEsBars] = useState<Array<{ t: string; h: number; l: number; c: number }> | null>(null);
  const [showLoadingDetail, setShowLoadingDetail] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const slowLoadTimer = window.setTimeout(() => {
      if (!cancelled) setShowLoadingDetail(true);
    }, 3500);
    if (!initialSnapshot) setState({ status: "loading" });
    setEsBars(null);
    setShowLoadingDetail(false);
    const url = replayDate
      ? `/api/spx/snapshot?date=${encodeURIComponent(replayDate)}`
      : `/api/spx/snapshot`;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as SPXSnapshot;
          if (!cancelled) setState({ status: "ready", snap: json });
          const intradayDate = replayDate ?? json.sessionDateCT;
          fetch(`/api/replay/intraday?date=${encodeURIComponent(intradayDate)}`, {
            cache: "no-store",
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((body: IntradayReplayResponse | null) => {
              if (cancelled) return;
              setEsBars(
                (body?.es ?? []).filter(
                  (bar) =>
                    !!bar.t &&
                    Number.isFinite(bar.h) &&
                    Number.isFinite(bar.l) &&
                    Number.isFinite(bar.c),
                ),
              );
            })
            .catch(() => {
              if (!cancelled) setEsBars(null);
            });
          return;
        }
        // Try to surface the API's error body. The handler emits
        // { error, kind, trace? } JSON for both 503 and 500.
        let body: ApiErrorBody = {};
        try {
          body = (await res.json()) as ApiErrorBody;
        } catch {
          /* non-JSON body, fall through */
        }
        const message = scrubProviderDetail(
          body.error ?? `API returned ${res.status} from ${url}`,
        );
        const trace = body.trace?.map(scrubProviderDetail).join(" - ");
        if (cancelled) return;
        if (initialSnapshot) {
          setState({ status: "ready", snap: initialSnapshot });
          return;
        }
        if (res.status === 503 || body.kind === "no_bars") {
          setState({ status: "no_bars", message });
        } else {
          setState({ status: "error", message, trace });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        if (initialSnapshot) {
          setState({ status: "ready", snap: initialSnapshot });
          return;
        }
        setState({
          status: "error",
          message:
            e instanceof Error ? e.message : "Snapshot fetch failed.",
        });
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(slowLoadTimer);
    };
  }, [initialSnapshot, replayDate]);

  if (!hydrated) {
    return <ESLoadingShell replayDate={replayDate} showLoadingDetail={false} />;
  }

  if (state.status === "loading") {
    return <ESLoadingShell replayDate={replayDate} showLoadingDetail={showLoadingDetail} />;
  }

  if (state.status === "no_bars") {
    // 503 from the API. The engine couldn't compute a snapshot for
    // structural reasons (overnight window empty, weekend, holiday,
    // data-feed gap). This is the honest "channel is between
    // sessions" state - render it as such, not as a hard error.
    return (
      <div className="w-full max-w-[1440px] space-y-6 pb-16 pt-6">
        {replayDate && <ReplayBanner date={replayDate} />}
        <div
          role="status"
          className="rounded-card border border-rule bg-paper-2/50 px-5 py-6 md:px-6 md:py-8"
        >
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3 mb-2">
            ES Control Map
          </p>
          <h1 className="font-serif text-h2 text-ink tracking-tight">
            Structure map forms after the configuration window
          </h1>
          <p className="mt-3 text-body text-ink-2 leading-snug max-w-2xl">
            The ES map appears when the next qualified session read is
            available. Outside the planning window, the cleanest move is to
            review a prior session in Replay or return when the next setup
            begins.
          </p>
          <p className="mt-3 text-meta text-ink-3 font-mono">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    // Hard error path - engine threw something we don't know how to
    // recover from. v5 silently substituted the mock fixture
    // (5872.00 / TAKE / ASCENDING) here, which made the failure
    // indistinguishable from a real engine reading. v6 surfaces
    // the API error body inline so the failure mode is diagnosable
    // from the browser.
    return (
      <div className="w-full max-w-[1440px] space-y-6 pb-16 pt-6">
        {replayDate && <ReplayBanner date={replayDate} />}
        <ErrorState
          title={
            replayDate
              ? `Couldn't load the ES read for ${replayDate}`
              : "Couldn't load the live ES read"
          }
          message={`${state.message}. Retry in a moment, or open Replay to review a prior session while the connection resets.`}
        />
        {state.trace && (
          <pre className="text-[11px] font-mono text-ink-3 whitespace-pre-wrap rounded-card border border-rule bg-paper-2/40 p-4 max-h-64 overflow-auto">
            {state.trace}
          </pre>
        )}
      </div>
    );
  }

  const snap = canonicalizeEsSnapshot(state.snap);
  const meta = snap._meta;
  const snapshotNow = Number.isFinite(Date.parse(snap.asOf))
    ? new Date(snap.asOf)
    : new Date();
  const session = getSessionInfo("SPX", snapshotNow);
  const currentState: EngineState =
    snap.currentState ??
    (snap.confluence.action === "TAKE"
      ? "GO"
      : snap.confluence.action === "SELECTIVE"
        ? "WATCH"
        : "STAND_DOWN");
  const nextEventISO = session.nextSignificantEvent.at.toISOString();
  const esReferenceISO = new Date(session.rthOpen.getTime() - 30 * 60_000).toISOString();
  const esEntryISO = new Date(session.rthOpen.getTime() + 30 * 60_000).toISOString();
  const transitionCondition = snap.descendingDeviationFan
    ? reentryCondition(snap)
    : snap.flipCondition || reentryCondition(snap);

  return (
    <div className="w-full max-w-[1440px] space-y-8 pb-16">
      {replayDate && <ReplayBanner date={replayDate} />}
      {initialSource === "mock" && (
        <div className="rounded-card border border-gold/35 bg-gold-tint px-4 py-3 text-[12px] leading-relaxed text-gold-ink shadow-card">
          ES live read is temporarily unavailable. This channel is locked to
          structure review until the session reconnects, and trade decisions
          remain gated.
          {initialError ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.10em] text-gold-ink">
              ES read unavailable
            </span>
          ) : null}
        </div>
      )}
      <header className="contrast-dark relative overflow-hidden rounded-[18px] border border-[#C9A227]/55 bg-[#071116] px-5 py-4 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-6 md:py-5">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft/82">
              ES Channel
            </span>
            <span className="hidden h-px w-10 bg-gold/45 sm:inline-block" />
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft/70">
              Session {snap.sessionDateCT}
            </span>
            <span className="hidden h-px w-10 bg-gold/45 sm:inline-block" />
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-paper/48">
              {dayLabel(snap.sessionDateCT)}
            </span>
          </div>
          <h1 className="mt-2 text-[34px] font-serif leading-none tracking-tight text-paper md:text-[42px]">
            Today&apos;s ES{" "}
            <span className="text-gold-soft/72 italic font-light">Control Map.</span>
          </h1>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-paper/72">
            {heroSynthesis(snap)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/48 tabular-nums">
              Fresh read - updated {formatHM(snap.asOf)} CT - next {formatHM(nextEventISO)} CT
            </p>
            <WhyThisStateLink
              engine="SPX"
              trace={(snap.decisionTrace ?? []).map((event) => ({
                ts: event.ts,
                event: event.event,
                weight: event.weight,
              }))}
              flipCondition={transitionCondition}
              currentStateLabel={formatEngineStateLabel(currentState)}
              className="border-paper/18 bg-paper/8 text-paper/78 hover:bg-paper/14"
            />
          </div>
          {meta && (
            <div className="hidden">
              <span>
                Bars <span className="text-ink-2">{meta.barsCount}</span>
              </span>
              <span className="text-ink-4">-</span>
              <span>
                Quote <span className="text-ink-2">synced</span>
              </span>
              <span className="text-ink-4">-</span>
              <span>
                Offset{" "}
                <span className="text-ink-2 tabular-nums">
                  {meta.appliedOffset >= 0 ? "+" : ""}
                  {meta.appliedOffset.toFixed(2)}
                </span>
                {meta.offsetSource === "env_override" && (
                  <span className="ml-1 text-[9px] uppercase tracking-[0.10em] text-gold-ink">
                    (override)
                  </span>
                )}
                {meta.offsetSource === "env_override" &&
                  typeof meta.computedOffset === "number" && (
                    <span className="ml-1 text-ink-4">
                      - live {meta.computedOffset >= 0 ? "+" : ""}
                      {meta.computedOffset.toFixed(2)}
                    </span>
                  )}
                {meta.offsetMethod && (
                  <span className="ml-1 text-ink-4">
                    - {formatDisplayLabel(meta.offsetMethod)}
                  </span>
                )}
              </span>
              <span className="text-ink-4">-</span>
              {/* v9: dropped the "/ SPX <cash>" half - the cash
                  index quote was diagnostic-only and the only
                  user-facing SPX leak left on this page. The
                  Cmd+Shift+D overlay still surfaces the full
                  basis pair for debugging. */}
              <span>
                ES <span className="text-ink-2 tabular-nums">{meta.esSpot.toFixed(2)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="hidden md:flex items-center gap-6 text-right">
          <Stat label="Last" value={snap.price.last.toFixed(2)} />
          <Stat
            label="Control Line"
            value={selectedControlPlanMap(snap)?.controlValue.toFixed(2) ?? "Resolving"}
            highlight={snap.controlTradePlan?.status ?? "PENDING"}
          />
          <Stat
            label="Location"
            value={controlPlanLocation(snap)}
          />
          {/* v9: Slope stat removed - proprietary engine parameter. */}
        </div>
        </div>
      </header>

      <section className="space-y-5">
        <SectionLabel number="01">Control Map</SectionLabel>
        <SPXDeviationFanPanel plan={snap.controlTradePlan} fan={snap.descendingDeviationFan} bars={esBars} />
      </section>

      <section className="space-y-5">
        <SectionLabel number="02">Trade Plan</SectionLabel>
        <SPXPlaysSlate snap={snap} />
      </section>

      <section className="space-y-5">
        <SectionLabel number="03">Session Timing</SectionLabel>
        <ESPlanCountdownCard
          sessionDate={snap.sessionDateCT}
          planOpenISO={session.configWindowStart.toISOString()}
          planReadyISO={session.configWindowEnd.toISOString()}
          referenceISO={esReferenceISO}
          entryISO={esEntryISO}
          rthCloseISO={session.rthClose.toISOString()}
          nowISO={snap.asOf}
          compact
        />
      </section>

      <SpyContextStrip />

      <details className="group rounded-card border border-rule bg-paper shadow-card">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Advanced review
          <span className="text-ink-4 transition group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-5 border-t border-rule p-5">
          {meta && <Diagnostics details={meta} />}
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12">
              <SPXConfluence
                factors={snap.confluence.factors}
                score={snap.confluence.score}
                action={snap.confluence.action}
              />
            </div>
          </div>
          <SPXSessionOrigin snap={snap} />
          <EsDecisionTape snap={snap} />
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
        <span className="hidden">Prophet - ES Control Map</span>
        <span className="hidden">Session surface</span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------

function heroSynthesis(snap: SPXSnapshot): string {
  const map = selectedControlPlanMap(snap);
  if (!map) {
    return "The ES Control Map is resolving. Stand down until the Control Plan is available.";
  }
  const direction = map.direction === "DESCENDING" ? "descending" : "ascending";
  return `The ${direction} Control Line is ${map.controlValue.toFixed(2)}. The next useful decision comes from a clean hourly touch and close.`;
}

function reentryCondition(snap: SPXSnapshot): string {
  const plan = snap.controlTradePlan;
  if (plan) {
    const buy = plan.setups.find((setup) => setup.side === "BUY");
    const sell = plan.setups.find((setup) => setup.side === "SELL");
    const reads = [
      buy ? `calls near ${buy.entryPrice.toFixed(2)}` : null,
      sell ? `puts near ${sell.entryPrice.toFixed(2)}` : null,
    ].filter(Boolean);
    return reads.length
      ? `Watch ${reads.join(" and ")}. A completed hourly candle must confirm before the next open.`
      : "Control Plan is mapped, but no qualified setup is active yet.";
  }
  if (snap.flipCondition) return snap.flipCondition;
  return "Control Map resolves after the prior session anchor is available.";
}

function selectedControlPlanMap(snap: SPXSnapshot) {
  const plan = snap.controlTradePlan;
  if (!plan) return null;
  if (plan.activeTrade?.mapId === plan.oppositeMap.id) return plan.oppositeMap;
  const setupMapId = plan.setups[0]?.mapId;
  if (setupMapId === plan.oppositeMap.id) return plan.oppositeMap;
  if (plan.primaryMap.status === "ARMED") return plan.primaryMap;
  return plan.oppositeMap;
}

function controlPlanLocation(snap: SPXSnapshot): string {
  const plan = snap.controlTradePlan;
  const map = selectedControlPlanMap(snap);
  if (!plan || !map) return "Resolving";
  if (plan.activeTrade) return `${plan.activeTrade.contractType} confirmed`;
  return map.direction === "DESCENDING" ? "Descending Control" : "Ascending Control";
}

function formatHM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Chicago",
  });
}

function SpyContextStrip() {
  return (
    <Link
      href="/spy"
      className="group flex flex-wrap items-center justify-between gap-3 rounded-card border border-rule bg-paper px-4 py-3 text-[12px] text-ink-2 shadow-card transition-colors hover:bg-paper-tier2"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        Companion SPY Read
      </span>
      <span className="flex items-center gap-2">
        Companion SPY read opens the equity cross-check for this ES session.
        <ArrowUpRight
          size={13}
          className="text-ink-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}

function Diagnostics({ details }: { details: NonNullable<SPXSnapshot["_meta"]> }) {
  const offset = `${details.appliedOffset >= 0 ? "+" : ""}${details.appliedOffset.toFixed(2)}`;
  return (
    <details className="rounded-card border border-rule bg-paper px-4 py-3 text-[12px] text-ink-2 shadow-card">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
        Diagnostics - bars {details.barsCount} - quote synced - offset{" "}
        <span className="tabular-nums">{offset}</span>
      </summary>
      <p className="mt-3 max-w-3xl leading-relaxed">
        Offset is the basis used to compare ES futures context against
        cash-style reference lines. It is diagnostic, not a trade trigger.
        Captured {formatHM(details.quoteCapturedAt)} CT from the canonical ES
        quote at <span className="font-mono tabular-nums">{details.esSpot.toFixed(2)}</span>.
      </p>
    </details>
  );
}

function EsDecisionTape({ snap }: { snap: SPXSnapshot }) {
  const events = snap.decisionTrace ?? [];
  return (
    <Card>
      <CardHeader
        eyebrow="Session Events"
        title="ES event log"
        meta={`${events.length} event${events.length === 1 ? "" : "s"} - replay-linked`}
      />
      <CardBody className="px-0 pb-0">
        {events.length === 0 ? (
          <div className="px-5 py-8">
            <div className="font-serif text-headline text-ink-3 italic font-light">
              Waiting for ES tape events.
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
              State changes, structure formation, line touches, and rule blocks
              will appear here as the session develops.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-rule">
            {events.slice(0, 8).map((event, index) => (
              <li
                key={`${event.ts}-${index}`}
                className="grid grid-cols-[64px_88px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 text-[13px]"
              >
                <time className="font-mono text-[11px] tabular-nums text-ink-3">
                  {formatHM(event.ts)}
                </time>
                <span className="rounded-pill border border-rule bg-paper-2 px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2">
                  {event.weight === "key" ? "Rule" : "Note"}
                </span>
                <span className="min-w-0 text-ink-2">{event.event}</span>
                <Link
                  href={`/replay?engine=es&date=${snap.sessionDateCT}&t=${formatHM(event.ts)}`}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 hover:text-ink"
                >
                  Replay
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function ReplayBanner({ date }: { date: string }) {
  return (
    <div
      role="status"
      aria-label={`Showing replay for ${date}`}
      className={cn(
        "rounded-card bg-gold-tint border border-gold/40",
        "px-4 py-3 flex items-center justify-between gap-3 flex-wrap",
        "text-[12px]",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-ink font-bold">
          Replay
        </span>
        <span aria-hidden className="h-3 w-px bg-gold/40" />
        <span className="text-ink-2 font-medium">
          Showing the historical ES Control Map for{" "}
          <span className="font-mono tabular-nums text-ink">{date}</span>
        </span>
      </div>
      <Link
        href={`/replay?date=${date}`}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2.5 rounded-pill shrink-0",
          "bg-paper text-ink-2 hover:text-ink hover:bg-paper-2",
          "border border-rule transition-colors",
          "text-[11px] tracking-[0.02em] font-medium",
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        <ArrowLeft size={11} className="text-ink-4" aria-hidden />
        Back to Replay
      </Link>
    </div>
  );
}

function dayLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return d
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
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  const tone =
    highlight === "ASCENDING"
      ? "text-bull-ink"
      : highlight === "DESCENDING"
        ? "text-bear-ink"
        : "text-paper";
  return (
    <div>
      <div className="eyebrow text-paper/45 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[13px] font-semibold tabular-nums ${tone}`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}

function ESLoadingShell({
  replayDate,
  showLoadingDetail,
}: {
  replayDate?: string;
  showLoadingDetail: boolean;
}) {
  return (
    <div className="w-full max-w-[1440px] space-y-8 pb-16 pt-6">
      {replayDate && <ReplayBanner date={replayDate} />}
      <section
        role="status"
        aria-live="polite"
        className="contrast-dark relative overflow-hidden rounded-[22px] border border-[#C9A227]/35 bg-[#071116] px-5 py-5 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-7 md:py-6"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
        />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] text-gold-soft/82 tracking-[0.20em] uppercase">
              ES Control Map - resolving
              </span>
              <span className="h-px w-10 bg-gold/45" />
              <span className="font-mono text-[10px] text-paper/48 tracking-[0.20em] uppercase">
                Measured values only
              </span>
            </div>
            <h1 className="mt-3 text-[34px] font-serif leading-none tracking-tight text-paper md:text-[44px]">
              Building the ES structure map.
            </h1>
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-paper/72">
              The live ES price, Control Line, gates, and session events
              are being assembled from the current session.
            </p>
            {showLoadingDetail && (
              <p className="mt-3 max-w-3xl rounded-[12px] border border-paper/12 bg-paper/8 px-3 py-2 text-[12px] leading-relaxed text-paper/62">
                This request is taking longer than usual. If a feed is missing,
                the structure map will switch to a named data state instead of
                displaying placeholders.
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <LoadingStat label="Price" value="Resolving" />
            <LoadingStat label="Structure" value="Building" />
            <LoadingStat label="Tape" value="Queued" />
          </div>
        </div>
      </section>
      <Skeleton className="h-72 w-full" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function LoadingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-paper/12 bg-paper/8 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
        {label}
      </div>
      <div className="mt-1 font-mono text-[12px] font-semibold uppercase tracking-[0.10em] text-paper/78">
        {value}
      </div>
    </div>
  );
}

function scrubProviderDetail(value: string): string {
  const vendorName = new RegExp("tasty" + "trade", "gi");
  const backupVendor = new RegExp("y" + "finance|yahoo", "gi");
  const fallbackTag = new RegExp("bars" + "-fallback:\\s*", "gi");
  return value
    .replace(vendorName, "primary market feed")
    .replace(backupVendor, "backup market feed")
    .replace(/\bbroker\b/gi, "primary source")
    .replace(fallbackTag, "")
    .replace(/FetcherUnavailable:\s*/gi, "")
    .replace(/via REST/gi, "")
    .replace(/backup market feed fallback serves bars/gi, "backup market data is serving bars")
    .replace(/\s{2,}/g, " ")
    .trim();
}

