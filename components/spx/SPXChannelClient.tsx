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
import type { SPXSnapshot } from "@/lib/types";

interface Props {
  /** YYYY-MM-DD when launched from a /replay deep link. */
  replayDate?: string;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; snap: SPXSnapshot }
  | { status: "error"; message: string };

export function SPXChannelClient({ replayDate }: Props) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const url = replayDate
      ? `/api/spx/snapshot?date=${encodeURIComponent(replayDate)}`
      : `/api/spx/snapshot`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`API returned ${r.status} from ${url}`);
        }
        const json = (await r.json()) as SPXSnapshot;
        if (!cancelled) setState({ status: "ready", snap: json });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            e instanceof Error ? e.message : "Snapshot fetch failed.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [replayDate]);

  if (state.status === "loading") {
    return (
      <div className="max-w-[1440px] mx-auto space-y-10 pb-16 pt-6">
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

  if (state.status === "error") {
    // v6 follow-up: explicit error during replay. v5 silently
    // substituted the mock fixture (5872.00 / TAKE / ASCENDING)
    // here, which made the failure indistinguishable from a real
    // engine reading.
    return (
      <div className="max-w-[1440px] mx-auto space-y-6 pb-16 pt-6">
        {replayDate && <ReplayBanner date={replayDate} />}
        <ErrorState
          title={
            replayDate
              ? `Couldn't load the SPX snapshot for ${replayDate}`
              : "Couldn't load the live SPX snapshot"
          }
          message={`${state.message}. The /replay tab uses the same endpoint and may be working — if it is, retry in a moment.`}
        />
      </div>
    );
  }

  const snap = state.snap;
  const meta = snap._meta;

  return (
    <div className="max-w-[1440px] mx-auto space-y-10 pb-16">
      {replayDate && <ReplayBanner date={replayDate} />}
      {/* Editorial header */}
      <header className="flex items-end justify-between pt-2 pb-1">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              SPX · Channel · session {snap.sessionDateCT}
            </span>
            <span className="h-px w-10 bg-rule-strong" />
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              {dayLabel(snap.sessionDateCT)}
            </span>
            <SourceBadge live />
          </div>
          <h1 className="mt-3 text-display font-serif tracking-tight text-ink">
            The corridor,{" "}
            <span className="text-ink-3 italic font-light">read aloud.</span>
          </h1>
          {meta && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono text-ink-3 tracking-[0.04em]">
              <span>
                Bars <span className="text-ink-2">{meta.barsSource}</span>
                <span className="text-ink-4 ml-1">({meta.barsCount})</span>
              </span>
              <span className="text-ink-4">·</span>
              <span>
                Quote <span className="text-ink-2">{meta.quoteSource}</span>
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
              <span>
                ES <span className="text-ink-2 tabular-nums">{meta.esSpot.toFixed(2)}</span>{" "}
                / SPX <span className="text-ink-2 tabular-nums">{meta.spxSpot.toFixed(2)}</span>
              </span>
              {meta.barsError && (
                <span className="text-bear-ink">
                  · bars-fallback: {meta.barsError}
                </span>
              )}
              {meta.quoteError && (
                <span className="text-bear-ink">
                  · quote-fallback: {meta.quoteError}
                </span>
              )}
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
          <Stat label="Slope" value="±1.05 pts/hr" />
        </div>
      </header>

      <SPXChannelHero snap={snap} />

      <section className="space-y-5">
        <SectionLabel number="01">Plays</SectionLabel>
        <SPXPlaysSlate snap={snap} />
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
        <span>Prophet · SPX channel</span>
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
          Showing the historical SPX channel for{" "}
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
  const mockCls =
    "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]";
  return (
    <span
      title={
        live
          ? "Live snapshot from API"
          : "Snapshot unavailable. Engine is reconnecting; retry in a moment."
      }
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${live ? liveCls : mockCls}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${live ? "bg-bull animate-breathe" : "bg-ink-4"}`}
      />
      {live ? "live" : "mock"}
    </span>
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
        : "text-ink";
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[13px] font-semibold tabular-nums ${tone}`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}
