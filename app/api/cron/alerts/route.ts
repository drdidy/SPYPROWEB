import { NextResponse } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import { runAlertMonitor } from "@/lib/alerts/monitor";
import { resolvePublicOrigin } from "@/lib/server/public-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAlertRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const result = await runAlertMonitor({ origin: resolvePublicOrigin(request), dryRun }).catch((error) => ({
    ok: false,
    checked: [],
    candidates: 0,
    sent: 0,
    skipped: 0,
    errors: [error instanceof Error ? error.message : String(error)],
    dryRun,
  }));
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
