// Server-side fetcher for /api/snapshot.
//
// On Vercel, the URL we should hit is the public host where the
// request landed (custom domain like spyprophet.app, or the
// spyproweb.vercel.app default). VERCEL_URL is the deployment-
// specific URL and may be behind Deployment Protection — calling it
// from a Server Component can fail. Reading the live request host
// via `next/headers` always works because it's whatever public host
// the user reached us on.
//
// The page that calls this MUST be marked `dynamic = 'force-dynamic'`
// so the fetch happens at request time, not build time. (At build
// time there's no incoming request to read headers from.)

import { headers } from "next/headers";

import {
  adaptSnapshot,
  type AdaptedSnapshot,
  type RawSnapshot,
  type SignalTick,
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

function resolveBase(): string | null {
  // Explicit override always wins (useful in dev / for staging).
  const override = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (override) return override;

  // Read the actual request's host. This is the user-facing URL —
  // a custom domain on production, the public Vercel preview URL
  // on a preview deploy, localhost in dev. Avoids the Deployment-
  // Protected VERCEL_URL trap entirely.
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws when called outside a request scope (e.g. at
    // build time on a statically-generated page). Fall through.
  }
  return null;
}

export async function loadLiveSnapshot(): Promise<LoadedLiveSnapshot> {
  const fetchedAt = new Date().toISOString();
  const base = resolveBase();
  if (!base) {
    return {
      data: mockAdapted(),
      source: "mock",
      fetchedAt,
      error: "no request host (build-time render?)",
    };
  }

  try {
    const res = await fetch(`${base}/api/snapshot`, { cache: "no-store" });
    if (!res.ok) {
      return {
        data: mockAdapted(),
        source: "mock",
        fetchedAt,
        error: `API returned ${res.status} from ${base}/api/snapshot`,
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
      error:
        (e instanceof Error ? `${e.message} ` : "fetch failed ") +
        `(target=${base}/api/snapshot)`,
    };
  }
}
