import { getSectorRate, getTickerClassification, getTrackedTickers } from "./data";
import {
  buildRejectionCandidate,
  buildTradeSetup,
  calculateDistancePts,
  calculateMainLine,
  calculateSlopePtsPerHour,
  countStockProjectionHoursBetween,
  ctLocalToUtcDate,
  detectPivotsFromCandles,
  determineActiveLine,
  determineStockSetupBias,
  evaluateStockSetupBiasFlip,
  getCtDateKey,
  STOCK_CASH_CLOSE_HOUR_CT,
  STOCK_REFERENCE_HOUR_CT,
} from "./engine";
import type {
  LineProjection,
  StockCandle,
  StockEngineSnapshot,
  StockPivot,
} from "./types";

export const STOCK_VALIDATION_PRICES: Record<string, number> = {
  AAPL: 299,
  NVDA: 225.32,
  TSLA: 418,
  META: 614.23,
  GOOGL: 395.19,
  GOOG: 395.19,
  PLTR: 133.04,
  SPY: 739.17,
  JPM: 297.58,
  GS: 946.5,
  BAC: 49.71,
  JNJ: 226.9,
  LLY: 980,
  XOM: 157.94,
  CVX: 186.89,
  WMT: 132.01,
  COST: 1005.5,
  PG: 141.66,
};

const SESSION_DATE = "2026-05-15";
const PRIOR_DATE = "2026-05-14";
const AS_OF_ISO = ctIso(SESSION_DATE, 11);
const DETECTED_AT_ISO = ctIso(SESSION_DATE, 7);

export type StockPreviewOverride = {
  primaryHigh: number;
  primaryTimestamp: string;
} | null;

export function buildStockEngineSnapshot(
  tickerInput = "AAPL",
  override: StockPreviewOverride = null,
): StockEngineSnapshot {
  const ticker = normalizeTicker(tickerInput);
  const classification = getTickerClassification(ticker);
  const sectorRate = getSectorRate(classification.sector);
  const currentPrice = validationPriceFor(ticker);
  const slopePts = calculateSlopePtsPerHour(currentPrice, sectorRate.slope_rate);
  const distancePts = calculateDistancePts(currentPrice, sectorRate.distance_rate);
  const posture = postureForTicker(ticker);
  const desiredMainAtAsOf =
    currentPrice + (posture === "bearish" ? distancePts * 0.28 : -distancePts * 0.22);
  const primaryTimestamp = ctIso(PRIOR_DATE, 10);
  const hoursFromPrimary = countStockProjectionHoursBetween(
    new Date(primaryTimestamp),
    new Date(AS_OF_ISO),
  );
  const generatedPrimaryHigh = desiredMainAtAsOf + slopePts * hoursFromPrimary;
  const priorCandles = buildPriorDayCandles({
    ticker,
    currentPrice,
    distancePts,
    primaryHigh: generatedPrimaryHigh,
  });
  const detected = detectPivotsFromCandles({
    ticker,
    candles: priorCandles,
    detectedAt: DETECTED_AT_ISO,
  });
  const primaryPivot = override
    ? {
        ...detected.primary,
        id: `${ticker}-primary-manual-${getCtDateKey(new Date(override.primaryTimestamp))}`,
        pivot_high: override.primaryHigh,
        pivot_timestamp: override.primaryTimestamp,
        detection_method: "manual_override" as const,
        source: "user" as const,
      }
    : detected.primary;
  const secondaryPivot = detected.secondary;
  const sessionId = `${SESSION_DATE}:stocks:${ticker.toLowerCase()}`;
  const planningIso = ctIso(SESSION_DATE, 5);
  const openIso = ctIso(SESSION_DATE, 8, 30);
  const currentMain = calculateMainLine(
    primaryPivot.pivot_high,
    new Date(primaryPivot.pivot_timestamp),
    new Date(AS_OF_ISO),
    slopePts,
  );
  const openMain = calculateMainLine(
    primaryPivot.pivot_high,
    new Date(primaryPivot.pivot_timestamp),
    new Date(openIso),
    slopePts,
  );
  const planningMain = calculateMainLine(
    primaryPivot.pivot_high,
    new Date(primaryPivot.pivot_timestamp),
    new Date(planningIso),
    slopePts,
  );
  const planningPrice =
    posture === "bearish"
      ? planningMain + distancePts * 0.18
      : planningMain - distancePts * 0.18;
  const openPrice =
    posture === "bearish"
      ? openMain - distancePts * 0.18
      : openMain + distancePts * 0.18;
  const initialBias = determineStockSetupBias(planningPrice, planningMain);
  const currentProjection = projectAt({
    sessionId,
    timestamp: AS_OF_ISO,
    anchor: primaryPivot,
    slopePts,
    distancePts,
    currentPrice,
  });
  const intradayCandles = buildCurrentDayCandles({
    ticker,
    currentPrice,
    distancePts,
    activeLine: currentProjection.active_line,
    linePrice: lineValue(currentProjection, currentProjection.active_line),
    posture,
  });
  const latestCandle = intradayCandles[intradayCandles.length - 2];
  const candidate = buildRejectionCandidate({
    sessionId,
    candle: latestCandle,
    lineTested: currentProjection.active_line,
    linePrice: lineValue(currentProjection, currentProjection.active_line),
  });
  const setup = buildTradeSetup({
    sessionId,
    candidate,
    entryTimestamp: ctIso(SESSION_DATE, 11),
    entryPrice: latestCandle.close,
    mainLine: currentProjection.main_line,
    upper2Line: currentProjection.upper_2_line,
    upperLine: currentProjection.upper_line,
    lowerLine: currentProjection.lower_line,
    lower2Line: currentProjection.lower_2_line,
    nextOpenPrice: intradayCandles[intradayCandles.length - 1].open,
  });
  const flipCheck = evaluateStockSetupBiasFlip({
    currentBias: initialBias,
    candle: latestCandle,
    mainLine: currentProjection.main_line,
  });
  const decision = setup?.chase_guard_active
    ? "Chase Guard"
    : setup
      ? "Trade Allowed"
      : "Wait for Setup";
  const verdict =
    setup?.setup_type === "put" ? "SHORT" : setup?.setup_type === "call" ? "LONG" : "NEUTRAL";
  const confidenceBase =
    classification.classification_confidence === "confirmed" ? 84 : 74;
  const conviction = Math.min(
    92,
    confidenceBase +
      (candidate.pattern_matched !== "none" ? 5 : 0) -
      (sectorRate.high_vol_extension_multiplier ? 4 : 0),
  );

  return {
    ticker,
    classification,
    sectorRate,
    session: {
      id: sessionId,
      ticker,
      session_date: SESSION_DATE,
      primary_pivot_id: primaryPivot.id,
      secondary_pivot_id: secondaryPivot?.id ?? null,
      sector: classification.sector,
      current_price: currentPrice,
      slope_rate: sectorRate.slope_rate,
      distance_rate: sectorRate.distance_rate,
      slope_pts_per_hour: slopePts,
      distance_pts: distancePts,
      open_price: openPrice,
      bias_reference_price: planningPrice,
      bias_reference_main_line: planningMain,
      bias_reference_timestamp: planningIso,
      bias_reference_kind: "preopen_to_9",
      initial_bias: initialBias,
      current_bias: flipCheck.bias,
      bias_flipped: flipCheck.flipped,
      status: "model_preview",
    },
    primaryPivot,
    secondaryPivot,
    projections: buildProjectionSeries({
      sessionId,
      anchor: primaryPivot,
      slopePts,
      distancePts,
      currentPrice,
    }),
    currentProjection,
    candles: intradayCandles,
    latestCandidate: candidate.pattern_matched === "none" ? null : candidate,
    setup,
    verdict,
    decision,
    conviction,
    dataMode: "validation_fixture",
    dataAsOf: AS_OF_ISO,
    dataSourceLabel: "Validation fixture",
    dataWarning:
      "Planning-only model path. Production Stocks reads should use the live market connection with hourly pivots.",
    notes: buildNotes({
      ticker,
      highVol: Boolean(sectorRate.high_vol_extension_multiplier),
      inferred: classification.classification_confidence === "inferred",
      manualOverride: Boolean(override),
    }),
  };
}

export function getDefaultStockTicker(): string {
  return getTrackedTickers().includes("AAPL") ? "AAPL" : getTrackedTickers()[0];
}

function buildProjectionSeries({
  sessionId,
  anchor,
  slopePts,
  distancePts,
  currentPrice,
}: {
  sessionId: string;
  anchor: StockPivot;
  slopePts: number;
  distancePts: number;
  currentPrice: number;
}): LineProjection[] {
  const hours = Array.from(
    { length: STOCK_CASH_CLOSE_HOUR_CT - STOCK_REFERENCE_HOUR_CT + 1 },
    (_, index) => index + STOCK_REFERENCE_HOUR_CT,
  );
  return hours.map((hour) =>
    projectAt({
      sessionId,
      timestamp: ctIso(SESSION_DATE, hour),
      anchor,
      slopePts,
      distancePts,
      currentPrice,
    }),
  );
}

function projectAt({
  sessionId,
  timestamp,
  anchor,
  slopePts,
  distancePts,
  currentPrice,
}: {
  sessionId: string;
  timestamp: string;
  anchor: StockPivot;
  slopePts: number;
  distancePts: number;
  currentPrice: number;
}): LineProjection {
  const main = calculateMainLine(
    anchor.pivot_high,
    new Date(anchor.pivot_timestamp),
    new Date(timestamp),
    slopePts,
  );
  return {
    session_id: sessionId,
    timestamp,
    upper_2_line: main + distancePts * 2,
    main_line: main,
    upper_line: main + distancePts,
    lower_line: main - distancePts,
    lower_2_line: main - distancePts * 2,
    active_line: determineActiveLine(currentPrice, main, distancePts),
  };
}

function lineValue(projection: LineProjection, line: LineProjection["active_line"]): number {
  if (line === "upper_2") return projection.upper_2_line;
  if (line === "upper") return projection.upper_line;
  if (line === "lower") return projection.lower_line;
  if (line === "lower_2") return projection.lower_2_line;
  return projection.main_line;
}

function buildPriorDayCandles({
  ticker,
  currentPrice,
  distancePts,
  primaryHigh,
}: {
  ticker: string;
  currentPrice: number;
  distancePts: number;
  primaryHigh: number;
}): StockCandle[] {
  const seed = tickerSeed(ticker);
  const hours = [8, 9, 10, 11, 12, 13, 14];
  return hours.map((hour, index) => {
    const primary = hour === 10;
    const secondary = hour === 13;
    const wave = Math.sin((index + seed) / 2.4) * distancePts * 0.18;
    const high = primary
      ? primaryHigh
      : secondary
        ? primaryHigh - distancePts * 0.38
        : primaryHigh - distancePts * (0.58 + index * 0.08) + wave;
    const open = high - distancePts * (0.18 + (index % 2) * 0.05);
    const close = high - distancePts * (0.12 + (index % 3) * 0.04);
    const low = Math.min(open, close) - distancePts * 0.18;
    return {
      timestamp: ctIso(PRIOR_DATE, hour),
      open: roundPrice(open, currentPrice),
      high: roundPrice(high, currentPrice),
      low: roundPrice(low, currentPrice),
      close: roundPrice(close, currentPrice),
    };
  });
}

function buildCurrentDayCandles({
  ticker,
  currentPrice,
  distancePts,
  activeLine,
  linePrice,
  posture,
}: {
  ticker: string;
  currentPrice: number;
  distancePts: number;
  activeLine: string;
  linePrice: number;
  posture: "bullish" | "bearish";
}): StockCandle[] {
  const seed = tickerSeed(ticker);
  const firstOpen = currentPrice + (posture === "bearish" ? distancePts * 0.42 : -distancePts * 0.35);
  const firstClose = currentPrice + (posture === "bearish" ? distancePts * 0.22 : -distancePts * 0.2);
  const secondOpen = currentPrice + Math.sin(seed) * distancePts * 0.08;
  const secondClose = currentPrice + (posture === "bearish" ? -distancePts * 0.02 : distancePts * 0.04);
  const rejection =
    posture === "bearish"
      ? {
          open: linePrice - distancePts * 0.22,
          high: linePrice + distancePts * 0.08,
          low: linePrice - distancePts * 0.34,
          close: linePrice - distancePts * 0.04,
        }
      : {
          open: linePrice + distancePts * 0.22,
          high: linePrice + distancePts * 0.34,
          low: linePrice - distancePts * 0.08,
          close: linePrice + distancePts * 0.04,
        };
  const nextOpen =
    posture === "bearish"
      ? rejection.close - distancePts * 0.14
      : rejection.close + distancePts * 0.14;
  const raw = [
    { timestamp: ctIso(SESSION_DATE, 8), open: firstOpen, high: Math.max(firstOpen, firstClose) + distancePts * 0.18, low: Math.min(firstOpen, firstClose) - distancePts * 0.15, close: firstClose },
    { timestamp: ctIso(SESSION_DATE, 9), open: secondOpen, high: Math.max(secondOpen, secondClose) + distancePts * 0.14, low: Math.min(secondOpen, secondClose) - distancePts * 0.16, close: secondClose },
    { timestamp: ctIso(SESSION_DATE, 10), ...rejection },
    { timestamp: ctIso(SESSION_DATE, 11), open: nextOpen, high: nextOpen + distancePts * 0.2, low: nextOpen - distancePts * 0.18, close: nextOpen + (posture === "bearish" ? -distancePts * 0.08 : distancePts * 0.08) },
  ];
  void activeLine;
  return raw.map((candle) => ({
    timestamp: candle.timestamp,
    open: roundPrice(candle.open, currentPrice),
    high: roundPrice(candle.high, currentPrice),
    low: roundPrice(candle.low, currentPrice),
    close: roundPrice(candle.close, currentPrice),
  }));
}

function buildNotes({
  ticker,
  highVol,
  inferred,
  manualOverride,
}: {
  ticker: string;
  highVol: boolean;
  inferred: boolean;
  manualOverride: boolean;
}): string[] {
  return [
    `${ticker} is prepared for the next equity session read.`,
    highVol
      ? "Momentum names can stretch after a clean rejection, so the slate keeps extra expansion room visible."
      : "The read keeps the active band and nearby expansion zones visible.",
    inferred
      ? "This symbol is included in the curated expansion list."
      : "This symbol is confirmed for the current equity engine release.",
    manualOverride
      ? "Primary anchor is using a local manual override for this browser session."
      : "Primary and secondary anchors are prepared automatically.",
  ];
}

function validationPriceFor(ticker: string): number {
  if (STOCK_VALIDATION_PRICES[ticker]) return STOCK_VALIDATION_PRICES[ticker];
  const classification = getTickerClassification(ticker);
  const defaults: Record<string, number> = {
    index_etf: 739.17,
    healthcare: 226.9,
    financials: 297.58,
    energy: 157.94,
    tech_mega_cap: 299,
    consumer_staples: 141.66,
    high_vol_momentum: 133.04,
  };
  return defaults[classification.sector];
}

function postureForTicker(ticker: string): "bullish" | "bearish" {
  return tickerSeed(ticker) % 2 === 0 ? "bullish" : "bearish";
}

function tickerSeed(ticker: string): number {
  return ticker.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function normalizeTicker(ticker: string): string {
  const normalized = ticker.trim().toUpperCase();
  return getTrackedTickers().includes(normalized) ? normalized : getDefaultStockTicker();
}

function ctIso(dateKey: string, hour: number, minute = 0): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return ctLocalToUtcDate(year, month, day, hour, minute).toISOString();
}

function roundPrice(value: number, reference: number): number {
  const decimals = reference >= 500 ? 2 : 2;
  return Number(value.toFixed(decimals));
}
