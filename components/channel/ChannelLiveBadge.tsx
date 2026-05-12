"use client";

import { FeedHeartbeat, useFeedHealth } from "@/components/decision-slate/FeedHealthProvider";
import type { FeedId } from "@/lib/feed-health";
import { cn } from "@/lib/utils";

type LiveState = "live" | "stale" | "offline";

export function ChannelLiveBadge() {
  const price = useFeedHealth("price-tick");
  const anchors = useFeedHealth("anchor-levels");
  const tape = useFeedHealth("signal-tape");
  const healthyContext = anchors.status === "live" || tape.status === "live";
  const state: LiveState =
    price.status === "failed" || (anchors.status === "failed" && tape.status === "failed")
      ? "offline"
      : price.status === "live" && healthyContext
        ? "live"
        : "stale";
  const lagging = laggingFeed([price, anchors, tape]);
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
): string {
  const lagging = feeds.find((feed) => feed.status !== "live");
  return lagging?.label ?? "feed refresh";
}

function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "--";
  if (ageMs < 1_000) return "0s";
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  return `${Math.floor(ageMs / 3_600_000)}h`;
}
