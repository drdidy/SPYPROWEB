import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CT_ZONE = "America/Chicago";
const DAY_SECONDS = 24 * 60 * 60;
const EPS = 1e-8;

const BASE_CONFIG = {
  fastEmaLength: 21,
  slowEmaLength: 50,
  pivotLeft: 1,
  pivotRight: 1,
  requireCandleColor: true,
  useHaConfirm: false,
  crossTrendFilter: true,
  crossStraddle50: true,
  crossSlopeBars: 5,
  lookbackBars: 90,
  setupBarsAfterEmaCross: 8,
  retestBars: 60,
  setupCooldownBars: 10,
  setupsPerSession: "First only",
  enableCross: true,
  enableStraddle: true,
  straddleDelayMins: 51,
  straddleTrendFilter: true,
  alertStartMins: 8 * 60 + 50,
  alertEndMins: 10 * 60 + 50,
  tradeManagementEndMins: 12 * 60,
  deepFib: 0.618,
  targetMultiple: 1.5,
  targetZoneFar: 1.618,
  requireGateTouch: false,
  gateLine: 0,
  gateTolerance: 0.25,
  gateLookbackBars: 20,
  flatAtSessionEnd: true,
  maxBarsInTrade: 0,
  htfFilter: "off",
  htfMinutes: 15,
  atrFilter: "off",
  atrLength: 14,
  minImpulseAtr: 0,
  maxEntryDistanceAtr: 0,
  volumeFilter: "off",
  volumeLength: 20,
  exitModel: "fixed",
  partialTargetMultiple: 1.236,
  partialSize: 0.5,
  requirePivotOpenStraddle50: false,
  firstTradePerDay: true,
};

const SYMBOLS = [
  { label: "SPY", yahoo: "SPY" },
  { label: "SPX", yahoo: "^GSPC" },
  { label: "ES", yahoo: "ES=F", localPattern: /^ES(_|\b).*\.csv$/i },
];

const WINDOWS = [{ name: "0850-1050", start: 8 * 60 + 50, end: 10 * 60 + 50 }];
const SESSIONS = [
  { name: "NewYork", window: "0850-1050", start: 8 * 60 + 50, end: 10 * 60 + 50, tz: "America/Chicago" },
  { name: "London", window: "0800-1000", start: 8 * 60, end: 10 * 60, tz: "Europe/London" },
  { name: "Tokyo", window: "0900-1100", start: 9 * 60, end: 11 * 60, tz: "Asia/Tokyo" },
  { name: "Sydney", window: "0700-0900", start: 7 * 60, end: 9 * 60, tz: "Australia/Sydney" },
];
const TARGETS = [1.236, 1.5, 1.618, 2.0];
const DEEP_FIBS = [0.618];
const SETUP_LIMITS = ["First only"];
const HA_OPTIONS = [false];
const SLOPE_OPTIONS = [true];
const STRADDLE_OPTIONS = [true];
const TEST_VARIANTS = [
  { name: "baseline", overrides: {} },
  { name: "htf_5m_price_vs_50", overrides: { htfFilter: "price_vs_ema", htfMinutes: 5 } },
  { name: "htf_15m_price_vs_50", overrides: { htfFilter: "price_vs_ema", htfMinutes: 15 } },
  { name: "htf_30m_price_vs_50", overrides: { htfFilter: "price_vs_ema", htfMinutes: 30 } },
  { name: "atr_impulse_0.50", overrides: { atrFilter: "min_impulse", minImpulseAtr: 0.5 } },
  { name: "atr_impulse_0.75", overrides: { atrFilter: "min_impulse", minImpulseAtr: 0.75 } },
  { name: "atr_impulse_1.00", overrides: { atrFilter: "min_impulse", minImpulseAtr: 1.0 } },
  { name: "max_entry_distance_1.50atr", overrides: { maxEntryDistanceAtr: 1.5 } },
  { name: "max_entry_distance_2.00atr", overrides: { maxEntryDistanceAtr: 2.0 } },
  { name: "volume_impulse_above_avg", overrides: { volumeFilter: "impulse_above_avg" } },
  {
    name: "partial_1236_runner_1500",
    overrides: { exitModel: "partial", partialTargetMultiple: 1.236, targetMultiple: 1.5, targetZoneFar: 1.618 },
  },
  {
    name: "partial_1236_runner_1618",
    overrides: { exitModel: "partial", partialTargetMultiple: 1.236, targetMultiple: 1.618, targetZoneFar: 2.0 },
  },
  {
    name: "htf15_plus_atr075",
    overrides: { htfFilter: "price_vs_ema", htfMinutes: 15, atrFilter: "min_impulse", minImpulseAtr: 0.75 },
  },
];

const STOP_STUDY_VARIANTS = [
  { id: "V0", label: "Baseline close beyond pivot", stopRule: "close", stopAtrK: 0, consecutiveCloses: 1 },
  ...[0.1, 0.25, 0.5, 0.75, 1].map((k) => ({
    id: `V1 k=${k.toFixed(2)}`,
    label: `ATR buffered stop k=${k.toFixed(2)}`,
    stopRule: "close",
    stopAtrK: k,
    consecutiveCloses: 1,
  })),
  { id: "V2 N=2", label: "2 consecutive closes beyond pivot", stopRule: "consecutive_close", stopAtrK: 0, consecutiveCloses: 2 },
  { id: "V2 N=3", label: "3 consecutive closes beyond pivot", stopRule: "consecutive_close", stopAtrK: 0, consecutiveCloses: 3 },
  { id: "V3 5m", label: "5m close beyond pivot", stopRule: "htf_close", stopAtrK: 0, htfStopMinutes: 5 },
  { id: "V3 15m", label: "15m close beyond pivot", stopRule: "htf_close", stopAtrK: 0, htfStopMinutes: 15 },
  { id: "V3 30m", label: "30m close beyond pivot", stopRule: "htf_close", stopAtrK: 0, htfStopMinutes: 30 },
  { id: "V4", label: "Wick/touch pivot stop", stopRule: "wick", stopAtrK: 0 },
];

const OPTIONS_STUDY_VARIANTS = [
  { id: "baseline", label: "Cross + straddle, 30m stop", overrides: {} },
  { id: "cross_only", label: "Cross setups only", overrides: { enableStraddle: false } },
  { id: "straddle_only", label: "Straddle setups only", overrides: { enableCross: false, enableStraddle: true } },
  { id: "htf_5m", label: "5m trend aligned", overrides: { htfFilter: "price_vs_ema", htfMinutes: 5 } },
  { id: "htf_15m", label: "15m trend aligned", overrides: { htfFilter: "price_vs_ema", htfMinutes: 15 } },
  { id: "htf_30m", label: "30m trend aligned", overrides: { htfFilter: "price_vs_ema", htfMinutes: 30 } },
  { id: "atr_impulse_050", label: "Min impulse 0.50 ATR", overrides: { atrFilter: "min_impulse", minImpulseAtr: 0.5 } },
  { id: "atr_impulse_075", label: "Min impulse 0.75 ATR", overrides: { atrFilter: "min_impulse", minImpulseAtr: 0.75 } },
  { id: "atr_impulse_100", label: "Min impulse 1.00 ATR", overrides: { atrFilter: "min_impulse", minImpulseAtr: 1.0 } },
  { id: "entry_dist_100", label: "Max entry distance 1.00 ATR", overrides: { maxEntryDistanceAtr: 1.0 } },
  { id: "entry_dist_150", label: "Max entry distance 1.50 ATR", overrides: { maxEntryDistanceAtr: 1.5 } },
  { id: "entry_dist_200", label: "Max entry distance 2.00 ATR", overrides: { maxEntryDistanceAtr: 2.0 } },
  { id: "volume_impulse", label: "Impulse volume above average", overrides: { volumeFilter: "impulse_above_avg" } },
  { id: "partial_1236", label: "Half at 1.236, runner to target", overrides: { exitModel: "partial", partialTargetMultiple: 1.236, partialSize: 0.5 } },
  { id: "partial_1500", label: "Half at 1.5, runner to target", overrides: { exitModel: "partial", partialTargetMultiple: 1.5, partialSize: 0.5 } },
  { id: "stop_15m_close", label: "15m close invalidation", overrides: { htfStopMinutes: 15 } },
  { id: "stop_1m_close", label: "1m close invalidation", overrides: { stopRule: "close" } },
  { id: "stop_wick", label: "Wick/touch invalidation", overrides: { stopRule: "wick" } },
  { id: "entry_end_1015", label: "Stop looking 10:15", overrides: { alertEndMins: 10 * 60 + 15 } },
  { id: "entry_end_1030", label: "Stop looking 10:30", overrides: { alertEndMins: 10 * 60 + 30 } },
  { id: "entry_end_1050", label: "Stop looking 10:50", overrides: { alertEndMins: 10 * 60 + 50 } },
];

const TIME_STUDY_STARTS = [
  8 * 60 + 30,
  8 * 60 + 35,
  8 * 60 + 40,
  8 * 60 + 45,
  8 * 60 + 50,
  8 * 60 + 55,
  9 * 60,
  9 * 60 + 5,
  9 * 60 + 10,
  9 * 60 + 15,
  9 * 60 + 20,
  9 * 60 + 25,
  9 * 60 + 30,
  9 * 60 + 35,
  9 * 60 + 40,
  9 * 60 + 45,
];

const TIME_STUDY_ENDS = [
  9 * 60 + 30,
  9 * 60 + 45,
  10 * 60,
  10 * 60 + 15,
  10 * 60 + 30,
  10 * 60 + 45,
  10 * 60 + 50,
  11 * 60,
  11 * 60 + 15,
  11 * 60 + 30,
  11 * 60 + 45,
  11 * 60 + 50,
  12 * 60,
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const symbols = SYMBOLS.filter((symbol) => args.symbols.has(symbol.label));
  const barsBySymbol = [];

  for (const symbol of symbols) {
    const bars =
      args.source === "local"
        ? await loadLocalBars(symbol, args)
        : await fetchYahoo1mChunked(symbol.yahoo, args.days);
    barsBySymbol.push({ symbol, bars });
  }

  if (args.stopStudy) {
    return printStopStudyReport(runStopStudy(barsBySymbol, args), args, barsBySymbol);
  }
  if (args.timeStudy) {
    return printTimeStudyReport(runTimeStudy(barsBySymbol, args), args, barsBySymbol);
  }
  if (args.optionsStudy) {
    const rows = runOptionsStudy(barsBySymbol, args);
    if (args.exportOptionsTrades) await exportOptionsTrades(rows, args.exportOptionsTrades);
    return printOptionsStudyReport(rows, args, barsBySymbol);
  }

  const rows = [];
  const sessions = SESSIONS.filter((session) => args.sessions.has(session.name));
  const targets = TARGETS.filter((target) => args.targets.has(String(target)));
  for (const session of sessions) {
    for (const target of targets) {
      for (const deepFib of DEEP_FIBS) {
        for (const setupLimit of SETUP_LIMITS) {
          for (const useHaConfirm of HA_OPTIONS) {
            for (const crossTrendFilter of SLOPE_OPTIONS) {
              for (const enableStraddle of STRADDLE_OPTIONS) {
                for (const variant of TEST_VARIANTS) {
                  if (variant.overrides.targetMultiple && target !== TARGETS[0]) continue;
                  const cfg = {
                    ...BASE_CONFIG,
                    alertStartMins: session.start,
                    alertEndMins: session.end,
                    sessionName: session.name,
                    sessionTz: session.tz,
                    targetMultiple: target,
                    targetZoneFar: Math.max(target, 1.618),
                    deepFib,
                    setupsPerSession: setupLimit,
                    useHaConfirm,
                    crossTrendFilter,
                    enableStraddle,
                    ...variant.overrides,
                  };
                  cfg.variantName = variant.name;
                  for (const item of barsBySymbol) {
                    const trades = runBacktest(item.bars, cfg);
                    const summary = summarize(trades);
                    rows.push({
                      symbol: item.symbol.label,
                      bars: item.bars.length,
                      cfg,
                      variant: variant.name,
                      window: session.window,
                      session: session.name,
                      trades,
                      summary,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  printResearchReport(rows, args, barsBySymbol);
}

function parseArgs(argv) {
  const out = {
    days: 28,
    symbols: new Set(["SPY", "SPX"]),
    minTrades: 8,
    sessions: new Set(["NewYork"]),
    stopStudy: false,
    timeStudy: false,
    optionsStudy: false,
    source: "yahoo",
    dataDir: "data/databento",
    targets: new Set(TARGETS.map(String)),
    stopTarget: 1.5,
    timeTarget: 1.5,
    timeStopRule: "close",
    timeHtfStopMinutes: 5,
    tradeEnd: 12 * 60,
    timeStarts: null,
    timeEnds: null,
    optionsVariants: null,
    optionTargets: null,
    exportOptionsTrades: null,
  };
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key === "days") out.days = Math.max(1, Math.min(60, Number(value) || 28));
    if (key === "stopStudy") out.stopStudy = true;
    if (key === "timeStudy") out.timeStudy = true;
    if (key === "optionsStudy") out.optionsStudy = true;
    if (key === "symbols") {
      out.symbols = new Set(
        value
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
      );
    }
    if (key === "minTrades") out.minTrades = Math.max(1, Number(value) || 8);
    if (key === "sessions") {
      out.sessions = new Set(
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
    }
    if (key === "source") out.source = value === "local" ? "local" : "yahoo";
    if (key === "dataDir") out.dataDir = value || out.dataDir;
    if (key === "targets") {
      out.targets = new Set(
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
    }
    if (key === "timeTarget") out.timeTarget = Number(value) || out.timeTarget;
    if (key === "stopTarget") out.stopTarget = Number(value) || out.stopTarget;
    if (key === "timeStopRule") out.timeStopRule = value || out.timeStopRule;
    if (key === "timeHtfStopMinutes") out.timeHtfStopMinutes = Number(value) || out.timeHtfStopMinutes;
    if (key === "tradeEnd") out.tradeEnd = parseTime(value);
    if (key === "timeStarts") out.timeStarts = parseMinuteSet(value);
    if (key === "timeEnds") out.timeEnds = parseMinuteSet(value);
    if (key === "optionsVariants") out.optionsVariants = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
    if (key === "optionTargets") out.optionTargets = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
    if (key === "exportOptionsTrades") out.exportOptionsTrades = value || "outputs/control_grid/ema_fib_options_trades.csv";
  }
  return out;
}

async function exportOptionsTrades(rows, filePath) {
  const fields = [
    "scope",
    "symbol",
    "target",
    "variant",
    "entryAt",
    "exitAt",
    "direction",
    "setupType",
    "confirmationMode",
    "entryPrice",
    "exitPrice",
    "result",
    "r",
    "pivotLow",
    "pivotHigh",
    "fib50",
    "fibDeep",
    "targetPrice",
    "stop",
    "weekday",
    "gapBucket",
    "overnightRangeBucket",
  ];
  const lines = [fields.join(",")];
  for (const row of rows.filter((item) => item.scope !== "COMBINED")) {
    for (const trade of row.trades) {
      const record = {
        scope: row.scope,
        symbol: trade.symbol ?? row.symbol,
        target: row.target,
        variant: row.variant.id,
        entryAt: trade.entryAt?.toISOString?.() ?? trade.entryAt,
        exitAt: trade.exitAt?.toISOString?.() ?? trade.exitAt,
        direction: trade.direction,
        setupType: trade.setupType,
        confirmationMode: trade.confirmationMode,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        result: trade.result,
        r: trade.r,
        pivotLow: trade.pivotLow,
        pivotHigh: trade.pivotHigh,
        fib50: trade.fib50,
        fibDeep: trade.fibDeep,
        targetPrice: trade.target,
        stop: trade.stop,
        weekday: trade.weekday,
        gapBucket: trade.gapBucket,
        overnightRangeBucket: trade.overnightRangeBucket,
      };
      lines.push(fields.map((field) => csvCell(record[field])).join(","));
    }
  }
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseMinuteSet(value) {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(parseTime),
  );
}

function parseTime(value) {
  const [hour, minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

async function loadLocalBars(symbol, args) {
  const file = await findLocalDataFile(symbol, args.dataDir);
  const text = await readFile(file, "utf8");
  const rows = parseCsv(text);
  const bars = rows
    .map((row) => {
      const timestamp = row.ts_event ?? row.timestamp ?? row.time ?? row.date;
      const at = new Date(String(timestamp));
      return {
        at,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0),
      };
    })
    .filter((bar) =>
      Number.isFinite(bar.at.getTime()) &&
      [bar.open, bar.high, bar.low, bar.close].every(
        (value) => Number.isFinite(value) && value > 0,
      ),
    )
    .map((bar) => {
      const parts = dateParts(bar.at);
      return {
        ...bar,
        ctMinutes: parts.hour * 60 + parts.minute,
        ctWeekday: weekdayNumber(bar.at),
      };
    })
    .sort((a, b) => a.at - b.at);

  if (!bars.length) throw new Error(`No parseable local bars found for ${symbol.label} in ${file}`);
  return bars;
}

async function findLocalDataFile(symbol, dataDir) {
  const absoluteDir = path.resolve(dataDir);
  const files = await readdir(absoluteDir);
  const pattern = symbol.localPattern ?? new RegExp(`^${symbol.label}(_|\\b).*\\.csv$`, "i");
  const match = files.find((file) => pattern.test(file));
  if (!match) throw new Error(`No local CSV for ${symbol.label} found in ${absoluteDir}`);
  return path.join(absoluteDir, match);
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  out.push(cell);
  return out;
}

async function fetchYahoo1mChunked(symbol, days) {
  const now = Math.floor(Date.now() / 1000);
  const earliest = now - days * DAY_SECONDS;
  const chunkSeconds = 7 * DAY_SECONDS;
  const byTime = new Map();

  for (let period1 = earliest; period1 < now; period1 += chunkSeconds) {
    const period2 = Math.min(period1 + chunkSeconds, now);
    let bars = [];
    try {
      bars = await fetchYahooBars(symbol, period1, period2);
    } catch (error) {
      continue;
    }
    for (const bar of bars) byTime.set(bar.at.getTime(), bar);
  }

  return [...byTime.values()].sort((a, b) => a.at - b.at);
}

async function fetchYahooBars(symbol, period1, period2) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("interval", "1m");
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("includePrePost", "true");

  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 SPYProphet/1.0",
    },
  });
  const body = await res.json();
  if (!res.ok) {
    const description = body.chart?.error?.description ?? `HTTP ${res.status}`;
    throw new Error(`Yahoo ${symbol} 1m failed: ${description}`);
  }

  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps?.length || !quote) return [];

  return timestamps
    .map((timestamp, index) => ({
      at: new Date(timestamp * 1000),
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index] ?? 0,
    }))
    .filter((bar) =>
      [bar.open, bar.high, bar.low, bar.close].every(
        (value) => Number.isFinite(value) && value > 0,
      ),
    )
    .map((bar) => {
      const parts = dateParts(bar.at);
      return {
        ...bar,
        ctMinutes: parts.hour * 60 + parts.minute,
        ctWeekday: weekdayNumber(bar.at),
      };
    });
}

function runBacktest(bars, cfg) {
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, cfg.fastEmaLength);
  const slow = ema(closes, cfg.slowEmaLength);
  const atr = computeAtr(bars, cfg.atrLength);
  const volumeAvg = ema(bars.map((bar) => bar.volume), cfg.volumeLength);
  const htf = computeHtfContext(bars, cfg.htfMinutes, cfg.slowEmaLength);
  const ha = heikinAshi(bars);
  for (let i = 0; i < bars.length; i += 1) bars[i].atr = atr[i];
  const trades = [];
  const swingLowValues = [];
  const swingLowBars = [];
  const swingHighValues = [];
  const swingHighBars = [];

  let alertSessionStartIndex = null;
  let wasInSession = false;
  let sessionSetupCount = 0;
  let crossThisSession = false;
  let straddleHigh = null;
  let straddleLow = null;
  let straddleHighIndex = null;
  let straddleLowIndex = null;
  let lastPriceCrossUp50Index = null;
  let lastPriceCrossDown50Index = null;
  let lastGateTouchIndex = null;
  let lastClosedSetupIndex = null;
  let pendingEmaCross = null;
  let armed = null;
  let tradeActive = null;
  const tradedDayKeys = new Set();

  for (let i = 1; i < bars.length; i += 1) {
    const inSession = isAlertSessionBar(bars[i], cfg);
    const currentDayKey = tradeDayKey(bars[i], cfg.sessionTz);
    if (inSession && !wasInSession) {
      alertSessionStartIndex = i;
      sessionSetupCount = 0;
      crossThisSession = false;
      straddleHigh = null;
      straddleLow = null;
      straddleHighIndex = null;
      straddleLowIndex = null;
    }
    if (!inSession && wasInSession) alertSessionStartIndex = null;
    wasInSession = inSession;

    const rawCrossUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const rawCrossDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    const priceCrossUp50 = bars[i - 1].close <= slow[i - 1] && bars[i].close > slow[i];
    const priceCrossDown50 = bars[i - 1].close >= slow[i - 1] && bars[i].close < slow[i];
    if (
      (rawCrossUp || rawCrossDown) &&
      cfg.enableCross !== false &&
      inSession &&
      alertSessionStartIndex !== null &&
      i - alertSessionStartIndex < cfg.straddleDelayMins
    ) {
      crossThisSession = true;
    }
    if (priceCrossUp50) lastPriceCrossUp50Index = i;
    if (priceCrossDown50) lastPriceCrossDown50Index = i;

    const pivotIndex = i - cfg.pivotRight;
    let pivotLow = null;
    let pivotHigh = null;
    if (pivotIndex >= cfg.pivotLeft) {
      if (isPivotLow(bars, pivotIndex, cfg)) {
        pivotLow = bars[pivotIndex].low;
        swingLowValues.push(pivotLow);
        swingLowBars.push(pivotIndex);
        while (swingLowBars.length > cfg.lookbackBars * 2) {
          swingLowValues.shift();
          swingLowBars.shift();
        }
      }
      if (isPivotHigh(bars, pivotIndex, cfg)) {
        pivotHigh = bars[pivotIndex].high;
        swingHighValues.push(pivotHigh);
        swingHighBars.push(pivotIndex);
        while (swingHighBars.length > cfg.lookbackBars * 2) {
          swingHighValues.shift();
          swingHighBars.shift();
        }
      }
    }

    let straddleLongReady = false;
    let straddleShortReady = false;
    let pairHigh = null;
    let pairHighIndex = null;
    let pairLow = null;
    let pairLowIndex = null;
    if (cfg.enableStraddle && pivotHigh !== null) {
      const sPhIndex = pivotIndex;
      if (
        pivotHigh > slow[sPhIndex] &&
        (!cfg.requirePivotOpenStraddle50 || bars[sPhIndex].open > slow[sPhIndex]) &&
        alertSessionStartIndex !== null &&
        sPhIndex >= alertSessionStartIndex &&
        sPhIndex - alertSessionStartIndex >= cfg.straddleDelayMins
      ) {
        if (
          straddleLow !== null &&
          straddleLowIndex >= alertSessionStartIndex &&
          straddleLowIndex < sPhIndex &&
          pivotHigh > straddleLow
        ) {
          straddleLongReady = true;
          pairHigh = pivotHigh;
          pairHighIndex = sPhIndex;
          pairLow = straddleLow;
          pairLowIndex = straddleLowIndex;
        }
        straddleHigh = pivotHigh;
        straddleHighIndex = sPhIndex;
      }
    }
    if (cfg.enableStraddle && pivotLow !== null) {
      const sPlIndex = pivotIndex;
      if (
        pivotLow < slow[sPlIndex] &&
        (!cfg.requirePivotOpenStraddle50 || bars[sPlIndex].open < slow[sPlIndex]) &&
        alertSessionStartIndex !== null &&
        sPlIndex >= alertSessionStartIndex &&
        sPlIndex - alertSessionStartIndex >= cfg.straddleDelayMins
      ) {
        if (
          straddleHigh !== null &&
          straddleHighIndex >= alertSessionStartIndex &&
          straddleHighIndex < sPlIndex &&
          straddleHigh > pivotLow
        ) {
          straddleShortReady = true;
          pairHigh = straddleHigh;
          pairHighIndex = straddleHighIndex;
          pairLow = pivotLow;
          pairLowIndex = sPlIndex;
        }
        straddleLow = pivotLow;
        straddleLowIndex = sPlIndex;
      }
    }

    const gateLineActive = cfg.gateLine > 0;
    const gateTouchedNow =
      gateLineActive && bars[i].low <= cfg.gateLine + cfg.gateTolerance && bars[i].high >= cfg.gateLine - cfg.gateTolerance;
    if (gateTouchedNow) lastGateTouchIndex = i;
    const gateSatisfied =
      !cfg.requireGateTouch ||
      (gateLineActive && lastGateTouchIndex !== null && i - lastGateTouchIndex <= cfg.gateLookbackBars);
    const cooldownSatisfied =
      lastClosedSetupIndex === null || i - lastClosedSetupIndex >= cfg.setupCooldownBars;
    const setupLimit =
      cfg.setupsPerSession === "First only"
        ? 1
        : cfg.setupsPerSession === "First and second"
          ? 2
          : 100000;
    const canStartNewSetup =
      sessionSetupCount < setupLimit &&
      (!cfg.firstTradePerDay || !tradedDayKeys.has(currentDayKey));

    if (tradeActive) {
      const closed = maybeCloseTrade(tradeActive, bars[i], i, isTradeManagementBar(bars[i], cfg), cfg);
      if (closed) {
        trades.push(closed);
        tradeActive = null;
        lastClosedSetupIndex = i;
      }
    }

    const oppositeResetCrossUp =
      armed &&
      armed.direction === "short" &&
      rawCrossUp &&
      inSession &&
      gateSatisfied &&
      cooldownSatisfied &&
      !tradeActive;
    const oppositeResetCrossDown =
      armed &&
      armed.direction === "long" &&
      rawCrossDown &&
      inSession &&
      gateSatisfied &&
      cooldownSatisfied &&
      !tradeActive;
    if (oppositeResetCrossUp || oppositeResetCrossDown) armed = null;

    const crossUp =
      cfg.enableCross !== false &&
      rawCrossUp &&
      inSession &&
      gateSatisfied &&
      cooldownSatisfied &&
      canStartNewSetup &&
      !tradeActive &&
      (!armed || oppositeResetCrossUp);
    const crossDown =
      cfg.enableCross !== false &&
      rawCrossDown &&
      inSession &&
      gateSatisfied &&
      cooldownSatisfied &&
      canStartNewSetup &&
      !tradeActive &&
      (!armed || oppositeResetCrossDown);
    if (crossUp && lastPriceCrossUp50Index !== null) {
      pendingEmaCross = {
        direction: "long",
        emaCrossIndex: i,
        priceCrossIndex: lastPriceCrossUp50Index,
      };
    }
    if (crossDown && lastPriceCrossDown50Index !== null) {
      pendingEmaCross = {
        direction: "short",
        emaCrossIndex: i,
        priceCrossIndex: lastPriceCrossDown50Index,
      };
    }

    if (
      pendingEmaCross &&
      (i - pendingEmaCross.emaCrossIndex > cfg.setupBarsAfterEmaCross || !inSession || tradeActive)
    ) {
      pendingEmaCross = null;
    }

    if (pendingEmaCross && pendingEmaCross.direction === "long") {
      const [longPivotLow, longPivotLowIndex] = findLastPivotBefore(
        swingLowValues,
        swingLowBars,
        pendingEmaCross.priceCrossIndex,
        alertSessionStartIndex,
        cfg,
      );
      const [longPivotHigh, longPivotHighIndex] = findFirstPivotAfter(
        swingHighValues,
        swingHighBars,
        pendingEmaCross.priceCrossIndex,
        alertSessionStartIndex,
        cfg,
      );
      const impossible = pendingEmaCross.priceCrossIndex < alertSessionStartIndex || longPivotLow === null;
      const valid =
        longPivotLow !== null &&
        longPivotHigh !== null &&
        longPivotLowIndex < pendingEmaCross.priceCrossIndex &&
        longPivotHighIndex >= pendingEmaCross.priceCrossIndex &&
        longPivotHigh > longPivotLow;
      const trendOk = !cfg.crossTrendFilter || slow[i] > slow[i - cfg.crossSlopeBars];
      const structOk =
        !cfg.crossStraddle50 ||
        (longPivotLow !== null &&
          longPivotHigh !== null &&
          longPivotLow < slow[longPivotLowIndex] &&
          longPivotHigh > slow[longPivotHighIndex] &&
          (!cfg.requirePivotOpenStraddle50 ||
            (bars[longPivotLowIndex].open < slow[longPivotLowIndex] &&
              bars[longPivotHighIndex].open > slow[longPivotHighIndex])));
      if (impossible || (valid && !(trendOk && structOk))) {
        pendingEmaCross = null;
      } else if (valid) {
        const setup = buildSetup({
          direction: "long",
          mode: "post_cross_retest",
          setupIndex: pendingEmaCross.emaCrossIndex,
          pivotLow: longPivotLow,
          pivotLowIndex: longPivotLowIndex,
          pivotHigh: longPivotHigh,
          pivotHighIndex: longPivotHighIndex,
          cfg,
        });
        if (passesSetupFilters(setup, bars, i, atr, volumeAvg, htf, cfg)) {
          sessionSetupCount += 1;
          const started = maybeStartPreTouchTrade(setup, bars, i, cfg);
          if (started) {
            tradeActive = started;
            tradedDayKeys.add(currentDayKey);
          }
          else armed = setup;
        }
        pendingEmaCross = null;
      }
    }

    if (pendingEmaCross && pendingEmaCross.direction === "short") {
      const [shortPivotHigh, shortPivotHighIndex] = findLastPivotBefore(
        swingHighValues,
        swingHighBars,
        pendingEmaCross.priceCrossIndex,
        alertSessionStartIndex,
        cfg,
      );
      const [shortPivotLow, shortPivotLowIndex] = findFirstPivotAfter(
        swingLowValues,
        swingLowBars,
        pendingEmaCross.priceCrossIndex,
        alertSessionStartIndex,
        cfg,
      );
      const impossible = pendingEmaCross.priceCrossIndex < alertSessionStartIndex || shortPivotHigh === null;
      const valid =
        shortPivotLow !== null &&
        shortPivotHigh !== null &&
        shortPivotHighIndex < pendingEmaCross.priceCrossIndex &&
        shortPivotLowIndex >= pendingEmaCross.priceCrossIndex &&
        shortPivotHigh > shortPivotLow;
      const trendOk = !cfg.crossTrendFilter || slow[i] < slow[i - cfg.crossSlopeBars];
      const structOk =
        !cfg.crossStraddle50 ||
        (shortPivotHigh !== null &&
          shortPivotLow !== null &&
          shortPivotHigh > slow[shortPivotHighIndex] &&
          shortPivotLow < slow[shortPivotLowIndex] &&
          (!cfg.requirePivotOpenStraddle50 ||
            (bars[shortPivotHighIndex].open > slow[shortPivotHighIndex] &&
              bars[shortPivotLowIndex].open < slow[shortPivotLowIndex])));
      if (impossible || (valid && !(trendOk && structOk))) {
        pendingEmaCross = null;
      } else if (valid) {
        const setup = buildSetup({
          direction: "short",
          mode: "post_cross_retest",
          setupIndex: pendingEmaCross.emaCrossIndex,
          pivotLow: shortPivotLow,
          pivotLowIndex: shortPivotLowIndex,
          pivotHigh: shortPivotHigh,
          pivotHighIndex: shortPivotHighIndex,
          cfg,
        });
        if (passesSetupFilters(setup, bars, i, atr, volumeAvg, htf, cfg)) {
          sessionSetupCount += 1;
          const started = maybeStartPreTouchTrade(setup, bars, i, cfg);
          if (started) {
            tradeActive = started;
            tradedDayKeys.add(currentDayKey);
          }
          else armed = setup;
        }
        pendingEmaCross = null;
      }
    }

    const straddleLongOk = straddleLongReady && (!cfg.straddleTrendFilter || fast[i] > slow[i]);
    const straddleShortOk = straddleShortReady && (!cfg.straddleTrendFilter || fast[i] < slow[i]);
    const straddleTrigger =
      (straddleLongOk || straddleShortOk) &&
      !pendingEmaCross &&
      !armed &&
      !tradeActive &&
      !crossThisSession &&
      inSession &&
      gateSatisfied &&
      cooldownSatisfied &&
      canStartNewSetup &&
      alertSessionStartIndex !== null &&
      i - alertSessionStartIndex >= cfg.straddleDelayMins;
    if (straddleTrigger) {
      const direction = straddleLongOk ? "long" : "short";
      const setup = buildSetup({
        direction,
        mode: "ema50_straddle",
        setupIndex: i,
        pivotLow: pairLow,
        pivotLowIndex: pairLowIndex,
        pivotHigh: pairHigh,
        pivotHighIndex: pairHighIndex,
        cfg,
      });
      if (passesSetupFilters(setup, bars, i, atr, volumeAvg, htf, cfg)) {
        sessionSetupCount += 1;
        const started = maybeStartPreTouchTrade(setup, bars, i, cfg);
        if (started) {
          tradeActive = started;
          tradedDayKeys.add(currentDayKey);
        }
        else armed = setup;
      }
    }

    if (armed && (i - armed.setupIndex > cfg.retestBars || !inSession)) {
      armed = null;
      lastClosedSetupIndex = i;
    }

    if (armed) {
      if (
        (armed.direction === "long" && bars[i].close < armed.stop) ||
        (armed.direction === "short" && bars[i].close > armed.stop)
      ) {
        armed = null;
        lastClosedSetupIndex = i;
      } else {
        const entrySignal = entryFromBar(armed, bars[i], ha[i], cfg);
        if (entrySignal) {
          tradeActive = startTrade(armed, i, bars[i], "post_cross_retest");
          tradedDayKeys.add(currentDayKey);
          armed = null;
        } else if (touchesZone(armed, bars[i])) {
          armed.zoneTouchAlerted = true;
        }
      }
    }
  }

  return trades;
}

function buildSetup({ direction, mode, setupIndex, pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, cfg }) {
  const range = pivotHigh - pivotLow;
  if (direction === "long") {
    return {
      direction,
      mode,
      setupIndex,
      pivotLow,
      pivotLowIndex,
      pivotHigh,
      pivotHighIndex,
      fibDeep: pivotHigh - range * cfg.deepFib,
      fib50: pivotLow + range * 0.5,
      target: pivotHigh + range * (cfg.targetMultiple - 1),
      targetFar: pivotHigh + range * (cfg.targetZoneFar - 1),
      stop: pivotLow,
      setupType: mode === "ema50_straddle" ? "straddle" : "cross",
      sessionName: cfg.sessionName ?? "NY",
      stopAtrK: cfg.stopAtrK ?? 0,
    };
  }
  return {
    direction,
    mode,
    setupIndex,
    pivotLow,
    pivotLowIndex,
    pivotHigh,
    pivotHighIndex,
    fibDeep: pivotLow + range * cfg.deepFib,
    fib50: pivotHigh - range * 0.5,
    target: pivotLow - range * (cfg.targetMultiple - 1),
    targetFar: pivotLow - range * (cfg.targetZoneFar - 1),
    stop: pivotHigh,
    setupType: mode === "ema50_straddle" ? "straddle" : "cross",
    sessionName: cfg.sessionName ?? "NY",
    stopAtrK: cfg.stopAtrK ?? 0,
  };
}

function passesSetupFilters(setup, bars, index, atr, volumeAvg, htf, cfg) {
  const impulse = Math.abs(setup.pivotHigh - setup.pivotLow);
  if (cfg.atrFilter === "min_impulse" && !(impulse >= (atr[index] ?? 0) * cfg.minImpulseAtr)) {
    return false;
  }
  if (cfg.htfFilter === "price_vs_ema") {
    const ctx = htf[index];
    if (!ctx || !Number.isFinite(ctx.ema50)) return false;
    if (setup.direction === "long" && !(bars[index].close > ctx.ema50)) return false;
    if (setup.direction === "short" && !(bars[index].close < ctx.ema50)) return false;
  }
  if (cfg.volumeFilter === "impulse_above_avg") {
    const avg = volumeAvg[index] ?? 0;
    const pivotStart = Math.min(setup.pivotLowIndex, setup.pivotHighIndex);
    const pivotEnd = Math.max(setup.pivotLowIndex, setup.pivotHighIndex);
    let maxVol = 0;
    for (let i = pivotStart; i <= pivotEnd; i += 1) maxVol = Math.max(maxVol, bars[i]?.volume ?? 0);
    if (!(maxVol > avg)) return false;
  }
  return true;
}

function maybeStartPreTouchTrade(setup, bars, i, cfg) {
  const preTouch = findPreCrossTouch(bars, setup, i, cfg);
  const targetAhead = setup.direction === "long" ? bars[i].close < setup.target : bars[i].close > setup.target;
  const entryDistanceOk =
    cfg.maxEntryDistanceAtr <= 0 ||
    !Number.isFinite(bars[i].atr) ||
    Math.abs(bars[i].close - setup.fib50) <= bars[i].atr * cfg.maxEntryDistanceAtr;
  if (preTouch && targetAhead && entryDistanceOk) return startTrade(setup, i, bars[i], "pre_cross_touch", preTouch);
  return null;
}

function findPreCrossTouch(bars, setup, i, cfg) {
  const zoneLow = Math.min(setup.fibDeep, setup.fib50);
  const zoneHigh = Math.max(setup.fibDeep, setup.fib50);
  const startIndex = Math.min(setup.pivotLowIndex, setup.pivotHighIndex);
  for (let offset = 1; offset <= cfg.lookbackBars; offset += 1) {
    const idx = i - offset;
    if (idx < startIndex || idx < 0) continue;
    const bar = bars[idx];
    const touched = bar.low <= zoneHigh && bar.high >= zoneLow;
    const closeOk = setup.direction === "long" ? bar.close >= setup.fib50 : bar.close <= setup.fib50;
    const colorOk =
      !cfg.requireCandleColor ||
      (setup.direction === "long" ? bar.close > bar.open : bar.close < bar.open);
    if (touched && closeOk && colorOk) return { index: idx, bar };
  }
  return null;
}

function entryFromBar(setup, bar, ha, cfg) {
  if (cfg.maxEntryDistanceAtr > 0 && bar.atr && Math.abs(bar.close - setup.fib50) > bar.atr * cfg.maxEntryDistanceAtr) {
    return false;
  }
  const touched = touchesZone(setup, bar);
  const longReject =
    setup.direction === "long" &&
    touched &&
    bar.close >= setup.fib50 &&
    bar.close < setup.target &&
    (!cfg.requireCandleColor || bar.close > bar.open) &&
    (!cfg.useHaConfirm || ha.green);
  const shortReject =
    setup.direction === "short" &&
    touched &&
    bar.close <= setup.fib50 &&
    bar.close > setup.target &&
    (!cfg.requireCandleColor || bar.close < bar.open) &&
    (!cfg.useHaConfirm || ha.red);
  return longReject || shortReject;
}

function touchesZone(setup, bar) {
  const zoneLow = Math.min(setup.fibDeep, setup.fib50);
  const zoneHigh = Math.max(setup.fibDeep, setup.fib50);
  return bar.low <= zoneHigh && bar.high >= zoneLow;
}

function startTrade(setup, entryIndex, entryBar, mode, touch = null) {
  const stopPrice = computeTradeStopPrice(setup, entryBar);
  return {
    ...setup,
    entryIndex,
    entryAt: entryBar.at,
    entryPrice: entryBar.close,
    confirmationMode: mode,
    touchIndex: touch?.index ?? null,
    setupType: setup.setupType,
    sessionName: setup.sessionName ?? "NY",
    partialTaken: false,
    originalStop: setup.stop,
    stopPrice,
    stopCloseCount: 0,
  };
}

function maybeCloseTrade(trade, bar, index, inTradeManagementWindow, cfg) {
  if (index <= trade.entryIndex) return null;
  const risk = Math.abs(trade.fib50 - trade.stopPrice);
  const partialTarget = targetFromMultiple(trade, cfg.partialTargetMultiple);
  const partialTargetR = risk === 0 ? 0 : Math.abs(partialTarget - trade.fib50) / risk;
  if (cfg.exitModel === "partial" && !trade.partialTaken) {
    const partialReached =
      trade.direction === "long" ? bar.high >= partialTarget : bar.low <= partialTarget;
    if (partialReached) {
      trade.partialTaken = true;
      trade.partialR = partialTargetR;
      trade.stop = trade.entryPrice;
    }
  }
  const targetReached = trade.direction === "long" ? bar.high >= trade.target : bar.low <= trade.target;
  const stopExit = getStopExit(trade, bar, cfg);
  const invalidated = stopExit !== null;
  const timedOut =
    (cfg.flatAtSessionEnd && !inTradeManagementWindow) ||
    (cfg.maxBarsInTrade > 0 && index - trade.entryIndex >= cfg.maxBarsInTrade);
  const targetR = risk === 0 ? 0 : Math.abs(trade.target - trade.fib50) / risk;
  const blendedWinR =
    cfg.exitModel === "partial" && trade.partialTaken
      ? cfg.partialSize * (trade.partialR ?? partialTargetR) + (1 - cfg.partialSize) * targetR
      : targetR;
  if (targetReached) {
    return { ...trade, exitIndex: index, exitAt: bar.at, exitPrice: trade.target, result: "WIN", r: blendedWinR };
  }
  if (invalidated) {
    const realizedR = realizedRFromExit(trade, stopExit.exitPrice, risk);
    const lossR =
      cfg.exitModel === "partial" && trade.partialTaken
        ? cfg.partialSize * (trade.partialR ?? partialTargetR) + (1 - cfg.partialSize) * Math.min(0, realizedR)
        : realizedR;
    return { ...trade, exitIndex: index, exitAt: bar.at, exitPrice: stopExit.exitPrice, result: lossR >= 0 ? "TIMEOUT" : "LOSS", r: lossR };
  }
  if (timedOut) {
    const openR =
      risk === 0
        ? 0
        : trade.direction === "long"
          ? (bar.close - trade.entryPrice) / risk
          : (trade.entryPrice - bar.close) / risk;
    const r =
      cfg.exitModel === "partial" && trade.partialTaken
        ? cfg.partialSize * (trade.partialR ?? partialTargetR) + (1 - cfg.partialSize) * Math.max(0, openR)
        : openR;
    return { ...trade, exitIndex: index, exitAt: bar.at, exitPrice: bar.close, result: "TIMEOUT", r };
  }
  return null;
}

function computeTradeStopPrice(setup, entryBar) {
  const k = setup.stopAtrK ?? 0;
  if (!k) return setup.stop;
  const atr = Number.isFinite(entryBar.atr) ? entryBar.atr : 0;
  return setup.direction === "long" ? setup.stop - k * atr : setup.stop + k * atr;
}

function getStopExit(trade, bar, cfg) {
  const stop = trade.stopPrice;
  if (cfg.stopRule === "wick") {
    const touched = trade.direction === "long" ? bar.low <= stop : bar.high >= stop;
    return touched ? { exitPrice: stop } : null;
  }

  const beyond = trade.direction === "long" ? bar.close < stop : bar.close > stop;
  if (cfg.stopRule === "consecutive_close") {
    trade.stopCloseCount = beyond ? trade.stopCloseCount + 1 : 0;
    return trade.stopCloseCount >= (cfg.consecutiveCloses ?? 1) ? { exitPrice: bar.close } : null;
  }

  if (cfg.stopRule === "htf_close") {
    const minutes = cfg.htfStopMinutes ?? 5;
    const minuteIndex = Math.floor(bar.at.getTime() / 60000);
    const isHtfClose = minuteIndex % minutes === minutes - 1;
    return isHtfClose && beyond ? { exitPrice: bar.close } : null;
  }

  return beyond ? { exitPrice: bar.close } : null;
}

function realizedRFromExit(trade, exitPrice, risk) {
  if (!risk) return 0;
  return trade.direction === "long"
    ? (exitPrice - trade.fib50) / risk
    : (trade.fib50 - exitPrice) / risk;
}

function targetFromMultiple(trade, multiple) {
  const range = Math.abs(trade.pivotHigh - trade.pivotLow);
  return trade.direction === "long"
    ? trade.pivotHigh + range * (multiple - 1)
    : trade.pivotLow - range * (multiple - 1);
}

function findLastPivotBefore(values, indexes, boundaryIndex, sessionStartIndex, cfg) {
  let foundValue = null;
  let foundIndex = null;
  for (let i = 0; i < indexes.length; i += 1) {
    const idx = indexes[i];
    if (idx >= sessionStartIndex && idx < boundaryIndex && boundaryIndex - idx <= cfg.lookbackBars) {
      foundValue = values[i];
      foundIndex = idx;
    }
  }
  return [foundValue, foundIndex];
}

function findFirstPivotAfter(values, indexes, boundaryIndex, sessionStartIndex, cfg) {
  let foundValue = null;
  let foundIndex = null;
  for (let i = 0; i < indexes.length; i += 1) {
    const idx = indexes[i];
    if (
      idx >= sessionStartIndex &&
      idx >= boundaryIndex &&
      idx - boundaryIndex <= cfg.lookbackBars &&
      (foundIndex === null || idx < foundIndex)
    ) {
      foundValue = values[i];
      foundIndex = idx;
    }
  }
  return [foundValue, foundIndex];
}

function isPivotLow(bars, index, cfg) {
  const value = bars[index].low;
  for (let i = index - cfg.pivotLeft; i <= index + cfg.pivotRight; i += 1) {
    if (i === index || i < 0 || i >= bars.length) continue;
    if (bars[i].low <= value) return false;
  }
  return true;
}

function isPivotHigh(bars, index, cfg) {
  const value = bars[index].high;
  for (let i = index - cfg.pivotLeft; i <= index + cfg.pivotRight; i += 1) {
    if (i === index || i < 0 || i >= bars.length) continue;
    if (bars[i].high >= value) return false;
  }
  return true;
}

function ema(values, length) {
  const out = [];
  const alpha = 2 / (length + 1);
  let previous = values[0];
  for (const value of values) {
    previous = previous == null ? value : alpha * value + (1 - alpha) * previous;
    out.push(previous);
  }
  return out;
}

function computeAtr(bars, length) {
  const trueRanges = bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low;
    const prevClose = bars[index - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
  });
  return ema(trueRanges, length);
}

function computeHtfContext(bars, minutes, emaLength) {
  const bucketMs = minutes * 60 * 1000;
  const buckets = [];
  let current = null;
  for (const bar of bars) {
    const bucket = Math.floor(bar.at.getTime() / bucketMs) * bucketMs;
    if (!current || current.bucket !== bucket) {
      if (current) buckets.push(current);
      current = { bucket, close: bar.close };
    } else {
      current.close = bar.close;
    }
  }
  if (current) buckets.push(current);
  const htfEma = ema(buckets.map((bucket) => bucket.close), emaLength);
  const byBucket = new Map(buckets.map((bucket, index) => [bucket.bucket, { close: bucket.close, ema50: htfEma[index] }]));
  return bars.map((bar) => {
    const bucket = Math.floor(bar.at.getTime() / bucketMs) * bucketMs;
    const priorBucket = bucket - bucketMs;
    return byBucket.get(priorBucket) ?? null;
  });
}

function heikinAshi(bars) {
  const out = [];
  let haOpen = null;
  for (const bar of bars) {
    const haClose = (bar.open + bar.high + bar.low + bar.close) / 4;
    haOpen = haOpen == null ? (bar.open + bar.close) / 2 : (haOpen + out[out.length - 1].close) / 2;
    out.push({ open: haOpen, close: haClose, green: haClose > haOpen, red: haClose < haOpen });
  }
  return out;
}

function isAlertSessionBar(bar, cfg) {
  const timeZone = cfg.sessionTz ?? CT_ZONE;
  bar.sessionTimeCache ??= {};
  let cached = bar.sessionTimeCache[timeZone];
  if (!cached) {
    const parts = datePartsInZone(bar.at, timeZone);
    cached = {
      minutes: parts.hour * 60 + parts.minute,
      weekday: weekdayNumberInZone(bar.at, timeZone),
    };
    bar.sessionTimeCache[timeZone] = cached;
  }
  return (
    cached.weekday >= 1 &&
    cached.weekday <= 5 &&
    cached.minutes >= cfg.alertStartMins &&
    cached.minutes <= cfg.alertEndMins
  );
}

function isTradeManagementBar(bar, cfg) {
  const timeZone = cfg.sessionTz ?? CT_ZONE;
  bar.sessionTimeCache ??= {};
  let cached = bar.sessionTimeCache[timeZone];
  if (!cached) {
    const parts = datePartsInZone(bar.at, timeZone);
    cached = {
      minutes: parts.hour * 60 + parts.minute,
      weekday: weekdayNumberInZone(bar.at, timeZone),
    };
    bar.sessionTimeCache[timeZone] = cached;
  }
  return (
    cached.weekday >= 1 &&
    cached.weekday <= 5 &&
    cached.minutes <= (cfg.tradeManagementEndMins ?? cfg.alertEndMins)
  );
}

function tradeDayKey(bar, timeZone = CT_ZONE) {
  if (bar.tradeDayKeyCache?.[timeZone]) return bar.tradeDayKeyCache[timeZone];
  const parts = datePartsInZone(bar.at, timeZone);
  const key = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  bar.tradeDayKeyCache ??= {};
  bar.tradeDayKeyCache[timeZone] = key;
  return key;
}

function sessionMinutes(date) {
  const parts = dateParts(date);
  return parts.hour * 60 + parts.minute;
}

function dateParts(date) {
  return datePartsInZone(date, CT_ZONE);
}

function datePartsInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

function formatInZone(date, mode = "datetime") {
  if (mode === "weekdayNumber") {
    return weekdayNumber(date);
  }
  const parts = dateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} CT`;
}

function weekdayNumber(date) {
  return weekdayNumberInZone(date, CT_ZONE);
}

function weekdayNumberInZone(date, timeZone) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekday] ?? 0;
}

function summarize(trades) {
  const wins = trades.filter((trade) => trade.result === "WIN").length;
  const losses = trades.filter((trade) => trade.result === "LOSS").length;
  const timeouts = trades.filter((trade) => trade.result === "TIMEOUT").length;
  const closed = wins + losses + timeouts;
  const winRate = closed ? (wins / closed) * 100 : 0;
  const avgR = closed ? trades.reduce((sum, trade) => sum + trade.r, 0) / closed : 0;
  return { closed, wins, losses, timeouts, winRate, avgR };
}

function runStopStudy(barsBySymbol, args) {
  const rows = [];
  const base = {
    ...BASE_CONFIG,
    sessionName: "NewYork",
    sessionTz: CT_ZONE,
    alertStartMins: 8 * 60 + 50,
    alertEndMins: 10 * 60 + 50,
    targetMultiple: args.stopTarget,
    targetZoneFar: Math.max(args.stopTarget, 1.618),
    deepFib: 0.618,
    setupsPerSession: "First only",
    useHaConfirm: false,
    crossTrendFilter: true,
    enableStraddle: true,
    htfFilter: "off",
    atrFilter: "off",
    volumeFilter: "off",
    maxEntryDistanceAtr: 0,
    exitModel: "fixed",
  };

  for (const variant of STOP_STUDY_VARIANTS) {
    const cfg = { ...base, ...variant, variantName: variant.id };
    for (const item of barsBySymbol) {
      const trades = runBacktest(item.bars, cfg);
      rows.push({
        scope: item.symbol.label,
        symbol: item.symbol.label,
        variant,
        cfg,
        trades,
        metrics: stopMetrics(trades),
      });
    }
    const combinedTrades = rows
      .filter((row) => row.variant.id === variant.id && row.scope !== "COMBINED")
      .flatMap((row) => row.trades.map((trade) => ({ ...trade, symbol: row.symbol })));
    rows.push({
      scope: "COMBINED",
      symbol: "COMBINED",
      variant,
      cfg,
      trades: combinedTrades,
      metrics: stopMetrics(combinedTrades),
    });
  }
  return rows;
}

function stopMetrics(trades) {
  const decided = trades.filter((trade) => trade.result === "WIN" || trade.result === "LOSS");
  const wins = decided.filter((trade) => trade.result === "WIN").length;
  const losses = decided.filter((trade) => trade.result === "LOSS").length;
  const timeouts = trades.filter((trade) => trade.result === "TIMEOUT").length;
  const rValues = decided.map((trade) => trade.r);
  const lossValues = decided.filter((trade) => trade.result === "LOSS").map((trade) => trade.r);
  const allRValues = trades.map((trade) => trade.r).filter((value) => Number.isFinite(value));
  const timeoutRValues = trades
    .filter((trade) => trade.result === "TIMEOUT")
    .map((trade) => trade.r)
    .filter((value) => Number.isFinite(value));
  const avgR = rValues.length ? rValues.reduce((sum, r) => sum + r, 0) / rValues.length : 0;
  const avgAllR = allRValues.length ? allRValues.reduce((sum, r) => sum + r, 0) / allRValues.length : 0;
  const avgTimeoutR = timeoutRValues.length ? timeoutRValues.reduce((sum, r) => sum + r, 0) / timeoutRValues.length : 0;
  const avgLossR = lossValues.length ? lossValues.reduce((sum, r) => sum + r, 0) / lossValues.length : 0;
  const winRate = wins + losses ? (wins / (wins + losses)) * 100 : 0;
  const worstLossR = rValues.length ? Math.min(...rValues) : 0;
  let longestLosingStreak = 0;
  let streak = 0;
  for (const trade of decided) {
    if (trade.result === "LOSS") {
      streak += 1;
      longestLosingStreak = Math.max(longestLosingStreak, streak);
    } else {
      streak = 0;
    }
  }
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const r of rValues) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  }
  const variance =
    rValues.length > 1
      ? rValues.reduce((sum, r) => sum + (r - avgR) ** 2, 0) / (rValues.length - 1)
      : 0;
  const standardError = rValues.length ? Math.sqrt(variance) / Math.sqrt(rValues.length) : 0;
  return {
    trades: trades.length,
    decided: decided.length,
    wins,
    losses,
    timeouts,
    winRate,
    avgR,
    avgAllR,
    avgTimeoutR,
    avgLossR,
    worstLossR,
    longestLosingStreak,
    maxDrawdownR,
    standardError,
  };
}

function printStopStudyReport(rows, args, barsBySymbol) {
  console.log("SPY Prophet stop/invalidation variant study");
  console.log("Scope: stop/invalidation rule only. Entry detection, pivots, target, retracement zone, session window, direction, and first-setup rule held constant.");
  console.log(`Core config: 21/50 EMA, 08:50-10:50 CT, first setup only, target ${args.stopTarget}, entry 50-61.8, ATR length 14.`);
  console.log(`Data source: ${args.source === "local" ? `local CSV (${args.dataDir})` : `Yahoo last ${args.days} calendar days`}`);
  for (const item of barsBySymbol) {
    const first = item.bars[0]?.at;
    const last = item.bars[item.bars.length - 1]?.at;
    console.log(`${item.symbol.label}: ${item.bars.length} bars (${first ? formatInZone(first) : "n/a"} -> ${last ? formatInZone(last) : "n/a"})`);
  }
  console.log("");

  const combinedBaseline = rows.find((row) => row.scope === "COMBINED" && row.variant.id === "V0");
  const baselineAvg = combinedBaseline?.metrics.avgR ?? 0;
  const baselineSe = combinedBaseline?.metrics.standardError ?? 0;
  console.log("COMBINED comparison");
  printStopTable(rows.filter((row) => row.scope === "COMBINED"), baselineAvg, baselineSe);
  console.log("");
  console.log("SPY only comparison");
  printStopTable(rows.filter((row) => row.scope === "SPY"), rows.find((row) => row.scope === "SPY" && row.variant.id === "V0")?.metrics.avgR ?? 0, rows.find((row) => row.scope === "SPY" && row.variant.id === "V0")?.metrics.standardError ?? 0);
  console.log("");
  console.log("SPX only comparison");
  printStopTable(rows.filter((row) => row.scope === "SPX"), rows.find((row) => row.scope === "SPX" && row.variant.id === "V0")?.metrics.avgR ?? 0, rows.find((row) => row.scope === "SPX" && row.variant.id === "V0")?.metrics.standardError ?? 0);
  console.log("");

  const winner = rows
    .filter((row) => row.scope === "COMBINED")
    .sort((a, b) => b.metrics.avgR - a.metrics.avgR)[0];
  console.log(`Winner by combined expectancy: ${winner.variant.id} (${winner.variant.label}) avgR ${winner.metrics.avgR.toFixed(2)}, win ${winner.metrics.winRate.toFixed(1)}%, decided ${winner.metrics.decided}.`);
  console.log(`Beats V0 by ${(winner.metrics.avgR - baselineAvg).toFixed(2)}R per decided trade. Approx SE threshold: ${Math.sqrt(baselineSe ** 2 + winner.metrics.standardError ** 2).toFixed(2)}R.`);
  console.log("");
  console.log("Segment breakdowns");
  for (const row of rows.filter((item) => item.scope === "COMBINED")) {
    console.log(`${row.variant.id} ${row.variant.label}`);
    console.log(`  setupType: ${segmentSummary(row.trades, (trade) => trade.setupType ?? "unknown")}`);
    console.log(`  direction: ${segmentSummary(row.trades, (trade) => trade.direction ?? "unknown")}`);
  }
}

function printStopTable(rows, baselineAvg, baselineSe) {
  console.log("| Variant | Rule | Trades | W | L | T | Win % | Avg R | Avg loss R | Worst loss R | Longest L streak | Max DD R | SE | Flag |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const row of rows) {
    const m = row.metrics;
    const diff = m.avgR - baselineAvg;
    const threshold = Math.sqrt(baselineSe ** 2 + m.standardError ** 2);
    const flag = row.variant.id !== "V0" && diff > threshold ? "BEATS V0 > ~1SE" : "";
    console.log(`| ${row.variant.id} | ${row.variant.label} | ${m.trades} | ${m.wins} | ${m.losses} | ${m.timeouts} | ${m.winRate.toFixed(1)} | ${m.avgR.toFixed(2)} | ${m.avgLossR.toFixed(2)} | ${m.worstLossR.toFixed(2)} | ${m.longestLosingStreak} | ${m.maxDrawdownR.toFixed(2)} | ${m.standardError.toFixed(2)} | ${flag} |`);
  }
}

function segmentSummary(trades, keyFn) {
  const groups = new Map();
  for (const trade of trades) {
    const key = keyFn(trade);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => {
      const m = stopMetrics(group);
      return `${key} trades ${m.trades}, win ${m.winRate.toFixed(1)}%, avgR ${m.avgR.toFixed(2)}`;
    })
    .join(" | ");
}

function runTimeStudy(barsBySymbol, args) {
  const rows = [];
  const base = {
    ...BASE_CONFIG,
    sessionName: "NewYork",
    sessionTz: CT_ZONE,
    targetMultiple: args.timeTarget,
    targetZoneFar: Math.max(args.timeTarget, 1.618),
    deepFib: 0.618,
    setupsPerSession: "First only",
    useHaConfirm: false,
    crossTrendFilter: true,
    enableStraddle: true,
    htfFilter: "off",
    atrFilter: "off",
    volumeFilter: "off",
    maxEntryDistanceAtr: 0,
    exitModel: "fixed",
    stopRule: args.timeStopRule,
    stopAtrK: 0,
    htfStopMinutes: args.timeHtfStopMinutes,
    consecutiveCloses: 1,
    requirePivotOpenStraddle50: true,
    tradeManagementEndMins: args.tradeEnd,
  };

  const starts = TIME_STUDY_STARTS.filter((start) => !args.timeStarts || args.timeStarts.has(start));
  const ends = TIME_STUDY_ENDS.filter((end) => !args.timeEnds || args.timeEnds.has(end));
  for (const start of starts) {
    for (const end of ends) {
      if (end <= start + 10) continue;
      const cfg = {
        ...base,
        alertStartMins: start,
        alertEndMins: end,
        variantName: `${formatMinutes(start)}-${formatMinutes(end)}`,
      };
      for (const item of barsBySymbol) {
        const trades = runBacktest(item.bars, cfg);
        rows.push({
          scope: item.symbol.label,
          symbol: item.symbol.label,
          start,
          end,
          cfg,
          trades,
          metrics: stopMetrics(trades),
        });
      }
      const combinedTrades = rows
        .filter((row) => row.start === start && row.end === end && row.scope !== "COMBINED")
        .flatMap((row) => row.trades.map((trade) => ({ ...trade, symbol: row.symbol })));
      rows.push({
        scope: "COMBINED",
        symbol: "COMBINED",
        start,
        end,
        cfg,
        trades: combinedTrades,
        metrics: stopMetrics(combinedTrades),
      });
    }
  }
  return rows;
}

function printTimeStudyReport(rows, args, barsBySymbol) {
  console.log("SPY Prophet time-window study");
  console.log("Scope: start/stop looking window plus pivot-open quality rule. Entry logic, pivots, zone, target, direction, stop rule, and first-setup rule otherwise held constant.");
  console.log("New pivot quality rule: high-pivot candle open must be above 1m 50 EMA; low-pivot candle open must be below 1m 50 EMA.");
  console.log(`Core config: 21/50 EMA, target ${args.timeTarget}, entry 50-61.8, first setup only, stop ${describeStopArgs(args)}, open trades managed until ${formatMinutes(args.tradeEnd)} CT.`);
  console.log(`Data source: ${args.source === "local" ? `local CSV (${args.dataDir})` : `Yahoo last ${args.days} calendar days`}`);
  for (const item of barsBySymbol) {
    const first = item.bars[0]?.at;
    const last = item.bars[item.bars.length - 1]?.at;
    console.log(`${item.symbol.label}: ${item.bars.length} bars (${first ? formatInZone(first) : "n/a"} -> ${last ? formatInZone(last) : "n/a"})`);
  }
  console.log("");

  const combinedRows = rows.filter((row) => row.scope === "COMBINED");
  combinedRows.sort(compareTimeRows);
  console.log("Best COMBINED windows");
  printTimeTable(combinedRows.slice(0, 30));
  console.log("");

  console.log("Best SPY-only windows");
  printTimeTable(rows.filter((row) => row.scope === "SPY").sort(compareTimeRows).slice(0, 20));
  console.log("");

  console.log("Best SPX-only windows");
  printTimeTable(rows.filter((row) => row.scope === "SPX").sort(compareTimeRows).slice(0, 20));
  console.log("");

  const byStart = summarizeTimeAxis(combinedRows, "start");
  const byEnd = summarizeTimeAxis(combinedRows, "end");
  console.log("Start-time average, combined rows with at least 20 decided trades");
  printAxisTable(byStart);
  console.log("");
  console.log("Stop-time average, combined rows with at least 20 decided trades");
  printAxisTable(byEnd);
  console.log("");

  const winner = combinedRows[0];
  console.log(`Winner by combined expectancy: ${formatMinutes(winner.start)}-${formatMinutes(winner.end)} avgR ${winner.metrics.avgR.toFixed(2)}, win ${winner.metrics.winRate.toFixed(1)}%, decided ${winner.metrics.decided}, trades ${winner.metrics.trades}.`);
  console.log(`Segments: setupType ${segmentSummary(winner.trades, (trade) => trade.setupType ?? "unknown")}`);
  console.log(`Segments: direction ${segmentSummary(winner.trades, (trade) => trade.direction ?? "unknown")}`);
}

function describeStopArgs(args) {
  if (args.timeStopRule === "htf_close") return `${args.timeHtfStopMinutes}m close beyond pivot`;
  if (args.timeStopRule === "wick") return "wick/touch pivot stop";
  if (args.timeStopRule === "consecutive_close") return "consecutive closes beyond pivot";
  return "1m close beyond pivot";
}

function compareTimeRows(a, b) {
  return (
    b.metrics.avgR - a.metrics.avgR ||
    b.metrics.winRate - a.metrics.winRate ||
    b.metrics.decided - a.metrics.decided ||
    a.start - b.start ||
    a.end - b.end
  );
}

function printTimeTable(rows) {
  console.log("| Window CT | Trades | W | L | T | Win % | Avg R decided | Avg R all | Avg timeout R | Worst Loss R | Max DD R | Cross | Straddle | Long | Short |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|");
  for (const row of rows) {
    const m = row.metrics;
    console.log(
      `| ${formatMinutes(row.start)}-${formatMinutes(row.end)} | ${m.trades} | ${m.wins} | ${m.losses} | ${m.timeouts} | ${m.winRate.toFixed(1)} | ${m.avgR.toFixed(2)} | ${m.avgAllR.toFixed(2)} | ${m.avgTimeoutR.toFixed(2)} | ${m.worstLossR.toFixed(2)} | ${m.maxDrawdownR.toFixed(2)} | ${compactSegment(row.trades, "setupType", "cross")} | ${compactSegment(row.trades, "setupType", "straddle")} | ${compactSegment(row.trades, "direction", "long")} | ${compactSegment(row.trades, "direction", "short")} |`,
    );
  }
}

function compactSegment(trades, key, value) {
  const group = trades.filter((trade) => (trade[key] ?? "unknown") === value);
  if (!group.length) return "-";
  const m = stopMetrics(group);
  return `${m.trades}/${m.winRate.toFixed(0)}%/${m.avgR.toFixed(2)}R`;
}

function summarizeTimeAxis(rows, axis) {
  const groups = new Map();
  for (const row of rows) {
    if (row.metrics.decided < 20) continue;
    const key = row[axis];
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      count: group.length,
      avgR: group.reduce((sum, row) => sum + row.metrics.avgR, 0) / group.length,
      winRate: group.reduce((sum, row) => sum + row.metrics.winRate, 0) / group.length,
      decided: group.reduce((sum, row) => sum + row.metrics.decided, 0),
    }))
    .sort((a, b) => b.avgR - a.avgR);
}

function printAxisTable(rows) {
  console.log("| Time CT | Windows | Total decided | Avg window R | Avg win % |");
  console.log("|---|---:|---:|---:|---:|");
  for (const row of rows) {
    console.log(`| ${formatMinutes(row.key)} | ${row.count} | ${row.decided} | ${row.avgR.toFixed(2)} | ${row.winRate.toFixed(1)} |`);
  }
}

function runOptionsStudy(barsBySymbol, args) {
  const rows = [];
  const targets = [1.5, 1.618].filter((target) => !args.optionTargets || args.optionTargets.has(String(target)));
  const variants = OPTIONS_STUDY_VARIANTS.filter((variant) => !args.optionsVariants || args.optionsVariants.has(variant.id));
  for (const item of barsBySymbol) {
    const dayContexts = buildDayContexts(item.bars);
    for (const target of targets) {
      for (const variant of variants) {
        const cfg = {
          ...BASE_CONFIG,
          sessionName: "NewYork",
          sessionTz: CT_ZONE,
          alertStartMins: 8 * 60 + 50,
          alertEndMins: 11 * 60 + 15,
          tradeManagementEndMins: 12 * 60,
          targetMultiple: target,
          targetZoneFar: 1.618,
          deepFib: 0.618,
          setupsPerSession: "First only",
          firstTradePerDay: true,
          useHaConfirm: false,
          crossTrendFilter: true,
          enableCross: true,
          enableStraddle: true,
          htfFilter: "off",
          atrFilter: "off",
          volumeFilter: "off",
          maxEntryDistanceAtr: 0,
          exitModel: "fixed",
          stopRule: "htf_close",
          htfStopMinutes: 30,
          stopAtrK: 0,
          consecutiveCloses: 1,
          requirePivotOpenStraddle50: true,
          ...variant.overrides,
        };
        cfg.targetZoneFar = Math.max(cfg.targetZoneFar, cfg.targetMultiple);
        cfg.variantName = variant.id;
        const trades = attachDayContexts(runBacktest(item.bars, cfg), dayContexts);
        rows.push({
          scope: item.symbol.label,
          symbol: item.symbol.label,
          target,
          variant,
          cfg,
          trades,
          metrics: stopMetrics(trades),
        });
      }
    }
  }

  for (const target of targets) {
    for (const variant of variants) {
      const combinedTrades = rows
        .filter((row) => row.target === target && row.variant.id === variant.id && row.scope !== "COMBINED")
        .flatMap((row) => row.trades.map((trade) => ({ ...trade, symbol: row.symbol })));
      rows.push({
        scope: "COMBINED",
        symbol: "COMBINED",
        target,
        variant,
        cfg: { targetMultiple: target, variantName: variant.id },
        trades: combinedTrades,
        metrics: stopMetrics(combinedTrades),
      });
    }
  }
  return rows;
}

function printOptionsStudyReport(rows, args, barsBySymbol) {
  console.log("SPY Prophet ES options-focused batch study");
  console.log("Scope: first actual trade per CT day, entry search 08:50-11:15 CT, open trades managed until 12:00 CT.");
  console.log("Targets tested: 1.5 and 1.618 only. Baseline stop is 30m close beyond pivot. Entry zone is 50-61.8.");
  console.log(`Data source: ${args.source === "local" ? `local CSV (${args.dataDir})` : `Yahoo last ${args.days} calendar days`}`);
  for (const item of barsBySymbol) {
    const first = item.bars[0]?.at;
    const last = item.bars[item.bars.length - 1]?.at;
    console.log(`${item.symbol.label}: ${item.bars.length} bars (${first ? formatInZone(first) : "n/a"} -> ${last ? formatInZone(last) : "n/a"})`);
  }
  console.log("");

  const combined = rows
    .filter((row) => row.scope === "COMBINED")
    .sort((a, b) => b.metrics.avgAllR - a.metrics.avgAllR || b.metrics.winRate - a.metrics.winRate);
  console.log("Ranked combined rows by Avg R all trades");
  printOptionsTable(combined);

  for (const target of [1.5, 1.618]) {
    console.log("");
    console.log(`Target ${target} baseline diagnostics`);
    const baseline = rows.find((row) => row.scope === "COMBINED" && row.target === target && row.variant.id === "baseline");
    if (baseline) {
      printOptionsTable([baseline]);
      printSegments("By setup type", baseline.trades, (trade) => trade.setupType ?? "unknown");
      printSegments("By direction", baseline.trades, (trade) => trade.direction ?? "unknown");
      printSegments("By weekday", baseline.trades, (trade) => trade.weekday ?? "unknown");
      printSegments("By gap bucket", baseline.trades, (trade) => trade.gapBucket ?? "unknown");
      printSegments("By overnight range", baseline.trades, (trade) => trade.overnightRangeBucket ?? "unknown");
    }
  }

  console.log("");
  console.log("Notes");
  console.log("- Option-contract profitability was not directly tested because this dataset is ES futures 1-minute bars, not historical SPX 0DTE option chains.");
  console.log("- Avg R all includes timeouts marked at noon, which is the closest futures-side proxy for 0DTE decay pressure.");
}

function printOptionsTable(rows) {
  console.log("| Target | Variant | Rule | Trades | W | L | T | Win % | Avg R decided | Avg R all | Avg timeout R | Worst loss | Max DD | Cross | Straddle | Long | Short |");
  console.log("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|");
  for (const row of rows) {
    const m = row.metrics;
    console.log(
      `| ${row.target} | ${row.variant.id} | ${row.variant.label} | ${m.trades} | ${m.wins} | ${m.losses} | ${m.timeouts} | ${m.winRate.toFixed(1)} | ${m.avgR.toFixed(2)} | ${m.avgAllR.toFixed(2)} | ${m.avgTimeoutR.toFixed(2)} | ${m.worstLossR.toFixed(2)} | ${m.maxDrawdownR.toFixed(2)} | ${compactSegment(row.trades, "setupType", "cross")} | ${compactSegment(row.trades, "setupType", "straddle")} | ${compactSegment(row.trades, "direction", "long")} | ${compactSegment(row.trades, "direction", "short")} |`,
    );
  }
}

function buildDayContexts(bars) {
  const contexts = new Map();
  for (const bar of bars) {
    const parts = dateParts(bar.at);
    const minutes = parts.hour * 60 + parts.minute;
    const key = minutes >= 17 * 60 ? nextDateKey(parts) : dateKey(parts);
    const context = contexts.get(key) ?? {
      key,
      weekday: weekdayNameFromNumber(weekdayNumber(bar.at)),
      overnightHigh: -Infinity,
      overnightLow: Infinity,
      rthOpen: null,
      rthClose: null,
      previousRthClose: null,
    };
    if (minutes >= 17 * 60 || minutes < 8 * 60 + 30) {
      context.overnightHigh = Math.max(context.overnightHigh, bar.high);
      context.overnightLow = Math.min(context.overnightLow, bar.low);
    }
    if (minutes >= 8 * 60 + 30 && context.rthOpen === null) context.rthOpen = bar.open;
    if (minutes >= 8 * 60 + 30 && minutes <= 15 * 60) context.rthClose = bar.close;
    contexts.set(key, context);
  }
  const ordered = [...contexts.keys()].sort();
  let previousRthClose = null;
  for (const key of ordered) {
    const context = contexts.get(key);
    context.previousRthClose = previousRthClose;
    context.gapPts =
      context.rthOpen !== null && previousRthClose !== null ? context.rthOpen - previousRthClose : null;
    context.overnightRangePts =
      Number.isFinite(context.overnightHigh) && Number.isFinite(context.overnightLow)
        ? context.overnightHigh - context.overnightLow
        : null;
    context.gapBucket = bucketGap(context.gapPts);
    context.overnightRangeBucket = bucketOvernightRange(context.overnightRangePts);
    if (context.rthClose !== null) previousRthClose = context.rthClose;
  }
  return contexts;
}

function attachDayContexts(trades, dayContexts) {
  return trades.map((trade) => {
    const key = tradeDayKey({ at: trade.entryAt }, CT_ZONE);
    const context = dayContexts.get(key);
    return {
      ...trade,
      weekday: context?.weekday ?? "unknown",
      gapBucket: context?.gapBucket ?? "unknown",
      overnightRangeBucket: context?.overnightRangeBucket ?? "unknown",
      gapPts: context?.gapPts ?? null,
      overnightRangePts: context?.overnightRangePts ?? null,
    };
  });
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function nextDateKey(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 12, 0, 0));
  return dateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function weekdayNameFromNumber(day) {
  return ["unknown", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day] ?? "unknown";
}

function bucketGap(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 10) return "gap_up_large";
  if (value >= 3) return "gap_up";
  if (value <= -10) return "gap_down_large";
  if (value <= -3) return "gap_down";
  return "flat";
}

function bucketOvernightRange(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 60) return "wide";
  if (value <= 25) return "quiet";
  return "normal";
}

function formatMinutes(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function printResearchReport(rows, args, barsBySymbol) {
  console.log("SPY Prophet Ultimate settings sweep");
  console.log(
    `Data source: ${args.source === "local" ? `local CSV (${args.dataDir})` : `Yahoo last ${args.days} calendar days, 1-minute bars`}`,
  );
  for (const item of barsBySymbol) {
    const first = item.bars[0]?.at;
    const last = item.bars[item.bars.length - 1]?.at;
    console.log(
      `${item.symbol.label}: ${item.bars.length} bars (${first ? formatInZone(first) : "n/a"} -> ${last ? formatInZone(last) : "n/a"})`,
    );
  }
  console.log(`Minimum trades for ranking: ${args.minTrades}`);
  console.log("");

  const eligible = rows.filter((row) => row.summary.closed >= args.minTrades);
  const ranked = [...eligible].sort(compareRows);
  console.log("Best single-symbol settings");
  for (const row of ranked.slice(0, 15)) printRow(row);

  const combined = combineRows(rows).filter((row) => row.summary.closed >= args.minTrades);
  combined.sort(compareRows);
  console.log("");
  console.log("Best combined settings");
  for (const row of combined.slice(0, 15)) printCombinedRow(row);

  console.log("");
  console.log("Combined variant scoreboard");
  for (const row of combined) printCombinedRow(row);

  console.log("");
  console.log("Current v2 default baseline");
  const baselineRows = rows.filter((row) => isBaseline(row.cfg, row.window, row.variant));
  for (const row of baselineRows) printRow(row);

  const baselineCombined = combineRows(baselineRows)[0];
  if (baselineCombined) {
    console.log("");
    console.log("Segmented diagnostics for current v2 baseline");
    printSegments("Combined by setup type", baselineCombined.trades, (trade) => trade.setupType ?? "unknown");
    printSegments("Combined by direction", baselineCombined.trades, (trade) => trade.direction ?? "unknown");
    printSegments("Combined by session", baselineCombined.trades, (trade) => trade.sessionName ?? "unknown");
    for (const row of baselineRows) {
      printSegments(`${row.symbol} by setup type`, row.trades, (trade) => trade.setupType ?? "unknown");
      printSegments(`${row.symbol} by direction`, row.trades, (trade) => trade.direction ?? "unknown");
    }
  }
}

function compareRows(a, b) {
  return (
    b.summary.winRate - a.summary.winRate ||
    b.summary.closed - a.summary.closed ||
    b.summary.avgR - a.summary.avgR
  );
}

function combineRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = configKey(row.cfg, row.window);
    const existing =
      groups.get(key) ??
      {
        key,
        window: row.window,
        session: row.session,
        cfg: row.cfg,
        variant: row.variant,
        trades: [],
      };
    existing.trades.push(...row.trades.map((trade) => ({ ...trade, symbol: row.symbol })));
    groups.set(key, existing);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    summary: summarize(row.trades),
  }));
}

function configKey(cfg, window) {
  return [
    cfg.sessionName,
    window,
    cfg.variantName,
    cfg.targetMultiple,
    cfg.deepFib,
    cfg.setupsPerSession,
    cfg.useHaConfirm,
    cfg.crossTrendFilter,
    cfg.enableStraddle,
    cfg.htfFilter,
    cfg.htfMinutes,
    cfg.atrFilter,
    cfg.minImpulseAtr,
    cfg.maxEntryDistanceAtr,
    cfg.volumeFilter,
    cfg.exitModel,
    cfg.partialTargetMultiple,
    cfg.partialSize,
  ].join("|");
}

function isBaseline(cfg, window, variant) {
  return (
    window === "0850-1050" &&
    cfg.sessionName === "NewYork" &&
    variant === "baseline" &&
    cfg.targetMultiple === 1.5 &&
    cfg.deepFib === 0.618 &&
    cfg.setupsPerSession === "First only" &&
    cfg.useHaConfirm === false &&
    cfg.crossTrendFilter === true &&
    cfg.enableStraddle === true
  );
}

function printRow(row) {
  console.log(
    `${row.symbol} ${describeConfig(row)} | trades ${row.summary.closed} | W ${row.summary.wins} L ${row.summary.losses} T ${row.summary.timeouts} | win ${row.summary.winRate.toFixed(1)}% | avgR ${row.summary.avgR.toFixed(2)}`,
  );
}

function printCombinedRow(row) {
  console.log(
    `COMBINED ${describeConfig(row)} | trades ${row.summary.closed} | W ${row.summary.wins} L ${row.summary.losses} T ${row.summary.timeouts} | win ${row.summary.winRate.toFixed(1)}% | avgR ${row.summary.avgR.toFixed(2)}`,
  );
}

function describeConfig(row) {
  const cfg = row.cfg;
  const variant = row.variant ?? cfg.variantName ?? "baseline";
  const session = row.session ?? cfg.sessionName ?? "NewYork";
  return `session ${session}, variant ${variant}, window ${row.window}, target ${cfg.targetMultiple}, fib 50-${(cfg.deepFib * 100).toFixed(1)}, setups ${cfg.setupsPerSession}, HA ${cfg.useHaConfirm ? "on" : "off"}, slope ${cfg.crossTrendFilter ? "on" : "off"}, straddle ${cfg.enableStraddle ? "on" : "off"}`;
}

function printSegments(title, trades, keyFn) {
  console.log(title);
  const groups = new Map();
  for (const trade of trades) {
    const key = keyFn(trade);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  for (const [key, groupTrades] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const summary = summarize(groupTrades);
    console.log(
      `  ${key}: trades ${summary.closed} | W ${summary.wins} L ${summary.losses} T ${summary.timeouts} | win ${summary.winRate.toFixed(1)}% | avgR ${summary.avgR.toFixed(2)}`,
    );
  }
}

function printReport(rows, args) {
  console.log(`SPY Prophet Ultimate backtest`);
  console.log(`Window: last ${args.days} calendar days, 1-minute Yahoo bars, regular session only`);
  console.log(`Defaults: first setup/session, 21/50, 0850-1150 CT, target ${CONFIG.targetMultiple}, deep fib ${CONFIG.deepFib}, straddle on from 09:40 CT`);
  console.log("");

  for (const row of rows) {
    const first = row.bars[0]?.at;
    const last = row.bars[row.bars.length - 1]?.at;
    console.log(`${row.symbol.label}: ${row.bars.length} bars (${first ? formatInZone(first) : "n/a"} -> ${last ? formatInZone(last) : "n/a"})`);
    console.log(
      `  Trades: ${row.summary.closed} | Wins: ${row.summary.wins} | Losses: ${row.summary.losses} | Timeouts: ${row.summary.timeouts} | Win rate: ${row.summary.winRate.toFixed(1)}% | Avg R: ${row.summary.avgR.toFixed(2)}`,
    );
    for (const trade of row.trades) {
      console.log(
        `  ${formatInZone(trade.entryAt)} ${trade.direction.toUpperCase()} ${trade.confirmationMode} entry ${fmt(trade.entryPrice)} target ${fmt(trade.target)} stop ${fmt(trade.stop)} -> ${trade.result} ${fmt(trade.exitPrice)} ${formatInZone(trade.exitAt)} R=${trade.r.toFixed(2)} pivots ${fmt(trade.pivotLow)}-${fmt(trade.pivotHigh)}`,
      );
    }
    console.log("");
  }
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}
