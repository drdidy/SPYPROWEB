import fs from "node:fs";
import path from "node:path";

const CT_ZONE = "America/Chicago";
const DATA_FILES = [
  "data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv",
  "data/databento/ES_ohlcv-1m_2026-06-17_tail.csv",
];
const CFG = {
  fast: 21,
  slow: 50,
  pivotLeft: 1,
  pivotRight: 1,
  lookback: 20,
  wait: 3,
  retest: 72,
  start: 8 * 60 + 50,
  end: 11 * 60 + 50,
  manageEnd: 12 * 60,
  near: 0.618,
  far: 0.786,
  target: 1.618,
  htfStopMinutes: 32,
};
const VARIANTS = [
  {
    id: "current_cross_30m_plus_1m_slope",
    label: "Current-style: first 21/50 cross either direction, require 30m agreement at cross + 1m 50 slope",
    dayGate: false,
    htfAtCross: true,
    slope: true,
  },
  {
    id: "day830_gate_only",
    label: "8:30 30m gate chooses direction, first matching cross only, no extra slope/HTF filter",
    dayGate: true,
    htfAtCross: false,
    slope: false,
  },
  {
    id: "day830_gate_plus_1m_slope",
    label: "8:30 30m gate + 1m 50 slope agreement",
    dayGate: true,
    htfAtCross: false,
    slope: true,
  },
  {
    id: "day830_gate_plus_cross30m",
    label: "8:30 30m gate + 30m agreement again at cross",
    dayGate: true,
    htfAtCross: true,
    slope: false,
  },
  {
    id: "day830_gate_plus_both",
    label: "8:30 30m gate + 30m agreement at cross + 1m 50 slope",
    dayGate: true,
    htfAtCross: true,
    slope: true,
  },
];

const dtfCache = new Map();

function main() {
  const bars = loadBars(DATA_FILES);
  decorateBars(bars);
  const ctx = buildContext(bars);
  const sessionStarts = computeSessionStarts(bars);
  const dayGates = computeDayGates(bars, ctx);
  const crossEvents = buildCrossEvents(bars, ctx);
  const rows = VARIANTS.map((variant) => runVariant(variant, bars, ctx, sessionStarts, dayGates, crossEvents));
  const outDir = "outputs/es_830_30m_gate_study";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "summary.csv"), summaryCsv(rows));
  for (const row of rows) {
    fs.writeFileSync(path.join(outDir, `${row.variant.id}_trades.csv`), tradesCsv(row.trades));
  }
  const report = reportMd(bars, rows, dayGates);
  fs.writeFileSync(path.join(outDir, "report.md"), report);
  console.log(report);
}

function runVariant(variant, bars, ctx, sessionStarts, dayGates, crossEvents) {
  const attemptedDays = new Set();
  const tradedDays = new Set();
  const trades = [];
  const attempts = [];
  for (const event of crossEvents) {
    const bar = bars[event.crossIndex];
    if (!isWeekday(bar) || bar.ctMinutes < CFG.start || bar.ctMinutes >= CFG.end) continue;
    if (attemptedDays.has(bar.ctDate)) continue;
    const gate = dayGates.get(bar.ctDate);
    if (!gate) continue;
    if (variant.dayGate && event.direction !== gate.direction) continue;
    if (variant.htfAtCross && !passesHtfAtCross(event.direction, event.crossIndex, bars, ctx)) continue;
    if (variant.slope && !passesSlope(event.direction, event.crossIndex, ctx)) continue;

    const setup = buildSetup(event, bars, ctx, sessionStarts);
    if (!setup) continue;
    attemptedDays.add(bar.ctDate);
    attempts.push({ date: bar.ctDate, time: hm(bar), dir: event.direction, setup: true, gate: gate.direction });
    const trade = simulateTrade(setup, bars);
    if (!trade || tradedDays.has(trade.entryDate)) continue;
    trades.push(trade);
    tradedDays.add(trade.entryDate);
  }
  return { variant, trades, attempts, metrics: metrics(trades), segments: segments(trades) };
}

function computeDayGates(bars, ctx) {
  const gates = new Map();
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (!isWeekday(bar) || bar.ctMinutes < 8 * 60 + 30 || gates.has(bar.ctDate)) continue;
    const ema30 = ctx.htf30[i];
    if (!Number.isFinite(ema30)) continue;
    gates.set(bar.ctDate, {
      index: i,
      date: bar.ctDate,
      time: hm(bar),
      price: bar.close,
      ema30,
      direction: bar.close >= ema30 ? "long" : "short",
    });
  }
  return gates;
}

function buildSetup(event, bars, ctx, sessionStarts) {
  const sessionStart = sessionStarts[event.crossIndex] ?? 0;
  const boundary = event.priceCrossIndex;
  const pivotA =
    event.direction === "long"
      ? findLastPivot(ctx.pivotLows, boundary, sessionStart, CFG.lookback, (pivot) => pivot.open < ctx.slow[pivot.index])
      : findLastPivot(ctx.pivotHighs, boundary, sessionStart, CFG.lookback, (pivot) => pivot.open > ctx.slow[pivot.index]);
  const pivotB =
    event.direction === "long"
      ? findFirstPivot(ctx.pivotHighs, boundary, event.crossIndex + CFG.wait, (pivot) => pivot.open > ctx.slow[pivot.index])
      : findFirstPivot(ctx.pivotLows, boundary, event.crossIndex + CFG.wait, (pivot) => pivot.open < ctx.slow[pivot.index]);
  if (!pivotA || !pivotB) return null;
  const pivotLow = event.direction === "long" ? pivotA.value : pivotB.value;
  const pivotHigh = event.direction === "long" ? pivotB.value : pivotA.value;
  const pivotLowIndex = event.direction === "long" ? pivotA.index : pivotB.index;
  const pivotHighIndex = event.direction === "long" ? pivotB.index : pivotA.index;
  if (!(pivotHigh > pivotLow)) return null;
  const range = pivotHigh - pivotLow;
  return {
    direction: event.direction,
    crossIndex: event.crossIndex,
    crossTimeCT: hm(bars[event.crossIndex]),
    priceCrossIndex: event.priceCrossIndex,
    entryDate: bars[event.crossIndex].ctDate,
    pivotLow,
    pivotHigh,
    pivotLowIndex,
    pivotHighIndex,
    range,
    nearLevel: event.direction === "long" ? pivotHigh - range * CFG.near : pivotLow + range * CFG.near,
    farLevel: event.direction === "long" ? pivotHigh - range * CFG.far : pivotLow + range * CFG.far,
    stop: event.direction === "long" ? pivotLow : pivotHigh,
    target: event.direction === "long" ? pivotHigh + range * (CFG.target - 1) : pivotLow - range * (CFG.target - 1),
  };
}

function simulateTrade(setup, bars) {
  const zoneLow = Math.min(setup.nearLevel, setup.farLevel);
  const zoneHigh = Math.max(setup.nearLevel, setup.farLevel);
  for (let i = setup.crossIndex + 1; i <= Math.min(bars.length - 1, setup.crossIndex + CFG.retest); i += 1) {
    const bar = bars[i];
    if (bar.ctDate !== setup.entryDate || bar.ctMinutes >= CFG.manageEnd) return null;
    const touched = bar.low <= zoneHigh && bar.high >= zoneLow;
    const confirmed =
      setup.direction === "long"
        ? bar.close >= setup.nearLevel && bar.close > bar.open && bar.close < setup.target
        : bar.close <= setup.nearLevel && bar.close < bar.open && bar.close > setup.target;
    if (!touched || !confirmed) continue;
    return manageTrade({ ...setup, entryIndex: i, entryAt: bar.at, entryTimeCT: hm(bar), entryPrice: bar.close }, bars);
  }
  return null;
}

function manageTrade(trade, bars) {
  const risk = Math.abs(trade.nearLevel - trade.stop);
  if (!risk) return null;
  for (let i = trade.entryIndex + 1; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar.ctDate !== trade.entryDate || !isWeekday(bar)) {
      return closeTrade(trade, bars[i - 1], bars[i - 1].close, "TIMEOUT", realizedR(trade, bars[i - 1].close, risk), "date_end");
    }
    const targetTouched = trade.direction === "long" ? bar.high >= trade.target : bar.low <= trade.target;
    if (targetTouched) {
      return closeTrade(trade, bar, trade.target, "WIN", Math.abs(trade.target - trade.nearLevel) / risk, "target");
    }
    const stopExit = htfStop(trade, bars, i, CFG.htfStopMinutes);
    if (stopExit) {
      return closeTrade(trade, stopExit.bar, stopExit.price, "LOSS", realizedR(trade, stopExit.price, risk), `${CFG.htfStopMinutes}m_close_stop`);
    }
    if (bar.ctMinutes >= CFG.manageEnd) {
      return closeTrade(trade, bar, bar.close, "TIMEOUT", realizedR(trade, bar.close, risk), "time_flat");
    }
  }
  return null;
}

function closeTrade(trade, bar, exitPrice, result, r, exitReason) {
  return {
    date: trade.entryDate,
    direction: trade.direction,
    crossTimeCT: trade.crossTimeCT,
    entryTimeCT: trade.entryTimeCT,
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

function htfStop(trade, bars, index, minutes) {
  const bar = bars[index];
  const prev = bars[index - 1];
  if (!prev || htfBucket(bar, minutes) === htfBucket(prev, minutes)) return null;
  const beyond = trade.direction === "long" ? prev.close < trade.stop : prev.close > trade.stop;
  return beyond ? { bar: prev, price: prev.close } : null;
}

function passesHtfAtCross(direction, index, bars, ctx) {
  const value = ctx.htf30[index];
  if (!Number.isFinite(value)) return false;
  return direction === "long" ? bars[index].close > value : bars[index].close < value;
}

function passesSlope(direction, index, ctx) {
  if (index < 3) return false;
  return direction === "long" ? ctx.slow[index] > ctx.slow[index - 3] : ctx.slow[index] < ctx.slow[index - 3];
}

function realizedR(trade, exitPrice, risk) {
  return trade.direction === "long" ? (exitPrice - trade.nearLevel) / risk : (trade.nearLevel - exitPrice) / risk;
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

function buildContext(bars) {
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, CFG.fast);
  const slow = ema(closes, CFG.slow);
  const pivotLows = [];
  const pivotHighs = [];
  for (let i = 1; i < bars.length - 1; i += 1) {
    if (bars[i].low < bars[i - 1].low && bars[i].low < bars[i + 1].low) {
      pivotLows.push({ index: i, value: bars[i].low, open: bars[i].open });
    }
    if (bars[i].high > bars[i - 1].high && bars[i].high > bars[i + 1].high) {
      pivotHighs.push({ index: i, value: bars[i].high, open: bars[i].open });
    }
  }
  return { fast, slow, pivotLows, pivotHighs, htf30: htfEmaToMinuteBars(bars, 30, CFG.slow) };
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

function findLastPivot(pivots, boundary, sessionStart, lookback, predicate) {
  const min = Math.max(sessionStart, boundary - lookback);
  for (let i = upperBoundPivot(pivots, boundary - 1); i >= 0; i -= 1) {
    const pivot = pivots[i];
    if (pivot.index < min) return null;
    if (predicate(pivot)) return pivot;
  }
  return null;
}

function findFirstPivot(pivots, from, through, predicate) {
  for (let i = lowerBoundPivot(pivots, from); i < pivots.length; i += 1) {
    const pivot = pivots[i];
    if (pivot.index > through) return null;
    if (predicate(pivot)) return pivot;
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

function computeSessionStarts(bars) {
  const out = new Array(bars.length).fill(0);
  let current = 0;
  let prevDate = "";
  let foundEntryStart = false;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i].ctDate !== prevDate) {
      prevDate = bars[i].ctDate;
      foundEntryStart = false;
    }
    if (!foundEntryStart && isWeekday(bars[i]) && bars[i].ctMinutes >= CFG.start) {
      current = i;
      foundEntryStart = true;
    }
    out[i] = current;
  }
  return out;
}

function metrics(trades) {
  const wins = trades.filter((trade) => trade.result === "WIN");
  const losses = trades.filter((trade) => trade.result === "LOSS");
  const timeouts = trades.filter((trade) => trade.result === "TIMEOUT");
  const decided = wins.length + losses.length;
  const decidedR = wins.concat(losses).map((trade) => trade.r);
  const allR = trades.map((trade) => trade.r);
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    decided,
    winRate: decided ? (wins.length * 100) / decided : 0,
    avgR: avg(decidedR),
    avgAllR: avg(allR),
    timeoutAvgR: avg(timeouts.map((trade) => trade.r)),
    worst: Math.min(0, ...losses.map((trade) => trade.r)),
    maxDD: maxDrawdown(allR),
    losingStreak: longestLosingStreak(trades),
  };
}

function segments(trades) {
  return {
    long: metrics(trades.filter((trade) => trade.direction === "long")),
    short: metrics(trades.filter((trade) => trade.direction === "short")),
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
  let best = 0;
  for (const trade of trades) {
    if (trade.result === "LOSS") current += 1;
    else if (trade.result === "WIN") current = 0;
    best = Math.max(best, current);
  }
  return best;
}

function summaryCsv(rows) {
  const fields = [
    "variant",
    "attempts",
    "trades",
    "wins",
    "losses",
    "timeouts",
    "winRate",
    "avgRDecided",
    "avgRAll",
    "timeoutAvgR",
    "worstR",
    "maxDDR",
    "longTrades",
    "longWinRate",
    "shortTrades",
    "shortWinRate",
  ];
  const lines = [fields.join(",")];
  for (const row of rows) {
    const metric = row.metrics;
    const record = {
      variant: row.variant.id,
      attempts: row.attempts.length,
      trades: metric.trades,
      wins: metric.wins,
      losses: metric.losses,
      timeouts: metric.timeouts,
      winRate: metric.winRate.toFixed(1),
      avgRDecided: metric.avgR.toFixed(3),
      avgRAll: metric.avgAllR.toFixed(3),
      timeoutAvgR: metric.timeoutAvgR.toFixed(3),
      worstR: metric.worst.toFixed(3),
      maxDDR: metric.maxDD.toFixed(3),
      longTrades: row.segments.long.trades,
      longWinRate: row.segments.long.winRate.toFixed(1),
      shortTrades: row.segments.short.trades,
      shortWinRate: row.segments.short.winRate.toFixed(1),
    };
    lines.push(fields.map((field) => csvCell(record[field])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function tradesCsv(trades) {
  const fields = [
    "date",
    "direction",
    "crossTimeCT",
    "entryTimeCT",
    "exitTimeCT",
    "result",
    "r",
    "entryPrice",
    "exitPrice",
    "pivotLow",
    "pivotHigh",
    "nearLevel",
    "farLevel",
    "stop",
    "target",
    "exitReason",
  ];
  return `${fields.join(",")}\n${trades
    .map((trade) => fields.map((field) => csvCell(typeof trade[field] === "number" ? trade[field].toFixed(4) : trade[field])).join(","))
    .join("\n")}\n`;
}

function reportMd(bars, rows, dayGates) {
  const longGate = [...dayGates.values()].filter((gate) => gate.direction === "long").length;
  const shortGate = [...dayGates.values()].filter((gate) => gate.direction === "short").length;
  let report = `# ES 8:30 30m gate study\n\n`;
  report += `Data: ${bars.length.toLocaleString()} ES 1-minute bars, ${bars[0].ctDate} ${hm(bars[0])} CT to ${bars.at(-1).ctDate} ${hm(bars.at(-1))} CT.\n\n`;
  report += `Rule tested: at/after 08:30 CT, compare ES price to the last completed 30-minute EMA50. Above means only look for the first bullish 1-minute 21/50 cross from 08:50-11:50 CT. Below means only look for the first bearish cross. Pivot selection stayed 1-minute and unchanged: last pivot on the price/50 side before the price/50 cross, first opposite pivot after the price/50 cross, pivot candle opens must straddle the 1-minute EMA50. Entry band 0.618-0.786, target 1.618, 32-minute close stop, manage/flat at 12:00 CT.\n\n`;
  report += `8:30 gate days: ${dayGates.size} total, ${longGate} long-bias, ${shortGate} short-bias.\n\n`;
  report += `| Variant | Attempts | Trades | W/L/T | Win % | Avg R decided | Avg R all | Timeout avg R | Worst R | Max DD R | Long trades/win | Short trades/win |\n`;
  report += `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  for (const row of rows) {
    const metric = row.metrics;
    report += `| ${row.variant.id} | ${row.attempts.length} | ${metric.trades} | ${metric.wins}/${metric.losses}/${metric.timeouts} | ${metric.winRate.toFixed(1)} | ${metric.avgR.toFixed(2)} | ${metric.avgAllR.toFixed(2)} | ${metric.timeoutAvgR.toFixed(2)} | ${metric.worst.toFixed(2)} | ${metric.maxDD.toFixed(2)} | ${row.segments.long.trades}/${row.segments.long.winRate.toFixed(0)}% | ${row.segments.short.trades}/${row.segments.short.winRate.toFixed(0)}% |\n`;
  }
  const current = rows[0];
  const best = [...rows].sort((a, b) => b.metrics.avgAllR - a.metrics.avgAllR)[0];
  report += `\n## Plain-English verdict\n\n`;
  report += `Best by average R including time-flats: ${best.variant.id}, with ${best.metrics.trades} trades, ${best.metrics.winRate.toFixed(1)}% decided win rate, and ${best.metrics.avgAllR.toFixed(2)} average R per trade. Current-style reference had ${current.metrics.trades} trades, ${current.metrics.winRate.toFixed(1)}% decided win rate, and ${current.metrics.avgAllR.toFixed(2)} average R per trade.\n`;
  return report;
}

function loadBars(files) {
  const byTime = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8").trim();
    const lines = text.split(/\r?\n/);
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
      if (Number.isFinite(at.getTime()) && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)) {
        byTime.set(at.getTime(), bar);
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.at - b.at);
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

function decorateBars(bars) {
  for (const bar of bars) {
    const parts = dateParts(bar.at, CT_ZONE);
    bar.ct = parts;
    bar.ctMinutes = parts.hour * 60 + parts.minute;
    bar.ctDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }
}

function isWeekday(bar) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(bar.ct.weekday);
}

function ema(values, length) {
  const out = new Array(values.length);
  const alpha = 2 / (length + 1);
  let previous = values[0];
  for (let i = 0; i < values.length; i += 1) {
    previous = i === 0 ? values[i] : alpha * values[i] + (1 - alpha) * previous;
    out[i] = previous;
  }
  return out;
}

function htfBucket(bar, minutes) {
  return `${bar.ctDate}-${bar.ct.hour}-${Math.floor(bar.ct.minute / minutes)}`;
}

function hm(bar) {
  return `${String(bar.ct.hour).padStart(2, "0")}:${String(bar.ct.minute).padStart(2, "0")}`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

main();
