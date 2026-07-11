import { getSectorRate, getTickerCalibration, getTickerClassification } from "./data";
import {
  aggregateToDisplayedHourCandles,
  buildRejectionCandidate,
  buildTradeSetup,
  calculateMainLine,
  chooseDominantRejectionCandidate,
  ctLocalToUtcDate,
  detectPivotsFromCandles,
  determineActiveLine,
  determineStockPlanningBias,
  evaluateStockSetupBiasFlip,
  getCtDateKey,
  getCtParts,
  isStockTradingDateKey,
  nextStockTradingDateKey,
  STOCK_CASH_CLOSE_HOUR_CT,
  STOCK_REFERENCE_HOUR_CT,
} from "./engine";
import { fetchTastytradeEquityQuote, hasTastytradeQuoteConfig } from "./tastytrade";
import { fetchSchwabEquityQuote, hasSchwabQuoteConfig } from "./schwab";
import type {
  LineProjection,
  RejectionCandidate,
  StockBias,
  StockCandle,
  StockEngineSnapshot,
  StockLineKey,
  StockPivot,
} from "./types";

export type StockAnchorOverride = {
  primaryHigh: number;
  primaryTimestamp: string;
} | null;

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[];
    error?: { code?: string; description?: string } | null;
  };
};

type YahooChartResult = {
  meta?: {
    symbol?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
    }>;
  };
};

const YAHOO_CACHE_TTL_MS = 60_000;
const YAHOO_FETCH_ATTEMPTS = 3;
const yahooChartCache = new Map<
  string,
  { expiresAt: number; result: YahooChartResult }
>();

export async function buildYahooStockEngineSnapshot(
  tickerInput = "AAPL",
  override: StockAnchorOverride = null,
  replayDate: string | null = null,
): Promise<StockEngineSnapshot> {
  const ticker = tickerInput.trim().toUpperCase();
  const classification = getTickerClassification(ticker);
  const tickerCalibration = getTickerCalibration(ticker);
  const sectorRate = getSectorRate(classification.sector);
  const [chart, tastytradeQuote, schwabQuote] = await Promise.all([
    fetchYahooChart(ticker),
    fetchTastytradeEquityQuote(ticker),
    fetchSchwabEquityQuote(ticker),
  ]);
  const tastytradeConfigured = hasTastytradeQuoteConfig();
  const schwabConfigured = hasSchwabQuoteConfig();
  const liveQuote = schwabQuote ?? tastytradeQuote;
  const liveProvider = schwabQuote ? "schwab" : tastytradeQuote ? "tastytrade" : null;
  const rawCandles = parseYahooCandles(chart).filter(isSaneCandle);
  const delayedReferencePrice = roundPrice(
    chart.meta?.regularMarketPrice || rawCandles.at(-1)?.close || 0,
  );
  const referencePrice = roundPrice(liveQuote?.price ?? delayedReferencePrice);
  const sourceCandles = filterCandlesNearReference(rawCandles, referencePrice);
  const rthCandles = aggregateToDisplayedHourCandles(
    sourceCandles.filter(isRegularSessionComponentCandle),
  );
  const displayCandles = aggregateToDisplayedHourCandles(
    sourceCandles.filter(isDisplayWindowCandle),
  );

  if (displayCandles.length < 2 || rthCandles.length < 1) {
    throw new Error(`Yahoo returned no usable hourly candles for ${ticker}.`);
  }

  const rthByDate = groupByDate(rthCandles);
  const displayByDate = groupByDate(displayCandles);
  const latestRthDate = latestDateKey(rthByDate);
  const latestDisplayDate = latestDateKey(displayByDate) ?? latestRthDate;
  if (!latestDisplayDate || !latestRthDate) {
    throw new Error(`Market structure returned no usable display-window candles for ${ticker}.`);
  }

  const rthDates = [...rthByDate.keys()].sort();
  const requestedSessionDate =
    replayDate && /^\d{4}-\d{2}-\d{2}$/.test(replayDate) ? replayDate : null;
  const sessionDate = requestedSessionDate ?? resolveStockSessionDate(latestRthDate);
  const isPlanningSession = (rthByDate.get(sessionDate)?.length ?? 0) === 0;
  const sessionHasRth = !isPlanningSession;
  const priorDate = sessionHasRth
    ? previousDateKey(rthDates, sessionDate)
    : latestRthDate;

  if (!priorDate) {
    throw new Error(`Market structure returned no prior regular-session candles for ${ticker}.`);
  }

  const chartCandles =
    displayByDate.get(sessionDate) ??
    displayByDate.get(latestRthDate) ??
    rthByDate.get(latestRthDate) ??
    [];
  const latestSessionCandle = chartCandles.at(-1) ?? displayCandles.at(-1);
  if (!latestSessionCandle) {
    throw new Error(`Market structure returned no current-session candles for ${ticker}.`);
  }

  const delayedCurrentPrice = roundPrice(
    chart.meta?.regularMarketPrice || latestSessionCandle.close || sourceCandles.at(-1)!.close,
  );
  const isReplaySession = Boolean(requestedSessionDate);
  const currentPrice = roundPrice(
    isReplaySession ? latestSessionCandle.close : liveQuote?.price ?? delayedCurrentPrice,
  );
  const priorCandles = rthByDate.get(priorDate) ?? [];
  const detectedAt = new Date().toISOString();
  const detected = detectPivotsFromCandles({
    ticker,
    candles: priorCandles,
    detectedAt,
  });
  const primaryPivot = override
    ? applyManualOverride(ticker, detected.primary, override, detectedAt)
    : markPivotSource(detected.primary, "yahoo_finance");
  const secondaryPivot = detected.secondary
    ? markPivotSource(detected.secondary, "yahoo_finance")
    : null;
  assertPivotLooksSane(ticker, primaryPivot, currentPrice);
  const calibrationPrice = roundPrice(priorCandles.at(-1)?.close ?? currentPrice);
  const slopePts = tickerCalibration.slope_pts_per_hour;
  const distancePts = tickerCalibration.distance_pts;
  const slopeRate = calibrationPrice > 0 ? slopePts / calibrationPrice : sectorRate.slope_rate;
  const distanceRate = calibrationPrice > 0 ? distancePts / calibrationPrice : sectorRate.distance_rate;
  const sessionId = `${sessionDate}:stocks:${ticker.toLowerCase()}`;
  const planningAsOf = sessionPlanningTimestamp(sessionDate);
  const asOf = isReplaySession
    ? latestSessionCandle.timestamp
    : isPlanningSession
    ? planningAsOf
    : liveQuote?.capturedAt ?? latestSessionCandle.timestamp;
  const projections = buildProjectionSeries({
    sessionDate,
    sessionId,
    anchor: primaryPivot,
    slopePts,
    distancePts,
    currentPrice,
  });
  const currentProjection = projectAt({
    sessionId,
    timestamp: asOf,
    anchor: primaryPivot,
    slopePts,
    distancePts,
    currentPrice,
  });

  const sessionRthCandles = rthByDate.get(sessionDate) ?? [];
  const sessionDisplayCandles = displayByDate.get(sessionDate) ?? [];
  const planningBias = determineStockPlanningBias({
    candles: sessionDisplayCandles,
    anchorPrice: primaryPivot.pivot_high,
    anchorTimestamp: new Date(primaryPivot.pivot_timestamp),
    slopePtsPerHour: slopePts,
  });
  const openCandle = sessionRthCandles[0] ?? null;
  const initialBias = planningBias.bias;
  const biasReferencePrice = planningBias.referenceCandle?.close ?? null;
  const biasReferenceMainLine = planningBias.mainLine;
  const biasReferenceTimestamp = planningBias.referenceCandle?.timestamp ?? null;
  const biasReferenceKind = planningBias.referenceCandle ? "preopen_to_9" : null;
  const currentBias = evaluateCurrentBias({
    initialBias,
    candles: sessionRthCandles,
    primaryPivot,
    slopePts,
  });
  const latestCandidate = latestRejectionCandidate({
    sessionId,
    candles: sessionRthCandles,
    primaryPivot,
    slopePts,
    distancePts,
  });
  const setup = latestCandidate
    ? buildSetupForCandidate({
        sessionId,
        candidate: latestCandidate,
        candles: sessionRthCandles,
        primaryPivot,
        slopePts,
        distancePts,
        currentPrice,
      })
    : null;
  const computedDecision = setup?.chase_guard_active
    ? "Chase Guard"
    : setup
      ? "Trade Allowed"
      : "Wait for Setup";
  const decision = liveQuote || isReplaySession ? computedDecision : "Wait for Setup";
  const verdict = liveQuote || isReplaySession
    ? setup?.setup_type === "put"
      ? "SHORT"
      : setup?.setup_type === "call"
        ? "LONG"
        : "NEUTRAL"
    : "NEUTRAL";
  const conviction = Math.min(
    91,
    (classification.classification_confidence === "confirmed" ? 82 : 72) +
      (latestCandidate ? 5 : 0) -
      (sectorRate.high_vol_extension_multiplier ? 4 : 0),
  );

  return {
    ticker,
    classification,
    sectorRate,
    session: {
      id: sessionId,
      ticker,
      session_date: sessionDate,
      primary_pivot_id: primaryPivot.id,
      secondary_pivot_id: secondaryPivot?.id ?? null,
      sector: classification.sector,
      current_price: currentPrice,
      slope_rate: slopeRate,
      distance_rate: distanceRate,
      slope_pts_per_hour: slopePts,
      distance_pts: distancePts,
      open_price: openCandle?.open ?? null,
      bias_reference_price: biasReferencePrice,
      bias_reference_main_line: biasReferenceMainLine,
      bias_reference_timestamp: biasReferenceTimestamp,
      bias_reference_kind: biasReferenceKind,
      initial_bias: initialBias,
      current_bias: currentBias.bias,
      bias_flipped: currentBias.flipped,
      status: isPlanningSession ? "pre_open" : statusForSession(openCandle, asOf),
    },
    primaryPivot,
    secondaryPivot,
    projections,
    currentProjection,
    candles: chartCandles,
    latestCandidate,
    setup,
    verdict,
    decision,
    conviction,
    dataMode: isReplaySession
      ? "validation_fixture"
      : liveQuote
      ? liveProvider === "schwab"
        ? "schwab_live"
        : "tastytrade_live"
      : tastytradeConfigured || schwabConfigured
        ? "yahoo_delayed"
        : "live_feed_required",
    dataAsOf: asOf,
    dataSourceLabel: liveQuote
      ? liveProvider === "schwab"
        ? "Live market quote"
        : liveQuote.source === "dxlink"
        ? "Live market stream"
        : "Live market quote"
      : tastytradeConfigured || schwabConfigured
        ? "Backup structure"
        : "Trade-day read pending",
    dataWarning: liveQuote
      ? liveProvider === "schwab"
        ? "Live market quote is primary for current price and decisions. Hourly candles remain the prior-session pivot source."
        : liveQuote.source === "dxlink"
        ? "Live market stream is primary for current price and decisions. Hourly candles remain the prior-session pivot source."
        : "Live market quote is primary for current price and decisions. Hourly candles remain the prior-session pivot source."
      : tastytradeConfigured || schwabConfigured
        ? "Primary live quote is unavailable. Hourly structure is shown as a backup read, but live entries stay gated until the feed recovers."
        : "The next trade-day read is pending. Structure remains visible for planning.",
    notes: [
      liveQuote
        ? liveProvider === "schwab"
          ? "Live market quote drives current price, active line, and decision slate."
          : liveQuote.source === "dxlink"
          ? "Live market stream drives current price, active line, and decision slate."
          : "Live market quote drives current price, active line, and decision slate."
        : tastytradeConfigured || schwabConfigured
          ? "Primary live quote is unavailable; hourly structure is shown only as a backup read."
          : "The trade-day read must activate before Stocks issues live trade reads.",
      "Hourly candles provide prior-session pivots and structure history.",
      "Only high-confidence calibrated tickers are available in this release.",
      `Ticker calibration uses the recent ${tickerCalibration.lookback_days}-day validation set.`,
      ...(override ? ["Manual primary anchor override is active for this read."] : []),
    ],
  };
}

async function fetchYahooChart(ticker: string): Promise<YahooChartResult> {
  const cached = yahooChartCache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
  );
  url.searchParams.set("range", "10d");
  url.searchParams.set("interval", "30m");
  url.searchParams.set("includePrePost", "true");
  url.searchParams.set("events", "div,splits");

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= YAHOO_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SPYProphet/1.0; +https://www.spyprophet.app)",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Yahoo returned HTTP ${res.status} for ${ticker}.`);
      }

      const body = (await res.json()) as YahooChartResponse;
      const result = parseYahooResult(ticker, body);
      yahooChartCache.set(ticker, {
        expiresAt: Date.now() + YAHOO_CACHE_TTL_MS,
        result,
      });
      return result;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(`Yahoo request failed for ${ticker}.`);
      if (attempt < YAHOO_FETCH_ATTEMPTS) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError ?? new Error(`Yahoo request failed for ${ticker}.`);
}

function parseYahooResult(
  ticker: string,
  body: YahooChartResponse,
): YahooChartResult {
  const error = body.chart?.error;
  if (error) {
    throw new Error(error.description ?? error.code ?? "Yahoo chart error.");
  }
  const result = body.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo returned an empty chart for ${ticker}.`);
  }
  return result;
}

function parseYahooCandles(result: YahooChartResult): StockCandle[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];

  return timestamps
    .map((seconds, index) => {
      const open = finiteOrNull(opens[index]);
      const high = finiteOrNull(highs[index]);
      const low = finiteOrNull(lows[index]);
      const close = finiteOrNull(closes[index]);
      if (open === null || high === null || low === null || close === null) {
        return null;
      }
      return {
        timestamp: new Date(seconds * 1000).toISOString(),
        open: roundPrice(open),
        high: roundPrice(high),
        low: roundPrice(low),
        close: roundPrice(close),
      };
    })
    .filter((item): item is StockCandle => item !== null);
}

function latestRejectionCandidate({
  sessionId,
  candles,
  primaryPivot,
  slopePts,
  distancePts,
}: {
  sessionId: string;
  candles: StockCandle[];
  primaryPivot: StockPivot;
  slopePts: number;
  distancePts: number;
}): RejectionCandidate | null {
  const candidates = candles
    .filter(isMorningEntryCandle)
    .map((candle) => {
      const projection = projectAt({
        sessionId,
        timestamp: candle.timestamp,
        anchor: primaryPivot,
        slopePts,
        distancePts,
        currentPrice: candle.close,
      });
      return chooseDominantRejectionCandidate(
        (["lower_2", "lower", "main", "upper", "upper_2"] as const)
          .map((lineTested) =>
            buildRejectionCandidate({
              sessionId,
              candle,
              lineTested,
              linePrice: lineValue(projection, lineTested),
            }),
          )
          .filter((candidate) => candidate.pattern_matched !== "none"),
      );
    })
    .filter((candidate): candidate is RejectionCandidate => candidate !== null);

  return candidates.at(-1) ?? null;
}

function buildSetupForCandidate({
  sessionId,
  candidate,
  candles,
  primaryPivot,
  slopePts,
  distancePts,
  currentPrice,
}: {
  sessionId: string;
  candidate: RejectionCandidate;
  candles: StockCandle[];
  primaryPivot: StockPivot;
  slopePts: number;
  distancePts: number;
  currentPrice: number;
}) {
  const candidateIndex = candles.findIndex(
    (candle) => candle.timestamp === candidate.candle_timestamp,
  );
  const nextCandle = candidateIndex >= 0 ? candles[candidateIndex + 1] : null;
  const entryTimestamp =
    nextCandle?.timestamp ?? new Date(Date.parse(candidate.candle_timestamp) + 36e5).toISOString();
  const entryPrice = nextCandle?.open ?? candidate.candle_close;
  const nextOpenPrice = nextCandle?.open ?? currentPrice;
  const entryProjection = projectAt({
    sessionId,
    timestamp: entryTimestamp,
    anchor: primaryPivot,
    slopePts,
    distancePts,
    currentPrice: entryPrice,
  });

  const setup = buildTradeSetup({
    sessionId,
    candidate,
    entryTimestamp,
    entryPrice,
    mainLine: entryProjection.main_line,
    upper2Line: entryProjection.upper_2_line,
    upperLine: entryProjection.upper_line,
    lowerLine: entryProjection.lower_line,
    lower2Line: entryProjection.lower_2_line,
    nextOpenPrice,
  });
  return applyLiveChaseGuard({ setup, candidate });
}

function applyLiveChaseGuard({
  setup,
  candidate,
}: {
  setup: ReturnType<typeof buildTradeSetup>;
  candidate: RejectionCandidate;
}) {
  if (!setup) return null;
  const movedFromRejectionClose =
    setup.setup_type === "put"
      ? candidate.candle_close - setup.entry_price
      : setup.entry_price - candidate.candle_close;
  const halfDistanceFromClose = Math.abs(candidate.candle_close - setup.target_price) * 0.5;
  const chaseGuardActive = movedFromRejectionClose > halfDistanceFromClose;
  const blocked = setup.chase_guard_active || chaseGuardActive;
  return {
    ...setup,
    chase_guard_active: blocked,
    status: blocked ? "invalidated" : setup.status,
  };
}

function evaluateCurrentBias({
  initialBias,
  candles,
  primaryPivot,
  slopePts,
}: {
  initialBias: StockBias | null;
  candles: StockCandle[];
  primaryPivot: StockPivot;
  slopePts: number;
}): { bias: StockBias | null; flipped: boolean } {
  if (!initialBias) return { bias: null, flipped: false };
  let bias = initialBias;
  let flipped = false;
  for (const candle of candles) {
    const mainLine = calculateMainLine(
      primaryPivot.pivot_high,
      new Date(primaryPivot.pivot_timestamp),
      new Date(candle.timestamp),
      slopePts,
    );
    const result = evaluateStockSetupBiasFlip({ currentBias: bias, candle, mainLine });
    bias = result.bias;
    flipped = flipped || result.flipped;
  }
  return { bias, flipped };
}

function buildProjectionSeries({
  sessionDate,
  sessionId,
  anchor,
  slopePts,
  distancePts,
  currentPrice,
}: {
  sessionDate: string;
  sessionId: string;
  anchor: StockPivot;
  slopePts: number;
  distancePts: number;
  currentPrice: number;
}): LineProjection[] {
  const [year, month, day] = sessionDate.split("-").map(Number);
  return Array.from(
    { length: STOCK_CASH_CLOSE_HOUR_CT - STOCK_REFERENCE_HOUR_CT + 1 },
    (_, index) => index + STOCK_REFERENCE_HOUR_CT,
  ).map((hour) =>
    projectAt({
      sessionId,
      timestamp: ctLocalToUtcDate(year, month, day, hour).toISOString(),
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

function lineValue(projection: LineProjection, line: StockLineKey): number {
  if (line === "upper_2") return projection.upper_2_line;
  if (line === "upper") return projection.upper_line;
  if (line === "lower") return projection.lower_line;
  if (line === "lower_2") return projection.lower_2_line;
  return projection.main_line;
}

function groupByDate(candles: StockCandle[]): Map<string, StockCandle[]> {
  const out = new Map<string, StockCandle[]>();
  for (const candle of candles) {
    const key = getCtDateKey(new Date(candle.timestamp));
    const bucket = out.get(key) ?? [];
    bucket.push(candle);
    out.set(key, bucket);
  }
  for (const bucket of out.values()) {
    bucket.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }
  return out;
}

function latestDateKey(map: Map<string, StockCandle[]>): string | null {
  return [...map.keys()].sort().at(-1) ?? null;
}

function previousDateKey(sortedKeys: string[], current: string): string | null {
  return sortedKeys.filter((key) => key < current).at(-1) ?? null;
}

function resolveStockSessionDate(latestRthDate: string): string {
  const nowKey = getCtDateKey(new Date());
  if (!isStockTradingDateKey(nowKey)) {
    return nextStockTradingDateKey(latestRthDate);
  }
  if (nowKey > latestRthDate) {
    return nowKey;
  }
  return latestRthDate;
}

function sessionPlanningTimestamp(sessionDate: string): string {
  const [year, month, day] = sessionDate.split("-").map(Number);
  return ctLocalToUtcDate(year, month, day, STOCK_REFERENCE_HOUR_CT).toISOString();
}

function isRegularSessionComponentCandle(candle: StockCandle): boolean {
  const parts = getCtParts(new Date(candle.timestamp));
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 8 * 60 + 30 && minutes < 15 * 60;
}

function isMorningEntryCandle(candle: StockCandle): boolean {
  const parts = getCtParts(new Date(candle.timestamp));
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 9 * 60 && minutes < 12 * 60;
}

function isDisplayWindowCandle(candle: StockCandle): boolean {
  const parts = getCtParts(new Date(candle.timestamp));
  return parts.hour >= 3 && parts.hour < 18;
}

function isSaneCandle(candle: StockCandle): boolean {
  return (
    candle.high >= candle.low &&
    candle.open > 0 &&
    candle.close > 0 &&
    candle.high > 0 &&
    candle.low > 0
  );
}

function filterCandlesNearReference(
  candles: StockCandle[],
  referencePrice: number,
): StockCandle[] {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) return candles;
  const min = referencePrice * 0.2;
  const max = referencePrice * 2.5;
  const maxRange = Math.max(referencePrice * 0.12, 8);
  return candles.filter(
    (candle) =>
      candle.low >= min &&
      candle.high <= max &&
      candle.high - candle.low <= maxRange,
  );
}

function assertPivotLooksSane(
  ticker: string,
  pivot: StockPivot,
  currentPrice: number,
) {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;
  if (pivot.pivot_high < currentPrice * 0.5 || pivot.pivot_high > currentPrice * 1.75) {
    throw new Error(
      `${ticker} pivot looks inconsistent with the current price. Manual review required.`,
    );
  }
}

function statusForSession(
  openCandle: StockCandle | null,
  asOf: string,
): StockEngineSnapshot["session"]["status"] {
  if (!openCandle) return "pre_open";
  const parts = getCtParts(new Date(asOf));
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes < 12 * 60) return "mid_session";
  return "window_closed";
}

function markPivotSource(
  pivot: StockPivot,
  source: "yahoo_finance",
): StockPivot {
  return { ...pivot, source };
}

function applyManualOverride(
  ticker: string,
  detected: StockPivot,
  override: NonNullable<StockAnchorOverride>,
  detectedAt: string,
): StockPivot {
  return {
    ...detected,
    id: `${ticker}-primary-manual-${getCtDateKey(new Date(override.primaryTimestamp))}`,
    pivot_high: roundPrice(override.primaryHigh),
    pivot_timestamp: override.primaryTimestamp,
    detection_method: "manual_override",
    detected_at: detectedAt,
    source: "user",
  };
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundPrice(value: number): number {
  return Number(value.toFixed(4));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
