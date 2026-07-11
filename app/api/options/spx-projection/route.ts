import { NextResponse } from "next/server";

import { buildLiveSpxProjectionSnapshot } from "@/lib/options/spx-live-projection";
import { normalizeEntryDebitCeiling } from "@/lib/spx-contract-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const debitLimit = normalizeEntryDebitCeiling(
    url.searchParams.get("maxDebit") ?? url.searchParams.get("debit"),
  );
  const snapshot = await buildLiveSpxProjectionSnapshot({
    debitLimit,
    origin: url.origin,
  });
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
