"use client";

import { FeedHeartbeat, useFeedHealth } from "@/components/decision-slate/FeedHealthProvider";
import type { FeedId } from "@/lib/feed-health";
import type { FeedHealthState } from "@/lib/feed-health";
import { formatSessionTime } from "@/lib/session-time";
import { cn } from "@/lib/utils";

type LiveState = "live" | "stale" | "offline";

export function useChannelFreshness() {
  const price = useFeedHealth("price-tick");
  const anchors = useFeedHealth("anchor-levels");
  const tape = useFeedHealth("signal-tape");
  const state = resolveChannelFreshness([price, anchors, tape]);
  const laggingHealth = laggingFeed([price, anchors, tape]);
  const lagging = laggingHealth?.label ?? "feed refresh";
  const freshest = freshestFeed([price, anchors, tape]);
  const next = nextFeed([price, anchors, tape]);

  return { state, lagging, laggingHealth, freshest, next, feeds: [price, anchors, tape] };
}

export function ChannelLiveBadge() {
  const { state, lagging } = useChannelFreshness();
  const tone = {
    live: "bg-bull-tint text-bull-ink shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]",
    stale: "bg-gold-tint text-gold-ink shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]",
    offline: "bg-bear-tint text-bear-ink shadow-[inset_0_0_0_1px_rgba(181,48,30,0.30)]",
  }[state];
  const title =
    state === "live"
      ? "LIVE: price tick and structure context are healthy"
      : `${state.toUpperCase()}: waiting on ${lagging}`;

  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-pill",
        "text-[9px] font-mono font-semibold uppercase tracking-[0.12em]",
        tone,
      )}
    >
      <span
        className={cn(
          "h-1 w-1 rounded-full",
          state === "live" ? "bg-bull animate-breathe" : state === "stale" ? "bg-gold" : "bg-bear",
        )}
        aria-hidden
      />
      {state}
    </span>
  );
}

export function ChannelFreshnessLine() {
  const { state, lagging, freshest, next } = useChannelFreshness();
  const updated = formatSessionTime(freshest?.lastUpdatedAt, { fallback: "--:-- CT" });
  const nextLabel = formatSessionTime(next?.nextExpectedAt, { fallback: "--:-- CT" });
  return (
    <span
      title={
        state === "live"
          ? `Live: updated ${updated}, next ${nextLabel}`
          : `${state.toUpperCase()}: waiting on ${lagging}. Updated ${updated}; next ${nextLabel}`
      }
    >
      {state} | updated {updated} | next {nextLabel}
    </span>
  );
}

export function ChannelFeedPauseBanner({ className }: { className?: string }) {
  const { state, lagging, laggingHealth } = useChannelFreshness();
  const ageMs = laggingHealth?.ageMs ?? 0;
  if (state === "live" || (state === "stale" && ageMs < 60_000)) return null;

  const message =
    state === "offline"
      ? `Feed disconnected: ${lagging}. Live decisions are paused until the feed reconnects.`
      : `Decisions paused: ${lagging} is stale. Live-only reads are dimmed until the next refresh.`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-card border border-gold/35 bg-gold-tint px-4 py-3",
        "font-mono text-[11px] uppercase tracking-[0.10em] text-gold-ink",
        className,
      )}
    >
      {message}
    </div>
  );
}

export function LastUpdatedAge({ feedId = "price-tick" }: { feedId?: FeedId }) {
  const health = useFeedHealth(feedId);
  return (
    <span
      title={`${health.label}: ${health.status}`}
      className="block pt-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-paper/45 tabular-nums"
    >
      {formatAge(health.ageMs)} ago
    </span>
  );
}

export function PanelHeartbeat({ feedId }: { feedId: FeedId }) {
  return <FeedHeartbeat feedId={feedId} />;
}

function laggingFeed(
  feeds: readonly ReturnType<typeof useFeedHealth>[],
): FeedHealthState | null {
  return feeds.find((feed) => feed.status !== "live") ?? null;
}

function resolveChannelFreshness(feeds: readonly FeedHealthState[]): LiveState {
  const [price, anchors, tape] = feeds;
  const healthyContext = anchors.status === "live" || tape.status === "live";
  if (price.status === "failed" || (anchors.status === "failed" && tape.status === "failed")) {
    return "offline";
  }
  return price.status === "live" && healthyContext ? "live" : "stale";
}

function freshestFeed(feeds: readonly FeedHealthState[]): FeedHealthState | null {
  return feeds
    .filter((feed) => feed.lastUpdatedAt)
    .sort((a, b) => Date.parse(b.lastUpdatedAt ?? "") - Date.parse(a.lastUpdatedAt ?? ""))[0] ?? null;
}

function nextFeed(feeds: readonly FeedHealthState[]): FeedHealthState | null {
  return feeds
    .filter((feed) => feed.nextExpectedAt)
    .sort((a, b) => Date.parse(a.nextExpectedAt ?? "") - Date.parse(b.nextExpectedAt ?? ""))[0] ?? null;
}

function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "--";
  if (ageMs < 1_000) return "0s";
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  return `${Math.floor(ageMs / 3_600_000)}h`;
}
