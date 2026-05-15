// Server-side fetcher for /api/spx/snapshot.
//
// Reads the live request host via next/headers (same approach as
// snapshot-fetch.ts) so it always hits the public URL the user
// reached us on, never the Deployment-Protected VERCEL_URL.
//
// Deployment protection bypass:
//   On Vercel preview deployments, every public URL — including
//   the project's own /api/* — is gated by Deployment Protection.
//   Server-to-server fetches from inside a Vercel function don't
//   carry the user's bypass cookie, so they get a 401 and fall
//   through to the mock fixture (lib/spx-mock-data.ts: 5872.00 /
//   TAKE / ASCENDING). To make server fetches authenticate
//   themselves we forward the project's
//   VERCEL_AUTOMATION_BYPASS_SECRET as the
//   `x-vercel-protection-bypass` header. The env var is auto-
//   populated by Vercel when Deployment Protection is on; on
//   production (no protection) the header is absent and the
//   request goes through unchanged.
//
// The page that calls this MUST be marked `dynamic = 'force-dynamic'`
// so the fetch happens at request time when headers() works.

import { headers } from "next/headers";

import type { SPXSnapshot } from "./types";
import { spxSnapshot as mockSnapshot } from "./spx-mock-data";
import { applySpxSessionGate } from "./snapshot-adapter";
import { canonicalizeEsSnapshot } from "./canonical-es";

export type SnapshotSource = "live" | "mock";

export interface LoadedSnapshot {
  snap: SPXSnapshot;
  source: SnapshotSource;
  fetchedAt: string;
  error?: string;
}

function resolveBase(): string | null {
  const override = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (override) return override;
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws outside a request scope; fall through to null
  }
  return null;
}

/**
 * Build the headers used for a server-side fetch to the project's
 * own /api endpoints. Adds the Vercel protection bypass when the
 * env is present so preview-deployment server fetches don't 401.
 */
function buildFetchHeaders(): HeadersInit {
  const out: Record<string, string> = {};
  try {
    const cookie = headers().get("cookie");
    if (cookie) out.cookie = cookie;
  } catch {
    // headers() is only available during request-time renders.
  }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    out["x-vercel-protection-bypass"] = bypass;
    out["x-vercel-set-bypass-cookie"] = "samesitenone";
  }
  return out;
}

export async function loadSnapshot(
  replayDate?: string,
): Promise<LoadedSnapshot> {
  const fetchedAt = new Date().toISOString();
  const base = resolveBase();
  // The session gate is the FE's "honest read" guard against the
  // mock fallback rendering as live data outside RTH. During REPLAY
  // it would do the wrong thing — a Tuesday replay viewed on a
  // Saturday would be muted to PRE_CONFIG by the gate even though
  // the backend already returned a complete historical snapshot.
  // The backend's replay path is itself the source of truth for
  // historical state, so we skip the gate when a replay date is
  // present.
  const isReplay =
    !!replayDate && /^\d{4}-\d{2}-\d{2}$/.test(replayDate);
  const maybeGate = (s: SPXSnapshot) => {
    const canonical = canonicalizeEsSnapshot(s);
    return isReplay ? canonical : applySpxSessionGate(canonical);
  };

  if (!base) {
    return {
      snap: maybeGate(mockSnapshot),
      source: "mock",
      fetchedAt,
      error: "no request host (build-time render?)",
    };
  }
  const target = isReplay
    ? `${base}/api/spx/snapshot?date=${replayDate}`
    : `${base}/api/spx/snapshot`;
  try {
    const res = await fetch(target, {
      cache: "no-store",
      headers: buildFetchHeaders(),
    });
    if (!res.ok) {
      return {
        snap: maybeGate(mockSnapshot),
        source: "mock",
        fetchedAt,
        error: `API returned ${res.status} from ${target}`,
      };
    }
    const snap = (await res.json()) as SPXSnapshot;
    return { snap: maybeGate(snap), source: "live", fetchedAt };
  } catch (e) {
    return {
      snap: maybeGate(mockSnapshot),
      source: "mock",
      fetchedAt,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
