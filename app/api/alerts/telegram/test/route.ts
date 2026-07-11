import { NextResponse } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import { sendTelegramMessage } from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!isAlertRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendTelegramMessage(
    [
      "SPY Prophet Alert Test",
      "Telegram delivery is connected.",
      "When live monitoring is enabled, this channel will receive entry and watch alerts.",
    ].join("\n"),
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result });
}

export async function POST(request: Request) {
  return GET(request);
}
