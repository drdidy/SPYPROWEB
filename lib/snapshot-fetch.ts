// Server-side fetcher for /api/snapshot (the SPY pipeline). Returns the
// adapted snapshot the editorial UI consumes, with a graceful mock
// fallback when the function is unreachable (local dev, build time).

import {
  adaptSnapshot,
  type AdaptedSnapshot,
  type RawSnapshot,
} from "./snapshot-adapter";
import {
  decision as mockDecision,
  latestSignal as mockSignal,
  signalQuality as mockQuality,
  candles as mockCandles,
  lines as mockLines,
  pivots as mockPivots,
  currentPrice as mockPrice,
  biasState as mockBias,
  guardrails as mockGuardrails,
  waitDiscipline as mockWaitDiscipline,
  optionsIntel as mockOptionsIntel,
  strikes as mockStrikes,
  shellState as mockShellState,
} from "./mock-data";
import type { SignalTick } from "./snapshot-adapter";

const REVALIDATE_SECONDS = 15;

export type LiveSnapshotSource = "live" | "degraded" | "seed" | "mock" | "error";

export interface LoadedLiveSnapshot {
  data: AdaptedSnapshot;
  source: LiveSnapshotSource;
  fetchedAt: string;
  error?: string;
}

const mockTicks: SignalTick[] = [];

function mockAdapted(): AdaptedSnapshot {
  return {
    source: "seed",
    asOf: new Date().toISOString(),
    decision: mockDecision,
    signal: mockSignal,
    quality: mockQuality,
    candles: mockCandles,
    lines: mockLines,
    pivots: mockPivots,
    currentPrice: mockPrice,
    bias: mockBias,
    guardrails: mockGuardrails,
    waitDiscipline: mockWaitDiscipline,
    optionsIntel: mockOptionsIntel,
    strikes: mockStrikes,
    signalTicks: mockTicks,
    shellState: mockShellState,
  };
}

function resolveBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    `http://localhost:${process.env.PORT ?? 3000}`
  );
}

export async function loadLiveSnapshot(): Promise<LoadedLiveSnapshot> {
  const fetchedAt = new Date().toISOString();
  const base = resolveBase();
  try {
    const res = await fetch(`${base}/api/snapshot`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      return {
        data: mockAdapted(),
        source: "mock",
        fetchedAt,
        error: `API returned ${res.status}`,
      };
    }
    const raw = (await res.json()) as RawSnapshot;
    return {
      data: adaptSnapshot(raw),
      source: raw.source ?? "live",
      fetchedAt,
    };
  } catch (e) {
    return {
      data: mockAdapted(),
      source: "mock",
      fetchedAt,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
