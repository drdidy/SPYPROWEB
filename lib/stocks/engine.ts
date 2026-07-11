import type {
  RejectionCandidate,
  RejectionPattern,
  StockBias,
  StockCandle,
  StockLineKey,
  StockPivot,
  StockTradeSetup,
} from "./types";

export const MARKET_TIME_ZONE = "America/Chicago";
export const DISPLAY_START_HOUR_CT = 3;
export const DISPLAY_END_HOUR_CT = 18;
export const RTH_START_CANDLE_HOUR_CT = 8;
export const RTH_END_CANDLE_HOUR_CT = 15;
export const STOCK_REFERENCE_HOUR_CT = 9;
export const STOCK_CASH_CLOSE_HOUR_CT = 15;
export const STOCK_BIAS_REFERENCE_START_HOUR_CT = 3;
export const STOCK_BIAS_REFERENCE_END_HOUR_CT = 10;

export class PivotDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PivotDetectionError";
  }
}

type CtParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const ctFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function calculateSlopePtsPerHour(
  currentPrice: number,
  slopeRate: number,
): number {
  return currentPrice * slopeRate;
}

export function calculateDistancePts(
  currentPrice: number,
  distanceRate: number,
): number {
  return currentPrice * distanceRate;
}

export function calculateMainLine(
  anchorPrice: number,
  anchorTimestamp: Date,
  currentTimestamp: Date,
  slopePtsPerHour: number,
): number {
  const displayedHours = countStockProjectionHoursBetween(
    anchorTimestamp,
    currentTimestamp,
  );
  return anchorPrice - slopePtsPerHour * displayedHours;
}

export function countDisplayedHoursBetween(
  start: Date,
  end: Date,
  extraHolidayKeys: ReadonlySet<string> = new Set(),
): number {
  if (end.getTime() <= start.getTime()) return 0;

  let hours = 0;
  let dateKey = getCtDateKey(start);
  const endKey = getCtDateKey(end);

  while (dateKey <= endKey) {
    if (isDisplayedTradingDay(dateKey, extraHolidayKeys)) {
      const parts = parseDateKey(dateKey);
      const windowStart = ctLocalToUtcDate(
        parts.year,
        parts.month,
        parts.day,
        DISPLAY_START_HOUR_CT,
      );
      const windowEnd = ctLocalToUtcDate(
        parts.year,
        parts.month,
        parts.day,
        DISPLAY_END_HOUR_CT,
      );
      const overlapStart = Math.max(start.getTime(), windowStart.getTime());
      const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());
      if (overlapEnd > overlapStart) {
        hours += (overlapEnd - overlapStart) / 36e5;
      }
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return roundTo(hours, 6);
}

export function countStockProjectionHoursBetween(
  start: Date,
  end: Date,
  extraHolidayKeys: ReadonlySet<string> = new Set(),
): number {
  return countDisplayedHoursBetween(start, end, extraHolidayKeys);
}

export function toDisplayedHourTimestamp(timestamp: string): string {
  const parts = getCtParts(new Date(timestamp));
  return ctLocalToUtcDate(parts.year, parts.month, parts.day, parts.hour).toISOString();
}

export function aggregateToDisplayedHourCandles(candles: StockCandle[]): StockCandle[] {
  const sorted = [...candles].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const buckets = new Map<string, StockCandle[]>();

  for (const candle of sorted) {
    const bucketTimestamp = toDisplayedHourTimestamp(candle.timestamp);
    const bucket = buckets.get(bucketTimestamp) ?? [];
    bucket.push(candle);
    buckets.set(bucketTimestamp, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([timestamp, bucket]) => ({
      timestamp,
      open: bucket[0].open,
      high: Math.max(...bucket.map((candle) => candle.high)),
      low: Math.min(...bucket.map((candle) => candle.low)),
      close: bucket.at(-1)!.close,
    }));
}

export function detectPivotsFromCandles({
  ticker,
  candles,
  detectedAt,
}: {
  ticker: string;
  candles: StockCandle[];
  detectedAt: string;
}): { primary: StockPivot; secondary: StockPivot | null } {
  const rthCandles = candles.filter((candle) =>
    isInRthWindow(candle.timestamp),
  );

  if (rthCandles.length === 0) {
    throw new PivotDetectionError(`No RTH candles found for ${ticker}`);
  }

  const bearishRthCandles = rthCandles.filter(isBearishCandle);

  if (bearishRthCandles.length === 0) {
    throw new PivotDetectionError(`No bearish RTH anchor candle found for ${ticker}`);
  }

  const sortedByHigh = [...bearishRthCandles].sort((a, b) => {
    const highDelta = b.high - a.high;
    if (Math.abs(highDelta) > 1e-9) return highDelta;
    return Date.parse(a.timestamp) - Date.parse(b.timestamp);
  });

  const primaryCandle = sortedByHigh[0];
  const secondaryCandle =
    sortedByHigh
      .slice(1)
      .find(
        (candle) =>
          Math.abs(hoursBetween(candle.timestamp, primaryCandle.timestamp)) >=
          2,
      ) ?? null;

  return {
    primary: pivotFromCandle(ticker, "primary", primaryCandle, detectedAt),
    secondary: secondaryCandle
      ? pivotFromCandle(ticker, "secondary", secondaryCandle, detectedAt)
      : null,
  };
}

export function isInRthWindow(timestamp: string): boolean {
  const hour = getCtParts(new Date(timestamp)).hour;
  return hour >= RTH_START_CANDLE_HOUR_CT && hour < RTH_END_CANDLE_HOUR_CT;
}

export function isBearishCandle(candle: StockCandle): boolean {
  return candle.close < candle.open;
}

export function determineActiveLine(
  currentPrice: number,
  mainLine: number,
  distancePts: number,
): StockLineKey {
  if (currentPrice > mainLine + distancePts * 2) return "upper_2";
  if (currentPrice > mainLine + distancePts) return "upper";
  if (currentPrice < mainLine - distancePts * 2) return "lower_2";
  if (currentPrice < mainLine - distancePts) return "lower";
  return "main";
}

export function determineBias(openPrice: number, mainLine: number): StockBias {
  if (openPrice > mainLine) return "bullish";
  if (openPrice < mainLine) return "bearish";
  return "neutral";
}

export function determineStockSetupBias(price: number, mainLine: number): StockBias {
  if (price > mainLine) return "bullish";
  if (price < mainLine) return "bearish";
  return "neutral";
}

export function isInStockBiasReferenceWindow(timestamp: string): boolean {
  const hour = getCtParts(new Date(timestamp)).hour;
  return (
    hour >= STOCK_BIAS_REFERENCE_START_HOUR_CT &&
    hour < STOCK_BIAS_REFERENCE_END_HOUR_CT
  );
}

export function determineStockPlanningBias({
  candles,
  anchorPrice,
  anchorTimestamp,
  slopePtsPerHour,
}: {
  candles: StockCandle[];
  anchorPrice: number;
  anchorTimestamp: Date;
  slopePtsPerHour: number;
}): {
  bias: StockBias | null;
  referenceCandle: StockCandle | null;
  mainLine: number | null;
} {
  const referenceCandle =
    candles
      .filter((candle) => isInStockBiasReferenceWindow(candle.timestamp))
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .at(-1) ?? null;

  if (!referenceCandle) {
    return { bias: null, referenceCandle: null, mainLine: null };
  }

  const mainLine = calculateMainLine(
    anchorPrice,
    anchorTimestamp,
    new Date(referenceCandle.timestamp),
    slopePtsPerHour,
  );

  return {
    bias: determineStockSetupBias(referenceCandle.close, mainLine),
    referenceCandle,
    mainLine,
  };
}

export function evaluateBiasFlip({
  currentBias,
  candle,
  mainLine,
}: {
  currentBias: StockBias;
  candle: StockCandle;
  mainLine: number;
}): { bias: StockBias; flipped: boolean } {
  if (
    currentBias === "bearish" &&
    candle.high > mainLine &&
    candle.close > mainLine
  ) {
    return { bias: "bullish", flipped: true };
  }
  if (
    currentBias === "bullish" &&
    candle.low < mainLine &&
    candle.close < mainLine
  ) {
    return { bias: "bearish", flipped: true };
  }
  return { bias: currentBias, flipped: false };
}

export function evaluateStockSetupBiasFlip({
  currentBias,
  candle,
  mainLine,
}: {
  currentBias: StockBias;
  candle: StockCandle;
  mainLine: number;
}): { bias: StockBias; flipped: boolean } {
  if (
    currentBias === "bearish" &&
    candle.high > mainLine &&
    candle.close > mainLine
  ) {
    return { bias: "bullish", flipped: true };
  }
  if (
    currentBias === "bullish" &&
    candle.low < mainLine &&
    candle.close < mainLine
  ) {
    return { bias: "bearish", flipped: true };
  }
  return { bias: currentBias, flipped: false };
}

export function chooseDominantRejectionCandidate(
  candidates: RejectionCandidate[],
): RejectionCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const shortMatches = candidates.filter(
    (candidate) => candidate.pattern_matched === "short_rejection",
  );
  if (shortMatches.length > 0) {
    return [...shortMatches].sort(
      (a, b) => b.line_price_at_candle - a.line_price_at_candle,
    )[0];
  }

  const longMatches = candidates.filter(
    (candidate) => candidate.pattern_matched === "long_rejection",
  );
  if (longMatches.length > 0) {
    return [...longMatches].sort(
      (a, b) => a.line_price_at_candle - b.line_price_at_candle,
    )[0];
  }

  return null;
}

export function detectRejectionPattern(
  candle: StockCandle,
  linePrice: number,
): RejectionPattern {
  const bullish = candle.close > candle.open;
  const bearish = candle.close < candle.open;
  const touchesFromBelow =
    candle.open < linePrice && candle.high >= linePrice && candle.close < linePrice;
  const touchesFromAbove =
    candle.open > linePrice && candle.low <= linePrice && candle.close > linePrice;

  if (bullish && touchesFromBelow) return "short_rejection";
  if (bearish && touchesFromAbove) return "long_rejection";
  return "none";
}

export function buildRejectionCandidate({
  sessionId,
  candle,
  lineTested,
  linePrice,
}: {
  sessionId: string;
  candle: StockCandle;
  lineTested: StockLineKey;
  linePrice: number;
}): RejectionCandidate {
  return {
    session_id: sessionId,
    candle_timestamp: candle.timestamp,
    candle_open: candle.open,
    candle_high: candle.high,
    candle_low: candle.low,
    candle_close: candle.close,
    candle_color: candle.close >= candle.open ? "bullish" : "bearish",
    line_tested: lineTested,
    line_price_at_candle: linePrice,
    pattern_matched: detectRejectionPattern(candle, linePrice),
  };
}

export function buildTradeSetup({
  sessionId,
  candidate,
  entryTimestamp,
  entryPrice,
  mainLine,
  upper2Line,
  upperLine,
  lowerLine,
  lower2Line,
  nextOpenPrice,
}: {
  sessionId: string;
  candidate: RejectionCandidate;
  entryTimestamp: string;
  entryPrice: number;
  mainLine: number;
  upper2Line: number;
  upperLine: number;
  lowerLine: number;
  lower2Line: number;
  nextOpenPrice: number;
}): StockTradeSetup | null {
  if (candidate.pattern_matched === "none") return null;

  const setup_type = candidate.pattern_matched === "short_rejection" ? "put" : "call";
  const targetLine = targetLineFor(candidate.line_tested, setup_type);
  const targetPrice = linePriceForTarget({
    targetLine,
    mainLine,
    upperLine,
    upper2Line,
    lowerLine,
    lower2Line,
  });
  const stopBuffer = Math.max(entryPrice * 0.001, 0.1);
  const stopPrice =
    setup_type === "put"
      ? candidate.candle_high + stopBuffer
      : candidate.candle_low - stopBuffer;
  const halfDistance = Math.abs(entryPrice - targetPrice) * 0.5;
  const breakeven =
    setup_type === "put" ? entryPrice - halfDistance : entryPrice + halfDistance;
  const movedTowardTarget =
    setup_type === "put" ? entryPrice - nextOpenPrice : nextOpenPrice - entryPrice;
  const chase_guard_active = movedTowardTarget > halfDistance;

  return {
    session_id: sessionId,
    setup_type,
    rejection_candle_timestamp: candidate.candle_timestamp,
    entry_timestamp: entryTimestamp,
    entry_price: entryPrice,
    target_price: targetPrice,
    target_line: targetLine,
    stop_price: stopPrice,
    breakeven_trigger_price: breakeven,
    chase_guard_active,
    status: chase_guard_active ? "invalidated" : "pending",
  };
}

export function getCtDateKey(date: Date): string {
  const parts = getCtParts(date);
  return formatDateKey(parts.year, parts.month, parts.day);
}

export function getCtParts(date: Date): CtParts {
  const bag: Record<string, string> = {};
  for (const part of ctFormatter.formatToParts(date)) {
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

export function ctLocalToUtcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utcMs));
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
  }
  return new Date(utcMs);
}

export function isMarketHolidayDateKey(dateKey: string): boolean {
  const { year } = parseDateKey(dateKey);
  const holidays = new Set([
    ...marketHolidayKeysForYear(year - 1),
    ...marketHolidayKeysForYear(year),
    ...marketHolidayKeysForYear(year + 1),
  ]);
  return holidays.has(dateKey);
}

export function isStockTradingDateKey(dateKey: string): boolean {
  return isDisplayedTradingDay(dateKey, new Set());
}

export function nextStockTradingDateKey(dateKey: string): string {
  let next = addDaysToDateKey(dateKey, 1);
  while (!isStockTradingDateKey(next)) {
    next = addDaysToDateKey(next, 1);
  }
  return next;
}

function isDisplayedTradingDay(
  dateKey: string,
  extraHolidayKeys: ReadonlySet<string>,
): boolean {
  return (
    !isWeekendDateKey(dateKey) &&
    !isMarketHolidayDateKey(dateKey) &&
    !extraHolidayKeys.has(dateKey)
  );
}

function targetLineFor(
  line: StockLineKey,
  setupType: "put" | "call",
): StockLineKey {
  if (setupType === "put") {
    if (line === "upper_2") return "upper";
    if (line === "upper") return "main";
    if (line === "main") return "lower";
    return "lower_2";
  }
  if (line === "lower_2") return "lower";
  if (line === "lower") return "main";
  if (line === "main") return "upper";
  return "upper_2";
}

function linePriceForTarget({
  targetLine,
  mainLine,
  upperLine,
  upper2Line,
  lowerLine,
  lower2Line,
}: {
  targetLine: StockLineKey;
  mainLine: number;
  upperLine: number;
  upper2Line: number;
  lowerLine: number;
  lower2Line: number;
}): number {
  if (targetLine === "upper_2") return upper2Line;
  if (targetLine === "upper") return upperLine;
  if (targetLine === "lower") return lowerLine;
  if (targetLine === "lower_2") return lower2Line;
  return mainLine;
}

function pivotFromCandle(
  ticker: string,
  role: "primary" | "secondary",
  candle: StockCandle,
  detectedAt: string,
): StockPivot {
  return {
    id: `${ticker}-${role}-${getCtDateKey(new Date(candle.timestamp))}`,
    ticker,
    pivot_role: role,
    pivot_high: candle.high,
    pivot_open: candle.open,
    pivot_close: candle.close,
    pivot_low: candle.low,
    pivot_timestamp: candle.timestamp,
    detection_method: "auto",
    detected_at: detectedAt,
    source: "validation_fixture",
  };
}

function hoursBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 36e5;
}

function getTimeZoneOffsetMs(date: Date): number {
  const parts = getCtParts(date);
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUTC - date.getTime();
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(Date.UTC(year, month - 1, day + days, 12));
  return formatDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function isWeekendDateKey(dateKey: string): boolean {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

function marketHolidayKeysForYear(year: number): string[] {
  return [
    observedFixedHoliday(year, 1, 1),
    nthWeekdayOfMonth(year, 1, 1, 3),
    nthWeekdayOfMonth(year, 2, 1, 3),
    addDaysToDateKey(easterSundayKey(year), -2),
    lastWeekdayOfMonth(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekdayOfMonth(year, 9, 1, 1),
    nthWeekdayOfMonth(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
  ];
}

function observedFixedHoliday(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return formatDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): string {
  const d = new Date(Date.UTC(year, month - 1, 1, 12));
  const delta = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(1 + delta + (occurrence - 1) * 7);
  return formatDateKey(year, month, d.getUTCDate());
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const d = new Date(Date.UTC(year, month, 0, 12));
  const delta = (d.getUTCDay() - weekday + 7) % 7;
  d.setUTCDate(d.getUTCDate() - delta);
  return formatDateKey(year, month, d.getUTCDate());
}

function easterSundayKey(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatDateKey(year, month, day);
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
