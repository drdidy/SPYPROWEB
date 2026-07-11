import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(root, request.slice(2)),
      parent,
      isMain,
      options,
    );
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const engine = require("../lib/stocks/engine.ts");
const fixtures = require("../lib/stocks/fixtures.ts");
const tastytrade = require("../lib/stocks/tastytrade.ts");
const schwab = require("../lib/stocks/schwab.ts");
const cryptoEngine = require("../lib/crypto/engine.ts");
const spxProjection = require("../lib/spx-contract-projection.ts");
const canonicalEs = require("../lib/canonical-es.ts");

const {
  aggregateToDisplayedHourCandles,
  buildTradeSetup,
  calculateMainLine,
  calculateSlopePtsPerHour,
  chooseDominantRejectionCandidate,
  countDisplayedHoursBetween,
  countStockProjectionHoursBetween,
  ctLocalToUtcDate,
  detectPivotsFromCandles,
  detectRejectionPattern,
  determineBias,
  determineStockPlanningBias,
  determineStockSetupBias,
  evaluateBiasFlip,
  evaluateStockSetupBiasFlip,
  PivotDetectionError,
} = engine;
const { extractTastytradeEquityPrice } = tastytrade;
const { extractSchwabEquityPrice } = schwab;
const { detectCryptoPivotsFromCandles } = cryptoEngine;
const { buildSpxZoneContractProjections } = spxProjection;
const { canonicalEsLast, canonicalizeEsSnapshot } = canonicalEs;

function ct(year, month, day, hour, minute = 0) {
  return ctLocalToUtcDate(year, month, day, hour, minute);
}

function candle(dateKey, hour, high, open = high - 0.5, close = high - 1, low = high - 2) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    timestamp: ct(year, month, day, hour).toISOString(),
    open,
    high,
    low,
    close,
  };
}

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

// countDisplayedHoursBetween
approx(countDisplayedHoursBetween(ct(2026, 5, 12, 4), ct(2026, 5, 12, 10)), 6);
approx(countDisplayedHoursBetween(ct(2026, 5, 12, 16), ct(2026, 5, 12, 20)), 2);
approx(countDisplayedHoursBetween(ct(2026, 5, 12, 1), ct(2026, 5, 12, 5)), 2);
approx(countDisplayedHoursBetween(ct(2026, 5, 12, 17), ct(2026, 5, 13, 4)), 2);
approx(countDisplayedHoursBetween(ct(2026, 5, 12, 5), ct(2026, 5, 14, 7)), 32);
approx(countDisplayedHoursBetween(ct(2026, 5, 15, 17), ct(2026, 5, 18, 4)), 2);
approx(countDisplayedHoursBetween(ct(2026, 6, 18, 17), ct(2026, 6, 22, 4)), 2);

// Stock projection hours count 3 AM-6 PM CT display time and compress weekends.
approx(countStockProjectionHoursBetween(ct(2026, 5, 15, 12), ct(2026, 5, 18, 9)), 12);
approx(countStockProjectionHoursBetween(ct(2026, 5, 15, 12), ct(2026, 5, 18, 10)), 13);
approx(countStockProjectionHoursBetween(ct(2026, 5, 15, 8), ct(2026, 5, 18, 9)), 16);

// Display-hour candle alignment for stock feeds that arrive on half-hours.
{
  const aligned = aggregateToDisplayedHourCandles([
    { timestamp: ct(2026, 5, 15, 8, 30).toISOString(), open: 100, high: 101, low: 99, close: 100.5 },
    { timestamp: ct(2026, 5, 15, 9).toISOString(), open: 100.5, high: 102, low: 100, close: 101 },
    { timestamp: ct(2026, 5, 15, 9, 30).toISOString(), open: 101, high: 103, low: 100.8, close: 102.5 },
  ]);
  assert.equal(aligned.length, 2);
  assert.equal(aligned[0].timestamp, ct(2026, 5, 15, 8).toISOString());
  assert.equal(aligned[0].high, 101);
  assert.equal(aligned[1].timestamp, ct(2026, 5, 15, 9).toISOString());
  assert.equal(aligned[1].open, 100.5);
  assert.equal(aligned[1].high, 103);
  assert.equal(aligned[1].close, 102.5);
}

// detectPivotsFromCandles anchors from the highest bearish RTH candle wick.
{
  const candles = [
    candle("2026-05-14", 8, 101),
    candle("2026-05-14", 9, 104),
    candle("2026-05-14", 10, 110),
    candle("2026-05-14", 11, 106),
    candle("2026-05-14", 13, 108),
  ];
  const pivots = detectPivotsFromCandles({ ticker: "AAPL", candles, detectedAt: ct(2026, 5, 15, 7).toISOString() });
  assert.equal(pivots.primary.pivot_high, 110);
  assert.equal(pivots.secondary?.pivot_high, 108);
}

{
  const candles = [
    candle("2026-05-14", 8, 101),
    candle("2026-05-14", 9, 112, 110, 111.5),
    candle("2026-05-14", 10, 108),
    candle("2026-05-14", 12, 106),
  ];
  const pivots = detectPivotsFromCandles({ ticker: "AAPL", candles, detectedAt: ct(2026, 5, 15, 7).toISOString() });
  assert.equal(pivots.primary.pivot_high, 108);
  assert.equal(pivots.primary.pivot_timestamp, candles[2].timestamp);
}

{
  const candles = [
    candle("2026-05-14", 8, 110),
    candle("2026-05-14", 10, 110),
    candle("2026-05-14", 13, 106),
  ];
  const pivots = detectPivotsFromCandles({ ticker: "AAPL", candles, detectedAt: ct(2026, 5, 15, 7).toISOString() });
  assert.equal(pivots.primary.pivot_timestamp, candles[0].timestamp);
}

{
  const candles = [
    candle("2026-05-14", 8, 100),
    candle("2026-05-14", 9, 109),
    candle("2026-05-14", 10, 110),
    candle("2026-05-14", 12, 106),
  ];
  const pivots = detectPivotsFromCandles({ ticker: "AAPL", candles, detectedAt: ct(2026, 5, 15, 7).toISOString() });
  assert.equal(pivots.secondary?.pivot_high, 106);
}

{
  const candles = [
    candle("2026-05-14", 9, 108),
    candle("2026-05-14", 10, 110),
    candle("2026-05-14", 11, 109),
  ];
  const pivots = detectPivotsFromCandles({ ticker: "AAPL", candles, detectedAt: ct(2026, 5, 15, 7).toISOString() });
  assert.equal(pivots.secondary, null);
}

assert.throws(
  () => detectPivotsFromCandles({ ticker: "AAPL", candles: [], detectedAt: ct(2026, 5, 15, 7).toISOString() }),
  PivotDetectionError,
);

assert.throws(
  () =>
    detectPivotsFromCandles({
      ticker: "AAPL",
      candles: [
        candle("2026-05-14", 8, 100, 99, 99.5),
        candle("2026-05-14", 9, 105, 103, 104),
      ],
      detectedAt: ct(2026, 5, 15, 7).toISOString(),
    }),
  PivotDetectionError,
);

{
  const candles = [
    candle("2026-05-14", 8, 100),
    candle("2026-05-14", 9, 105),
    candle("2026-05-14", 10, 103),
  ];
  const pivots = detectPivotsFromCandles({ ticker: "AAPL", candles, detectedAt: ct(2026, 5, 15, 7).toISOString() });
  assert.equal(pivots.primary.pivot_high, 105);
}

// Slope validation examples, within 10 percent.
for (const row of [
  ["AAPL", 299, 0.00066, 0.197],
  ["NVDA", 225.32, 0.00066, 0.149],
  ["JPM", 297.58, 0.00049, 0.146],
  ["GS", 946.5, 0.00049, 0.464],
  ["XOM", 157.94, 0.0006, 0.095],
  ["PG", 141.66, 0.001, 0.142],
]) {
  const [ticker, price, rate, expected] = row;
  const actual = calculateSlopePtsPerHour(price, rate);
  assert.ok(Math.abs(actual - expected) / expected <= 0.1, `${ticker} slope failed`);
}

approx(calculateMainLine(303.2, ct(2026, 5, 15, 12), ct(2026, 5, 18, 9), 0.198), 300.824);
approx(calculateMainLine(110, ct(2026, 5, 14, 10), ct(2026, 5, 15, 11), 0.2), 106.8);

// Rejection patterns
assert.equal(
  detectRejectionPattern({ timestamp: ct(2026, 5, 15, 10).toISOString(), open: 99, high: 101, low: 98, close: 99.5 }, 100),
  "short_rejection",
);
assert.equal(
  detectRejectionPattern({ timestamp: ct(2026, 5, 15, 10).toISOString(), open: 101, high: 102, low: 99, close: 100.5 }, 100),
  "long_rejection",
);
assert.equal(
  detectRejectionPattern({ timestamp: ct(2026, 5, 15, 10).toISOString(), open: 99, high: 101, low: 98, close: 100.5 }, 100),
  "none",
);

// Crypto anchors use the highest bearish New York active-session close.
{
  const candles = [
    { timestamp: "2026-05-15T12:00:00.000Z", open: 100, high: 112, low: 99, close: 110 },
    { timestamp: "2026-05-15T13:00:00.000Z", open: 108, high: 109, low: 104, close: 106 },
    { timestamp: "2026-05-15T15:00:00.000Z", open: 105, high: 107, low: 101, close: 103 },
  ];
  const pivots = detectCryptoPivotsFromCandles({
    asset: "BTC",
    candles,
    detectedAt: ct(2026, 5, 15, 7).toISOString(),
  });
  assert.equal(pivots.primary.pivot_close, 106);
  assert.equal(pivots.secondary?.pivot_close, 103);
}

assert.throws(
  () =>
    detectCryptoPivotsFromCandles({
      asset: "ETH",
      candles: [
        { timestamp: "2026-05-15T12:00:00.000Z", open: 100, high: 112, low: 99, close: 110 },
        { timestamp: "2026-05-15T13:00:00.000Z", open: 109, high: 113, low: 108, close: 111 },
      ],
      detectedAt: ct(2026, 5, 15, 7).toISOString(),
    }),
  /no bearish New York active-session candles/,
);

{
  const base = {
    session_id: "x",
    candle_timestamp: ct(2026, 5, 15, 10).toISOString(),
    candle_open: 99,
    candle_high: 103,
    candle_low: 98,
    candle_close: 99.5,
    candle_color: "bullish",
  };
  assert.equal(
    chooseDominantRejectionCandidate([
      { ...base, line_tested: "main", line_price_at_candle: 100, pattern_matched: "short_rejection" },
      { ...base, line_tested: "upper", line_price_at_candle: 102, pattern_matched: "short_rejection" },
    ])?.line_tested,
    "upper",
  );
  assert.equal(
    chooseDominantRejectionCandidate([
      { ...base, line_tested: "lower", line_price_at_candle: 98, pattern_matched: "long_rejection" },
      { ...base, line_tested: "main", line_price_at_candle: 100, pattern_matched: "long_rejection" },
    ])?.line_tested,
    "lower",
  );
}

// Bias and flip rules
assert.equal(determineBias(101, 100), "bullish");
assert.equal(determineBias(99, 100), "bearish");
assert.equal(determineBias(100, 100), "neutral");
assert.equal(determineStockSetupBias(101, 100), "bullish");
assert.equal(determineStockSetupBias(99, 100), "bearish");
assert.equal(determineStockSetupBias(100, 100), "neutral");
{
  const read = determineStockPlanningBias({
    candles: [
      { timestamp: ct(2026, 5, 18, 3).toISOString(), open: 302, high: 302.5, low: 301, close: 301.8 },
      { timestamp: ct(2026, 5, 18, 4).toISOString(), open: 302.2, high: 303.4, low: 302, close: 302.8 },
      { timestamp: ct(2026, 5, 18, 6).toISOString(), open: 306, high: 307, low: 305, close: 306.5 },
      { timestamp: ct(2026, 5, 18, 9).toISOString(), open: 301, high: 301.5, low: 300, close: 300.5 },
    ],
    anchorPrice: 303.2,
    anchorTimestamp: ct(2026, 5, 15, 12),
    slopePtsPerHour: 0.198,
  });
  assert.equal(read.referenceCandle?.timestamp, ct(2026, 5, 18, 9).toISOString());
  assert.equal(read.bias, "bearish");
  approx(read.mainLine, 300.824);
}
{
  const read = determineStockPlanningBias({
    candles: [
      { timestamp: ct(2026, 5, 15, 14).toISOString(), open: 300, high: 301, low: 299, close: 300.5 },
    ],
    anchorPrice: 303.2,
    anchorTimestamp: ct(2026, 5, 15, 12),
    slopePtsPerHour: 0.198,
  });
  assert.equal(read.referenceCandle, null);
  assert.equal(read.bias, null);
  assert.equal(read.mainLine, null);
}
assert.deepEqual(
  evaluateBiasFlip({
    currentBias: "bearish",
    candle: { timestamp: ct(2026, 5, 15, 10).toISOString(), open: 99, high: 101, low: 98, close: 100.5 },
    mainLine: 100,
  }),
  { bias: "bullish", flipped: true },
);
assert.deepEqual(
  evaluateBiasFlip({
    currentBias: "bearish",
    candle: { timestamp: ct(2026, 5, 15, 10).toISOString(), open: 99, high: 101, low: 98, close: 99.5 },
    mainLine: 100,
  }),
  { bias: "bearish", flipped: false },
);
assert.deepEqual(
  evaluateStockSetupBiasFlip({
    currentBias: "bearish",
    candle: { timestamp: ct(2026, 5, 15, 8).toISOString(), open: 99, high: 101, low: 98, close: 100.5 },
    mainLine: 100,
  }),
  { bias: "bullish", flipped: true },
);
assert.deepEqual(
  evaluateStockSetupBiasFlip({
    currentBias: "bullish",
    candle: { timestamp: ct(2026, 5, 15, 8).toISOString(), open: 101, high: 102, low: 99, close: 99.5 },
    mainLine: 100,
  }),
  { bias: "bearish", flipped: true },
);

// Tastytrade live quote parsing stays server-side and tolerates common shapes.
assert.equal(
  extractTastytradeEquityPrice(
    { data: { items: [{ symbol: "AAPL", last: "299.12" }] } },
    "AAPL",
  ),
  299.12,
);
assert.equal(
  extractTastytradeEquityPrice(
    { data: { items: [{ symbol: "NVDA", "mark-price": 225.44 }] } },
    "NVDA",
  ),
  225.44,
);
assert.equal(
  extractTastytradeEquityPrice(
    { data: { items: [{ symbol: "JPM", bid: 297.5, ask: 297.7 }] } },
    "JPM",
  ),
  297.6,
);
assert.equal(
  extractTastytradeEquityPrice(
    { data: { items: [{ symbol: "MSFT", last: 500 }] } },
    "AAPL",
  ),
  null,
);

// Schwab live quote parsing supports direct last price and bid/ask midpoint.
assert.equal(
  extractSchwabEquityPrice(
    {
      AAPL: {
        assetMainType: "EQUITY",
        quote: { symbol: "AAPL", lastPrice: 301.42 },
      },
    },
    "AAPL",
  ),
  301.42,
);

// SPX options projection translates ES gates into SPX with signed basis,
// keeps buy-bottom / sell-top tickets directional, and carries the proof
// fields needed by Options Lens.
{
  const snap = {
    symbol: "SPX",
    asOf: "2026-05-18T13:30:00.000Z",
    sessionDateCT: "2026-05-18",
    _meta: {
      computedOffset: -34,
      spxSpot: 7386,
      esSpot: 7420,
      quoteCapturedAt: "2026-05-18T13:30:00.000Z",
      asOf: "2026-05-18T13:30:00.000Z",
    },
    price: { last: 7420 },
    descendingDeviationFan: {
      zone: { label: "Between South Gate II and South Gate I", lowerLine: "-68", upperLine: "-34" },
      lines: [
        { label: "-68", value: 7392 },
        { label: "-34", value: 7426 },
      ],
    },
  };
  const chain = {
    expiration: "2026-05-18",
    atm: 7385,
    asOf: "2026-05-18T13:30:00.000Z",
    calls: [
      { strike: 7360, bid: 1.8, ask: 2.2, mark: 2, delta: 0.25, gamma: 0.01, theta: -0.2, iv: 15 },
      { strike: 7395, bid: 0.9, ask: 1.2, mark: 1.05, delta: 0.14, gamma: 0.006, theta: -0.1, iv: 15 },
    ],
    puts: [
      { strike: 7390, bid: 1.8, ask: 2.2, mark: 2, delta: -0.25, gamma: 0.01, theta: -0.2, iv: 15 },
      { strike: 7355, bid: 0.9, ask: 1.2, mark: 1.05, delta: -0.14, gamma: 0.006, theta: -0.1, iv: 15 },
    ],
  };
  const zone = buildSpxZoneContractProjections({
    snap,
    chain,
    now: new Date("2026-05-18T13:30:00.000Z"),
  });
  assert.ok(zone?.buyBottom);
  assert.ok(zone?.sellTop);
  assert.equal(zone.buyBottom.translation.esEntry, 7392);
  assert.equal(zone.buyBottom.translation.spxEntry, 7358);
  assert.equal(zone.buyBottom.translation.esTarget, 7426);
  assert.equal(zone.buyBottom.translation.spxTarget, 7392);
  assert.equal(zone.buyBottom.translation.basis, -34);
  assert.equal(zone.sellTop.translation.esEntry, 7426);
  assert.equal(zone.sellTop.translation.spxEntry, 7392);
  assert.equal(zone.buyBottom.strike, 7395);
  assert.equal(zone.sellTop.strike, 7355);
  assert.ok(Math.abs(zone.buyBottom.strikeDistanceFromEntry) >= 15);
  assert.ok(Math.abs(zone.sellTop.strikeDistanceFromEntry) >= 15);
  assert.notEqual(zone.buyBottom.projectedEntry.mark, zone.buyBottom.projectedTarget.mark);
  assert.ok(zone.sellTop.projectedTarget.mark > zone.sellTop.projectedEntry.mark);
  assert.ok(zone.sellTop.selectionReasons.some((reason) => reason.includes("SPX after ES translation")));
}

// Tuesday holiday-rollover zone tickets should use the close-anchored ES/SPX
// basis. A stale Friday cash SPX print must not be subtracted from live
// Monday-holiday ES, or the whole ticket map shifts about 70 points too low.
{
  const snap = {
    symbol: "SPX",
    asOf: "2026-05-25T18:24:00.000Z",
    sessionDateCT: "2026-05-26",
    _meta: {
      computedOffset: -18.03,
      spxSpot: 7473.47,
      esSpot: 7491.5,
      quoteCapturedAt: "2026-05-22T20:00:00.000Z",
      asOf: "2026-05-25T18:24:00.000Z",
      offsetMethod: "close_anchored",
    },
    price: { last: 7564.5 },
    descendingDeviationFan: {
      zone: {
        label: "Between Control Line and North Gate I",
        lowerLine: "Control Line",
        upperLine: "North Gate I",
      },
      lines: [
        { label: "Control Line", value: 7546.00 },
        { label: "North Gate I", value: 7578.00 },
      ],
    },
  };
  const chain = {
    expiration: "2026-05-26",
    atm: 7473,
    asOf: "2026-05-25T18:24:00.000Z",
    calls: [
      { strike: 7540, bid: 8.2, ask: 8.7, mark: 8.45, delta: null, gamma: null, iv: null },
      { strike: 7550, bid: 5.6, ask: 6.1, mark: 5.85, delta: null, gamma: null, iv: null },
      { strike: 7560, bid: 3.8, ask: 4.2, mark: 4.0, delta: null, gamma: null, iv: null },
      { strike: 7570, bid: 2.7, ask: 3.1, mark: 2.9, delta: null, gamma: null, iv: null },
    ],
    puts: [
      { strike: 7550, bid: 8.0, ask: 8.5, mark: 8.25, delta: null, gamma: null, iv: null },
      { strike: 7540, bid: 5.9, ask: 6.4, mark: 6.15, delta: null, gamma: null, iv: null },
      { strike: 7535, bid: 5.0, ask: 5.5, mark: 5.25, delta: null, gamma: null, iv: null },
      { strike: 7530, bid: 4.4, ask: 4.9, mark: 4.65, delta: null, gamma: null, iv: null },
    ],
  };
  const zone = buildSpxZoneContractProjections({
    snap,
    chain,
    maxEntryDebit: 10,
    now: new Date("2026-05-25T18:24:00.000Z"),
  });
  assert.ok(zone?.buyBottom);
  assert.ok(zone?.sellTop);
  approx(zone.buyBottom.translation.basis, -18.03);
  approx(zone.buyBottom.translation.spxEntry, 7527.97);
  approx(zone.buyBottom.translation.spxTarget, 7559.97);
  approx(zone.buyBottom.underlyingNow, 7473);
  assert.equal(zone.buyBottom.strike, 7560);
  assert.equal(zone.sellTop.strike, 7535);
  assert.ok(Math.abs(zone.buyBottom.strikeDistanceFromEntry) >= 15);
  assert.ok(Math.abs(zone.sellTop.strikeDistanceFromEntry) >= 15);
  assert.notEqual(zone.buyBottom.contractLabel, "SPX 05/26 7460C");
  assert.notEqual(zone.sellTop.contractLabel, "SPX 05/26 7475P");
}
assert.equal(
  extractSchwabEquityPrice(
    {
      MSFT: {
        quote: { symbol: "MSFT", bidPrice: 500.1, askPrice: 500.3 },
      },
    },
    "MSFT",
  ),
  500.2,
);
assert.equal(
  extractSchwabEquityPrice(
    {
      NVDA: {
        quote: { symbol: "NVDA", closePrice: 225.4 },
      },
    },
    "AAPL",
  ),
  null,
);

// Close-anchored basis metadata stores ES at the cash close, not the current
// ES last. Frontend canonicalization must keep the live ES price from the
// snapshot itself or options translation falls back to the stale cash close.
{
  const canonical = canonicalizeEsSnapshot({
    price: { last: 7564.5 },
    _meta: {
      offsetMethod: "close_anchored",
      esSpot: 7491.0,
      computedOffset: -17.53,
      appliedOffset: 0,
      quoteCapturedAt: "2026-05-22T15:00:00-05:00",
    },
    lines: [],
    channel: { direction: "ASCENDING", reason: "Control Map active." },
    scenario: "INSIDE_ASCENDING",
    scenarioExplanation: "Last print 7564.50 is inside the map.",
    decisionTrace: [],
  });
  assert.equal(canonical.price.last, 7564.5);
  assert.equal(canonicalEsLast(canonical), 7564.5);
}

// Integration path: auto-detect, project, simulate rejection, populate slate.
{
  const snap = fixtures.buildStockEngineSnapshot("AAPL");
  assert.equal(snap.ticker, "AAPL");
  assert.ok(snap.primaryPivot.pivot_high > 0);
  assert.ok(snap.currentProjection.main_line > 0);
  assert.ok(snap.latestCandidate);
  assert.ok(snap.setup);
  assert.equal(snap.decision, "Trade Allowed");
}

// Trade setup chase guard.
{
  const candidate = {
    session_id: "x",
    candle_timestamp: ct(2026, 5, 15, 10).toISOString(),
    candle_open: 99,
    candle_high: 101,
    candle_low: 98,
    candle_close: 99.5,
    candle_color: "bullish",
    line_tested: "main",
    line_price_at_candle: 100,
    pattern_matched: "short_rejection",
  };
  const setup = buildTradeSetup({
    sessionId: "x",
    candidate,
    entryTimestamp: ct(2026, 5, 15, 11).toISOString(),
    entryPrice: 99.5,
    mainLine: 100,
    upper2Line: 102,
    upperLine: 101,
    lowerLine: 95,
    lower2Line: 90,
    nextOpenPrice: 96.5,
  });
  assert.equal(setup?.chase_guard_active, true);
}

console.log("Stocks Engine unit tests passed.");
