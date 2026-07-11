import { NextResponse } from "next/server";

import { buildDailyIntelligence } from "@/lib/intelligence/daily";
import { resolvePublicOrigin } from "@/lib/server/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const snapshot = await buildDailyIntelligence({
    origin: resolvePublicOrigin(request),
    date: url.searchParams.get("date"),
  });
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
