import { NextResponse, type NextRequest } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import {
  extractTelegramChatId,
  maskTelegramChatId,
  sendTelegramMessage,
  storeTelegramChatId,
} from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAlertRequestAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, webhook: "telegram" });
}

export async function POST(req: NextRequest) {
  if (!isAlertRequestAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const chatId = extractTelegramChatId(update);
  if (chatId !== null) {
    await storeTelegramChatId(chatId);
    await sendTelegramMessage(
      [
        "SPY Prophet alerts are connected.",
        "",
        "You will receive structured EMA/Fib continuation alerts here.",
        "Notification only. SPY Prophet does not place trades.",
      ].join("\n"),
      String(chatId),
    );
  }

  return NextResponse.json({
    ok: true,
    chatBound: chatId !== null,
    chat: maskTelegramChatId(chatId),
  });
}
