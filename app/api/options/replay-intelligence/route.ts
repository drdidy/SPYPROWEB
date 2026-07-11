import { NextResponse } from "next/server";

import { buildOptionReplayIntelligence } from "@/lib/options/replay-intelligence";
import { DEFAULT_SPX_ENTRY_DEBIT_CEILING } from "@/lib/spx-contract-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lookbackParam = Number(url.searchParams.get("lookback") ?? 3);
  const budgetParam = Number(url.searchParams.get("budget") ?? DEFAULT_SPX_ENTRY_DEBIT_CEILING);
  const lookback = Number.isFinite(lookbackParam) ? Math.min(5, Math.max(2, lookbackParam)) : 3;
  const budget = Number.isFinite(budgetParam) ? budgetParam : DEFAULT_SPX_ENTRY_DEBIT_CEILING;

  const snapshot = await buildOptionReplayIntelligence({
    origin: url.origin,
    lookback,
    budget,
  });

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
