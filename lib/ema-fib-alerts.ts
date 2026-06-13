import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  EmaFibAlertPayload,
  type EmaFibAlertRecord,
  type EmaFibDirection,
} from "@/lib/contracts/ema-fib-alert";
import {
  configuredTelegramChatId,
  readStoredTelegramChatId,
  telegramBotToken,
} from "@/lib/telegram-alerts";

const ROOT =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "spyprophet")
    : path.join(process.cwd(), ".data");

const ALERTS_FILE = path.join(ROOT, "ema-fib-alerts.jsonl");
const EPS = 0.02;

export interface AlertValidation {
  status: "accepted" | "rejected";
  reasons: string[];
}

export interface NotificationResult {
  attempted: boolean;
  delivered: boolean;
  error: string | null;
}

export function parseEmaFibPayload(raw: unknown) {
  return EmaFibAlertPayload.safeParse(raw);
}

export function validateEmaFibAlert(payload: EmaFibAlertPayload): AlertValidation {
  const reasons: string[] = [];
  const range = payload.pivotHigh - payload.pivotLow;

  if (!(range > 0)) reasons.push("Pivot high must be above pivot low.");

  const expectedFib50 = payload.pivotLow + range * 0.5;
  if (Math.abs(payload.fib50 - expectedFib50) > EPS) {
    reasons.push(`Fib 50 mismatch. Expected ${expectedFib50.toFixed(2)}.`);
  }

  const expectedExtension =
    payload.direction === "long"
      ? payload.pivotHigh + range * 0.5
      : payload.pivotLow - range * 0.5;
  if (Math.abs(payload.extension150 - expectedExtension) > EPS) {
    reasons.push(`Fib 1.5 extension mismatch. Expected ${expectedExtension.toFixed(2)}.`);
  }

  if (payload.candle.low > payload.candle.high) {
    reasons.push("Candle low is above candle high.");
  }
  if (payload.last < payload.candle.low - EPS || payload.last > payload.candle.high + EPS) {
    reasons.push("Last price is outside the alert candle range.");
  }

  if (payload.kind === "fib50_rejection" || payload.kind === "entry") {
    const touched = payload.candle.low <= payload.fib50 + EPS && payload.candle.high >= payload.fib50 - EPS;
    if (!touched) reasons.push("Alert candle did not touch Fib 50.");

    if (payload.direction === "long") {
      if (payload.candle.close < payload.fib50 - EPS) {
        reasons.push("Long entry requires the candle to close above Fib 50.");
      }
      if (payload.candle.close <= payload.candle.open) {
        reasons.push("Long entry requires a bullish rejection candle.");
      }
    } else {
      if (payload.candle.close > payload.fib50 + EPS) {
        reasons.push("Short entry requires the candle to close below Fib 50.");
      }
      if (payload.candle.close >= payload.candle.open) {
        reasons.push("Short entry requires a bearish rejection candle.");
      }
    }
  }

  const eventMs = Date.parse(payload.eventAt);
  if (!Number.isFinite(eventMs)) {
    reasons.push("Invalid event timestamp.");
  } else {
    const ageMin = (Date.now() - eventMs) / 60000;
    if (ageMin > 15) reasons.push(`Signal is stale by ${Math.round(ageMin)} minutes.`);
  }

  return {
    status: reasons.length ? "rejected" : "accepted",
    reasons,
  };
}

export function buildEmaFibAlertId(payload: EmaFibAlertPayload): string {
  const key = [
    payload.source,
    payload.strategy,
    payload.symbol,
    payload.kind,
    payload.direction,
    payload.eventAt,
    payload.fib50.toFixed(2),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

export function buildOperatorMessage(payload: EmaFibAlertPayload): {
  title: string;
  text: string;
  priority: "watch" | "armed" | "entry" | "exit" | "invalid";
} {
  const side = payload.direction === "long" ? "LONG" : "SHORT";
  const symbol = payload.symbol;
  const fib = fmt(payload.fib50);
  const extension = fmt(payload.extension150);
  const last = fmt(payload.last);
  const stop = payload.stop === null ? "-" : fmt(payload.stop);

  if (payload.kind === "entry" || payload.kind === "fib50_rejection") {
    return {
      priority: "entry",
      title: `${symbol} ENTRY: ${side} Fib 50 rejection`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} continuation confirmed.`,
        `Fib 50: ${fib} | Last: ${last}`,
        `Exit plan: 1.5 fib at ${extension}`,
        `Invalidation: ${stop}`,
        `Source: 21/50 EMA cross + clean Fib 50 rejection.`,
      ]).join("\n"),
    };
  }

  if (payload.kind === "fib50_armed") {
    return {
      priority: "armed",
      title: `${symbol} ARMED: watch Fib 50`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} continuation structure is armed.`,
        `Watch Fib 50: ${fib}`,
        `Target if confirmed: ${extension}`,
        `No entry until price touches and closes on the continuation side.`,
      ]).join("\n"),
    };
  }

  if (payload.kind === "exit_target") {
    return {
      priority: "exit",
      title: `${symbol} EXIT: 1.5 fib reached`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} target reached.`,
        `1.5 fib: ${extension}`,
        `Last: ${last}`,
      ]).join("\n"),
    };
  }

  if (payload.kind === "invalidated") {
    return {
      priority: "invalid",
      title: `${symbol} INVALIDATED`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} continuation invalidated.`,
        `Fib 50: ${fib} | Last: ${last}`,
        `Stop/reference: ${stop}`,
      ]).join("\n"),
    };
  }

  return {
    priority: "watch",
    title: `${symbol} WATCH: EMA cross`,
    text: addPayloadNote(payload, [
      `${symbol} ${side} 21/50 EMA cross detected.`,
      `Fib 50: ${fib}`,
      `Target if confirmed: ${extension}`,
      `Wait for clean rejection before entry.`,
    ]).join("\n"),
  };
}

function addPayloadNote(payload: EmaFibAlertPayload, lines: string[]): string[] {
  const note = payload.note?.trim();
  return note ? [...lines, `Note: ${note}`] : lines;
}

export async function appendEmaFibAlertRecord(record: EmaFibAlertRecord): Promise<{
  inserted: boolean;
  record: EmaFibAlertRecord;
}> {
  const existing = await readEmaFibAlerts(200);
  const prior = existing.find((row) => row.id === record.id);
  if (prior) return { inserted: false, record: prior };
  await appendJsonl(ALERTS_FILE, record);
  return { inserted: true, record };
}

export async function readEmaFibAlerts(limit = 100): Promise<EmaFibAlertRecord[]> {
  const rows = await readJsonl<EmaFibAlertRecord>(ALERTS_FILE);
  return rows
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, limit);
}

export async function sendAlertNotification(
  payload: EmaFibAlertPayload,
  validation: AlertValidation,
): Promise<NotificationResult> {
  if (validation.status !== "accepted") {
    return { attempted: false, delivered: false, error: "Signal rejected by validation." };
  }

  const message = buildOperatorMessage(payload);
  const results = await Promise.allSettled([
    sendTelegramMessage(message.title, message.text),
    sendGenericWebhook(message.title, message.text, message.priority, payload),
  ]);

  const attempted = results.some((row) => row.status === "fulfilled" && row.value.attempted);
  const delivered = results.some((row) => row.status === "fulfilled" && row.value.delivered);
  const errors = results
    .map((row) => (row.status === "rejected" ? String(row.reason) : row.value.error))
    .filter(Boolean);

  return {
    attempted,
    delivered,
    error: delivered ? null : errors.join("; ") || (attempted ? "Notification sink failed." : "No notification sink configured."),
  };
}

async function sendTelegramMessage(title: string, text: string): Promise<NotificationResult> {
  const token = telegramBotToken();
  const chatId = configuredTelegramChatId();
  if (!token) return { attempted: false, delivered: false, error: null };

  const candidates = [
    chatId,
    await readStoredTelegramChatId(),
    await resolveTelegramChatId(token),
  ].filter((value, index, arr): value is string | number => {
    if (value === null || value === undefined || value === "") return false;
    return arr.findIndex((candidate) => String(candidate) === String(value)) === index;
  });

  let lastError: string | null = null;
  for (const candidate of candidates) {
    const result = await sendTelegramMessageToChat(token, candidate, title, text);
    if (result.delivered) return result;
    lastError = result.error;
    if (!/chat not found/i.test(result.error ?? "")) break;
  }

  return {
    attempted: candidates.length > 0,
    delivered: false,
    error: lastError || "No reachable Telegram chat configured.",
  };
}

async function sendTelegramMessageToChat(
  token: string,
  chatId: string | number,
  title: string,
  text: string,
): Promise<NotificationResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${title}\n\n${text}`,
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { attempted: true, delivered: false, error: `Telegram ${res.status}: ${err.slice(0, 160)}` };
    }
    return { attempted: true, delivered: true, error: null };
  } catch (error) {
    return {
      attempted: true,
      delivered: false,
      error: error instanceof Error ? error.message : "Telegram request failed.",
    };
  }
}

async function resolveTelegramChatId(token: string): Promise<string | number | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=25`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      result?: Array<{
        message?: { chat?: { id?: string | number } };
        channel_post?: { chat?: { id?: string | number } };
        edited_message?: { chat?: { id?: string | number } };
      }>;
    };
    if (!data.ok || !Array.isArray(data.result)) return null;
    for (const update of [...data.result].reverse()) {
      const id =
        update.message?.chat?.id ??
        update.channel_post?.chat?.id ??
        update.edited_message?.chat?.id;
      if (id !== undefined && id !== null) return id;
    }
    return null;
  } catch {
    return null;
  }
}

async function sendGenericWebhook(
  title: string,
  text: string,
  priority: string,
  payload: EmaFibAlertPayload,
): Promise<NotificationResult> {
  const url = process.env.SPYPROPHET_ALERT_WEBHOOK_URL;
  if (!url) return { attempted: false, delivered: false, error: null };
  const token = process.env.SPYPROPHET_ALERT_WEBHOOK_TOKEN;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title,
        message: text,
        priority,
        payload,
        sentAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { attempted: true, delivered: false, error: `Webhook ${res.status}` };
    }
    return { attempted: true, delivered: true, error: null };
  } catch (error) {
    return {
      attempted: true,
      delivered: false,
      error: error instanceof Error ? error.message : "Webhook request failed.",
    };
  }
}

function fmt(value: number): string {
  return value.toFixed(2);
}

async function appendJsonl(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonl<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

export function directionLabel(direction: EmaFibDirection): string {
  return direction === "long" ? "Long" : "Short";
}
