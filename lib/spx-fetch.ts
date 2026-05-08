// Server-side fetcher for /api/spx/snapshot.
//
// Same-origin: the Python function lives at api/spx/snapshot.py and is
// served by Vercel under the same hostname as the Next.js app, so no
// NEXT_PUBLIC_API_BASE is needed.
//
// Returns a SnapshotSource so the consumer can render an honest
// "live" / "error" indicator. Keep this server-only — it's intended
// to be called from a Server Component or a Route Handler.

import type { SPXSnapshot } from "./spx-types";

const REVALIDATE_SECONDS = 30;

export type SnapshotSource = "live" | "error";

export interface LoadedSPXSnapshot {
  snap: SPXSnapshot | null;
  source: SnapshotSource;
  fetchedAt: string;
  status: number;
  error?: string;
}

export async function loadSPXSnapshot(
  baseUrl: string = "",
): Promise<LoadedSPXSnapshot> {
  const url = `${baseUrl}/api/spx/snapshot`;
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) {
      return {
        snap: null,
        source: "error",
        fetchedAt,
        status: res.status,
        error: `API returned ${res.status}`,
      };
    }
    const snap = (await res.json()) as SPXSnapshot;
    return { snap, source: "live", fetchedAt, status: 200 };
  } catch (e) {
    return {
      snap: null,
      source: "error",
      fetchedAt,
      status: 0,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
