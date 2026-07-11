import { NextResponse } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import { getTelegramChatCandidates } from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!isAlertRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const chats = await getTelegramChatCandidates();
    return NextResponse.json({
      chats,
      next:
        chats.length > 0
          ? "Use the chatId from the newest message as TELEGRAM_CHAT_ID."
          : "Send any message to your bot in Telegram, then refresh this endpoint.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read Telegram updates." },
      { status: 500 },
    );
  }
}
