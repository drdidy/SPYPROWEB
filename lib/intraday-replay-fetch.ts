import { headers } from "next/headers";

import type { StructureChartBar } from "@/components/decision-slate/StructurePathChart";

export interface IntradayReplayData {
  date: string;
  spy: StructureChartBar[];
  es: StructureChartBar[];
  error?: string;
}

function resolveBase(): string | null {
  const override = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (override) return override;
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!host) return null;
    const proto =
      h.get("x-forwarded-proto") ||
      (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

function buildFetchHeaders(): HeadersInit {
  const out: Record<string, string> = {};
  try {
    const cookie = headers().get("cookie");
    if (cookie) out.cookie = cookie;
  } catch {
    // Request headers are unavailable at build time.
  }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    out["x-vercel-protection-bypass"] = bypass;
    out["x-vercel-set-bypass-cookie"] = "samesitenone";
  }
  return out;
}

export async function loadIntradayReplay(
  date: string,
): Promise<IntradayReplayData | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const base = resolveBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/replay/intraday?date=${date}`, {
      cache: "no-store",
      headers: buildFetchHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as IntradayReplayData;
    return {
      date: data.date,
      spy: sanitizeBars(data.spy),
      es: sanitizeBars(data.es),
      error: data.error,
    };
  } catch {
    return null;
  }
}

function sanitizeBars(bars: StructureChartBar[] | undefined): StructureChartBar[] {
  return (bars ?? [])
    .filter(
      (bar) =>
        !!bar?.t &&
        Number.isFinite(bar.h) &&
        Number.isFinite(bar.l) &&
        Number.isFinite(bar.c),
    )
    .map((bar) => ({ t: bar.t, h: bar.h, l: bar.l, c: bar.c }));
}
