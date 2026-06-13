import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  EmaFibAlertPayload,
  type EmaFibAlertRecord,
  type EmaFibDirection,
  type EmaFibSymbol,
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

export function normalizeEmaFibPayload(payload: EmaFibAlertPayload): EmaFibAlertPayload {
  return {
    ...payload,
    symbol: inferSymbolFromTicker(payload.ticker) ?? payload.symbol,
  };
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

function inferSymbolFromTicker(ticker: string): EmaFibSymbol | null {
  const clean = ticker.toUpperCase().replace(/[^A-Z0-9!]/g, "");
  if (clean === "SPY") return "SPY";
  if (clean.includes("SPX500") || clean === "SPX") return "SPX";
  if (clean === "ES" || clean === "ES1!" || clean.startsWith("ES")) return "ES";
  return null;
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
  const isLong = payload.direction === "long";
  const side = isLong ? "LONG" : "SHORT";
  const symbol = payload.symbol;
  const fib = fmt(payload.fib50);
  const extension = fmt(payload.extension150);
  const last = fmt(payload.last);
  const stop = payload.stop === null ? "-" : fmt(payload.stop);
  const pivotPath = `${fmt(payload.pivotLow)} -> ${fmt(payload.pivotHigh)}`;
  const closeRule = isLong
    ? `Candle tagged Fib 50 and closed back above ${fib}.`
    : `Candle tagged Fib 50 and closed back below ${fib}.`;
  const waitRule = isLong
    ? `Wait for a pullback into ${fib}, then a close back above it.`
    : `Wait for a rally into ${fib}, then a close back below it.`;
  const entryWindow = isLong
    ? "Entry window: next 1-minute candle after the bullish rejection close."
    : "Entry window: next 1-minute candle after the bearish rejection close.";

  if (payload.kind === "entry" || payload.kind === "fib50_rejection") {
    return {
      priority: "entry",
      title: `${symbol} ENTRY NOW: ${side} Fib 50 rejection`,
      text: addPayloadNote(payload, [
        `Setup confirmed: 21 EMA / 50 EMA continuation on ${payload.timeframe}m.`,
        closeRule,
        entryWindow,
        `Entry reference: ${last}.`,
        `Target / planned exit: Fib 1.5 at ${extension}.`,
        `Invalidation reference: ${stop}.`,
        `Swing map: ${pivotPath}.`,
        "This is an alert only. Confirm spread, contract price, and liquidity before acting.",
      ]).join("\n"),
    };
  }

  if (payload.kind === "fib50_armed") {
    return {
      priority: "armed",
      title: `${symbol} TESTING: Fib 50 continuation line`,
      text: addPayloadNote(payload, [
        `Price is testing the Fib 50 continuation line at ${fib}.`,
        waitRule,
        "Do not enter from the touch alone. Wait for the candle close.",
        `If confirmed, target / planned exit is Fib 1.5 at ${extension}.`,
        `Invalidation reference: ${stop}.`,
        `Swing map: ${pivotPath}.`,
      ]).join("\n"),
    };
  }

  if (payload.kind === "exit_target") {
    return {
      priority: "exit",
      title: `${symbol} EXIT: Fib 1.5 reached`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} continuation target reached.`,
        `Fib 1.5: ${extension}.`,
        `Last: ${last}.`,
        "Execution note: planned target zone reached; reassess before any new setup.",
      ]).join("\n"),
    };
  }

  if (payload.kind === "invalidated") {
    return {
      priority: "invalid",
      title: `${symbol} INVALIDATED`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} continuation setup is no longer valid.`,
        `Last: ${last}.`,
        `Fib 50: ${fib}.`,
        `Invalidation reference: ${stop}.`,
        "Action: stand down until a fresh EMA cross creates a new swing map.",
      ]).join("\n"),
    };
  }

  return {
    priority: "watch",
    title: `${symbol} CROSS: build Fib 50 map`,
    text: addPayloadNote(payload, [
      `${symbol} ${side} 21 EMA / 50 EMA cross detected on ${payload.timeframe}m.`,
      `Swing map: ${pivotPath}.`,
      `Fib 50 decision line: ${fib}.`,
      `Target if confirmed: Fib 1.5 at ${extension}.`,
      waitRule,
      "No entry yet. Wait for the Fib 50 touch-and-close confirmation.",
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
