// Server-side fetcher for /api/spx/snapshot.
//
// Reads the live request host via next/headers (same approach as
// snapshot-fetch.ts) so it always hits the public URL the user
// reached us on, never the Deployment-Protected VERCEL_URL.
//
// The page that calls this MUST be marked `dynamic = 'force-dynamic'`
// so the fetch happens at request time when headers() works.

import { headers } from "next/headers";

import type { SPXSnapshot } from "./types";
import { spxSnapshot as mockSnapshot } from "./spx-mock-data";

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

export async function loadSnapshot(): Promise<LoadedSnapshot> {
  const fetchedAt = new Date().toISOString();
  const base = resolveBase();
  if (!base) {
    return {
      snap: mockSnapshot,
      source: "mock",
      fetchedAt,
      error: "no request host (build-time render?)",
    };
  }
  try {
    const res = await fetch(`${base}/api/spx/snapshot`, { cache: "no-store" });
    if (!res.ok) {
      return {
        snap: mockSnapshot,
        source: "mock",
        fetchedAt,
        error: `API returned ${res.status} from ${base}/api/spx/snapshot`,
      };
    }
    const snap = (await res.json()) as SPXSnapshot;
    return { snap, source: "live", fetchedAt };
  } catch (e) {
    return {
      snap: mockSnapshot,
      source: "mock",
      fetchedAt,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
