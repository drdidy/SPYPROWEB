import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CT_ZONE = "America/Chicago";
const DATA_FILES = [
  "data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv",
  "data/databento/ES_ohlcv-1m_2026-06-17_tail.csv",
];
const OUT_DIR = "outputs/ema21_50_clean_optimizer";
const SPLIT_DATE = "2026-03-01";

const WINDOWS = [
  [8 * 60 + 30, 10 * 60],
  [8 * 60 + 45, 10 * 60 + 30],
  [8 * 60 + 50, 10 * 60 + 50],
  [8 * 60 + 50, 11 * 60 + 50],
  [9 * 60, 11 * 60],
  [9 * 60, 11 * 60 + 50],
  [9 * 60 + 30, 12 * 60],
];
const MODES = ["fib_retest", "ema50_retest", "cross_close"];
const FILTERS = ["none", "slope3", "slope5", "htf15", "htf30", "slope3_htf15"];
const BAND_PAIRS = [
  [0.382, 0.5],
  [0.5, 0.618],
  [0.618, 0.786],
];
const TARGETS = [1.236, 1.382, 1.5, 1.618, 2.0];
const STOP_RULES = [
  { name: "1m_close", kind: "close" },
  { name: "3x1m_close", kind: "consecutive", n: 3 },
  { name: "10x1m_close", kind: "consecutive", n: 10 },
  { name: "15m_close", kind: "htf", minutes: 15 },
  { name: "30m_close", kind: "htf", minutes: 30 },
  { name: "30m_or_10x1m", kind: "combo", minutes: 30, n: 10 },
];
const LOOKBACKS = [10, 20, 40, 60];
const SETUP_WAIT_BARS = [3, 5, 8, 12];
const RETEST_BARS = [30, 60, 90];
const ATR_MIN = [0, 0.5, 0.75];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const bars = await loadBars(DATA_FILES);
  decorateBars(bars);
  const ctx = buildContext(bars);

  await mkdir(OUT_DIR, { recursive: true });

  const stage1Configs = [];
  for (const [start, end] of WINDOWS) {
    for (const mode of MODES) {
      for (const filter of FILTERS) {
        for (const atrMin of ATR_MIN) {
          const bandSet = mode === "fib_retest" ? BAND_PAIRS : [[0.5, 0.618]];
          for (const [near, far] of bandSet) {
            stage1Configs.push({
              mode,
              start,
              end,
              manageEnd: 12 * 60,
              filter,
              atrMin,
              lookback: 20,
              setupWait: 5,
              retestBars: 60,
              near,
              far,
              target: 1.5,
              stop: { name: "30m_or_10x1m", kind: "combo", minutes: 30, n: 10 },
              firstPerDay: true,
            });
          }
        }
      }
    }
  }

  const stage1 = evaluateConfigs(bars, ctx, stage1Configs, "stage1");
  const seeds = stage1
    .filter((row) => row.full.trades >= 15)
    .sort((a, b) => scoreRow(b) - scoreRow(a))
    .slice(0, 35)
    .map((row) => row.cfg);

  const stage2Configs = [];
  for (const seed of seeds) {
    for (const lookback of LOOKBACKS) {
      for (const setupWait of SETUP_WAIT_BARS) {
        for (const retestBars of RETEST_BARS) {
          for (const target of TARGETS) {
            for (const stop of STOP_RULES) {
              stage2Configs.push({
                ...seed,
                lookback,
                setupWait,
                retestBars,
                target,
                stop,
              });
            }
          }
        }
      }
    }
  }

  const stage2 = evaluateConfigs(bars, ctx, uniqueConfigs(stage2Configs), "stage2");
  const allRows = [...stage1, ...stage2];
  const bestFull = rankRows(allRows, "full").slice(0, 25);
  const bestRobust = allRows
    .filter((row) => row.train.trades >= 12 && row.test.trades >= 8 && row.full.trades >= 25)
    .sort((a, b) => robustScore(b) - robustScore(a))
    .slice(0, 25);

  await writeCsv(path.join(OUT_DIR, "all_results.csv"), allRows);
  await writeCsv(path.join(OUT_DIR, "best_full.csv"), bestFull);
  await writeCsv(path.join(OUT_DIR, "best_robust.csv"), bestRobust);
  await writeTrades(path.join(OUT_DIR, "best_robust_trades.csv"), runBacktest(bars, ctx, bestRobust[0].cfg));
  await writeReport(path.join(OUT_DIR, "report.md"), bars, bestFull, bestRobust);
  console.log(reportText(bars, bestFull, bestRobust));
}

function evaluateConfigs(bars, ctx, configs, stage) {
  const rows = [];
  let i = 0;
  for (const cfg of configs) {
    const trades = runBacktest(bars, ctx, cfg);
    rows.push({
      stage,
      cfg,
      full: summarize(trades),
      train: summarize(trades.filter((trade) => trade.entryDate < SPLIT_DATE)),
      test: summarize(trades.filter((trade) => trade.entryDate >= SPLIT_DATE)),
    });
    i += 1;
    if (i % 1000 === 0) console.error(`${stage}: ${i}/${configs.length}`);
  }
  return rows;
}

function runBacktest(bars, ctx, cfg) {
  const trades = [];
  const tradedDays = new Set();
  let active = null;
  let wasInSession = false;
  let sessionStartIndex = 0;

  for (let i = 60; i < bars.length; i += 1) {
    const bar = bars[i];
    const inSession = isTradeDay(bar) && bar.ctMinutes >= cfg.start && bar.ctMinutes < cfg.end;
    const inManage = isTradeDay(bar) && bar.ctMinutes >= cfg.start && bar.ctMinutes < cfg.manageEnd;
    if (inSession && !wasInSession) sessionStartIndex = i;
    wasInSession = inSession;

    if (active) {
      const closed = maybeClose(active, bars, ctx, i, cfg, inManage);
      if (closed) {
        trades.push(closed);
        active = null;
      }
      if (active) continue;
    }

    if (!inSession) continue;
    if (cfg.firstPerDay && tradedDays.has(bar.ctDate)) continue;

    const crossUp = ctx.fast[i - 1] <= ctx.slow[i - 1] && ctx.fast[i] > ctx.slow[i];
    const crossDown = ctx.fast[i - 1] >= ctx.slow[i - 1] && ctx.fast[i] < ctx.slow[i];
    if (!crossUp && !crossDown) continue;

    const direction = crossUp ? "long" : "short";
    if (!passesFilter(direction, i, bars, ctx, cfg)) continue;

    const setup = buildSetup(direction, i, bars, ctx, cfg, sessionStartIndex);
    if (!setup) continue;
    if (cfg.atrMin > 0 && setup.range < (ctx.atr[i] ?? 0) * cfg.atrMin) continue;

    const trade = findEntry(setup, bars, ctx, cfg);
    if (trade) {
      active = trade;
      tradedDays.add(trade.entryDate);
    }
  }
  return trades;
}

function buildSetup(direction, crossIndex, bars, ctx, cfg, sessionStartIndex) {
  if (cfg.mode === "cross_close") {
    const piv = direction === "long"
      ? findLastPivot(ctx.pivotLows, crossIndex, sessionStartIndex, cfg.lookback, (p) => p.open < ctx.slow[p.index])
      : findLastPivot(ctx.pivotHighs, crossIndex, sessionStartIndex, cfg.lookback, (p) => p.open > ctx.slow[p.index]);
    if (!piv) return null;
    const stop = piv.value;
    const risk = Math.abs(bars[crossIndex].close - stop);
    if (risk <= 0) return null;
    return {
      mode: cfg.mode,
      direction,
      crossIndex,
      setupReadyIndex: crossIndex,
      entryLevel: bars[crossIndex].close,
      stop,
      target: direction === "long" ? bars[crossIndex].close + risk * cfg.target : bars[crossIndex].close - risk * cfg.target,
      range: risk,
      pivotLow: direction === "long" ? stop : null,
      pivotHigh: direction === "short" ? stop : null,
    };
  }

  if (cfg.mode === "ema50_retest") {
    const piv = direction === "long"
      ? findLastPivot(ctx.pivotLows, crossIndex, sessionStartIndex, cfg.lookback, (p) => p.open < ctx.slow[p.index])
      : findLastPivot(ctx.pivotHighs, crossIndex, sessionStartIndex, cfg.lookback, (p) => p.open > ctx.slow[p.index]);
    if (!piv) return null;
    return {
      mode: cfg.mode,
      direction,
      crossIndex,
      setupReadyIndex: crossIndex,
      stop: piv.value,
      range: Math.abs(bars[crossIndex].close - piv.value),
      pivotLow: direction === "long" ? piv.value : null,
      pivotHigh: direction === "short" ? piv.value : null,
    };
  }

  const boundary = direction === "long" ? lastIndexAtOrBefore(ctx.priceCrossUp50, crossIndex) : lastIndexAtOrBefore(ctx.priceCrossDown50, crossIndex);
  const pivotA = direction === "long"
    ? findLastPivot(ctx.pivotLows, boundary ?? crossIndex, sessionStartIndex, cfg.lookback, (p) => p.open < ctx.slow[p.index])
    : findLastPivot(ctx.pivotHighs, boundary ?? crossIndex, sessionStartIndex, cfg.lookback, (p) => p.open > ctx.slow[p.index]);
  const pivotB = direction === "long"
    ? findFirstPivot(ctx.pivotHighs, boundary ?? crossIndex, cfg.setupWait, (p) => p.open > ctx.slow[p.index])
    : findFirstPivot(ctx.pivotLows, boundary ?? crossIndex, cfg.setupWait, (p) => p.open < ctx.slow[p.index]);
  if (!pivotA || !pivotB) return null;

  const pivotLow = direction === "long" ? pivotA.value : pivotB.value;
  const pivotHigh = direction === "long" ? pivotB.value : pivotA.value;
  if (!(pivotHigh > pivotLow)) return null;

  const range = pivotHigh - pivotLow;
  const nearLevel = direction === "long" ? pivotHigh - range * cfg.near : pivotLow + range * cfg.near;
  const farLevel = direction === "long" ? pivotHigh - range * cfg.far : pivotLow + range * cfg.far;
  const target = direction === "long" ? pivotHigh + range * (cfg.target - 1) : pivotLow - range * (cfg.target - 1);
  return {
    mode: cfg.mode,
    direction,
    crossIndex,
    setupReadyIndex: Math.max(crossIndex, pivotB.index + 1),
    pivotLow,
    pivotHigh,
    range,
    nearLevel,
    farLevel,
    stop: direction === "long" ? pivotLow : pivotHigh,
    target,
  };
}

function findEntry(setup, bars, ctx, cfg) {
  if (setup.mode === "cross_close") {
    return startTrade(setup, bars, setup.crossIndex, bars[setup.crossIndex].close, cfg);
  }

  const endIndex = Math.min(bars.length - 1, setup.setupReadyIndex + cfg.retestBars);
  for (let i = setup.setupReadyIndex; i <= endIndex; i += 1) {
    const bar = bars[i];
    if (!isTradeDay(bar) || bar.ctMinutes >= cfg.manageEnd) return null;
    if (setup.mode === "ema50_retest") {
      const touched = setup.direction === "long" ? bar.low <= ctx.slow[i] : bar.high >= ctx.slow[i];
      const confirmed = setup.direction === "long" ? bar.close > ctx.slow[i] && bar.close > bar.open : bar.close < ctx.slow[i] && bar.close < bar.open;
      if (!touched || !confirmed) continue;
      const entryPrice = bar.close;
      const risk = Math.abs(entryPrice - setup.stop);
      if (risk <= 0) return null;
      setup.target = setup.direction === "long" ? entryPrice + risk * cfg.target : entryPrice - risk * cfg.target;
      return startTrade(setup, bars, i, entryPrice, cfg);
    }
    const zLo = Math.min(setup.nearLevel, setup.farLevel);
    const zHi = Math.max(setup.nearLevel, setup.farLevel);
    const touched = bar.low <= zHi && bar.high >= zLo;
    const confirmed = setup.direction === "long"
      ? bar.close >= setup.nearLevel && bar.close > bar.open && bar.close < setup.target
      : bar.close <= setup.nearLevel && bar.close < bar.open && bar.close > setup.target;
    if (touched && confirmed) return startTrade(setup, bars, i, bar.close, cfg);
  }
  return null;
}

function startTrade(setup, bars, index, entryPrice, cfg) {
  return {
    mode: setup.mode,
    direction: setup.direction,
    entryIndex: index,
    entryAt: bars[index].at,
    entryDate: bars[index].ctDate,
    entryTimeCT: hm(bars[index]),
    entryPrice,
    fib50: setup.nearLevel ?? entryPrice,
    stop: setup.stop,
    target: setup.target,
    range: setup.range,
    pivotLow: setup.pivotLow,
    pivotHigh: setup.pivotHigh,
    stopCount: 0,
    htfLastBucket: null,
  };
}

function maybeClose(trade, bars, ctx, i, cfg, inManage) {
  if (i <= trade.entryIndex) return null;
  const bar = bars[i];
  const risk = Math.abs((trade.fib50 ?? trade.entryPrice) - trade.stop);
  const targetTouched = trade.direction === "long" ? bar.high >= trade.target : bar.low <= trade.target;
  if (targetTouched) return finishTrade(trade, bar, i, trade.target, "WIN", risk ? Math.abs(trade.target - (trade.fib50 ?? trade.entryPrice)) / risk : 0, "target");

  const stopExit = stopTriggered(trade, bars, i, cfg);
  if (stopExit) {
    const r = realizedR(trade, stopExit.price, risk);
    return finishTrade(trade, stopExit.bar, stopExit.index, stopExit.price, "LOSS", r, stopExit.reason);
  }

  if (!inManage) {
    const r = realizedR(trade, bar.close, risk);
    return finishTrade(trade, bar, i, bar.close, "TIMEOUT", r, "time");
  }
  return null;
}

function stopTriggered(trade, bars, index, cfg) {
  const stop = cfg.stop;
  if (stop.kind === "close") return oneMinuteCloseStop(trade, bars[index], index, stop.name);
  if (stop.kind === "consecutive") return consecutiveStop(trade, bars, index, stop.n, stop.name);
  if (stop.kind === "htf") return htfStop(trade, bars, index, stop.minutes, stop.name);
  if (stop.kind === "combo") return htfStop(trade, bars, index, stop.minutes, `${stop.minutes}m_close`) ?? consecutiveStop(trade, bars, index, stop.n, `${stop.n}x1m_close`);
  return null;
}

function oneMinuteCloseStop(trade, bar, index, reason) {
  const beyond = trade.direction === "long" ? bar.close < trade.stop : bar.close > trade.stop;
  return beyond ? { price: bar.close, bar, index, reason } : null;
}

function consecutiveStop(trade, bars, index, n, reason) {
  if (index - trade.entryIndex < n) return null;
  for (let k = 0; k < n; k += 1) {
    const bar = bars[index - k];
    const beyond = trade.direction === "long" ? bar.close < trade.stop : bar.close > trade.stop;
    if (!beyond) return null;
  }
  return { price: bars[index].close, bar: bars[index], index, reason };
}

function htfStop(trade, bars, index, minutes, reason) {
  const bar = bars[index];
  const prev = bars[index - 1];
  if (!prev) return null;
  if (htfBucket(bar, minutes) === htfBucket(prev, minutes)) return null;
  const beyond = trade.direction === "long" ? prev.close < trade.stop : prev.close > trade.stop;
  return beyond ? { price: prev.close, bar: prev, index: index - 1, reason } : null;
}

function htfBucket(bar, minutes) {
  return `${bar.ctDate}-${bar.ct.hour}-${Math.floor(bar.ct.minute / minutes)}`;
}

function finishTrade(trade, bar, index, exitPrice, result, r, exitReason) {
  return {
    ...trade,
    exitIndex: index,
    exitAt: bar.at,
    exitDate: bar.ctDate,
    exitTimeCT: hm(bar),
    exitPrice,
    result,
    r,
    exitReason,
  };
}

function realizedR(trade, exitPrice, risk) {
  if (!risk) return 0;
  const entryRef = trade.fib50 ?? trade.entryPrice;
  return trade.direction === "long" ? (exitPrice - entryRef) / risk : (entryRef - exitPrice) / risk;
}

function passesFilter(direction, i, bars, ctx, cfg) {
  if (cfg.filter.includes("slope3")) {
    if (direction === "long" && !(ctx.slow[i] > ctx.slow[i - 3])) return false;
    if (direction === "short" && !(ctx.slow[i] < ctx.slow[i - 3])) return false;
  }
  if (cfg.filter.includes("slope5")) {
    if (direction === "long" && !(ctx.slow[i] > ctx.slow[i - 5])) return false;
    if (direction === "short" && !(ctx.slow[i] < ctx.slow[i - 5])) return false;
  }
  if (cfg.filter.includes("htf15")) {
    if (direction === "long" && !(bars[i].close > ctx.htf15[i])) return false;
    if (direction === "short" && !(bars[i].close < ctx.htf15[i])) return false;
  }
  if (cfg.filter.includes("htf30")) {
    if (direction === "long" && !(bars[i].close > ctx.htf30[i])) return false;
    if (direction === "short" && !(bars[i].close < ctx.htf30[i])) return false;
  }
  return true;
}

function buildContext(bars) {
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, 21);
  const slow = ema(closes, 50);
  const atr = computeAtr(bars, 14);
  const pivotLows = [];
  const pivotHighs = [];
  const priceCrossUp50 = [];
  const priceCrossDown50 = [];
  for (let i = 2; i < bars.length - 2; i += 1) {
    if (bars[i - 1].close <= slow[i - 1] && bars[i].close > slow[i]) priceCrossUp50.push(i);
    if (bars[i - 1].close >= slow[i - 1] && bars[i].close < slow[i]) priceCrossDown50.push(i);
    if (bars[i].low < bars[i - 1].low && bars[i].low < bars[i + 1].low) pivotLows.push({ index: i, value: bars[i].low, open: bars[i].open });
    if (bars[i].high > bars[i - 1].high && bars[i].high > bars[i + 1].high) pivotHighs.push({ index: i, value: bars[i].high, open: bars[i].open });
  }
  return {
    fast,
    slow,
    atr,
    htf15: htfEmaToMinuteBars(bars, 15, 50),
    htf30: htfEmaToMinuteBars(bars, 30, 50),
    pivotLows,
    pivotHighs,
    priceCrossUp50,
    priceCrossDown50,
  };
}

function findLastPivot(pivots, boundary, sessionStart, lookback, predicate) {
  const min = Math.max(sessionStart, boundary - lookback);
  for (let i = upperBoundPivot(pivots, boundary - 1); i >= 0; i -= 1) {
    const p = pivots[i];
    if (p.index < min) return null;
    if (!predicate || predicate(p)) return p;
  }
  return null;
}

function findFirstPivot(pivots, boundary, maxAfter, predicate) {
  const max = boundary + maxAfter;
  for (let i = lowerBoundPivot(pivots, boundary); i < pivots.length; i += 1) {
    const p = pivots[i];
    if (p.index > max) return null;
    if (!predicate || predicate(p)) return p;
  }
  return null;
}

function lowerBoundPivot(pivots, index) {
  let lo = 0;
  let hi = pivots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pivots[mid].index < index) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundPivot(pivots, index) {
  let lo = 0;
  let hi = pivots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pivots[mid].index <= index) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function lastIndexAtOrBefore(values, index) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= index) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? values[lo - 1] : null;
}

function summarize(trades) {
  const wins = trades.filter((t) => t.result === "WIN");
  const losses = trades.filter((t) => t.result === "LOSS");
  const timeouts = trades.filter((t) => t.result === "TIMEOUT");
  const decided = wins.length + losses.length;
  const rAll = trades.map((t) => t.r);
  const rDecided = [...wins, ...losses].map((t) => t.r);
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    winRate: decided ? (wins.length * 100) / decided : 0,
    avgR: avg(rDecided),
    avgAllR: avg(rAll),
    maxDD: maxDrawdown(rAll),
    worst: Math.min(0, ...losses.map((t) => t.r)),
    longestL: longestLosingStreak(trades),
  };
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function maxDrawdown(values) {
  let equity = 0;
  let peak = 0;
  let dd = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    dd = Math.max(dd, peak - equity);
  }
  return dd;
}

function longestLosingStreak(trades) {
  let current = 0;
  let longest = 0;
  for (const trade of trades) {
    if (trade.result === "LOSS") current += 1;
    if (trade.result === "WIN") current = 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function rankRows(rows, scope) {
  return rows
    .filter((row) => row[scope].trades >= 20)
    .sort((a, b) => metricScore(b[scope]) - metricScore(a[scope]));
}

function scoreRow(row) {
  return metricScore(row.full) + 0.5 * metricScore(row.test);
}

function robustScore(row) {
  return Math.min(row.train.avgAllR, row.test.avgAllR) * 100 + row.full.avgAllR * 25 - row.full.maxDD * 2 + Math.min(row.full.trades, 60) * 0.1;
}

function metricScore(m) {
  return m.avgAllR * 100 + m.winRate * 0.2 - m.maxDD * 2 + Math.min(m.trades, 80) * 0.05;
}

function uniqueConfigs(configs) {
  const seen = new Set();
  const out = [];
  for (const cfg of configs) {
    const key = cfgKey(cfg);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cfg);
  }
  return out;
}

function cfgKey(cfg) {
  return [
    cfg.mode,
    cfg.start,
    cfg.end,
    cfg.filter,
    cfg.atrMin,
    cfg.lookback,
    cfg.setupWait,
    cfg.retestBars,
    cfg.near,
    cfg.far,
    cfg.target,
    cfg.stop.name,
    cfg.firstPerDay,
  ].join("|");
}

function cfgLabel(cfg) {
  return `${cfg.mode} ${minutesToHm(cfg.start)}-${minutesToHm(cfg.end)} filter=${cfg.filter} band=${cfg.near}-${cfg.far} target=${cfg.target} stop=${cfg.stop.name} lookback=${cfg.lookback} wait=${cfg.setupWait} retest=${cfg.retestBars} atrMin=${cfg.atrMin}`;
}

async function writeCsv(file, rows) {
  const fields = [
    "stage",
    "config",
    "mode",
    "window",
    "filter",
    "band",
    "target",
    "stop",
    "lookback",
    "setupWait",
    "retestBars",
    "atrMin",
    "fullTrades",
    "fullW",
    "fullL",
    "fullT",
    "fullWinRate",
    "fullAvgAllR",
    "fullMaxDD",
    "fullWorst",
    "trainTrades",
    "trainAvgAllR",
    "testTrades",
    "testAvgAllR",
    "testWinRate",
    "testMaxDD",
  ];
  const lines = [fields.join(",")];
  for (const row of rows) {
    const cfg = row.cfg;
    const rec = {
      stage: row.stage,
      config: cfgLabel(cfg),
      mode: cfg.mode,
      window: `${minutesToHm(cfg.start)}-${minutesToHm(cfg.end)}`,
      filter: cfg.filter,
      band: `${cfg.near}-${cfg.far}`,
      target: cfg.target,
      stop: cfg.stop.name,
      lookback: cfg.lookback,
      setupWait: cfg.setupWait,
      retestBars: cfg.retestBars,
      atrMin: cfg.atrMin,
      fullTrades: row.full.trades,
      fullW: row.full.wins,
      fullL: row.full.losses,
      fullT: row.full.timeouts,
      fullWinRate: row.full.winRate.toFixed(1),
      fullAvgAllR: row.full.avgAllR.toFixed(3),
      fullMaxDD: row.full.maxDD.toFixed(2),
      fullWorst: row.full.worst.toFixed(2),
      trainTrades: row.train.trades,
      trainAvgAllR: row.train.avgAllR.toFixed(3),
      testTrades: row.test.trades,
      testAvgAllR: row.test.avgAllR.toFixed(3),
      testWinRate: row.test.winRate.toFixed(1),
      testMaxDD: row.test.maxDD.toFixed(2),
    };
    lines.push(fields.map((field) => csvCell(rec[field])).join(","));
  }
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

async function writeTrades(file, trades) {
  const fields = ["entryDate", "entryTimeCT", "exitTimeCT", "mode", "direction", "result", "r", "entryPrice", "exitPrice", "target", "stop", "exitReason"];
  const lines = [fields.join(",")];
  for (const trade of trades) lines.push(fields.map((field) => csvCell(trade[field])).join(","));
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

async function writeReport(file, bars, bestFull, bestRobust) {
  await writeFile(file, reportText(bars, bestFull, bestRobust), "utf8");
}

function reportText(bars, bestFull, bestRobust) {
  const lines = [];
  lines.push("# Clean 1-minute 21/50 cross optimizer");
  lines.push("");
  lines.push(`Data: ES 1-minute bars, ${bars.length.toLocaleString()} rows, ${bars[0].ctDate} ${hm(bars[0])} CT to ${bars.at(-1).ctDate} ${hm(bars.at(-1))} CT.`);
  lines.push(`Train/test split: train before ${SPLIT_DATE}, test from ${SPLIT_DATE} onward.`);
  lines.push("");
  lines.push("Rules searched: cross-close, EMA50 retest, and Fibonacci pullback after a real 21/50 EMA cross only. No straddles. No pre-cross entries.");
  lines.push("");
  lines.push("## Best robust candidates");
  lines.push("");
  lines.push(tableRows(bestRobust.slice(0, 12)));
  lines.push("");
  lines.push("## Best full-sample candidates");
  lines.push("");
  lines.push(tableRows(bestFull.slice(0, 12)));
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function tableRows(rows) {
  const lines = [
    "| Rank | Config | Trades | W/L/T | Win % | Avg R all | Max DD | Worst | Train R | Test R | Test win % |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  rows.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${cfgLabel(row.cfg)} | ${row.full.trades} | ${row.full.wins}/${row.full.losses}/${row.full.timeouts} | ${row.full.winRate.toFixed(1)} | ${row.full.avgAllR.toFixed(2)} | ${row.full.maxDD.toFixed(2)} | ${row.full.worst.toFixed(2)} | ${row.train.avgAllR.toFixed(2)} | ${row.test.avgAllR.toFixed(2)} | ${row.test.winRate.toFixed(1)} |`);
  });
  return lines.join("\n");
}

async function loadBars(files) {
  const byTime = new Map();
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const lines = text.trim().split(/\r?\n/);
    const headers = splitCsvLine(lines[0]);
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
      const at = new Date(row.ts_event || row.timestamp || row.time);
      const bar = {
        at,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume || 0),
      };
      if (Number.isFinite(bar.at.getTime()) && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)) {
        byTime.set(bar.at.getTime(), bar);
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.at - b.at);
}

function decorateBars(bars) {
  for (const bar of bars) {
    const parts = dateParts(bar.at, CT_ZONE);
    bar.ct = parts;
    bar.ctMinutes = parts.hour * 60 + parts.minute;
    bar.ctDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }
}

function splitCsvLine(line) {
  const out = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

const dtfCache = new Map();
function dateParts(date, timeZone) {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    dtfCache.set(timeZone, dtf);
  }
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

function isTradeDay(bar) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(bar.ct.weekday);
}

function ema(values, length) {
  const out = new Array(values.length);
  const alpha = 2 / (length + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    prev = i === 0 ? value : alpha * value + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function computeAtr(bars, length) {
  const tr = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) {
    tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  return ema(tr, length);
}

function htfEmaToMinuteBars(bars, minutes, length) {
  const htfBars = [];
  let current = null;
  for (let i = 0; i < bars.length; i += 1) {
    const key = htfBucket(bars[i], minutes);
    if (!current || current.key !== key) {
      current = { key, close: bars[i].close, lastIndex: i };
      htfBars.push(current);
    } else {
      current.close = bars[i].close;
      current.lastIndex = i;
    }
  }
  const htfEma = ema(htfBars.map((bar) => bar.close), length);
  const out = new Array(bars.length).fill(NaN);
  let h = 0;
  let lastCompleted = NaN;
  for (let i = 0; i < bars.length; i += 1) {
    while (h < htfBars.length && htfBars[h].lastIndex < i) {
      lastCompleted = htfEma[h];
      h += 1;
    }
    out[i] = lastCompleted;
  }
  return out;
}

function hm(bar) {
  return `${String(bar.ct.hour).padStart(2, "0")}:${String(bar.ct.minute).padStart(2, "0")}`;
}

function minutesToHm(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
