import type {
  CryptoBias,
  CryptoCandle,
  CryptoLineKey,
  CryptoPivot,
  CryptoProjection,
  CryptoRejectionCandidate,
  CryptoRejectionPattern,
  CryptoTradeSetup,
} from "./types";

const NY_TIME_ZONE = "America/New_York";
const NY_SESSION_START_HOUR = 8;
const NY_SESSION_EXTENSION_HOUR = 12;
const NY_SESSION_END_HOUR = 17;

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function calculateCryptoMainLine({
  anchorPrice,
  anchorTimestamp,
  currentTimestamp,
  slopePtsPerHour,
}: {
  anchorPrice: number;
  anchorTimestamp: Date;
  currentTimestamp: Date;
  slopePtsPerHour: number;
}): number {
  const hours = Math.max(0, (currentTimestamp.getTime() - anchorTimestamp.getTime()) / 36e5);
  return anchorPrice - slopePtsPerHour * hours;
}

export function determineActiveCryptoLine(
  currentPrice: number,
  mainLine: number,
  deviationPts: number,
): CryptoLineKey {
  if (currentPrice > mainLine + deviationPts) return "upper";
  if (currentPrice < mainLine - deviationPts) return "lower";
  return "main";
}

export function determineCryptoBias(openPrice: number, mainLine: number): CryptoBias {
  if (openPrice > mainLine) return "bullish";
  if (openPrice < mainLine) return "bearish";
  return "neutral";
}

export function detectCryptoPivotsFromCandles({
  asset,
  candles,
  detectedAt,
}: {
  asset: string;
  candles: CryptoCandle[];
  detectedAt: string;
}): { primary: CryptoPivot; secondary: CryptoPivot | null } {
  const bearishCandles = candles.filter((candle) => candle.close < candle.open);
  const sorted = [...bearishCandles].sort((a, b) => {
    if (b.close !== a.close) return b.close - a.close;
    return Date.parse(a.timestamp) - Date.parse(b.timestamp);
  });
  const primaryCandle = sorted[0];
  if (!primaryCandle) {
    throw new Error(`${asset} has no bearish New York active-session candles for anchor detection.`);
  }
  const secondaryCandle =
    sorted
      .slice(1)
      .find(
        (candle) =>
          Math.abs(Date.parse(candle.timestamp) - Date.parse(primaryCandle.timestamp)) >=
          2 * 36e5,
      ) ?? null;

  return {
    primary: pivotFromCandle(asset, primaryCandle, "primary", detectedAt),
    secondary: secondaryCandle
      ? pivotFromCandle(asset, secondaryCandle, "secondary", detectedAt)
      : null,
  };
}

export function buildCryptoProjection({
  sessionId,
  timestamp,
  anchor,
  slopePtsPerHour,
  deviationPts,
  currentPrice,
}: {
  sessionId: string;
  timestamp: string;
  anchor: CryptoPivot;
  slopePtsPerHour: number;
  deviationPts: number;
  currentPrice: number;
}): CryptoProjection {
  const main = calculateCryptoMainLine({
    anchorPrice: anchor.pivot_close,
    anchorTimestamp: new Date(anchor.pivot_timestamp),
    currentTimestamp: new Date(timestamp),
    slopePtsPerHour,
  });
  return {
    session_id: sessionId,
    timestamp,
    main_line: roundPrice(main),
    upper_line: roundPrice(main + deviationPts),
    lower_line: roundPrice(main - deviationPts),
    active_line: determineActiveCryptoLine(currentPrice, main, deviationPts),
  };
}

export function detectCryptoRejectionPattern(
  candle: CryptoCandle,
  linePrice: number,
): CryptoRejectionPattern {
  const bullish = candle.close > candle.open;
  const bearish = candle.close < candle.open;
  const touched = candle.low <= linePrice && candle.high >= linePrice;
  if (!touched) return "none";
  if (bullish && candle.open < linePrice && candle.close < linePrice) {
    return "short_rejection";
  }
  if (bearish && candle.open > linePrice && candle.close > linePrice) {
    return "long_rejection";
  }
  return "none";
}

export function buildCryptoRejectionCandidate({
  sessionId,
  candle,
  lineTested,
  linePrice,
}: {
  sessionId: string;
  candle: CryptoCandle;
  lineTested: CryptoLineKey;
  linePrice: number;
}): CryptoRejectionCandidate {
  return {
    session_id: sessionId,
    candle_timestamp: candle.timestamp,
    candle_open: candle.open,
    candle_high: candle.high,
    candle_low: candle.low,
    candle_close: candle.close,
    candle_color: candle.close >= candle.open ? "bullish" : "bearish",
    line_tested: lineTested,
    line_price_at_candle: roundPrice(linePrice),
    pattern_matched: detectCryptoRejectionPattern(candle, linePrice),
    window: isPrimaryWindow(candle.timestamp) ? "primary" : "extension",
  };
}

export function buildCryptoTradeSetup({
  sessionId,
  candidate,
  entryTimestamp,
  entryPrice,
  currentPrice,
  mainLine,
  upperLine,
  lowerLine,
  deviationPts,
}: {
  sessionId: string;
  candidate: CryptoRejectionCandidate;
  entryTimestamp: string;
  entryPrice: number;
  currentPrice: number;
  mainLine: number;
  upperLine: number;
  lowerLine: number;
  deviationPts: number;
}): CryptoTradeSetup | null {
  if (candidate.pattern_matched === "none") return null;
  const setupType = candidate.pattern_matched === "short_rejection" ? "short" : "long";
  const target = targetForSetup(setupType, candidate.line_tested, {
    main: mainLine,
    upper: upperLine,
    lower: lowerLine,
    deviationPts,
  });
  const stopBuffer = Math.max(Math.abs(entryPrice) * 0.001, deviationPts * 0.02);
  const stop =
    setupType === "short"
      ? candidate.candle_high + stopBuffer
      : candidate.candle_low - stopBuffer;
  const distanceToTarget = Math.abs(entryPrice - target.price);
  const progressFromEntry =
    setupType === "short" ? entryPrice - currentPrice : currentPrice - entryPrice;
  const chaseGuardActive = progressFromEntry > distanceToTarget * 0.5;
  const breakeven =
    setupType === "short"
      ? entryPrice - distanceToTarget * 0.5
      : entryPrice + distanceToTarget * 0.5;

  return {
    session_id: sessionId,
    setup_type: setupType,
    rejection_candle_timestamp: candidate.candle_timestamp,
    entry_timestamp: entryTimestamp,
    entry_price: roundPrice(entryPrice),
    target_price: roundPrice(target.price),
    target_line: target.line,
    stop_price: roundPrice(stop),
    breakeven_trigger_price: roundPrice(breakeven),
    chase_guard_active: chaseGuardActive,
    status: chaseGuardActive ? "invalidated" : "pending",
  };
}

export function evaluateCryptoBiasFlip({
  currentBias,
  candle,
  mainLine,
}: {
  currentBias: CryptoBias;
  candle: CryptoCandle;
  mainLine: number;
}): { bias: CryptoBias; flipped: boolean } {
  if (currentBias === "bearish" && candle.high > mainLine && candle.close > mainLine) {
    return { bias: "bullish", flipped: true };
  }
  if (currentBias === "bullish" && candle.low < mainLine && candle.close < mainLine) {
    return { bias: "bearish", flipped: true };
  }
  return { bias: currentBias, flipped: false };
}

export function getNyDateKey(date: Date): string {
  const parts = getNyParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getNyParts(date: Date) {
  const bag: Record<string, string> = {};
  for (const part of nyFormatter.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function nyLocalToUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = nyOffsetMs(new Date(utcMs));
    utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(utcMs);
}

export function isNyActiveSessionCandle(candle: CryptoCandle): boolean {
  const { hour } = getNyParts(new Date(candle.timestamp));
  return hour >= NY_SESSION_START_HOUR && hour < NY_SESSION_END_HOUR;
}

export function isCurrentNyEntryCandle(candle: CryptoCandle, sessionDate: string): boolean {
  if (getNyDateKey(new Date(candle.timestamp)) !== sessionDate) return false;
  const { hour } = getNyParts(new Date(candle.timestamp));
  return hour >= NY_SESSION_START_HOUR && hour < NY_SESSION_END_HOUR;
}

export function cryptoSessionStatus(now: Date): "pre_session" | "ny_active" | "ny_extension" | "off_hours" {
  const { hour, minute } = getNyParts(now);
  const minutes = hour * 60 + minute;
  if (minutes < NY_SESSION_START_HOUR * 60) return "pre_session";
  if (minutes < NY_SESSION_EXTENSION_HOUR * 60) return "ny_active";
  if (minutes < NY_SESSION_END_HOUR * 60) return "ny_extension";
  return "off_hours";
}

export function sessionWindowLabel(status: ReturnType<typeof cryptoSessionStatus>): string {
  if (status === "pre_session") return "Pre-session";
  if (status === "ny_active") return "NY primary";
  if (status === "ny_extension") return "NY extension";
  return "Off hours";
}

function pivotFromCandle(
  asset: string,
  candle: CryptoCandle,
  role: CryptoPivot["pivot_role"],
  detectedAt: string,
): CryptoPivot {
  return {
    id: `${asset.toUpperCase()}-${role}-${getNyDateKey(new Date(candle.timestamp))}-${Date.parse(candle.timestamp)}`,
    asset: asset.toUpperCase() as CryptoPivot["asset"],
    pivot_role: role,
    pivot_close: candle.close,
    pivot_open: candle.open,
    pivot_high: candle.high,
    pivot_low: candle.low,
    pivot_timestamp: candle.timestamp,
    detected_at: detectedAt,
    source: "coinbase_exchange",
  };
}

function isPrimaryWindow(iso: string): boolean {
  const { hour } = getNyParts(new Date(iso));
  return hour >= NY_SESSION_START_HOUR && hour < NY_SESSION_EXTENSION_HOUR;
}

function targetForSetup(
  setupType: "short" | "long",
  line: CryptoLineKey,
  levels: { main: number; upper: number; lower: number; deviationPts: number },
): { price: number; line: CryptoLineKey } {
  if (setupType === "short") {
    if (line === "upper") return { price: levels.main, line: "main" };
    if (line === "main") return { price: levels.lower, line: "lower" };
    return { price: levels.lower - levels.deviationPts, line: "lower" };
  }
  if (line === "lower") return { price: levels.main, line: "main" };
  if (line === "main") return { price: levels.upper, line: "upper" };
  return { price: levels.upper + levels.deviationPts, line: "upper" };
}

function nyOffsetMs(date: Date): number {
  const parts = getNyParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function roundPrice(value: number): number {
  return Number(value.toFixed(4));
}
