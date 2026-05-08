// Server-side fetcher for /api/spx/snapshot.
//
// Same-origin: the Python function lives at api/spx/snapshot.py and is
// served by Vercel under the same hostname as the Next.js app, so no
// external base URL is needed.
//
// Falls back to lib/spx-mock-data when the API is unreachable so the
// page still renders in dev / preview without the function deployed.
// Returns SnapshotSource so the page can render an honest "live" /
// "mock" badge in the editorial header.

import type { SPXSnapshot } from "./types";
import { spxSnapshot as mockSnapshot } from "./spx-mock-data";

const REVALIDATE_SECONDS = 30;

export type SnapshotSource = "live" | "mock";

export interface LoadedSnapshot {
  snap: SPXSnapshot;
  source: SnapshotSource;
  fetchedAt: string;
  error?: string;
}

export async function loadSnapshot(): Promise<LoadedSnapshot> {
  const fetchedAt = new Date().toISOString();
  // Server-side fetch needs an absolute URL. Vercel exposes the runtime
  // host via VERCEL_URL; locally we rely on PORT or default to 3000.
  const base =
    process.env.NEXT_PUBLIC_API_BASE?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    `http://localhost:${process.env.PORT ?? 3000}`;

  try {
    const res = await fetch(`${base}/api/spx/snapshot`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      return {
        snap: mockSnapshot,
        source: "mock",
        fetchedAt,
        error: `API returned ${res.status}`,
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
