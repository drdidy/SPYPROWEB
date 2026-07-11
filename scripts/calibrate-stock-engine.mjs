import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
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
const {
  aggregateToDisplayedHourCandles,
  buildRejectionCandidate,
  buildTradeSetup,
  calculateMainLine,
  chooseDominantRejectionCandidate,
  countStockProjectionHoursBetween,
  ctLocalToUtcDate,
  determineActiveLine,
  getCtDateKey,
  getCtParts,
  isStockTradingDateKey,
} = engine;

const DEFAULT_OUTPUT = ".data/stock-calibration-report.json";
const MARKET_TIME_ZONE = "America/Chicago";
const RTH_START_CANDLE_HOUR_CT = 8;
const PIVOT_CUTOFF_HOUR_CT = 14;
const ENTRY_START_HOUR_CT = 9;
const ENTRY_END_HOUR_CT = 12;
const STOCK_REFERENCE_HOUR_CT = 9;
const STOCK_CASH_CLOSE_HOUR_CT = 15;

const args = parseArgs(process.argv.slice(2));
const tickers = resolveTickers(args);

if (tickers.length === 0) {
  console.error(
    "No tickers provided. Use: npm run calibrate:stocks -- SPY QQQ AAPL MSFT or npm run calibrate:stocks -- --all",
  );
  process.exit(1);
}

const options = {
  days: numberArg(args.days, 30),
  top: numberArg(args.top, 5),
  output: stringArg(args.output, DEFAULT_OUTPUT),
  slopeRateMin: numberArg(args["slope-rate-min"], 0.0001),
  slopeRateMax: numberArg(args["slope-rate-max"], 0.002),
  slopeRateStep: numberArg(args["slope-rate-step"], 0.00001),
  distanceRateMin: numberArg(args["distance-rate-min"], 0.0025),
  distanceRateMax: numberArg(args["distance-rate-max"], 0.03),
  distanceRateStep: numberArg(args["distance-rate-step"], 0.00025),
  walkForwardRatio: numberArg(args["walk-forward"], 0.35),
};

const report = {
  generatedAt: new Date().toISOString(),
  method: {
    anchor: "prior_rth_high_swing_pivot_before_2pm_ct",
    controlLine: "anchor_high_minus_slope_pts_per_displayed_hour_projected_to_9am_ct",
    gates: "ticker_specific_distance_points_above_and_below_control_line",
    entryWindow: "9am_to_noon_ct",
    validation: "recent_30_calendar_days_with_older_sessions_fit_newer_sessions_walk_forward",
  },
  options,
  tickers: [],
};
const outputPath = path.resolve(root, options.output);
mkdirSync(path.dirname(outputPath), { recursive: true });

for (const ticker of tickers) {
  try {
    console.log(`\n[${ticker}] fetching ${options.days}d of 30m candles...`);
    const candles = await fetchYahooCandles(ticker, options.days);
    const result = calibrateTicker(ticker, candles, options);
    report.tickers.push(result);
    printTickerSummary(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${ticker}] calibration failed: ${message}`);
    report.tickers.push({
      ticker,
      status: "failed",
      error: message,
    });
  }
  writeReport(outputPath, report);
}

writeReport(outputPath, report);
console.log(`\nCalibration report written to ${path.relative(root, outputPath)}`);

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      out._.push(item);
      continue;
    }
    const raw = item.slice(2);
    const [key, inlineValue] = raw.split("=");
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function resolveTickers(parsedArgs) {
  const explicit = parsedArgs._
    .map((ticker) => String(ticker).trim().toUpperCase())
    .filter(Boolean);
  if (explicit.length > 0) return unique(explicit);
  if (!parsedArgs.all) return [];

  const classifications = JSON.parse(
    readFileSync(path.join(root, "stocks/data/ticker-classifications.json"), "utf8"),
  );
  return unique(
    classifications
      .map((row) => String(row.ticker ?? "").trim().toUpperCase())
      .filter(Boolean),
  );
}

function numberArg(value, fallback) {
  if (value === undefined || value === true) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArg(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function fetchYahooCandles(ticker, days) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
  );
  url.searchParams.set("range", `${Math.max(5, Math.min(60, days))}d`);
  url.searchParams.set("interval", "30m");
  url.searchParams.set("includePrePost", "true");
  url.searchParams.set("events", "div,splits");

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SPYProphetCalibration/1.0; +https://www.spyprophet.app)",
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Yahoo returned HTTP ${response.status}`);
      }
      const body = await response.json();
      return parseYahooCandles(ticker, body);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(300 * attempt);
    }
  }
  throw lastError ?? new Error("Yahoo fetch failed.");
}

function parseYahooCandles(ticker, body) {
  const error = body.chart?.error;
  if (error) throw new Error(error.description ?? error.code ?? "Yahoo chart error.");
  const result = body.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo returned an empty chart for ${ticker}.`);

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
      if (open === null || high === null || low === null || close === null) return null;
      return {
        timestamp: new Date(seconds * 1000).toISOString(),
        open: roundPrice(open),
        high: roundPrice(high),
        low: roundPrice(low),
        close: roundPrice(close),
      };
    })
    .filter(Boolean)
    .filter((candle) => candle.high >= candle.low && candle.open > 0 && candle.close > 0);
}

function calibrateTicker(ticker, rawCandles, opts) {
  const displayCandles = aggregateToDisplayedHourCandles(
    rawCandles.filter(isDisplayWindowCandle),
  );
  const rthCandles = aggregateToDisplayedHourCandles(
    rawCandles.filter(isRegularSessionComponentCandle),
  );
  const displayByDate = groupByDate(displayCandles);
  const rthByDate = groupByDate(rthCandles);
  const rthDates = [...rthByDate.keys()]
    .filter((dateKey) => isStockTradingDateKey(dateKey))
    .sort();
  const sessionPairs = buildSessionPairs(ticker, rthDates, rthByDate, displayByDate);
  if (sessionPairs.length < 8) {
    throw new Error(`Only ${sessionPairs.length} usable sessions. Need at least 8.`);
  }

  const calibrationPrice = median(
    sessionPairs
      .map((sample) => sample.priorClose)
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  const slopeCandidates = buildCandidateValues({
    price: calibrationPrice,
    minRate: opts.slopeRateMin,
    maxRate: opts.slopeRateMax,
    stepRate: opts.slopeRateStep,
    minValue: 0.005,
    precision: 3,
  });
  const distanceCandidates = buildCandidateValues({
    price: calibrationPrice,
    minRate: opts.distanceRateMin,
    maxRate: opts.distanceRateMax,
    stepRate: opts.distanceRateStep,
    minValue: 0.1,
    precision: 2,
  });

  const splitIndex = Math.max(
    4,
    Math.floor(sessionPairs.length * (1 - clamp(opts.walkForwardRatio, 0.15, 0.6))),
  );
  const train = sessionPairs.slice(0, splitIndex);
  const validation = sessionPairs.slice(splitIndex);

  const slopeScores = slopeCandidates
    .map((slope) => scoreSlope(train, slope))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(16, slopeCandidates.length));

  const candidates = [];
  for (const slopeScore of slopeScores) {
    for (const distance of distanceCandidates) {
      const trainScore = scoreModel(train, slopeScore.slopePtsPerHour, distance);
      const validationScore = scoreModel(validation, slopeScore.slopePtsPerHour, distance);
      const allScore = scoreModel(sessionPairs, slopeScore.slopePtsPerHour, distance);
      candidates.push({
        slopePtsPerHour: slopeScore.slopePtsPerHour,
        gateDistancePts: distance,
        score: roundScore(trainScore.score * 0.45 + validationScore.score * 0.55),
        train: compactScore(trainScore),
        validation: compactScore(validationScore),
        all: compactScore(allScore),
      });
    }
  }

  const ranked = candidates
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (Math.abs(scoreDelta) > 1e-9) return scoreDelta;
      const validationDelta = b.validation.score - a.validation.score;
      if (Math.abs(validationDelta) > 1e-9) return validationDelta;
      return a.gateDistancePts - b.gateDistancePts;
    })
    .slice(0, opts.top);

  const best = ranked[0];
  return {
    ticker,
    status: "ok",
    sessionsTested: sessionPairs.length,
    calibrationPrice,
    recommended: {
      slopePtsPerHour: best.slopePtsPerHour,
      gateDistancePts: best.gateDistancePts,
      confidence: confidenceFor(best),
      anchorModel: "prior_rth_high_swing_pivot_before_2pm_ct",
      controlRead: "9am_ct",
    },
    topCandidates: ranked,
    samples: sessionPairs.map((sample) => ({
      sessionDate: sample.sessionDate,
      priorDate: sample.priorDate,
      anchorTime: sample.anchor.timestamp,
      anchorHigh: sample.anchor.high,
      priorClose: sample.priorClose,
    })),
  };
}

function buildSessionPairs(ticker, rthDates, rthByDate, displayByDate) {
  const out = [];
  for (let index = 1; index < rthDates.length; index += 1) {
    const priorDate = rthDates[index - 1];
    const sessionDate = rthDates[index];
    const priorRth = rthByDate.get(priorDate) ?? [];
    const sessionDisplay = displayByDate.get(sessionDate) ?? [];
    const sessionRth = rthByDate.get(sessionDate) ?? [];
    const anchor = detectHighestSwingPivotBeforeCutoff(priorRth);
    const nine = projectionTimestamp(sessionDate, STOCK_REFERENCE_HOUR_CT);
    if (!anchor || sessionDisplay.length === 0 || sessionRth.length === 0) continue;
    const anchorDate = new Date(anchor.timestamp);
    const sessionRthWithHours = sessionRth.map((candle) => ({
      ...candle,
      hoursFromAnchor: countStockProjectionHoursBetween(anchorDate, new Date(candle.timestamp)),
    }));
    out.push({
      ticker,
      priorDate,
      sessionDate,
      anchor,
      nine,
      nineHoursFromAnchor: countStockProjectionHoursBetween(anchorDate, new Date(nine)),
      priorClose: priorRth.at(-1)?.close ?? anchor.close,
      sessionDisplay,
      sessionRth: sessionRthWithHours,
    });
  }
  return out;
}

function detectHighestSwingPivotBeforeCutoff(candles) {
  const eligible = candles.filter((candle) => {
    const hour = getCtParts(new Date(candle.timestamp)).hour;
    return hour >= RTH_START_CANDLE_HOUR_CT && hour < PIVOT_CUTOFF_HOUR_CT;
  });
  if (eligible.length === 0) return null;

  const pivots = eligible.filter((candle, index) => {
    const previous = eligible[index - 1];
    const next = eligible[index + 1];
    if (!previous || !next) return false;
    return candle.high >= previous.high && candle.high > next.high;
  });
  const pool = pivots.length > 0 ? pivots : eligible;
  return [...pool].sort((a, b) => {
    const highDelta = b.high - a.high;
    if (Math.abs(highDelta) > 1e-9) return highDelta;
    return Date.parse(a.timestamp) - Date.parse(b.timestamp);
  })[0];
}

function scoreSlope(samples, slopePtsPerHour) {
  if (samples.length === 0) {
    return { slopePtsPerHour, score: 0 };
  }
  let touches = 0;
  let near = 0;
  let directional = 0;
  let totalCloseness = 0;

  for (const sample of samples) {
    const cachedMainAtNine = sample.anchor.high - slopePtsPerHour * sample.nineHoursFromAnchor;
    const early = sample.sessionRth.filter(isEntryWindowCandle);
    const typicalMove = Math.max(0.1, averageTrueRange(sample.sessionRth));
    const nearestDistance = Math.min(
      ...early.map((candle) => distanceToCandleRange(candle, cachedMainAtNine)),
    );
    const closeness = Math.max(0, 1 - nearestDistance / typicalMove);
    totalCloseness += closeness;
    if (nearestDistance <= typicalMove * 0.18) touches += 1;
    if (nearestDistance <= typicalMove * 0.5) near += 1;

    const nineCandle = early[0];
    const noonCandle = early.at(-1);
    if (nineCandle && noonCandle) {
      const startsAbove = nineCandle.open > cachedMainAtNine;
      const endsAbove = noonCandle.close > cachedMainAtNine;
      if (startsAbove === endsAbove) directional += 1;
    }
  }

  return {
    slopePtsPerHour,
    score: roundScore(
      (touches / samples.length) * 42 +
        (near / samples.length) * 24 +
        (directional / samples.length) * 14 +
        (totalCloseness / samples.length) * 20,
    ),
  };
}

function scoreModel(samples, slopePtsPerHour, gateDistancePts) {
  if (samples.length === 0) {
    return emptyScore();
  }
  let wins = 0;
  let losses = 0;
  let skips = 0;
  let touches = 0;
  let validSetups = 0;
  let totalExcursionQuality = 0;

  for (const sample of samples) {
    const outcome = gradeSession(sample, slopePtsPerHour, gateDistancePts);
    if (outcome.touched) touches += 1;
    if (outcome.validSetup) validSetups += 1;
    if (outcome.result === "win") wins += 1;
    if (outcome.result === "loss") losses += 1;
    if (outcome.result === "skip") skips += 1;
    totalExcursionQuality += outcome.excursionQuality;
  }

  const graded = wins + losses;
  const hitRate = graded > 0 ? wins / graded : 0;
  const setupRate = validSetups / samples.length;
  const touchRate = touches / samples.length;
  const avgExcursionQuality = totalExcursionQuality / samples.length;
  const score = roundScore(
    hitRate * 46 +
      setupRate * 22 +
      touchRate * 14 +
      avgExcursionQuality * 18 -
      (losses / samples.length) * 10,
  );

  return {
    score,
    sessions: samples.length,
    wins,
    losses,
    skips,
    validSetups,
    touches,
    hitRate: roundScore(hitRate * 100),
    setupRate: roundScore(setupRate * 100),
    touchRate: roundScore(touchRate * 100),
  };
}

function gradeSession(sample, slopePtsPerHour, gateDistancePts) {
  const sessionId = `${sample.sessionDate}:${sample.ticker}`;
  const candidates = sample.sessionRth
    .filter(isEntryWindowCandle)
    .map((candle) => {
      const projection = projectAt({
        sessionId,
        timestamp: candle.timestamp,
        anchor: sample.anchor,
        slopePtsPerHour,
        gateDistancePts,
        currentPrice: candle.close,
        hoursFromAnchor: candle.hoursFromAnchor,
      });
      return chooseDominantRejectionCandidate(
        ["lower_2", "lower", "main", "upper", "upper_2"]
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
    .filter(Boolean);

  const candidate = candidates[0] ?? null;
  const touched = sample.sessionRth
    .filter(isEntryWindowCandle)
    .some((candle) => {
      const projection = projectAt({
        sessionId,
        timestamp: candle.timestamp,
        anchor: sample.anchor,
        slopePtsPerHour,
        gateDistancePts,
        currentPrice: candle.close,
        hoursFromAnchor: candle.hoursFromAnchor,
      });
      return ["lower_2", "lower", "main", "upper", "upper_2"].some((line) =>
        candle.low <= lineValue(projection, line) && candle.high >= lineValue(projection, line),
      );
    });

  if (!candidate) {
    return { result: "skip", validSetup: false, touched, excursionQuality: touched ? 0.25 : 0 };
  }

  const candidateIndex = sample.sessionRth.findIndex(
    (candle) => candle.timestamp === candidate.candle_timestamp,
  );
  const nextCandle = candidateIndex >= 0 ? sample.sessionRth[candidateIndex + 1] : null;
  if (!nextCandle) {
    return { result: "skip", validSetup: true, touched: true, excursionQuality: 0.35 };
  }

  const entryProjection = projectAt({
    sessionId,
    timestamp: nextCandle.timestamp,
    anchor: sample.anchor,
    slopePtsPerHour,
    gateDistancePts,
    currentPrice: nextCandle.open,
    hoursFromAnchor: nextCandle.hoursFromAnchor,
  });
  const setup = buildTradeSetup({
    sessionId,
    candidate,
    entryTimestamp: nextCandle.timestamp,
    entryPrice: nextCandle.open,
    mainLine: entryProjection.main_line,
    upper2Line: entryProjection.upper_2_line,
    upperLine: entryProjection.upper_line,
    lowerLine: entryProjection.lower_line,
    lower2Line: entryProjection.lower_2_line,
    nextOpenPrice: nextCandle.open,
  });
  if (!setup || setup.chase_guard_active) {
    return { result: "skip", validSetup: true, touched: true, excursionQuality: 0.35 };
  }

  const forwardCandles = sample.sessionRth.slice(candidateIndex + 1);
  const resolved = resolveSetup(setup, forwardCandles);
  return {
    result: resolved.result,
    validSetup: true,
    touched: true,
    excursionQuality: resolved.excursionQuality,
  };
}

function resolveSetup(setup, candles) {
  const target = setup.target_price;
  const stop = setup.stop_price;
  let bestExcursion = 0;
  for (const candle of candles) {
    if (setup.setup_type === "put") {
      bestExcursion = Math.max(
        bestExcursion,
        (setup.entry_price - candle.low) / Math.max(0.01, Math.abs(setup.entry_price - target)),
      );
      if (candle.high >= stop) return { result: "loss", excursionQuality: clamp(bestExcursion, 0, 1) };
      if (candle.low <= target) return { result: "win", excursionQuality: 1 };
    } else {
      bestExcursion = Math.max(
        bestExcursion,
        (candle.high - setup.entry_price) / Math.max(0.01, Math.abs(target - setup.entry_price)),
      );
      if (candle.low <= stop) return { result: "loss", excursionQuality: clamp(bestExcursion, 0, 1) };
      if (candle.high >= target) return { result: "win", excursionQuality: 1 };
    }
  }
  return {
    result: bestExcursion >= 0.65 ? "win" : bestExcursion <= 0.25 ? "loss" : "skip",
    excursionQuality: clamp(bestExcursion, 0, 1),
  };
}

function projectAt({
  sessionId,
  timestamp,
  anchor,
  slopePtsPerHour,
  gateDistancePts,
  currentPrice,
  hoursFromAnchor,
}) {
  const main =
    typeof hoursFromAnchor === "number"
      ? anchor.high - slopePtsPerHour * hoursFromAnchor
      : calculateMainLine(
          anchor.high,
          new Date(anchor.timestamp),
          new Date(timestamp),
          slopePtsPerHour,
        );
  return {
    session_id: sessionId,
    timestamp,
    upper_2_line: main + gateDistancePts * 2,
    main_line: main,
    upper_line: main + gateDistancePts,
    lower_line: main - gateDistancePts,
    lower_2_line: main - gateDistancePts * 2,
    active_line: determineActiveLine(currentPrice, main, gateDistancePts),
  };
}

function lineValue(projection, line) {
  if (line === "upper_2") return projection.upper_2_line;
  if (line === "upper") return projection.upper_line;
  if (line === "lower") return projection.lower_line;
  if (line === "lower_2") return projection.lower_2_line;
  return projection.main_line;
}

function buildCandidateValues({ price, minRate, maxRate, stepRate, minValue, precision }) {
  const values = new Set();
  for (let rate = minRate; rate <= maxRate + 1e-12; rate += stepRate) {
    values.add(roundTo(Math.max(minValue, price * rate), precision));
  }
  return [...values].sort((a, b) => a - b);
}

function groupByDate(candles) {
  const out = new Map();
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

function projectionTimestamp(dateKey, hour) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return ctLocalToUtcDate(year, month, day, hour).toISOString();
}

function isDisplayWindowCandle(candle) {
  const hour = getCtParts(new Date(candle.timestamp)).hour;
  return hour >= 3 && hour < 18;
}

function isRegularSessionComponentCandle(candle) {
  const parts = getCtParts(new Date(candle.timestamp));
  return (
    (parts.hour === 8 && parts.minute >= 30) ||
    (parts.hour > 8 && parts.hour < STOCK_CASH_CLOSE_HOUR_CT)
  );
}

function isEntryWindowCandle(candle) {
  const hour = getCtParts(new Date(candle.timestamp)).hour;
  return hour >= ENTRY_START_HOUR_CT && hour < ENTRY_END_HOUR_CT;
}

function distanceToCandleRange(candle, price) {
  if (price >= candle.low && price <= candle.high) return 0;
  return Math.min(Math.abs(price - candle.low), Math.abs(price - candle.high));
}

function averageTrueRange(candles) {
  if (candles.length === 0) return 0;
  return (
    candles.reduce((sum, candle) => sum + Math.max(0.01, candle.high - candle.low), 0) /
    candles.length
  );
}

function compactScore(score) {
  return {
    score: score.score,
    sessions: score.sessions,
    validSetups: score.validSetups,
    wins: score.wins,
    losses: score.losses,
    skips: score.skips,
    hitRate: score.hitRate,
    setupRate: score.setupRate,
    touchRate: score.touchRate,
  };
}

function emptyScore() {
  return {
    score: 0,
    sessions: 0,
    wins: 0,
    losses: 0,
    skips: 0,
    validSetups: 0,
    touches: 0,
    hitRate: 0,
    setupRate: 0,
    touchRate: 0,
  };
}

function confidenceFor(candidate) {
  if (candidate.validation.sessions < 4) return "low";
  if (candidate.validation.hitRate >= 68 && candidate.validation.validSetups >= 4) return "high";
  if (candidate.validation.hitRate >= 55 && candidate.validation.validSetups >= 3) return "medium";
  return "needs_review";
}

function printTickerSummary(result) {
  if (result.status !== "ok") return;
  const rec = result.recommended;
  const best = result.topCandidates[0];
  console.log(
    `[${result.ticker}] slope=${rec.slopePtsPerHour.toFixed(3)} pts/hr distance=${rec.gateDistancePts.toFixed(2)} pts confidence=${rec.confidence}`,
  );
  console.log(
    `  validation: ${best.validation.wins}W ${best.validation.losses}L ${best.validation.skips}S, hit ${best.validation.hitRate}% over ${best.validation.sessions} sessions`,
  );
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 100;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundPrice(value) {
  return Math.round(value * 100) / 100;
}

function roundScore(value) {
  return Math.round(value * 100) / 100;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeReport(outputPath, report) {
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
