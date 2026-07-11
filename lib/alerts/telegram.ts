export type TelegramSendResult = {
  ok: boolean;
  status: number;
  description?: string;
  messageId?: number;
};

export type TelegramChannel = "default" | "indicator";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    date?: number;
    text?: string;
    chat?: {
      id: number;
      type?: string;
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

type TelegramSentMessage = {
  message_id: number;
};

export type TelegramChatCandidate = {
  chatId: string;
  label: string;
  text: string;
  date: string | null;
};

export function telegramConfigured(channel: TelegramChannel = "default"): boolean {
  return Boolean(telegramBotToken(channel));
}

export function telegramChatConfigured(channel: TelegramChannel = "default"): boolean {
  return Boolean(configuredTelegramChatId(channel));
}

export async function sendTelegramMessage(
  text: string,
  chatId?: string | null,
  channel: TelegramChannel = "default",
): Promise<TelegramSendResult> {
  const token = telegramBotToken(channel);
  if (!token) {
    return { ok: false, status: 500, description: `${telegramEnvPrefix(channel)}_BOT_TOKEN is not configured.` };
  }

  const candidates = [
    chatId ?? configuredTelegramChatId(channel),
    await readStoredTelegramChatId(channel),
    await resolveTelegramChatId(token),
  ].filter((value, index, arr): value is string => {
    if (!value) return false;
    return arr.findIndex((candidate) => candidate === value) === index;
  });

  if (candidates.length === 0) {
    return { ok: false, status: 500, description: `${telegramEnvPrefix(channel)}_CHAT_ID is not configured.` };
  }

  let lastResult: TelegramSendResult | null = null;
  for (const target of candidates) {
    const result = await sendTelegramMessageToChat(token, target, text);
    if (result.ok) return result;
    lastResult = result;
    if (!/chat not found/i.test(result.description ?? "")) break;
  }

  return lastResult ?? { ok: false, status: 500, description: "Telegram delivery failed." };
}

export function telegramBotToken(channel: TelegramChannel = "default"): string | null {
  if (channel === "indicator") {
    return (
      process.env.INDICATOR_TELEGRAM_BOT_TOKEN?.trim() ||
      process.env.SPYPROPHET_INDICATOR_TELEGRAM_BOT_TOKEN?.trim() ||
      null
    );
  }

  return (
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    process.env.SPYPROPHET_TELEGRAM_BOT_TOKEN?.trim() ||
    null
  );
}

export function configuredTelegramChatId(channel: TelegramChannel = "default"): string | null {
  if (channel === "indicator") {
    return (
      process.env.INDICATOR_TELEGRAM_CHAT_ID?.trim() ||
      process.env.SPYPROPHET_INDICATOR_TELEGRAM_CHAT_ID?.trim() ||
      null
    );
  }

  return (
    process.env.TELEGRAM_CHAT_ID?.trim() ||
    process.env.SPYPROPHET_TELEGRAM_CHAT_ID?.trim() ||
    null
  );
}

export async function readStoredTelegramChatId(channel: TelegramChannel = "default"): Promise<string | null> {
  return redisGet(telegramChatRedisKey(channel));
}

export async function storeTelegramChatId(
  chatId: string | number,
  channel: TelegramChannel = "default",
): Promise<void> {
  await redisSet(telegramChatRedisKey(channel), String(chatId));
}

export function extractTelegramChatId(update: unknown): string | number | null {
  if (!update || typeof update !== "object") return null;
  const row = update as {
    message?: { chat?: { id?: string | number } };
    channel_post?: { chat?: { id?: string | number } };
    edited_message?: { chat?: { id?: string | number } };
    callback_query?: { message?: { chat?: { id?: string | number } } };
  };
  return (
    row.message?.chat?.id ??
    row.channel_post?.chat?.id ??
    row.edited_message?.chat?.id ??
    row.callback_query?.message?.chat?.id ??
    null
  );
}

export function maskTelegramChatId(chatId: string | number | null): string | null {
  if (chatId === null || chatId === undefined) return null;
  const value = String(chatId);
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

async function sendTelegramMessageToChat(
  token: string,
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | TelegramApiResponse<TelegramSentMessage>
    | null;
  return {
    ok: res.ok && Boolean(body?.ok),
    status: res.status,
    description: body?.description,
    messageId: body?.result?.message_id,
  };
}

export async function getTelegramChatCandidates(
  channel: TelegramChannel = "default",
): Promise<TelegramChatCandidate[]> {
  const token = telegramBotToken(channel);
  if (!token) {
    throw new Error(`${telegramEnvPrefix(channel)}_BOT_TOKEN is not configured.`);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    cache: "no-store",
  });
  const body = (await res.json()) as TelegramApiResponse<TelegramUpdate[]>;
  if (!res.ok || !body.ok) {
    throw new Error(body.description || `Telegram returned HTTP ${res.status}.`);
  }

  const seen = new Set<string>();
  return (body.result ?? [])
    .slice()
    .reverse()
    .map((update) => {
      const chat = update.message?.chat;
      if (!chat?.id) return null;
      const chatId = String(chat.id);
      if (seen.has(chatId)) return null;
      seen.add(chatId);
      const name =
        chat.title ||
        chat.username ||
        [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
        chat.type ||
        "Telegram chat";
      return {
        chatId,
        label: name,
        text: update.message?.text ?? "",
        date: update.message?.date
          ? new Date(update.message.date * 1000).toISOString()
          : null,
      };
    })
    .filter((item): item is TelegramChatCandidate => item !== null);
}

function telegramEnvPrefix(channel: TelegramChannel): string {
  return channel === "indicator" ? "INDICATOR_TELEGRAM" : "TELEGRAM";
}

function telegramChatRedisKey(channel: TelegramChannel): string {
  return channel === "indicator"
    ? "spyprophet:telegram:indicator_chat_id"
    : "spyprophet:telegram:chat_id";
}

async function resolveTelegramChatId(token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | TelegramApiResponse<TelegramUpdate[]>
      | null;
    if (!res.ok || !body?.ok) return null;
    const latest = (body.result ?? [])
      .slice()
      .reverse()
      .map((update) => update.message?.chat?.id)
      .find((id): id is number => typeof id === "number");
    return latest === undefined ? null : String(latest);
  } catch {
    return null;
  }
}

async function redisGet(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/get/${encodeURIComponent(key)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { result?: string | null } | null;
    return typeof body?.result === "string" ? body.result : null;
  } catch {
    return null;
  }
}

async function redisSet(key: string, value: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return;
  await fetch(
    `${url.replace(/\/$/, "")}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  ).catch(() => null);
}
