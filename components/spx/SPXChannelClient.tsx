"use client";

// Client-side SPX channel renderer. The page wrapper is a thin
// server-component shell (page.tsx); this component fetches the
// snapshot from the browser via the same path the /replay workspace
// uses.
//
// Why client-side fetch on /spx? The previous server-side path
// silently fell back to the mock fixture (lib/spx-mock-data.ts —
// 5872.00 / TAKE / ASCENDING) whenever the server function couldn't
// reach /api/spx/snapshot. The most common cause: Vercel preview
// deployments enforce Deployment Protection on the public URL, and
// server-to-server fetches from inside a Vercel function get a 401
// from that wall. The browser carries the user's bypass cookie so
// /replay's client-side fetch sails through, but /spx's server
// fetch did not — hence the user-reported "shows mock data on the
// SPX Channel tab".
//
// Moving the fetch to the browser uses the same auth-cookie path as
// /replay and produces identical results.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { SPXChannelHero } from "@/components/spx/SPXChannelHero";
import { SPXPlaysSlate } from "@/components/spx/SPXPlaysSlate";
import { SPXLineLadder } from "@/components/spx/SPXLineLadder";
import { SPXSessionOrigin } from "@/components/spx/SPXSessionOrigin";
import { SPXConfluence } from "@/components/spx/SPXConfluence";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils";
import type { SpxProjectionChainInput } from "@/lib/spx-contract-projection";
import type { SPXSnapshot } from "@/lib/types";

interface Props {
  /** YYYY-MM-DD when launched from a /replay deep link. */
  replayDate?: string;
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

export function SPXChannelClient({ replayDate }: Props) {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [optionsChain, setOptionsChain] = useState<SpxProjectionChainInput | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setOptionsChain(null);
    const url = replayDate
      ? `/api/spx/snapshot?date=${encodeURIComponent(replayDate)}`
      : `/api/spx/snapshot`;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as SPXSnapshot;
          if (!cancelled) setState({ status: "ready", snap: json });
          const chain = await fetchSpxOptionsChain(replayDate);
          if (!cancelled) setOptionsChain(chain);
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
        const trace = body.trace?.map(scrubProviderDetail).join(" · ");
        if (cancelled) return;
        if (res.status === 503 || body.kind === "no_bars") {
          setState({ status: "no_bars", message });
        } else {
          setState({ status: "error", message, trace });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            e instanceof Error ? e.message : "Snapshot fetch failed.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replayDate]);

  if (state.status === "loading") {
    return (
      <div className="w-full max-w-[1440px] space-y-10 pb-16 pt-6">
        {replayDate && <ReplayBanner date={replayDate} />}
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-72 w-full" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (state.status === "no_bars") {
    // 503 from the API. The engine couldn't compute a snapshot for
    // structural reasons (overnight window empty, weekend, holiday,
    // data-feed gap). This is the honest "channel is between
    // sessions" state — render it as such, not as a hard error.
    return (
      <div className="w-full max-w-[1440px] space-y-6 pb-16 pt-6">
        {replayDate && <ReplayBanner date={replayDate} />}
        <div
          role="status"
          className="rounded-card border border-rule bg-paper-2/50 px-5 py-6 md:px-6 md:py-8"
        >
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3 mb-2">
            ES · Channel
          </p>
          <h1 className="font-serif text-h2 text-ink tracking-tight">
            Channel forms after the configuration window
          </h1>
          <p className="mt-3 text-body text-ink-2 leading-snug max-w-2xl">
            The engine plots from ES front-month overnight bars
            (15:00 prev-day → 02:00 today CT). Outside that window —
            on weekends, holidays, or when the data feed gaps — there
            is nothing yet to plot. Check back during the next
            overnight session, or open <code>/replay</code> to step
            through a previous day.
          </p>
          <p className="mt-3 text-meta text-ink-3 font-mono">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    // Hard error path — engine threw something we don't know how to
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
              ? `Couldn't load the ES snapshot for ${replayDate}`
              : "Couldn't load the live ES snapshot"
          }
          message={`${state.message}. The /replay tab uses the same endpoint and may be working — if it is, retry in a moment.`}
        />
        {state.trace && (
          <pre className="text-[11px] font-mono text-ink-3 whitespace-pre-wrap rounded-card border border-rule bg-paper-2/40 p-4 max-h-64 overflow-auto">
            {state.trace}
          </pre>
        )}
      </div>
    );
  }

  const snap = state.snap;
  const meta = snap._meta;

  return (
    <div className="w-full max-w-[1440px] space-y-10 pb-16">
      {replayDate && <ReplayBanner date={replayDate} />}
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
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-gold-soft/82 tracking-[0.20em] uppercase">
              ES · Channel · session {snap.sessionDateCT}
            </span>
            <span className="h-px w-10 bg-gold/45" />
            <span className="font-mono text-[10px] text-paper/48 tracking-[0.20em] uppercase">
              {dayLabel(snap.sessionDateCT)}
            </span>
            <SourceBadge live />
          </div>
          <h1 className="mt-3 text-[36px] font-serif leading-none tracking-tight text-paper md:text-[46px]">
            The corridor,{" "}
            <span className="text-gold-soft/72 italic font-light">read aloud.</span>
          </h1>
          {meta && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono text-paper/48 tracking-[0.04em] [&_.text-ink-2]:!text-paper/78 [&_.text-ink-4]:!text-paper/32">
              <span>
                Bars <span className="text-ink-2">{meta.barsCount}</span>
              </span>
              <span className="text-ink-4">·</span>
              <span>
                Quote <span className="text-ink-2">synced</span>
              </span>
              <span className="text-ink-4">·</span>
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
                      ↔ live {meta.computedOffset >= 0 ? "+" : ""}
                      {meta.computedOffset.toFixed(2)}
                    </span>
                  )}
                {meta.offsetMethod && (
                  <span className="ml-1 text-ink-4">
                    · {meta.offsetMethod.replace(/_/g, " ")}
                  </span>
                )}
              </span>
              <span className="text-ink-4">·</span>
              {/* v9: dropped the "/ SPX <cash>" half — the cash
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
          <Stat
            label="Direction"
            value={snap.channel.direction}
            highlight={snap.channel.direction}
          />
          <Stat label="Scenario" value={snap.scenario.replace(/_/g, " ")} />
          {/* v9: Slope stat removed — proprietary engine parameter. */}
        </div>
        </div>
      </header>

      <SPXChannelHero snap={snap} />

      <section className="space-y-5">
        <SectionLabel number="01">Plays</SectionLabel>
        <SPXPlaysSlate snap={snap} optionsChain={optionsChain} />
      </section>

      <section className="space-y-5">
        <SectionLabel number="02">Lines</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <SPXLineLadder lines={snap.lines} price={snap.price.last} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <SPXConfluence
              factors={snap.confluence.factors}
              score={snap.confluence.score}
              action={snap.confluence.action}
            />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionLabel number="03">Origin</SectionLabel>
        <SPXSessionOrigin snap={snap} />
      </section>

      <footer className="pt-6 mt-6 border-t border-rule flex items-center justify-between text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em]">
        <span>Prophet · ES channel</span>
        <span>End of slate</span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------

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
          Showing the historical ES channel for{" "}
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

function SourceBadge({ live }: { live: boolean }) {
  const liveCls =
    "bg-bull-tint text-bull-ink shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]";
  const offlineCls =
    "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]";
  return (
    <span
      title={
        live
          ? "Live snapshot from API"
          : "Snapshot unavailable. Engine is reconnecting; retry in a moment."
      }
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${live ? liveCls : offlineCls}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${live ? "bg-bull animate-breathe" : "bg-ink-4"}`}
      />
      {live ? "live" : "offline"}
    </span>
  );
}

async function fetchSpxOptionsChain(
  replayDate?: string,
): Promise<SpxProjectionChainInput | null> {
  try {
    const params = new URLSearchParams({ symbols: "SPX" });
    if (replayDate) params.set("date", replayDate);
    const res = await fetch(`/api/options/intel?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      symbols?: {
        SPX?: {
          chain?: SpxProjectionChainInput | null;
        };
      };
    };
    return json.symbols?.SPX?.chain ?? null;
  } catch {
    return null;
  }
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

function scrubProviderDetail(value: string): string {
  const vendorName = new RegExp("tasty" + "trade", "gi");
  const fallbackTag = new RegExp("bars" + "-fallback:\\s*", "gi");
  return value
    .replace(vendorName, "primary market feed")
    .replace(fallbackTag, "")
    .replace(/FetcherUnavailable:\s*/gi, "")
    .replace(/via REST/gi, "")
    .replace(/yfinance fallback serves bars/gi, "backup market data is serving bars")
    .replace(/\s{2,}/g, " ")
    .trim();
}
