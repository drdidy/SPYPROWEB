import { getCryptoCalibration } from "./data";
import {
  buildCryptoProjection,
  buildCryptoRejectionCandidate,
  buildCryptoTradeSetup,
  calculateCryptoMainLine,
  cryptoSessionStatus,
  detectCryptoPivotsFromCandles,
  determineCryptoBias,
  evaluateCryptoBiasFlip,
  getNyDateKey,
  getNyParts,
  isCurrentNyEntryCandle,
  isNyActiveSessionCandle,
  nyLocalToUtcDate,
} from "./engine";
import type {
  CryptoBias,
  CryptoCandle,
  CryptoEngineSnapshot,
  CryptoLineKey,
  CryptoPivot,
  CryptoProjection,
  CryptoRejectionCandidate,
} from "./types";

type CoinbaseTicker = {
  price?: string;
  time?: string;
  bid?: string;
  ask?: string;
};

const COINBASE_BASE = "https://api.exchange.coinbase.com";
const COINBASE_CACHE_TTL_MS = 30_000;
const COINBASE_CANDLE_WINDOW_HOURS = 96;

const cache = new Map<string, { expiresAt: number; value: unknown }>();

export async function buildCoinbaseCryptoSnapshot(
  assetInput = "BTC",
  replayDate: string | null = null,
): Promise<CryptoEngineSnapshot> {
  const calibration = getCryptoCalibration(assetInput);
  const replayNow =
    replayDate && /^\d{4}-\d{2}-\d{2}$/.test(replayDate)
      ? new Date(`${replayDate}T23:59:00-04:00`)
      : null;
  const now = replayNow ?? new Date();
  const [ticker, rawCandles] = await Promise.all([
    replayNow ? Promise.resolve(null) : fetchCoinbaseTicker(calibration.productId).catch(() => null),
    fetchCoinbaseCandles(calibration.productId, now),
  ]);
  const candles = rawCandles.filter(isSaneCandle);
  if (candles.length < 4) {
    throw new Error(`${calibration.asset} returned no usable hourly candles.`);
  }

  const livePrice = ticker?.price ? Number(ticker.price) : NaN;
  const latestCandle = candles.at(-1)!;
  const currentPrice =
    !replayNow && Number.isFinite(livePrice) && livePrice > 0 ? roundPrice(livePrice) : latestCandle.close;
  const dataAsOf =
    !replayNow && ticker?.time && Number.isFinite(Date.parse(ticker.time))
      ? new Date(ticker.time).toISOString()
      : latestCandle.timestamp;
  const sessionDate = getNyDateKey(now);
  const anchorDate = resolveAnchorSessionDate(candles, now);
  const anchorCandles = candles
    .filter(isNyActiveSessionCandle)
    .filter((candle) => getNyDateKey(new Date(candle.timestamp)) === anchorDate);
  const detectedAt = new Date().toISOString();
  const detected = detectCryptoPivotsFromCandles({
    asset: calibration.asset,
    candles: anchorCandles,
    detectedAt,
  });
  const primaryPivot = detected.primary;
  const secondaryPivot = detected.secondary;
  const sessionId = `${sessionDate}:crypto:${calibration.asset.toLowerCase()}`;
  const chartCandles = appendLiveCandle(
    candles.filter((candle) => Date.parse(candle.timestamp) >= Date.now() - 72 * 36e5),
    currentPrice,
    dataAsOf,
  );
  const currentProjection = buildCryptoProjection({
    sessionId,
    timestamp: dataAsOf,
    anchor: primaryPivot,
    slopePtsPerHour: calibration.slopePtsPerHour,
    deviationPts: calibration.deviationPts,
    currentPrice,
  });
  const projections = buildProjectionSeries({
    sessionId,
    candles: chartCandles,
    anchor: primaryPivot,
    slopePtsPerHour: calibration.slopePtsPerHour,
    deviationPts: calibration.deviationPts,
    currentPrice,
  });

  const currentSessionCandles = candles.filter(
    (candle) => getNyDateKey(new Date(candle.timestamp)) === sessionDate,
  );
  const completedSessionCandles = currentSessionCandles.filter(
    (candle) => Date.parse(candle.timestamp) + 36e5 <= Date.parse(dataAsOf),
  );
  const openCandle =
    currentSessionCandles.find((candle) => getNyParts(new Date(candle.timestamp)).hour === 8) ??
    null;
  const openMain = openCandle
    ? calculateCryptoMainLine({
        anchorPrice: primaryPivot.pivot_close,
        anchorTimestamp: new Date(primaryPivot.pivot_timestamp),
        currentTimestamp: new Date(openCandle.timestamp),
        slopePtsPerHour: calibration.slopePtsPerHour,
      })
    : null;
  const initialBias =
    openCandle && openMain !== null ? determineCryptoBias(openCandle.open, openMain) : null;
  const currentBias = evaluateCurrentBias({
    initialBias,
    candles: completedSessionCandles,
    primaryPivot,
    slopePtsPerHour: calibration.slopePtsPerHour,
  });
  const latestCandidate = latestCryptoRejectionCandidate({
    sessionId,
    sessionDate,
    candles: completedSessionCandles,
    primaryPivot,
    slopePtsPerHour: calibration.slopePtsPerHour,
    deviationPts: calibration.deviationPts,
  });
  const setup = latestCandidate
    ? buildSetupForCandidate({
        sessionId,
        candidate: latestCandidate,
        candles: currentSessionCandles,
        primaryPivot,
        slopePtsPerHour: calibration.slopePtsPerHour,
        deviationPts: calibration.deviationPts,
        currentPrice,
      })
    : null;
  const status = cryptoSessionStatus(now);
  const activeSetup = status === "off_hours" && !replayNow ? null : setup;
  const decision = activeSetup?.chase_guard_active
    ? "Chase Guard"
    : activeSetup
      ? "Trade Allowed"
      : status === "off_hours" && !replayNow
        ? "Off Hours"
        : "Wait for Setup";
  const verdict =
    activeSetup?.setup_type === "long"
      ? "LONG"
      : activeSetup?.setup_type === "short"
        ? "SHORT"
        : "NEUTRAL";
  const conviction = Math.min(
    92,
    76 +
      (ticker ? 6 : 0) +
      (latestCandidate ? 7 : 0) +
      (latestCandidate?.window === "primary" ? 4 : 0) -
      (status === "off_hours" ? 8 : 0),
  );

  return {
    asset: calibration.asset,
    calibration,
    session: {
      id: sessionId,
      asset: calibration.asset,
      session_date: sessionDate,
      anchor_session_date: anchorDate,
      current_price: currentPrice,
      open_price: openCandle?.open ?? null,
      initial_bias: initialBias,
      current_bias: currentBias.bias,
      bias_flipped: currentBias.flipped,
      status,
    },
    primaryPivot,
    secondaryPivot,
    projections,
    candles: chartCandles,
    currentProjection,
    latestCandidate,
    setup: activeSetup,
    verdict,
    decision,
    conviction,
    dataMode: ticker && !replayNow ? "coinbase_live" : "coinbase_candles",
    dataAsOf,
    dataSourceLabel: ticker ? "Live crypto feed" : "Structure feed",
    dataWarning: ticker
      ? "Live crypto feed drives current price and decisions. Hourly candles provide the New York session anchor."
      : "Live crypto tick is unavailable. Structure remains visible, but live entries stay gated until the feed recovers.",
    notes: [
      "Premium Crypto Engine is limited to BTC and ETH in this release.",
      "New York active session anchors are detected from the highest bearish hourly close.",
      "Private crypto calibration stays server-side.",
    ],
  };
}

async function fetchCoinbaseTicker(productId: string): Promise<CoinbaseTicker> {
  return fetchJson<CoinbaseTicker>(`${COINBASE_BASE}/products/${productId}/ticker`, {
    ttlMs: 8_000,
  });
}

async function fetchCoinbaseCandles(productId: string, now: Date): Promise<CryptoCandle[]> {
  const end = now.toISOString();
  const start = new Date(now.getTime() - COINBASE_CANDLE_WINDOW_HOURS * 36e5).toISOString();
  const url = new URL(`${COINBASE_BASE}/products/${productId}/candles`);
  url.searchParams.set("granularity", "3600");
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  const rows = await fetchJson<unknown[]>(url.toString(), { ttlMs: COINBASE_CACHE_TTL_MS });
  return rows
    .map(parseCoinbaseCandle)
    .filter((candle): candle is CryptoCandle => candle !== null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

async function fetchJson<T>(url: string, { ttlMs }: { ttlMs: number }): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "SPYProphet/1.0 (+https://www.spyprophet.app)",
    },
  });
  if (!res.ok) {
    throw new Error(`Crypto market feed returned HTTP ${res.status}.`);
  }
  const value = (await res.json()) as T;
  cache.set(url, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

function parseCoinbaseCandle(row: unknown): CryptoCandle | null {
  if (!Array.isArray(row) || row.length < 5) return null;
  const [time, low, high, open, close, volume] = row.map(Number);
  if (![time, low, high, open, close].every(Number.isFinite)) return null;
  return {
    timestamp: new Date(time * 1000).toISOString(),
    open: roundPrice(open),
    high: roundPrice(high),
    low: roundPrice(low),
    close: roundPrice(close),
    volume: Number.isFinite(volume) ? volume : undefined,
  };
}

function resolveAnchorSessionDate(candles: CryptoCandle[], now: Date): string {
  const activeDates = [
    ...new Set(candles.filter(isNyActiveSessionCandle).map((candle) => getNyDateKey(new Date(candle.timestamp)))),
  ].sort();
  const today = getNyDateKey(now);
  const status = cryptoSessionStatus(now);
  const preferred = status === "off_hours" ? today : addDays(today, -1);
  return activeDates.filter((date) => date <= preferred).at(-1) ?? activeDates.at(-1) ?? preferred;
}

function buildProjectionSeries({
  sessionId,
  candles,
  anchor,
  slopePtsPerHour,
  deviationPts,
  currentPrice,
}: {
  sessionId: string;
  candles: CryptoCandle[];
  anchor: CryptoPivot;
  slopePtsPerHour: number;
  deviationPts: number;
  currentPrice: number;
}): CryptoProjection[] {
  const first = candles[0]?.timestamp ?? anchor.pivot_timestamp;
  const last = candles.at(-1)?.timestamp ?? new Date().toISOString();
  const start = Math.min(Date.parse(first), Date.parse(anchor.pivot_timestamp));
  const end = Math.max(Date.parse(last) + 4 * 36e5, start + 12 * 36e5);
  const count = Math.min(120, Math.max(2, Math.ceil((end - start) / 36e5) + 1));
  return Array.from({ length: count }, (_, index) =>
    buildCryptoProjection({
      sessionId,
      timestamp: new Date(start + index * 36e5).toISOString(),
      anchor,
      slopePtsPerHour,
      deviationPts,
      currentPrice,
    }),
  );
}

function latestCryptoRejectionCandidate({
  sessionId,
  sessionDate,
  candles,
  primaryPivot,
  slopePtsPerHour,
  deviationPts,
}: {
  sessionId: string;
  sessionDate: string;
  candles: CryptoCandle[];
  primaryPivot: CryptoPivot;
  slopePtsPerHour: number;
  deviationPts: number;
}): CryptoRejectionCandidate | null {
  const candidates = candles
    .filter((candle) => isCurrentNyEntryCandle(candle, sessionDate))
    .map((candle) => {
      const projection = buildCryptoProjection({
        sessionId,
        timestamp: candle.timestamp,
        anchor: primaryPivot,
        slopePtsPerHour,
        deviationPts,
        currentPrice: candle.close,
      });
      const line = lineValue(projection, projection.active_line);
      return buildCryptoRejectionCandidate({
        sessionId,
        candle,
        lineTested: projection.active_line,
        linePrice: line,
      });
    })
    .filter((candidate) => candidate.pattern_matched !== "none");
  return candidates.at(-1) ?? null;
}

function buildSetupForCandidate({
  sessionId,
  candidate,
  candles,
  primaryPivot,
  slopePtsPerHour,
  deviationPts,
  currentPrice,
}: {
  sessionId: string;
  candidate: CryptoRejectionCandidate;
  candles: CryptoCandle[];
  primaryPivot: CryptoPivot;
  slopePtsPerHour: number;
  deviationPts: number;
  currentPrice: number;
}) {
  const candidateIndex = candles.findIndex(
    (candle) => candle.timestamp === candidate.candle_timestamp,
  );
  const nextCandle = candidateIndex >= 0 ? candles[candidateIndex + 1] : null;
  const entryTimestamp =
    nextCandle?.timestamp ?? new Date(Date.parse(candidate.candle_timestamp) + 36e5).toISOString();
  const entryPrice = nextCandle?.open ?? currentPrice;
  const projection = buildCryptoProjection({
    sessionId,
    timestamp: candidate.candle_timestamp,
    anchor: primaryPivot,
    slopePtsPerHour,
    deviationPts,
    currentPrice: candidate.candle_close,
  });
  return buildCryptoTradeSetup({
    sessionId,
    candidate,
    entryTimestamp,
    entryPrice,
    currentPrice,
    mainLine: projection.main_line,
    upperLine: projection.upper_line,
    lowerLine: projection.lower_line,
    deviationPts,
  });
}

function evaluateCurrentBias({
  initialBias,
  candles,
  primaryPivot,
  slopePtsPerHour,
}: {
  initialBias: CryptoBias | null;
  candles: CryptoCandle[];
  primaryPivot: CryptoPivot;
  slopePtsPerHour: number;
}): { bias: CryptoBias | null; flipped: boolean } {
  if (!initialBias) return { bias: null, flipped: false };
  let bias = initialBias;
  let flipped = false;
  for (const candle of candles) {
    const mainLine = calculateCryptoMainLine({
      anchorPrice: primaryPivot.pivot_close,
      anchorTimestamp: new Date(primaryPivot.pivot_timestamp),
      currentTimestamp: new Date(candle.timestamp),
      slopePtsPerHour,
    });
    const result = evaluateCryptoBiasFlip({ currentBias: bias, candle, mainLine });
    bias = result.bias;
    flipped = flipped || result.flipped;
  }
  return { bias, flipped };
}

function appendLiveCandle(
  candles: CryptoCandle[],
  currentPrice: number,
  dataAsOf: string,
): CryptoCandle[] {
  const last = candles.at(-1);
  if (!last || Date.parse(dataAsOf) <= Date.parse(last.timestamp)) return candles;
  return [
    ...candles,
    {
      timestamp: dataAsOf,
      open: last.close,
      high: Math.max(last.close, currentPrice),
      low: Math.min(last.close, currentPrice),
      close: currentPrice,
    },
  ];
}

function lineValue(projection: CryptoProjection, line: CryptoLineKey): number {
  if (line === "upper") return projection.upper_line;
  if (line === "lower") return projection.lower_line;
  return projection.main_line;
}

function isSaneCandle(candle: CryptoCandle): boolean {
  return (
    candle.open > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0 &&
    candle.high >= candle.low
  );
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function roundPrice(value: number): number {
  return Number(value.toFixed(4));
}
