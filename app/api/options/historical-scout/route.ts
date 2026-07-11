import { NextResponse } from "next/server";

import { buildHistoricalOptionScout } from "@/lib/options/historical-scout";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lookback = Math.min(10, Math.max(3, Number(url.searchParams.get("lookback") ?? 5)));
  const scout = await buildHistoricalOptionScout({ origin: url.origin, lookback });
  return NextResponse.json(scout, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
