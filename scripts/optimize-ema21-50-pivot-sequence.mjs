import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CT_ZONE = "America/Chicago";
const FAST_EMA = Number(process.env.SPP_FAST_EMA || 21);
const SLOW_EMA = Number(process.env.SPP_SLOW_EMA || 50);
const DATA_FILES = [
  "data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv",
  "data/databento/ES_ohlcv-1m_2026-06-17_tail.csv",
];
const OUT_DIR = process.env.SPP_OUT_DIR || `outputs/ema${FAST_EMA}_${SLOW_EMA}_pivot_sequence_optimizer`;
const SPLIT_DATE = "2026-03-01";

const STARTS = [8 * 60 + 30, 8 * 60 + 45, 8 * 60 + 50, 9 * 60, 9 * 60 + 15, 9 * 60 + 30];
const ENDS = [10 * 60, 10 * 60 + 30, 10 * 60 + 50, 11 * 60, 11 * 60 + 30, 11 * 60 + 50, 12 * 60];
const FILTERS = ["none", "slope3", "slope5", "htf15", "htf30", "slope3_htf15", "htf15_htf30"];
const BANDS = [
  [0.382, 0.5],
  [0.5, 0.618],
  [0.5, 0.786],
  [0.618, 0.786],
];
const TARGETS = [1.236, 1.382, 1.5, 1.618, 2.0];
const STOPS = [
  { name: "1m_close", kind: "close" },
  { name: "3x1m_close", kind: "consecutive", n: 3 },
  { name: "10x1m_close", kind: "consecutive", n: 10 },
  { name: "15m_close", kind: "htf", minutes: 15 },
  { name: "30m_close", kind: "htf", minutes: 30 },
  { name: "30m_or_10x1m", kind: "combo", minutes: 30, n: 10 },
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const bars = await loadBars(DATA_FILES);
  decorateBars(bars);
  const ctx = buildContext(bars);
  const sessionStarts = computeSessionStarts(bars);
  const crossEvents = buildCrossEvents(bars, ctx);
  await mkdir(OUT_DIR, { recursive: true });

  const stage1Configs = [];
  for (const start of STARTS) {
    for (const end of ENDS) {
      if (end <= start + 30) continue;
      for (const filter of FILTERS) {
        for (const band of BANDS) {
          stage1Configs.push(baseCfg({ start, end, filter, band, target: 1.5, stop: STOPS.at(-1), lookback: 20, wait: 8, retest: 60, manageEnd: 12 * 60, atrMin: 0 }));
        }
      }
    }
  }

  const stage1 = evaluate(stage1Configs, bars, ctx, sessionStarts, crossEvents, "stage1");
  const seeds = stage1
    .filter((row) => row.full.trades >= 15 && row.test.trades >= 5)
    .sort((a, b) => robustScore(b) - robustScore(a))
    .slice(0, 8)
    .map((row) => row.cfg);

  const stage2Configs = [];
  for (const seed of seeds) {
    for (const target of [1.236, 1.5, 1.618, 2.0]) {
      for (const stop of [STOPS[1], STOPS[2], STOPS[4], STOPS[5]]) {
        for (const lookback of [20, 40]) {
          for (const wait of [5, 8, 12]) {
            for (const retest of [30, 60]) {
              for (const atrMin of [0, 0.5]) {
                for (const manageEnd of [12 * 60]) {
                  stage2Configs.push({ ...seed, target, stop, lookback, wait, retest, atrMin, manageEnd });
                }
              }
            }
          }
        }
      }
    }
  }

  const stage2 = evaluate(uniqueConfigs(stage2Configs), bars, ctx, sessionStarts, crossEvents, "stage2");
  const rows = [...stage1, ...stage2];
  const bestRobust = rows
    .filter((row) => row.full.trades >= 20 && row.train.trades >= 10 && row.test.trades >= 8)
    .sort((a, b) => robustScore(b) - robustScore(a))
    .slice(0, 30);
  const bestFull = rows
    .filter((row) => row.full.trades >= 20)
    .sort((a, b) => fullScore(b.full) - fullScore(a.full))
    .slice(0, 30);

  await writeResultCsv(path.join(OUT_DIR, "all_results.csv"), rows);
  await writeResultCsv(path.join(OUT_DIR, "best_robust.csv"), bestRobust);
  await writeResultCsv(path.join(OUT_DIR, "best_full.csv"), bestFull);
  await writeTrades(path.join(OUT_DIR, "best_robust_trades.csv"), runBacktest(bestRobust[0].cfg, bars, ctx, sessionStarts, crossEvents));
  await writeReport(path.join(OUT_DIR, "report.md"), bars, crossEvents, bestRobust, bestFull);
  console.log(reportText(bars, crossEvents, bestRobust, bestFull));
}

function baseCfg(overrides) {
  return {
    start: 8 * 60 + 50,
    end: 11 * 60 + 50,
    manageEnd: 12 * 60,
    filter: "none",
    band: [0.5, 0.618],
    target: 1.5,
    stop: STOPS.at(-1),
    lookback: 20,
    wait: 8,
    retest: 60,
    atrMin: 0,
    ...overrides,
  };
}

function evaluate(configs, bars, ctx, sessionStarts, crossEvents, stage) {
  const rows = [];
  for (let i = 0; i < configs.length; i += 1) {
    const cfg = configs[i];
    const trades = runBacktest(cfg, bars, ctx, sessionStarts, crossEvents);
    rows.push({
      stage,
      cfg,
      full: summarize(trades),
      train: summarize(trades.filter((trade) => trade.entryDate < SPLIT_DATE)),
      test: summarize(trades.filter((trade) => trade.entryDate >= SPLIT_DATE)),
    });
    if ((i + 1) % 250 === 0) console.error(`${stage}: ${i + 1}/${configs.length}`);
  }
  return rows;
}

function runBacktest(cfg, bars, ctx, sessionStarts, crossEvents) {
  const trades = [];
  const tradedDays = new Set();
  for (const event of crossEvents) {
    const crossBar = bars[event.crossIndex];
    if (!isTradeDay(crossBar) || crossBar.ctMinutes < cfg.start || crossBar.ctMinutes >= cfg.end) continue;
    if (tradedDays.has(crossBar.ctDate)) continue;
    if (!passesFilter(event.direction, event.crossIndex, bars, ctx, cfg)) continue;
    const setup = buildSetup(event, bars, ctx, sessionStarts, cfg);
    if (!setup) continue;
    if (cfg.atrMin > 0 && setup.range < (ctx.atr[event.crossIndex] ?? 0) * cfg.atrMin) continue;
    const trade = simulateTrade(setup, bars, cfg);
    if (!trade) continue;
    trades.push(trade);
    tradedDays.add(trade.entryDate);
  }
  return trades;
}

function buildSetup(event, bars, ctx, sessionStarts, cfg) {
  const sessionStart = sessionStarts[event.crossIndex] ?? 0;
  const boundary = event.priceCrossIndex;
  const pivotA = event.direction === "long"
    ? findLastPivot(ctx.pivotLows, boundary, sessionStart, cfg.lookback, (p) => p.open < ctx.slow[p.index])
    : findLastPivot(ctx.pivotHighs, boundary, sessionStart, cfg.lookback, (p) => p.open > ctx.slow[p.index]);
  const pivotB = event.direction === "long"
    ? findFirstPivot(ctx.pivotHighs, boundary + 1, Math.min(event.crossIndex, boundary + cfg.wait), (p) => p.open > ctx.slow[p.index])
    : findFirstPivot(ctx.pivotLows, boundary + 1, Math.min(event.crossIndex, boundary + cfg.wait), (p) => p.open < ctx.slow[p.index]);
  if (!pivotA || !pivotB) return null;
  const pivotLow = event.direction === "long" ? pivotA.value : pivotB.value;
  const pivotHigh = event.direction === "long" ? pivotB.value : pivotA.value;
  if (!(pivotHigh > pivotLow)) return null;
  const range = pivotHigh - pivotLow;
  const [near, far] = cfg.band;
  return {
    direction: event.direction,
    crossIndex: event.crossIndex,
    priceCrossIndex: event.priceCrossIndex,
    pivotLow,
    pivotHigh,
    range,
    nearLevel: event.direction === "long" ? pivotHigh - range * near : pivotLow + range * near,
    farLevel: event.direction === "long" ? pivotHigh - range * far : pivotLow + range * far,
    stop: event.direction === "long" ? pivotLow : pivotHigh,
    target: event.direction === "long" ? pivotHigh + range * (cfg.target - 1) : pivotLow - range * (cfg.target - 1),
  };
}

function simulateTrade(setup, bars, cfg) {
  const entryStart = setup.crossIndex + 1;
  const entryEnd = Math.min(bars.length - 1, setup.crossIndex + cfg.retest);
  const zLo = Math.min(setup.nearLevel, setup.farLevel);
  const zHi = Math.max(setup.nearLevel, setup.farLevel);
  for (let i = entryStart; i <= entryEnd; i += 1) {
    const bar = bars[i];
    if (!isTradeDay(bar) || bar.ctDate !== bars[setup.crossIndex].ctDate || bar.ctMinutes >= cfg.manageEnd) return null;
    const touched = bar.low <= zHi && bar.high >= zLo;
    const confirmed = setup.direction === "long"
      ? bar.close >= setup.nearLevel && bar.close > bar.open && bar.close < setup.target
      : bar.close <= setup.nearLevel && bar.close < bar.open && bar.close > setup.target;
    if (!touched || !confirmed) continue;
    return manageTrade({ ...setup, entryIndex: i, entryAt: bar.at, entryDate: bar.ctDate, entryTimeCT: hm(bar), entryPrice: bar.close }, bars, cfg);
  }
  return null;
}

function manageTrade(trade, bars, cfg) {
  const risk = Math.abs(trade.nearLevel - trade.stop);
  if (!risk) return null;
  for (let i = trade.entryIndex + 1; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar.ctDate !== trade.entryDate || !isTradeDay(bar)) {
      return closeTrade(trade, bars[i - 1], i - 1, bars[i - 1].close, "TIMEOUT", realizedR(trade, bars[i - 1].close, risk), "date_end");
    }
    const targetTouched = trade.direction === "long" ? bar.high >= trade.target : bar.low <= trade.target;
    if (targetTouched) return closeTrade(trade, bar, i, trade.target, "WIN", Math.abs(trade.target - trade.nearLevel) / risk, "target");
    const stopExit = stopExitAt(trade, bars, i, cfg.stop);
    if (stopExit) return closeTrade(trade, stopExit.bar, stopExit.index, stopExit.price, "LOSS", realizedR(trade, stopExit.price, risk), stopExit.reason);
    if (bar.ctMinutes >= cfg.manageEnd) {
      return closeTrade(trade, bar, i, bar.close, "TIMEOUT", realizedR(trade, bar.close, risk), "time");
    }
  }
  return null;
}

function stopExitAt(trade, bars, index, stop) {
  if (stop.kind === "close") return oneCloseStop(trade, bars[index], index, stop.name);
  if (stop.kind === "consecutive") return consecutiveStop(trade, bars, index, stop.n, stop.name);
  if (stop.kind === "htf") return htfStop(trade, bars, index, stop.minutes, stop.name);
  if (stop.kind === "combo") return htfStop(trade, bars, index, stop.minutes, `${stop.minutes}m_close`) ?? consecutiveStop(trade, bars, index, stop.n, `${stop.n}x1m_close`);
  return null;
}

function oneCloseStop(trade, bar, index, reason) {
  const beyond = trade.direction === "long" ? bar.close < trade.stop : bar.close > trade.stop;
  return beyond ? { bar, index, price: bar.close, reason } : null;
}

function consecutiveStop(trade, bars, index, n, reason) {
  if (index - trade.entryIndex < n) return null;
  for (let k = 0; k < n; k += 1) {
    const bar = bars[index - k];
    const beyond = trade.direction === "long" ? bar.close < trade.stop : bar.close > trade.stop;
    if (!beyond) return null;
  }
  return { bar: bars[index], index, price: bars[index].close, reason };
}

function htfStop(trade, bars, index, minutes, reason) {
  const bar = bars[index];
  const prev = bars[index - 1];
  if (!prev || htfBucket(bar, minutes) === htfBucket(prev, minutes)) return null;
  const beyond = trade.direction === "long" ? prev.close < trade.stop : prev.close > trade.stop;
  return beyond ? { bar: prev, index: index - 1, price: prev.close, reason } : null;
}

function closeTrade(trade, bar, index, exitPrice, result, r, exitReason) {
  return {
    direction: trade.direction,
    entryDate: trade.entryDate,
    entryTimeCT: trade.entryTimeCT,
    exitDate: bar.ctDate,
    exitTimeCT: hm(bar),
    entryPrice: trade.entryPrice,
    exitPrice,
    pivotLow: trade.pivotLow,
    pivotHigh: trade.pivotHigh,
    nearLevel: trade.nearLevel,
    farLevel: trade.farLevel,
    stop: trade.stop,
    target: trade.target,
    result,
    r,
    exitReason,
  };
}

function realizedR(trade, exitPrice, risk) {
  return trade.direction === "long" ? (exitPrice - trade.nearLevel) / risk : (trade.nearLevel - exitPrice) / risk;
}

function passesFilter(direction, index, bars, ctx, cfg) {
  if (cfg.filter.includes("slope3")) {
    if (direction === "long" && !(ctx.slow[index] > ctx.slow[index - 3])) return false;
    if (direction === "short" && !(ctx.slow[index] < ctx.slow[index - 3])) return false;
  }
  if (cfg.filter.includes("slope5")) {
    if (direction === "long" && !(ctx.slow[index] > ctx.slow[index - 5])) return false;
    if (direction === "short" && !(ctx.slow[index] < ctx.slow[index - 5])) return false;
  }
  if (cfg.filter.includes("htf15")) {
    if (direction === "long" && !(bars[index].close > ctx.htf15[index])) return false;
    if (direction === "short" && !(bars[index].close < ctx.htf15[index])) return false;
  }
  if (cfg.filter.includes("htf30")) {
    if (direction === "long" && !(bars[index].close > ctx.htf30[index])) return false;
    if (direction === "short" && !(bars[index].close < ctx.htf30[index])) return false;
  }
  return true;
}

function buildCrossEvents(bars, ctx) {
  const events = [];
  let lastPriceCrossUp = null;
  let lastPriceCrossDown = null;
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i - 1].close <= ctx.slow[i - 1] && bars[i].close > ctx.slow[i]) lastPriceCrossUp = i;
    if (bars[i - 1].close >= ctx.slow[i - 1] && bars[i].close < ctx.slow[i]) lastPriceCrossDown = i;
    if (ctx.fast[i - 1] <= ctx.slow[i - 1] && ctx.fast[i] > ctx.slow[i] && lastPriceCrossUp !== null && lastPriceCrossUp <= i) {
      events.push({ direction: "long", crossIndex: i, priceCrossIndex: lastPriceCrossUp });
    }
    if (ctx.fast[i - 1] >= ctx.slow[i - 1] && ctx.fast[i] < ctx.slow[i] && lastPriceCrossDown !== null && lastPriceCrossDown <= i) {
      events.push({ direction: "short", crossIndex: i, priceCrossIndex: lastPriceCrossDown });
    }
  }
  return events;
}

function computeSessionStarts(bars) {
  const out = new Array(bars.length).fill(0);
  let current = 0;
  let prevDate = "";
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].ctDate !== prevDate && isTradeDay(bars[i])) {
      current = i;
      prevDate = bars[i].ctDate;
    }
    out[i] = current;
  }
  return out;
}

function buildContext(bars) {
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, FAST_EMA);
  const slow = ema(closes, SLOW_EMA);
  const atr = computeAtr(bars, 14);
  const pivotLows = [];
  const pivotHighs = [];
  for (let i = 1; i < bars.length - 1; i += 1) {
    if (bars[i].low < bars[i - 1].low && bars[i].low < bars[i + 1].low) pivotLows.push({ index: i, value: bars[i].low, open: bars[i].open });
    if (bars[i].high > bars[i - 1].high && bars[i].high > bars[i + 1].high) pivotHighs.push({ index: i, value: bars[i].high, open: bars[i].open });
  }
  return { fast, slow, atr, pivotLows, pivotHighs, htf15: htfEmaToMinuteBars(bars, 15, SLOW_EMA), htf30: htfEmaToMinuteBars(bars, 30, SLOW_EMA) };
}

function findLastPivot(pivots, boundary, sessionStart, lookback, predicate) {
  const min = Math.max(sessionStart, boundary - lookback);
  for (let i = upperBoundPivot(pivots, boundary - 1); i >= 0; i -= 1) {
    const p = pivots[i];
    if (p.index < min) return null;
    if (predicate(p)) return p;
  }
  return null;
}

function findFirstPivot(pivots, from, through, predicate) {
  for (let i = lowerBoundPivot(pivots, from); i < pivots.length; i += 1) {
    const p = pivots[i];
    if (p.index > through) return null;
    if (predicate(p)) return p;
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

function summarize(trades) {
  const wins = trades.filter((trade) => trade.result === "WIN");
  const losses = trades.filter((trade) => trade.result === "LOSS");
  const timeouts = trades.filter((trade) => trade.result === "TIMEOUT");
  const decided = wins.length + losses.length;
  const rAll = trades.map((trade) => trade.r);
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    winRate: decided ? (wins.length * 100) / decided : 0,
    avgR: avg([...wins, ...losses].map((trade) => trade.r)),
    avgAllR: avg(rAll),
    maxDD: maxDrawdown(rAll),
    worst: Math.min(0, ...losses.map((trade) => trade.r)),
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

function robustScore(row) {
  return Math.min(row.train.avgAllR, row.test.avgAllR) * 100 + row.full.avgAllR * 30 + row.full.winRate * 0.15 - row.full.maxDD * 2 + Math.min(row.full.trades, 70) * 0.08;
}

function fullScore(summary) {
  return summary.avgAllR * 100 + summary.winRate * 0.2 - summary.maxDD * 2 + Math.min(summary.trades, 70) * 0.08;
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
  return [cfg.start, cfg.end, cfg.manageEnd, cfg.filter, cfg.band.join("-"), cfg.target, cfg.stop.name, cfg.lookback, cfg.wait, cfg.retest, cfg.atrMin].join("|");
}

function cfgLabel(cfg) {
  return `${minutesToHm(cfg.start)}-${minutesToHm(cfg.end)} manage=${minutesToHm(cfg.manageEnd)} filter=${cfg.filter} band=${cfg.band[0]}-${cfg.band[1]} target=${cfg.target} stop=${cfg.stop.name} lookback=${cfg.lookback} wait=${cfg.wait} retest=${cfg.retest} atrMin=${cfg.atrMin}`;
}

async function writeResultCsv(file, rows) {
  const fields = ["stage", "config", "trades", "wins", "losses", "timeouts", "winRate", "avgAllR", "avgR", "maxDD", "worst", "trainTrades", "trainAvgAllR", "testTrades", "testAvgAllR", "testWinRate", "testMaxDD"];
  const lines = [fields.join(",")];
  for (const row of rows) {
    const rec = {
      stage: row.stage,
      config: cfgLabel(row.cfg),
      trades: row.full.trades,
      wins: row.full.wins,
      losses: row.full.losses,
      timeouts: row.full.timeouts,
      winRate: row.full.winRate.toFixed(1),
      avgAllR: row.full.avgAllR.toFixed(3),
      avgR: row.full.avgR.toFixed(3),
      maxDD: row.full.maxDD.toFixed(2),
      worst: row.full.worst.toFixed(2),
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
  const fields = ["entryDate", "entryTimeCT", "exitTimeCT", "direction", "result", "r", "entryPrice", "exitPrice", "pivotLow", "pivotHigh", "nearLevel", "farLevel", "stop", "target", "exitReason"];
  const lines = [fields.join(",")];
  for (const trade of trades) lines.push(fields.map((field) => csvCell(trade[field])).join(","));
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

async function writeReport(file, bars, crossEvents, bestRobust, bestFull) {
  await writeFile(file, reportText(bars, crossEvents, bestRobust, bestFull), "utf8");
}

function reportText(bars, crossEvents, bestRobust, bestFull) {
  const lines = [];
  lines.push(`# ES 1-minute ${FAST_EMA}/${SLOW_EMA} EMA cross optimizer`);
  lines.push("");
  lines.push(`Data: ${bars.length.toLocaleString()} ES 1-minute bars, ${bars[0].ctDate} ${hm(bars[0])} CT to ${bars.at(-1).ctDate} ${hm(bars.at(-1))} CT.`);
  lines.push(`Cross events with valid price-${SLOW_EMA} sequence before ${FAST_EMA}/${SLOW_EMA} confirmation: ${crossEvents.length}.`);
  lines.push(`Train/test split: train before ${SPLIT_DATE}, test from ${SPLIT_DATE} onward.`);
  lines.push("");
  lines.push(`Pivot rule: bullish uses last pivot low before price crosses above the ${SLOW_EMA} EMA and first pivot high after that price-${SLOW_EMA} cross, then waits for the ${FAST_EMA} EMA to cross above the ${SLOW_EMA}. Bearish is mirrored.`);
  lines.push("");
  lines.push("## Best robust candidates");
  lines.push(tableRows(bestRobust.slice(0, 12)));
  lines.push("");
  lines.push("## Best full-sample candidates");
  lines.push(tableRows(bestFull.slice(0, 12)));
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function tableRows(rows) {
  const lines = [
    "| Rank | Config | Trades | W/L/T | Win % | Avg R all | Max DD | Worst | Train R | Test R | Test win % |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  rows.forEach((row, i) => {
    lines.push(`| ${i + 1} | ${cfgLabel(row.cfg)} | ${row.full.trades} | ${row.full.wins}/${row.full.losses}/${row.full.timeouts} | ${row.full.winRate.toFixed(1)} | ${row.full.avgAllR.toFixed(2)} | ${row.full.maxDD.toFixed(2)} | ${row.full.worst.toFixed(2)} | ${row.train.avgAllR.toFixed(2)} | ${row.test.avgAllR.toFixed(2)} | ${row.test.winRate.toFixed(1)} |`);
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
      const bar = { at, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume || 0) };
      if (Number.isFinite(bar.at.getTime()) && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)) byTime.set(bar.at.getTime(), bar);
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
    } else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cell);
      cell = "";
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

const dtfCache = new Map();
function dateParts(date, timeZone) {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" });
    dtfCache.set(timeZone, dtf);
  }
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour === "24" ? "0" : parts.hour), minute: Number(parts.minute), weekday: parts.weekday };
}

function isTradeDay(bar) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(bar.ct.weekday);
}

function ema(values, length) {
  const out = new Array(values.length);
  const alpha = 2 / (length + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i += 1) {
    prev = i === 0 ? values[i] : alpha * values[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function computeAtr(bars, length) {
  const tr = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
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

function htfBucket(bar, minutes) {
  return `${bar.ctDate}-${bar.ct.hour}-${Math.floor(bar.ct.minute / minutes)}`;
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
