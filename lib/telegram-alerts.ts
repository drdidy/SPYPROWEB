import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "spyprophet")
    : path.join(process.cwd(), ".data");

const TELEGRAM_CHAT_FILE = path.join(ROOT, "telegram-chat.json");
const TELEGRAM_CHAT_KEY = "spyprophet:telegram:chat_id";

export interface TelegramChatBinding {
  chatId: string;
  source: "env" | "store";
}

export function telegramBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || process.env.SPYPROPHET_TELEGRAM_BOT_TOKEN || null;
}

export function configuredTelegramChatId(): string | null {
  return process.env.SPYPROPHET_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || null;
}

export function alertSecrets(): string[] {
  return [
    process.env.SPYPROPHET_TRADINGVIEW_WEBHOOK_SECRET,
    process.env.ALERT_SECRET,
  ].filter((value): value is string => !!value);
}

export function isAuthorizedAlertToken(token: string | null): boolean {
  if (!token) return false;
  return alertSecrets().includes(token);
}

export async function getTelegramChatBinding(): Promise<TelegramChatBinding | null> {
  const envChat = configuredTelegramChatId();
  if (envChat) return { chatId: envChat, source: "env" };
  const stored = await readStoredTelegramChatId();
  return stored ? { chatId: stored, source: "store" } : null;
}

export async function readStoredTelegramChatId(): Promise<string | null> {
  const redis = await redisGet(TELEGRAM_CHAT_KEY);
  if (redis) return redis;
  try {
    const raw = await fs.readFile(TELEGRAM_CHAT_FILE, "utf8");
    const parsed = JSON.parse(raw) as { chatId?: string };
    return parsed.chatId || null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function storeTelegramChatId(chatId: string | number): Promise<void> {
  const normalized = String(chatId);
  await redisSet(TELEGRAM_CHAT_KEY, normalized);
  await fs.mkdir(path.dirname(TELEGRAM_CHAT_FILE), { recursive: true });
  await fs.writeFile(
    TELEGRAM_CHAT_FILE,
    JSON.stringify({ chatId: normalized, storedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
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

export function maskChatId(chatId: string | number | null): string | null {
  if (chatId === null || chatId === undefined) return null;
  const value = String(chatId);
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

async function redisGet(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    return typeof data.result === "string" ? data.result : null;
  } catch {
    return null;
  }
}

async function redisSet(key: string, value: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(
      `${url.replace(/\/$/, "")}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    // File fallback still covers local/dev. In production this leaves
    // Telegram unbound until the next message if Upstash is unavailable.
  }
}
