import { NextResponse, type NextRequest } from "next/server";

import {
  isAuthorizedAlertToken,
  maskChatId,
  readTelegramBotProfile,
  readStoredTelegramChatId,
  telegramBotToken,
} from "@/lib/telegram-alerts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!isAuthorizedAlertToken(token)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const botToken = telegramBotToken();
  if (!botToken || !token) {
    return NextResponse.json(
      { ok: false, error: "Telegram token or alert secret is not configured." },
      { status: 503 },
    );
  }

  const webhookUrl = `${url.origin}/api/telegram/webhook?token=${encodeURIComponent(token)}`;
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
  const telegramBody = (await telegramRes.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  const storedChat = await readStoredTelegramChatId();
  const botProfile = await readTelegramBotProfile();
  return NextResponse.json({
    ok: telegramRes.ok && telegramBody?.ok !== false,
    telegram: {
      ok: telegramBody?.ok ?? telegramRes.ok,
      description: telegramBody?.description ?? null,
    },
    bot: botProfile
      ? {
          username: botProfile.username,
          link: botProfile.username ? `https://t.me/${botProfile.username}` : null,
        }
      : null,
    storedChat: maskChatId(storedChat),
    nextStep: storedChat
      ? "Telegram chat is already bound."
      : "Send /start to the SPY Prophet Telegram bot once to bind this chat.",
  });
}
