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
} from "./snapshot-adapter";
// Honest "no data" state when the upstream is unreachable. We do NOT
// fall back to lib/mock-data here — the dashboard surfaces handle
// nullable fields by rendering empty states.

export type LiveSnapshotSource = "live" | "degraded" | "seed" | "mock" | "error";

export interface LoadedLiveSnapshot {
  data: AdaptedSnapshot;
  source: LiveSnapshotSource;
  fetchedAt: string;
  error?: string;
}

function emptyAdapted(): AdaptedSnapshot {
  return {
    source: "error",
    asOf: new Date().toISOString(),
    decision: {
      finalDecision: "WAIT_FOR_CONFIRMATION",
      verdict: "WAIT",
      conviction: 0,
      finalExplanation: "Live data unavailable. Reconnecting…",
      windowET: "",
      updatedAt: "",
    },
    signal: null,
    quality: null,
    candles: [],
    hourlyCandles: [],
    lines: [],
    anchor: null,
    replay: null,
    pivots: [],
    currentPrice: 0,
    bias: {
      bias: "NEUTRAL",
      strengthScore: 0,
      ua: { value: 0, touched: false },
      ud: { value: 0, touched: false },
      la: { value: 0, touched: false },
      ld: { value: 0, touched: false },
      explanation: "",
    },
    guardrails: {
      chase: { status: "OK", detail: "" },
      retest: { status: "OK", detail: "" },
      structure: { status: "WAITING", detail: "" },
      daily: { status: "OK", detail: "" },
    },
    waitDiscipline: [],
    optionsIntel: null,
    strikes: null,
    signalTicks: [],
    flow: null,
    gex: null,
    marketContext: null,
    optionsChain: null,
    shellState: {
      spy: 0,
      change: 0,
      changePct: 0,
      vix: 0,
      isLive: false,
      sessionLabel: "",
      sessionCloses: "",
    },
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

export async function loadLiveSnapshot(
  replayDate?: string,
): Promise<LoadedLiveSnapshot> {
  const fetchedAt = new Date().toISOString();
  const base = resolveBase();
  if (!base) {
    return {
      data: emptyAdapted(),
      source: "error",
      fetchedAt,
      error: "no request host (build-time render?)",
    };
  }

  const target =
    replayDate && /^\d{4}-\d{2}-\d{2}$/.test(replayDate)
      ? `${base}/api/snapshot?date=${replayDate}`
      : `${base}/api/snapshot`;

  try {
    const res = await fetch(target, { cache: "no-store" });
    if (!res.ok) {
      return {
        data: emptyAdapted(),
        source: "error",
        fetchedAt,
        error: `API returned ${res.status} from ${target}`,
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
      data: emptyAdapted(),
      source: "error",
      fetchedAt,
      error:
        (e instanceof Error ? `${e.message} ` : "fetch failed ") +
        `(target=${target})`,
    };
  }
}
