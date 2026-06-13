import { NextResponse, type NextRequest } from "next/server";

import {
  extractTelegramChatId,
  isAuthorizedAlertToken,
  maskChatId,
  storeTelegramChatId,
  telegramBotToken,
} from "@/lib/telegram-alerts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!isAuthorizedAlertToken(token)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, webhook: "telegram" });
}

export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!isAuthorizedAlertToken(token)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const chatId = extractTelegramChatId(update);
  if (chatId !== null) {
    await storeTelegramChatId(chatId);
    await replyToTelegramChat(chatId);
  }

  return NextResponse.json({ ok: true, chatBound: chatId !== null, chat: maskChatId(chatId) });
}

async function replyToTelegramChat(chatId: string | number) {
  const botToken = telegramBotToken();
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text:
        "SPY Prophet alerts are connected.\n\n" +
        "You will receive structured TradingView EMA/Fib alerts here. " +
        "Notification only. SPY Prophet does not place trades.",
      disable_web_page_preview: true,
    }),
    cache: "no-store",
  }).catch(() => null);
}
