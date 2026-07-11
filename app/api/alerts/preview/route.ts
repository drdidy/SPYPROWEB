import { NextResponse } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import { buildAlertPreview } from "@/lib/alerts/monitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!isAlertRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const origin = new URL(request.url).origin;
  const preview = await buildAlertPreview(origin);
  return NextResponse.json({
    alerts: preview.alerts,
    errors: preview.errors,
  });
}
