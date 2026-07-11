import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  EmaFibAlertPayload,
  EmaFibAlertRecord,
  type EmaFibDirection,
  type EmaFibSymbol,
} from "@/lib/contracts/ema-fib-alert";
import { sendTelegramMessage, telegramChatConfigured, telegramConfigured } from "@/lib/alerts/telegram";

const ROOT =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "spyprophet")
    : path.join(process.cwd(), ".data");

const ALERTS_FILE = path.join(ROOT, "ema-fib-alerts.jsonl");
const ALERTS_REDIS_KEY = "spyprophet:ema_fib_alerts";
const EPS = 0.02;
const EMPTY_SENTINEL = -999_999_999_999;

const compactNumber = z.coerce.number().finite();

const TradingViewCompactPayload = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    source: z.literal("tradingview_compact"),
    strategy: z.string().default("ema_fast_ema50_fib_continuation"),
    symbol: z.string().optional(),
    ticker: z.string().min(1).max(48),
    timeframe: z.string().min(1).max(12),
    eventAt: z.string().optional(),
    kindCode: compactNumber,
    directionCode: compactNumber,
    confirmationModeCode: compactNumber,
    last: compactNumber,
    fastEmaLength: compactNumber,
    slowEmaLength: compactNumber,
    ema21: compactNumber,
    ema50: compactNumber,
    pivotLow: compactNumber,
    pivotHigh: compactNumber,
    shallowFib: compactNumber.optional(),
    deepFib: compactNumber.optional(),
    fibDeep: compactNumber.optional(),
    fib618: compactNumber,
    fib50: compactNumber,
    extension150: compactNumber,
    targetMultiple: compactNumber.optional(),
    stop: compactNumber,
    open: compactNumber,
    high: compactNumber,
    low: compactNumber,
    close: compactNumber,
    touchOpen: compactNumber.optional(),
    touchHigh: compactNumber.optional(),
    touchLow: compactNumber.optional(),
    touchClose: compactNumber.optional(),
  })
  .passthrough();

type TradingViewCompactPayload = z.infer<typeof TradingViewCompactPayload>;

const TradingViewPhonePayload = z
  .object({
    source: z.literal("tradingview"),
    strategy: z.string().optional(),
    symbol: z.string().optional(),
    ticker: z.string().min(1).max(48),
    timeframe: z.string().min(1).max(12),
    eventAt: z.string().optional(),
    kind: z.string().min(1).max(48),
    phoneTitle: z.string().max(120).optional(),
    side: z.string().max(32).optional(),
    mode: z.string().max(64).optional(),
    note: z.string().max(800).optional(),
    last: z.number().finite(),
    ema21: z.number().finite().optional(),
    ema50: z.number().finite().optional(),
    pivotLow: z.number().finite().nullable().optional(),
    pivotHigh: z.number().finite().nullable().optional(),
    entryTrigger: z.number().finite().nullable().optional(),
    entryDeep: z.number().finite().nullable().optional(),
    target150: z.number().finite().nullable().optional(),
    target1618: z.number().finite().nullable().optional(),
    target1786: z.number().finite().nullable().optional(),
    stop: z.number().finite().nullable().optional(),
    spxProxy: z.number().finite().nullable().optional(),
    contractSide: z.string().max(8).optional(),
    conservativeStrike: z.number().finite().nullable().optional(),
    cheaperStrike: z.number().finite().nullable().optional(),
    vix: z.number().finite().nullable().optional(),
    vixRegime: z.string().max(32).optional(),
  })
  .passthrough();

type TradingViewPhonePayload = z.infer<typeof TradingViewPhonePayload>;

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
  const parsed = EmaFibAlertPayload.safeParse(raw);
  if (parsed.success) return parsed;

  const compact = TradingViewCompactPayload.safeParse(raw);
  if (compact.success) {
    const expandedCompact = EmaFibAlertPayload.safeParse(expandTradingViewCompactPayload(compact.data));
    if (expandedCompact.success) return expandedCompact;
  }

  const phone = TradingViewPhonePayload.safeParse(raw);
  if (!phone.success) return parsed;

  return EmaFibAlertPayload.safeParse(expandTradingViewPhonePayload(phone.data));
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
  const normalizedTimeframe = payload.timeframe.toLowerCase();

  if (!["1", "1m", "1min"].includes(normalizedTimeframe)) {
    reasons.push("EMA/Fib continuation alerts must be generated from the 1-minute chart.");
  }

  if (payload.kind === "price_cross_50") {
    if (payload.candle.low > payload.candle.high) {
      reasons.push("Candle low is above candle high.");
    }
    if (payload.last < payload.candle.low - EPS || payload.last > payload.candle.high + EPS) {
      reasons.push("Last price is outside the alert candle range.");
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

  if (!(range > 0)) reasons.push("Pivot high must be above pivot low.");

  const nearRatio = entryNearRatio(payload);
  const deepRatio = entryDeepRatio(payload);
  const expectedFib50 =
    payload.direction === "long"
      ? payload.pivotHigh - range * nearRatio
      : payload.pivotLow + range * nearRatio;
  if (Math.abs(payload.fib50 - expectedFib50) > EPS) {
    reasons.push(`Entry trigger Fib ${formatRatioPercent(nearRatio)} mismatch. Expected ${expectedFib50.toFixed(2)}.`);
  }

  const actualFibDeep = fibDeepLevel(payload);
  const expectedFibDeep =
    payload.direction === "long"
      ? payload.pivotHigh - range * deepRatio
      : payload.pivotLow + range * deepRatio;
  if (actualFibDeep === null) {
    reasons.push(`Entry band far Fib ${formatRatioPercent(deepRatio)} level is missing.`);
  } else if (Math.abs(actualFibDeep - expectedFibDeep) > EPS) {
    reasons.push(`Entry band far Fib ${formatRatioPercent(deepRatio)} mismatch. Expected ${expectedFibDeep.toFixed(2)}.`);
  }

  const targetFib = targetMultiple(payload);
  const expectedExtension =
    payload.direction === "long"
      ? payload.pivotLow + range * targetFib
      : payload.pivotHigh - range * targetFib;
  if (Math.abs(payload.extension150 - expectedExtension) > EPS) {
    reasons.push(`Fib ${targetFib.toFixed(3)} target mismatch. Expected ${expectedExtension.toFixed(2)}.`);
  }

  if (payload.candle.low > payload.candle.high) {
    reasons.push("Candle low is above candle high.");
  }
  if (payload.last < payload.candle.low - EPS || payload.last > payload.candle.high + EPS) {
    reasons.push("Last price is outside the alert candle range.");
  }

  if (isEntryKind(payload.kind)) {
    const shouldUseTouchCandle =
      isPreCrossTouchMode(payload.confirmationMode) ||
      (payload.confirmationMode === "ema50_straddle" && Boolean(payload.touchCandle));
    const signalCandle =
      shouldUseTouchCandle ? payload.touchCandle : payload.candle;
    if (!signalCandle) {
      reasons.push("Pre-cross entry confirmation requires the touch candle.");
      return { status: "rejected", reasons };
    }

    if (actualFibDeep === null) {
      reasons.push(`Entry validation requires the Fib ${formatRatioPercent(deepRatio)} level.`);
      return { status: "rejected", reasons };
    }

    const zoneLow = Math.min(actualFibDeep, payload.fib50);
    const zoneHigh = Math.max(actualFibDeep, payload.fib50);
    const touchedZone = signalCandle.low <= zoneHigh + EPS && signalCandle.high >= zoneLow - EPS;
    if (!touchedZone) reasons.push(`Alert candle did not touch the Fib ${entryBandLabel(payload)} zone.`);

    if (payload.direction === "long") {
      if (payload.last >= payload.extension150 - EPS) {
        reasons.push(`Long entry is no longer actionable because price is already at or beyond Fib ${targetFib.toFixed(3)}.`);
      }
      if (signalCandle.close < payload.fib50 - EPS) {
        reasons.push(`Long entry requires the candle to close above Fib ${formatRatioPercent(nearRatio)}.`);
      }
      if (signalCandle.close <= signalCandle.open) {
        reasons.push("Long entry requires a bullish rejection candle.");
      }
    } else {
      if (payload.last <= payload.extension150 + EPS) {
        reasons.push(`Short entry is no longer actionable because price is already at or beyond Fib ${targetFib.toFixed(3)}.`);
      }
      if (signalCandle.close > payload.fib50 + EPS) {
        reasons.push(`Short entry requires the candle to close below Fib ${formatRatioPercent(nearRatio)}.`);
      }
      if (signalCandle.close >= signalCandle.open) {
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
    `${payload.fastEmaLength}/${payload.slowEmaLength}`,
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
  const fibDeepValue = fibDeepLevel(payload) ?? payload.fib50;
  const fibDeep = fmt(fibDeepValue);
  const extension = fmt(payload.extension150);
  const targetName = targetLabel(payload);
  const last = fmt(payload.last);
  const stop = payload.stop === null ? "-" : fmt(payload.stop);
  const pivotPath = `${fmt(payload.pivotLow)} -> ${fmt(payload.pivotHigh)}`;
  const timeframe = formatTimeframe(payload.timeframe);
  const emaProfile = emaPair(payload);
  const pocketLabel = entryBandLabel(payload);
  const nearLabel = formatRatioPercent(entryNearRatio(payload));
  const zone = `${fmt(Math.min(fibDeepValue, payload.fib50))} - ${fmt(
    Math.max(fibDeepValue, payload.fib50),
  )}`;
  const closeRule = isLong
    ? `Candle tagged the Fib ${pocketLabel} entry zone and closed back above ${fib}.`
    : `Candle tagged the Fib ${pocketLabel} entry zone and closed back below ${fib}.`;
  const waitRule = isLong
    ? `Wait for a pullback into the ${zone} Fib ${pocketLabel} entry zone, then a close back above ${fib}.`
    : `Wait for a rally into the ${zone} Fib ${pocketLabel} entry zone, then a close back below ${fib}.`;
  const entryWindow = isLong
    ? "Entry window: next 1-minute candle after the bullish rejection close."
    : "Entry window: next 1-minute candle after the bearish rejection close.";
  const customTitle = payload.telegramTitle?.trim();
  const customText = payload.telegramText?.trim();
  const customAction = payload.humanAction?.trim();
  const isFutures = payload.instrumentMode === "futures" || Boolean(payload.tokyoFutures);
  const executionNote = isFutures
    ? "Futures note: this is an ES/MES futures signal. Confirm spread, size, and session liquidity before entry."
    : "Option note: confirm the live SPXW ask and spread before entry; target exits should use the first live-chain bid after the underlying target alert.";
  const pivotNote = isLong
    ? "Swing map uses the last 1-minute pivot-low wick before price crossed above the 50 EMA, then the first pivot-high wick after that 50 EMA cross."
    : "Swing map uses the last 1-minute pivot-high wick before price crossed below the 50 EMA, then the first pivot-low wick after that 50 EMA cross.";

  if (payload.kind === "price_cross_50") {
    return {
      priority: "watch",
      title: customTitle || `${symbol} GET READY: price crossed the 50 EMA`,
      text: addPayloadNote(payload, [
        customText || `${symbol} ${side} watch: price crossed the 50 EMA on ${timeframe}.`,
        customAction || "Action: do not enter yet. Wait for the 21/50 cross, then the Fib pocket entry confirmation.",
        `Last: ${last}.`,
        `EMA ${payload.slowEmaLength}: ${fmt(payload.ema50)}.`,
      ]).join("\n"),
    };
  }

  if (customTitle || customText || customAction) {
    return {
      priority: priorityFromKind(payload.kind),
      title: customTitle || `${symbol} ${side} alert`,
      text: addPayloadNote(payload, [
        customText || `${symbol} ${side} ${emaProfile} setup on ${timeframe}.`,
        customAction ? `Action: ${customAction}` : "",
        `Entry zone: ${zone}.`,
        `Target / planned exit: ${targetName} at ${extension}.`,
        `Invalidation reference: ${stop}.`,
        `Swing map: ${pivotPath}.`,
        executionNote,
      ].filter(Boolean)).join("\n"),
    };
  }

  if (isEntryKind(payload.kind)) {
    const modeLine =
      isPreCrossTouchMode(payload.confirmationMode)
        ? `Confirmation mode: the Fib ${pocketLabel} zone was rejected before the cross; the cross now confirms the setup.`
        : `Confirmation mode: the cross came first; this candle rejected the Fib ${pocketLabel} zone after the cross.`;
    return {
      priority: "entry",
      title: `${symbol} ENTRY NOW: ${side} Fib ${pocketLabel} rejection`,
      text: addPayloadNote(payload, [
        `Setup confirmed: EMA ${emaProfile} continuation on ${timeframe}.`,
        modeLine,
        closeRule,
        entryWindow,
        `Entry reference: ${last}.`,
        `Target / planned exit: ${targetName} at ${extension}.`,
        `Invalidation reference: ${stop}.`,
        `Swing map: ${pivotPath}.`,
        pivotNote,
        executionNote,
        "This is an alert only. Confirm spread, contract price, and liquidity before acting.",
      ]).join("\n"),
    };
  }

  if (isZoneKind(payload.kind)) {
    return {
      priority: "armed",
      title: `${symbol} TESTING: Fib ${pocketLabel} continuation zone`,
      text: addPayloadNote(payload, [
        `Price is testing the Fib ${pocketLabel} continuation zone: ${zone}.`,
        waitRule,
        "Do not enter from the touch alone. Wait for the candle close.",
        `If confirmed, target / planned exit is ${targetName} at ${extension}.`,
        `Invalidation reference: ${stop}.`,
        `Swing map: ${pivotPath}.`,
        pivotNote,
      ]).join("\n"),
    };
  }

  if (payload.kind === "exit_target") {
    return {
      priority: "exit",
      title: `${symbol} EXIT: ${targetName} reached`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} continuation target reached.`,
        `${targetName}: ${extension}.`,
        `Last: ${last}.`,
        "Option note: price the exit from the first live-chain bid at or after this alert time.",
        "Execution note: planned target zone reached; reassess before any new setup.",
      ]).join("\n"),
    };
  }

  if (payload.kind === "exit_timeout") {
    return {
      priority: "exit",
      title: `${symbol} FLAT: management window closed`,
      text: addPayloadNote(payload, [
        `${symbol} ${side} continuation did not reach the planned target before the management cutoff.`,
        `Last: ${last}.`,
        `Target remains ${targetName} at ${extension}, but the 0DTE trade window is over.`,
        "Action: stand down unless a fresh setup prints.",
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
    title: payload.kind === "straddle_armed"
      ? `${symbol} STANDARD SETUP: Fib ${pocketLabel} map armed`
      : `${symbol} CROSS: build Fib ${pocketLabel} map`,
    text: addPayloadNote(payload, [
        `${symbol} ${side} EMA ${emaProfile} cross detected on ${timeframe}.`,
        `Swing map: ${pivotPath}.`,
        pivotNote,
        `Likely entry zone: Fib ${nearLabel} at ${fib} to Fib ${formatRatioPercent(entryDeepRatio(payload))} at ${fibDeep}.`,
        `Target if confirmed: ${targetName} at ${extension}.`,
        waitRule,
        `No entry yet. Wait for the Fib ${pocketLabel} zone touch-and-close confirmation.`,
    ]).join("\n"),
  };
}

export async function appendEmaFibAlertRecord(record: EmaFibAlertRecord): Promise<{
  inserted: boolean;
  record: EmaFibAlertRecord;
}> {
  const existing = await readEmaFibAlerts(500);
  const prior = existing.find((row) => row.id === record.id);
  if (prior) return { inserted: false, record: prior };

  if (redisConfigured()) {
    await redisCommand(["LPUSH", ALERTS_REDIS_KEY, JSON.stringify(record)]);
    await redisCommand(["LTRIM", ALERTS_REDIS_KEY, 0, 499]);
    return { inserted: true, record };
  }

  await appendJsonl(ALERTS_FILE, record);
  return { inserted: true, record };
}

export async function readEmaFibAlerts(limit = 100): Promise<EmaFibAlertRecord[]> {
  if (redisConfigured()) {
    const rows = await redisCommand<string[]>(["LRANGE", ALERTS_REDIS_KEY, 0, Math.max(0, limit - 1)]);
    return (rows ?? [])
      .map(parseAlertRecord)
      .filter((row): row is EmaFibAlertRecord => row !== null);
  }

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
  const text = [message.title, "", message.text].join("\n");
  const channel = telegramConfigured("indicator") && telegramChatConfigured("indicator") ? "indicator" : "default";
  const result = await sendTelegramMessage(text, undefined, channel);
  return {
    attempted: true,
    delivered: result.ok,
    error: result.ok ? null : result.description || `Telegram HTTP ${result.status}.`,
  };
}

function inferSymbolFromTicker(ticker: string): EmaFibSymbol | null {
  const clean = ticker.toUpperCase().replace(/[^A-Z0-9!]/g, "");
  if (clean === "SPY") return "SPY";
  if (clean.includes("SPX500") || clean === "SPX") return "SPX";
  if (clean === "ES" || clean === "ES1!" || clean.startsWith("ES")) return "ES";
  return null;
}

function expandTradingViewCompactPayload(payload: TradingViewCompactPayload): unknown {
  const direction = payload.directionCode >= 0 ? "long" : "short";
  const kind = kindFromCode(payload.kindCode);
  const modeCode = Math.round(payload.confirmationModeCode);
  const confirmationMode =
    modeCode === 1 ? "pre_cross_touch" : modeCode === 3 ? "ema50_straddle" : "post_cross_retest";
  const touchCandle =
    confirmationMode === "pre_cross_touch" &&
    isRealValue(payload.touchOpen) &&
    isRealValue(payload.touchHigh) &&
    isRealValue(payload.touchLow) &&
    isRealValue(payload.touchClose)
      ? {
          open: payload.touchOpen,
          high: payload.touchHigh,
          low: payload.touchLow,
          close: payload.touchClose,
        }
      : null;

  return {
    schemaVersion: 1,
    source: "tradingview",
    strategy:
      Math.round(payload.fastEmaLength) === 21 && Math.round(payload.slowEmaLength) === 50
        ? "ema21_ema50_fib50_continuation"
        : "ema_fast_ema50_fib_continuation",
    symbol: inferSymbolFromTicker(payload.ticker) ?? "SPX",
    ticker: payload.ticker,
    timeframe: payload.timeframe,
    eventAt: normalizeEventAt(payload.eventAt),
    kind,
    direction,
    last: payload.last,
    fastEmaLength: Math.round(payload.fastEmaLength),
    slowEmaLength: Math.round(payload.slowEmaLength),
    ema21: payload.ema21,
    ema50: payload.ema50,
    pivotLow: payload.pivotLow,
    pivotHigh: payload.pivotHigh,
    shallowFib: payload.shallowFib,
    deepFib: payload.deepFib,
    fibDeep: payload.fibDeep,
    fib618: payload.fib618,
    fib50: payload.fib50,
    extension150: payload.extension150,
    targetMultiple: payload.targetMultiple,
    stop: isRealValue(payload.stop) ? payload.stop : null,
    candle: {
      open: payload.open,
      high: payload.high,
      low: payload.low,
      close: payload.close,
    },
    confirmationMode,
    touchAt: touchCandle ? normalizeEventAt(payload.eventAt) : null,
    touchCandle,
  };
}

function expandTradingViewPhonePayload(payload: TradingViewPhonePayload): unknown {
  const direction = directionFromPhonePayload(payload);
  const kind = kindFromPhonePayload(payload.kind);
  const fib50 = realOr(payload.entryTrigger, payload.last);
  const fibDeep = realOr(payload.entryDeep, fib50);
  const pivotLow = realOr(payload.pivotLow, payload.last - 0.01);
  const pivotHighCandidate = realOr(payload.pivotHigh, payload.last + 0.01);
  const pivotHigh = pivotHighCandidate > pivotLow ? pivotHighCandidate : pivotLow + 0.01;
  const extension =
    realOr(payload.target1618, null) ??
    realOr(payload.target150, null) ??
    realOr(payload.target1786, null) ??
    payload.last;
  const targetMultipleValue =
    typeof payload.target1618 === "number" && Number.isFinite(payload.target1618)
      ? 1.618
      : typeof payload.target150 === "number" && Number.isFinite(payload.target150)
        ? 1.5
        : typeof payload.target1786 === "number" && Number.isFinite(payload.target1786)
          ? 1.786
          : 1.618;

  return {
    schemaVersion: 2,
    source: "tradingview",
    strategy: "spy_prophet",
    symbol: symbolFromPhonePayload(payload),
    ticker: payload.ticker,
    timeframe: payload.timeframe,
    eventAt: normalizeEventAt(payload.eventAt),
    kind,
    direction,
    last: payload.last,
    fastEmaLength: 21,
    slowEmaLength: 50,
    ema21: realOr(payload.ema21, payload.last),
    ema50: realOr(payload.ema50, payload.last),
    pivotLow,
    pivotHigh,
    shallowFib: 0.5,
    deepFib: 0.786,
    fibDeep,
    fib618: fibDeep,
    fib50,
    extension150: extension,
    target: extension,
    targetMultiple: targetMultipleValue,
    targetFar: realOr(payload.target1786, extension),
    stop: typeof payload.stop === "number" && Number.isFinite(payload.stop) ? payload.stop : null,
    targetOptionPricing: "estimate_only_confirm_live_chain",
    spxAnchor: typeof payload.spxProxy === "number" && Number.isFinite(payload.spxProxy) ? payload.spxProxy : undefined,
    vix: typeof payload.vix === "number" && Number.isFinite(payload.vix) ? payload.vix : null,
    vixRegime: payload.vixRegime,
    telegramTitle: payload.phoneTitle,
    telegramText: payload.note,
    humanAction: actionFromPhoneKind(kind),
    candle: {
      open: payload.last,
      high: payload.last,
      low: payload.last,
      close: payload.last,
    },
    confirmationMode: modeFromPhonePayload(payload),
    note: payload.note,
    phoneMode: payload.mode,
    contractSide: payload.contractSide,
    conservativeStrike: payload.conservativeStrike,
    cheaperStrike: payload.cheaperStrike,
  };
}

function kindFromCode(value: number): EmaFibAlertPayload["kind"] {
  switch (Math.round(value)) {
    case 1:
      return "ema_cross";
    case 2:
      return "fib50_armed";
    case 3:
      return "entry";
    case 4:
      return "exit_target";
    case 5:
      return "invalidated";
    case 6:
      return "exit_timeout";
    default:
      return "ema_cross";
  }
}

function kindFromPhonePayload(value: string): EmaFibAlertPayload["kind"] {
  const normalized = value.toLowerCase().trim();
  switch (normalized) {
    case "price_cross_50":
    case "ema_cross":
    case "ema_cross_21_50":
    case "reload_cross":
    case "tokyo_cross":
    case "fib50_armed":
    case "reload_zone":
    case "tokyo_zone":
    case "fib50_rejection":
    case "entry":
    case "reload_entry":
    case "tokyo_entry":
    case "exit_target":
    case "invalidated":
    case "exit_timeout":
      return normalized;
    default:
      return "ema_cross";
  }
}

function directionFromPhonePayload(payload: TradingViewPhonePayload): EmaFibDirection {
  const text = `${payload.side ?? ""} ${payload.contractSide ?? ""} ${payload.note ?? ""}`.toLowerCase();
  if (text.includes("short") || text.includes("put") || text.includes(" p")) return "short";
  return "long";
}

function symbolFromPhonePayload(payload: TradingViewPhonePayload): EmaFibSymbol {
  const normalized = payload.symbol?.toUpperCase();
  if (normalized === "SPY" || normalized === "SPX" || normalized === "ES") return normalized;
  return inferSymbolFromTicker(payload.ticker) ?? "SPX";
}

function modeFromPhonePayload(payload: TradingViewPhonePayload): EmaFibAlertPayload["confirmationMode"] {
  const mode = payload.mode?.toLowerCase() ?? "";
  const kind = payload.kind.toLowerCase();
  if (mode.includes("afternoon")) {
    return kind.includes("entry") ? "afternoon_reload_retest" : "afternoon_reload";
  }
  if (mode.includes("tokyo")) {
    return kind.includes("entry") ? "tokyo_futures_retest" : "tokyo_futures";
  }
  return "post_cross_retest";
}

function actionFromPhoneKind(kind: EmaFibAlertPayload["kind"]): string {
  if (kind === "price_cross_50") return "Get ready only. Wait for 21/50 cross and Fib pocket confirmation.";
  if (kind === "ema_cross" || kind === "ema_cross_21_50" || kind === "reload_cross" || kind === "tokyo_cross") {
    return "Map is armed. Wait for the entry pocket and close confirmation.";
  }
  if (isZoneKind(kind)) return "Price is in the pocket. Wait for the confirmation close.";
  if (isEntryKind(kind)) return "Enter now only if spread and liquidity are acceptable.";
  if (kind === "exit_target") return "Exit now. Planned target touched.";
  if (kind === "invalidated") return "Stand down. The setup is invalid.";
  if (kind === "exit_timeout") return "Flatten or stand down. Trade window closed.";
  return "Watch only.";
}

function realOr(value: number | null | undefined, fallback: number): number;
function realOr(value: number | null | undefined, fallback: null): number | null;
function realOr(value: number | null | undefined, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRealValue(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > EMPTY_SENTINEL;
}

function normalizeEventAt(value: string | undefined): string {
  if (value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function addPayloadNote(payload: EmaFibAlertPayload, lines: string[]): string[] {
  const note = payload.note?.trim();
  return note ? [...lines, `Note: ${note}`] : lines;
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
      .filter(Boolean)
      .map((row) => JSON.parse(row) as T);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

function fmt(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTimeframe(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "1" || normalized === "1m" || normalized === "1min") return "1m";
  return value;
}

function emaPair(payload: EmaFibAlertPayload): string {
  return `${payload.fastEmaLength}/${payload.slowEmaLength}`;
}

function fibDeepLevel(payload: EmaFibAlertPayload): number | null {
  return payload.fib618 ?? payload.fibDeep ?? payload.fib382 ?? null;
}

function entryNearRatio(payload: EmaFibAlertPayload): number {
  const value = payload.shallowFib;
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1
    ? value
    : 0.5;
}

function entryDeepRatio(payload: EmaFibAlertPayload): number {
  const value = payload.deepFib;
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1
    ? value
    : 0.618;
}

function formatRatioPercent(value: number): string {
  const pct = value * 100;
  return Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1);
}

function entryBandLabel(payload: EmaFibAlertPayload): string {
  return `${formatRatioPercent(entryNearRatio(payload))}-${formatRatioPercent(entryDeepRatio(payload))}`;
}

function targetMultiple(payload: EmaFibAlertPayload): number {
  if (typeof payload.targetMultiple === "number" && Number.isFinite(payload.targetMultiple)) {
    return payload.targetMultiple;
  }

  const range = payload.pivotHigh - payload.pivotLow;
  if (!(range > 0)) return 1.5;

  const inferred =
    payload.direction === "long"
      ? (payload.extension150 - payload.pivotLow) / range
      : (payload.pivotHigh - payload.extension150) / range;

  return Number.isFinite(inferred) && inferred > 1 ? inferred : 1.5;
}

function targetLabel(payload: EmaFibAlertPayload): string {
  return `Fib ${targetMultiple(payload).toFixed(3)}`;
}

function isEntryKind(kind: EmaFibAlertPayload["kind"]): boolean {
  return kind === "entry" || kind === "fib50_rejection" || kind === "reload_entry" || kind === "tokyo_entry";
}

function isZoneKind(kind: EmaFibAlertPayload["kind"]): boolean {
  return kind === "fib50_armed" || kind === "reload_zone" || kind === "tokyo_zone";
}

function isPreCrossTouchMode(mode: EmaFibAlertPayload["confirmationMode"]): boolean {
  return mode === "pre_cross_touch" || mode === "afternoon_reload_pre_cross_touch" || mode === "tokyo_futures_pre_cross_touch";
}

function priorityFromKind(kind: EmaFibAlertPayload["kind"]): "watch" | "armed" | "entry" | "exit" | "invalid" {
  if (isEntryKind(kind)) return "entry";
  if (isZoneKind(kind)) return "armed";
  if (kind === "exit_target" || kind === "exit_timeout") return "exit";
  if (kind === "invalidated") return "invalid";
  return "watch";
}

function parseAlertRecord(value: string): EmaFibAlertRecord | null {
  try {
    const parsed = EmaFibAlertRecord.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

async function redisCommand<T = unknown>(command: Array<string | number>): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Redis command failed with HTTP ${res.status}.`);
  }

  const body = (await res.json().catch(() => null)) as { result?: T } | null;
  return body?.result ?? null;
}
