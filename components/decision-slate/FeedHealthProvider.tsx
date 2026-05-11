"use client";

import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FEED_DEFAULTS,
  FEED_LABELS,
  type FeedHealthSeed,
  type FeedHealthState,
  type FeedId,
  type FeedStatus,
} from "@/lib/feed-health";
import { cn } from "@/lib/utils";

interface FeedHealthContextValue {
  serverNowISO: string;
  estimatedNowMs: number;
  feeds: Record<FeedId, FeedHealthSeed>;
}

const FeedHealthContext = createContext<FeedHealthContextValue | null>(null);

function clientElapsedMs(hydratedAtMs: number) {
  if (typeof performance === "undefined") return 0;
  return Math.max(0, performance.now() - hydratedAtMs);
}

export function FeedHealthProvider({
  serverNowISO,
  feeds,
  children,
}: {
  serverNowISO: string;
  feeds: FeedHealthSeed[];
  children: ReactNode;
}) {
  const hydratedAtMs = useRef(
    typeof performance === "undefined" ? 0 : performance.now(),
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const estimatedNowMs = useMemo(() => {
    void tick;
    const serverNowMs = Date.parse(serverNowISO);
    return (
      (Number.isFinite(serverNowMs) ? serverNowMs : 0) +
      clientElapsedMs(hydratedAtMs.current)
    );
  }, [serverNowISO, tick]);

  const value = useMemo<FeedHealthContextValue>(() => {
    const feedMap = {} as Record<FeedId, FeedHealthSeed>;
    for (const feed of feeds) {
      feedMap[feed.feedId] = feed;
    }
    return {
      serverNowISO,
      estimatedNowMs,
      feeds: feedMap,
    };
  }, [estimatedNowMs, feeds, serverNowISO]);

  return (
    <FeedHealthContext.Provider value={value}>
      {children}
    </FeedHealthContext.Provider>
  );
}

export function useFeedHealth(feedId: FeedId): FeedHealthState {
  const ctx = useContext(FeedHealthContext);

  if (!ctx) {
    return {
      feedId,
      label: FEED_LABELS[feedId],
      status: "loading",
      lastUpdatedAt: null,
      nextExpectedAt: null,
      critical: false,
      failedForMs: 0,
      ageMs: Number.POSITIVE_INFINITY,
    };
  }

  const seed = ctx.feeds[feedId];
  if (!seed) {
    return {
      feedId,
      label: FEED_LABELS[feedId],
      status: "loading",
      lastUpdatedAt: null,
      nextExpectedAt: null,
      critical: false,
      failedForMs: 0,
      ageMs: Number.POSITIVE_INFINITY,
    };
  }

  const updatedMs = seed.lastUpdatedAt ? Date.parse(seed.lastUpdatedAt) : NaN;
  const failedMs = seed.failedAt ? Date.parse(seed.failedAt) : NaN;
  const staleAfterMs = seed.staleAfterMs ?? FEED_DEFAULTS.hitRateMs;
  const failAfterMs = seed.failAfterMs ?? Number.POSITIVE_INFINITY;
  const ageMs = Number.isFinite(updatedMs)
    ? ctx.estimatedNowMs - updatedMs
    : Number.POSITIVE_INFINITY;
  const failedForMs = Number.isFinite(failedMs)
    ? Math.max(0, ctx.estimatedNowMs - failedMs)
    : 0;

  return {
    feedId,
    label: seed.label,
    status: resolveStatus(seed.initialStatus, ageMs, staleAfterMs, failAfterMs),
    lastUpdatedAt: seed.lastUpdatedAt,
    nextExpectedAt: seed.nextExpectedAt ?? null,
    critical: seed.critical ?? false,
    failedForMs,
    ageMs,
  };
}

function resolveStatus(
  initialStatus: FeedStatus | undefined,
  ageMs: number,
  staleAfterMs: number,
  failAfterMs: number,
): FeedStatus {
  if (initialStatus === "failed") return "failed";
  if (initialStatus === "loading") return "loading";
  if (initialStatus === "stale") return "stale";
  if (!Number.isFinite(ageMs)) return "loading";
  if (ageMs > failAfterMs) return "failed";
  if (ageMs > staleAfterMs) return "stale";
  return "live";
}

export function FeedHeartbeat({
  feedId,
  className,
}: {
  feedId: FeedId;
  className?: string;
}) {
  const health = useFeedHealth(feedId);
  const tone = {
    live: "bg-bull text-bull-soft",
    stale: "bg-gold text-gold-soft",
    failed: "bg-bear text-bear-soft",
    loading: "bg-ink-4 text-ink-3",
  }[health.status];
  const title = [
    `${health.label}: ${health.status}`,
    health.lastUpdatedAt ? `updated ${formatTime(health.lastUpdatedAt)}` : null,
    health.nextExpectedAt ? `next ${formatTime(health.nextExpectedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <span
      tabIndex={0}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-pill px-1.5",
        "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone)} aria-hidden />
      <span className="sr-only">{title}</span>
    </span>
  );
}

export function DegradedModeBanner({ className }: { className?: string }) {
  const feeds = [
    useFeedHealth("spy-rails"),
    useFeedHealth("spx-rails"),
    useFeedHealth("spy-hit-rate"),
    useFeedHealth("spx-hit-rate"),
    useFeedHealth("spy-last-session"),
    useFeedHealth("spx-last-session"),
    useFeedHealth("daily-brief-preview"),
    useFeedHealth("market-clock"),
    useFeedHealth("price-tick"),
    useFeedHealth("anchor-levels"),
    useFeedHealth("trigger-lines"),
    useFeedHealth("pre-open-bias"),
    useFeedHealth("options-chain"),
    useFeedHealth("signal-tape"),
    useFeedHealth("risk-guardrails"),
    useFeedHealth("session-clock"),
    useFeedHealth("projection-engine"),
    useFeedHealth("calibration-store"),
  ];
  const failed = feeds
    .filter(
      (feed) =>
        feed.critical &&
        feed.status === "failed" &&
        feed.failedForMs > FEED_DEFAULTS.failedBannerDelayMs,
    );

  if (failed.length === 0) return null;

  const names = failed.map((feed) => feed.label).join(", ");
  const eta = failed.find((feed) => feed.nextExpectedAt)?.nextExpectedAt;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-card border border-gold/40 bg-gold-tint px-4 py-3",
        "font-mono text-[11px] leading-relaxed text-gold-ink",
        className,
      )}
    >
      {names} feed {failed.length === 1 ? "is" : "are"} unavailable. We are
      waiting for the next update{eta ? ` around ${formatTime(eta)}` : ""}.
      Other slate panels remain available.
    </div>
  );
}

function formatTime(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Chicago",
  }).format(new Date(ms));
}
