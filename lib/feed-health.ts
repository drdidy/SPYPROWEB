export type FeedStatus = "live" | "stale" | "failed" | "loading";

export type FeedId =
  | "spy-rails"
  | "spx-rails"
  | "spy-hit-rate"
  | "spx-hit-rate"
  | "spy-last-session"
  | "spx-last-session"
  | "daily-brief-preview"
  | "market-clock"
  | "price-tick"
  | "anchor-levels"
  | "trigger-lines"
  | "pre-open-bias"
  | "options-chain"
  | "signal-tape"
  | "risk-guardrails"
  | "session-clock"
  | "projection-engine"
  | "calibration-store";

export const FEED_IDS = [
  "spy-rails",
  "spx-rails",
  "spy-hit-rate",
  "spx-hit-rate",
  "spy-last-session",
  "spx-last-session",
  "daily-brief-preview",
  "market-clock",
  "price-tick",
  "anchor-levels",
  "trigger-lines",
  "pre-open-bias",
  "options-chain",
  "signal-tape",
  "risk-guardrails",
  "session-clock",
  "projection-engine",
  "calibration-store",
] as const satisfies readonly FeedId[];

export interface FeedHealthSeed {
  feedId: FeedId;
  label: string;
  lastUpdatedAt: string | null;
  nextExpectedAt?: string | null;
  staleAfterMs?: number;
  failAfterMs?: number;
  critical?: boolean;
  failedAt?: string | null;
  initialStatus?: FeedStatus;
}

export interface FeedHealthState {
  feedId: FeedId;
  label: string;
  status: FeedStatus;
  lastUpdatedAt: string | null;
  nextExpectedAt: string | null;
  critical: boolean;
  failedForMs: number;
  ageMs: number;
}

export const FEED_LABELS: Record<FeedId, string> = {
  "spy-rails": "SPY rails",
  "spx-rails": "ES rails",
  "spy-hit-rate": "SPY last-5",
  "spx-hit-rate": "ES last-5",
  "spy-last-session": "SPY last session",
  "spx-last-session": "ES last session",
  "daily-brief-preview": "Daily brief preview",
  "market-clock": "Market clock",
  "price-tick": "Last price",
  "anchor-levels": "Anchor levels",
  "trigger-lines": "Trigger map",
  "pre-open-bias": "Pre-open bias",
  "options-chain": "Options intelligence",
  "signal-tape": "Signal tape",
  "risk-guardrails": "Risk guardrails",
  "session-clock": "Session clock",
  "projection-engine": "Projection engine",
  "calibration-store": "Calibration store",
};

export const FEED_DEFAULTS = {
  railsDuringSessionMs: 5_000,
  railsOffSessionMs: 60_000,
  hitRateMs: 5 * 60_000,
  lastSessionMs: 5 * 60_000,
  briefPreviewMs: 24 * 60 * 60_000,
  marketClockMs: 60_000,
  priceTickMs: 5_000,
  channelStructureMs: 60_000,
  channelPanelMs: 5 * 60_000,
  failedBannerDelayMs: 60_000,
};

export function buildFeedSeed(
  feedId: FeedId,
  overrides: Partial<Omit<FeedHealthSeed, "feedId" | "label">> & {
    label?: string;
  } = {},
): FeedHealthSeed {
  return {
    feedId,
    label: overrides.label ?? FEED_LABELS[feedId],
    lastUpdatedAt: overrides.lastUpdatedAt ?? null,
    nextExpectedAt: overrides.nextExpectedAt ?? null,
    staleAfterMs: overrides.staleAfterMs,
    failAfterMs: overrides.failAfterMs,
    critical: overrides.critical ?? false,
    failedAt: overrides.failedAt ?? null,
    initialStatus: overrides.initialStatus,
  };
}
