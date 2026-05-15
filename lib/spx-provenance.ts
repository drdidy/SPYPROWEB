// SPX value provenance — single source of truth for the
// "is this number trustworthy?" question across the dashboard.
//
// The SPX value rendered in the UI is a synthetic: the engine
// pulls ES front-month bars, computes a basis offset against the
// SPX cash spot, and renders `ES + appliedOffset` everywhere the
// user sees an "SPX" price. Three failure modes can produce a
// wrong-looking number:
//
//   1. Basis stale. The sync quote that produced the offset was
//      captured > 60s ago. ES has moved since; the displayed SPX
//      is `ES_now + offset_old`.
//   2. Wrong contract. yfinance's ES=F symbol can show a
//      different futures contract than the broker's /ES (typical
//      drift: ~80-100 pts on a back-month / back-adjusted
//      continuous). SPX_ES_OFFSET_OVERRIDE pins the basis to the
//      broker's actual spread; offsetSource === "env_override"
//      indicates that path.
//   3. Cash market closed. SPX cash (^GSPC) is unprintable
//      outside RTH; the only honest read is the synthetic
//      ES-derived value, but it should be labelled as such.
//
// This module exposes pure helpers that derive the user-facing
// "kind" (live / synthetic / stale) plus the underlying numbers
// for the dev overlay. No React, no hooks — easy to test.

import type { SPXSnapshotMeta } from "@/lib/types";

/**
 * Tier of trust in the displayed SPX value.
 *
 *   live      — cash market is open AND basis < 60s old.
 *   synthetic — cash market is closed; render with a "synthetic ·
 *               derived from ES + basis" tooltip.
 *   stale     — basis > 60s old; surface a visible warning chip.
 */
export type SpxTrust = "live" | "synthetic" | "stale";

/** Stale threshold per the v6 spec (P0-4 #3). */
export const STALE_BASIS_MS = 60_000;
export const CLOSE_ANCHORED_BASIS_STALE_MS = 36 * 60 * 60 * 1000;

export interface SpxProvenance {
  trust: SpxTrust;
  /** Raw ES front-month spot at the time of the basis snapshot. */
  esSpot: number;
  /** Cash SPX spot at the time of the basis snapshot. */
  spxSpot: number;
  /** Basis = SPX_cash - ES_front. Positive when SPX trades over ES. */
  basis: number;
  /** Computed SPX displayed = ES + appliedOffset. */
  computedSpx: number;
  /** ms since the basis was captured (relative to `now`). */
  basisAgeMs: number;
  /** ISO of the basis-capture moment. */
  capturedAtISO: string;
  /** Where the offset came from. */
  offsetSource: "native_es" | "computed" | "env_override" | "historical_replay";
  /** Sub-algorithm that produced the offset (yfinance backend). */
  offsetMethod:
    | "close_anchored"
    | "intersection_1m"
    | "latest_of_each"
    | null;
  /** Whether the env-override (broker spread) is in play. */
  isOverridden: boolean;
}

/**
 * Distill the snapshot's `_meta` block into a single user-facing
 * provenance object. Returns null when `_meta` is absent (older
 * snapshot shape, mock fallback, etc.).
 */
export function deriveProvenance(
  meta: SPXSnapshotMeta | undefined | null,
  now: Date = new Date(),
  cashMarketOpen: boolean = isCashMarketOpenNow(now),
): SpxProvenance | null {
  if (!meta) return null;
  const capturedAt = Date.parse(meta.quoteCapturedAt);
  const basisAgeMs = Number.isFinite(capturedAt) ? now.getTime() - capturedAt : NaN;
  const staleThresholdMs = basisStaleThresholdMs(meta);
  const stale =
    !Number.isFinite(basisAgeMs) || basisAgeMs > staleThresholdMs;
  const trust: SpxTrust = stale
    ? "stale"
    : cashMarketOpen
      ? "live"
      : "synthetic";
  return {
    trust,
    esSpot: meta.esSpot,
    spxSpot: meta.spxSpot,
    basis: meta.computedOffset ?? meta.requestedOffset ?? meta.appliedOffset,
    computedSpx: meta.esSpot + (meta.computedOffset ?? meta.requestedOffset ?? meta.appliedOffset),
    basisAgeMs: Number.isFinite(basisAgeMs) ? basisAgeMs : Infinity,
    capturedAtISO: meta.quoteCapturedAt,
    offsetSource: meta.offsetSource ?? "computed",
    offsetMethod: meta.offsetMethod ?? null,
    isOverridden: meta.offsetSource === "env_override",
  };
}

export function basisStaleThresholdMs(meta: SPXSnapshotMeta): number {
  if (
    meta.offsetSource === "historical_replay" ||
    meta.offsetMethod === "close_anchored"
  ) {
    return CLOSE_ANCHORED_BASIS_STALE_MS;
  }
  return STALE_BASIS_MS;
}

/**
 * RTH = M-F 08:30–15:00 CT (the SPX cash session). Outside this
 * window the SPX value rendered in the UI is honestly synthetic.
 * Holidays / early closes are not modelled here — that level of
 * accuracy lives in lib/sessions.ts. This helper is intentionally
 * coarse: it only needs to flip provenance copy from "live" to
 * "synthetic", and a 30-minute over-include on a holiday morning
 * is not a real harm.
 */
export function isCashMarketOpenNow(now: Date = new Date()): boolean {
  // Convert to CT minutes-since-midnight via Intl.DateTimeFormat.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>(
    (acc, p) => {
      acc[p.type] = p.value;
      return acc;
    },
    {},
  );
  const weekday = parts.weekday;
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutes = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
  // 08:30 CT = 510, 15:00 CT = 900.
  return minutes >= 510 && minutes < 900;
}

/**
 * Short copy used by tooltip/badge UI. Centralizes the wording so
 * "synthetic" reads the same in every place it surfaces.
 */
export function provenanceLabel(p: SpxProvenance): string {
  switch (p.trust) {
    case "live":
      return "Live";
    case "synthetic":
      return "Synthetic — derived from ES front-month + basis";
    case "stale":
      return "Stale basis";
  }
}

export function provenanceDetail(p: SpxProvenance): string {
  // Format basis age in human terms for the tooltip body.
  const age =
    p.basisAgeMs < 60_000
      ? `${Math.floor(p.basisAgeMs / 1000)}s ago`
      : p.basisAgeMs < 3_600_000
        ? `${Math.floor(p.basisAgeMs / 60_000)}m ago`
        : `${Math.floor(p.basisAgeMs / 3_600_000)}h ago`;
  const overrideNote = p.isOverridden
    ? " · basis is broker-spread override"
    : p.offsetSource === "historical_replay"
      ? " · basis is historical-replay value"
      : p.offsetMethod === "close_anchored"
        ? " · basis anchored to last cash close"
        : "";
  return `SPX = ES (${p.esSpot.toFixed(2)}) + basis (${signed(p.basis)}). Basis captured ${age}${overrideNote}.`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

// Pure helpers exported for testing.
export const __test = {
  deriveProvenance,
  isCashMarketOpenNow,
  provenanceLabel,
  provenanceDetail,
  STALE_BASIS_MS,
  CLOSE_ANCHORED_BASIS_STALE_MS,
  basisStaleThresholdMs,
};
