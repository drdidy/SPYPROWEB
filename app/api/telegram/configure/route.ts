import { NextResponse, type NextRequest } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import {
  maskTelegramChatId,
  readStoredTelegramChatId,
  telegramBotToken,
} from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  if (!isAlertRequestAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const botToken = telegramBotToken();
  if (!botToken) {
    return NextResponse.json(
      { ok: false, error: "Telegram token is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || url.searchParams.get("token");
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Missing shared secret in query string." },
      { status: 400 },
    );
  }

  const webhookUrl = `${url.origin}/api/telegram/webhook?secret=${encodeURIComponent(secret)}`;
  const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "channel_post", "edited_message", "callback_query"],
      drop_pending_updates: false,
    }),
    cache: "no-store",
  });
  const body = (await telegramRes.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  const storedChat = await readStoredTelegramChatId();
  return NextResponse.json({
    ok: telegramRes.ok && body?.ok !== false,
    telegram: {
      ok: body?.ok ?? telegramRes.ok,
      description: body?.description ?? null,
    },
    storedChat: maskTelegramChatId(storedChat),
    nextStep: storedChat
      ? "Telegram chat is already bound."
      : "Send /start to the SPY Prophet Telegram bot once to bind this chat.",
  });
}
