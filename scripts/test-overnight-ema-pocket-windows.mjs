import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CT_ZONE = "America/Chicago";
const EPS = 1e-8;

const DATA_FILES = [
  "data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv",
  "data/databento/ES_ohlcv-1m_2026-06-17_tail.csv",
];

const BASE = {
  fastEmaLength: 21,
  slowEmaLength: 50,
  pivotLeft: 1,
  pivotRight: 1,
  requireCandleColor: true,
  useHaConfirm: false,
  crossTrendFilter: true,
  crossSlopeBars: 3,
  lookbackBars: 20,
  setupBarsAfterEmaCross: 3,
  retestBars: 72,
  setupCooldownBars: 5,
  setupsPerSession: "First only",
  firstTradePerSession: true,
  shallowFib: 0.5,
  deepFib: 0.786,
  targetMultiple: 1.618,
  stopRule: "htf_close",
  htfStopMinutes: 32,
  htfBoundaryMode: "clock_hour",
  requirePivotOpenStraddle50: true,
  allowPreCrossTouchEntry: true,
};

const OUT_DIR = "outputs/overnight_ema_pocket_windows";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const bars = await loadBars(DATA_FILES);
  const windows = buildWindows();
  const rows = [];
  await mkdir(OUT_DIR, { recursive: true });

  for (const win of windows) {
    for (const manageExtra of [0, 60, 120, 180]) {
      const cfg = {
        ...BASE,
        sessionName: win.family,
        sessionStart: win.start,
        sessionEnd: win.end,
        managementEnd: addMinutes(win.end, manageExtra),
        managementExtra: manageExtra,
        includeSundayEvening: win.family === "Tokyo",
      };
      const trades = runBacktest(bars, cfg);
      rows.push({
        family: win.family,
        window: `${hm(win.start)}-${hm(win.end)}`,
        manage: manageExtra === 0 ? "to window end" : `+${manageExtra}m`,
        cfg,
        trades,
        metrics: metrics(trades),
      });
    }
  }

  rows.sort((a, b) => {
    const ma = a.metrics;
    const mb = b.metrics;
    if (mb.winRate !== ma.winRate) return mb.winRate - ma.winRate;
    if (mb.decided !== ma.decided) return mb.decided - ma.decided;
    return mb.avgR - ma.avgR;
  });

  const csv = [
    [
      "family",
      "window_ct",
      "manage",
      "trades",
      "wins",
      "losses",
      "timeouts",
      "decided",
      "win_rate",
      "avg_r_decided",
      "avg_r_all",
      "long",
      "short",
      "pre_cross",
      "post_cross",
    ].join(","),
    ...rows.map((r) => {
      const m = r.metrics;
      return [
        r.family,
        r.window,
        r.manage,
        m.trades,
        m.wins,
        m.losses,
        m.timeouts,
        m.decided,
        m.winRate.toFixed(2),
        m.avgR.toFixed(3),
        m.avgAllR.toFixed(3),
        m.long,
        m.short,
        m.pre,
        m.post,
      ].join(",");
    }),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "overnight_window_sweep.csv"), csv);
  const directionCsv = [
    ["family", "window_ct", "manage", "direction", "trades", "wins", "losses", "timeouts", "decided", "win_rate", "all_hit_rate", "avg_r_decided", "avg_r_all", "pre_cross", "post_cross"].join(","),
  ];
  for (const row of rows) {
    for (const dir of ["long", "short"]) {
      const group = row.trades.filter((trade) => trade.direction === dir);
      const m = metrics(group);
      directionCsv.push([
        row.family,
        row.window,
        row.manage,
        dir,
        m.trades,
        m.wins,
        m.losses,
        m.timeouts,
        m.decided,
        m.winRate.toFixed(2),
        (m.trades ? (m.wins * 100) / m.trades : 0).toFixed(2),
        m.avgR.toFixed(3),
        m.avgAllR.toFixed(3),
        m.pre,
        m.post,
      ].join(","));
    }
  }
  await writeFile(path.join(OUT_DIR, "overnight_direction_sweep.csv"), directionCsv.join("\n"));

  const best = rows.filter((r) => r.metrics.decided >= 8).slice(0, 25);
  const byFamily = ["Tokyo", "London"].flatMap((family) =>
    rows.filter((r) => r.family === family && r.metrics.decided >= 8).slice(0, 15),
  );
  await writeFile(path.join(OUT_DIR, "overnight_window_report.md"), report(bars, rows, best, byFamily));
  for (const row of best.slice(0, 10)) {
    await writeTrades(path.join(OUT_DIR, `${slug(row.family)}_${slug(row.window)}_${slug(row.manage)}.csv`), row.trades);
  }

  console.log(report(bars, rows, best, byFamily));
}

function buildWindows() {
  const out = [];
  const tokyoStarts = ["19:30", "20:00", "20:30", "20:50", "21:00", "21:15", "21:30"];
  const tokyoEnds = ["22:00", "22:30", "23:00", "23:30", "00:00"];
  for (const s of tokyoStarts.map(parseHm)) {
    for (const e of tokyoEnds.map(parseHm)) {
      if (windowLength(s, e) >= 60 && windowLength(s, e) <= 270) out.push({ family: "Tokyo", start: s, end: e });
    }
  }
  const londonStarts = ["01:30", "02:00", "02:15", "02:30", "02:45", "03:00", "03:30"];
  const londonEnds = ["04:00", "04:30", "05:00", "05:30", "06:00"];
  for (const s of londonStarts.map(parseHm)) {
    for (const e of londonEnds.map(parseHm)) {
      if (e > s && e - s >= 60 && e - s <= 270) out.push({ family: "London", start: s, end: e });
    }
  }
  return out;
}

function runBacktest(bars, cfg) {
  const fast = ema(bars.map((bar) => bar.close), cfg.fastEmaLength);
  const slow = ema(bars.map((bar) => bar.close), cfg.slowEmaLength);
  const swingLowValues = [];
  const swingLowBars = [];
  const swingHighValues = [];
  const swingHighBars = [];
  const tradedSessions = new Set();
  const trades = [];

  let sessionStartIndex = null;
  let sessionKey = null;
  let wasInSession = false;
  let sessionSetupCount = 0;
  let lastPriceCrossUp50Index = null;
  let lastPriceCrossDown50Index = null;
  let lastClosedSetupIndex = null;
  let pending = null;
  let armed = null;
  let activeTrade = null;

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const inSession = inEntrySession(bar, cfg);
    const key = sessionInstanceKey(bar, cfg);
    if (inSession && (!wasInSession || key !== sessionKey)) {
      sessionStartIndex = i;
      sessionKey = key;
      sessionSetupCount = 0;
    }
    if (!inSession && wasInSession) {
      sessionStartIndex = null;
      sessionKey = null;
    }
    wasInSession = inSession;

    const rawCrossUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const rawCrossDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    const priceCrossUp50 = bars[i - 1].close <= slow[i - 1] && bars[i].close > slow[i];
    const priceCrossDown50 = bars[i - 1].close >= slow[i - 1] && bars[i].close < slow[i];
    if (priceCrossUp50) lastPriceCrossUp50Index = i;
    if (priceCrossDown50) lastPriceCrossDown50Index = i;

    const pivotIndex = i - cfg.pivotRight;
    if (pivotIndex >= cfg.pivotLeft && pivotIndex + cfg.pivotRight < bars.length) {
      if (isPivotLow(bars, pivotIndex, cfg) && bars[pivotIndex].open < slow[pivotIndex]) {
        swingLowValues.push(bars[pivotIndex].low);
        swingLowBars.push(pivotIndex);
        while (swingLowBars.length > cfg.lookbackBars * 2) {
          swingLowValues.shift();
          swingLowBars.shift();
        }
      }
      if (isPivotHigh(bars, pivotIndex, cfg) && bars[pivotIndex].open > slow[pivotIndex]) {
        swingHighValues.push(bars[pivotIndex].high);
        swingHighBars.push(pivotIndex);
        while (swingHighBars.length > cfg.lookbackBars * 2) {
          swingHighValues.shift();
          swingHighBars.shift();
        }
      }
    }

    if (activeTrade) {
      const closed = maybeCloseTrade(activeTrade, bars, i, cfg);
      if (closed) {
        trades.push(closed);
        activeTrade = null;
        lastClosedSetupIndex = i;
      }
    }

    const cooldownOk = lastClosedSetupIndex === null || i - lastClosedSetupIndex >= cfg.setupCooldownBars;
    const setupLimit = cfg.setupsPerSession === "First only" ? 1 : cfg.setupsPerSession === "First and second" ? 2 : 100000;
    const canStart = inSession && sessionSetupCount < setupLimit && cooldownOk && !activeTrade && (!cfg.firstTradePerSession || !tradedSessions.has(key));
    const crossUp = canStart && rawCrossUp && (!armed || armed.direction === "short");
    const crossDown = canStart && rawCrossDown && (!armed || armed.direction === "long");

    if (crossUp && lastPriceCrossUp50Index !== null) {
      pending = { direction: "long", emaCrossIndex: i, priceCrossIndex: lastPriceCrossUp50Index, sessionStartIndex };
    }
    if (crossDown && lastPriceCrossDown50Index !== null) {
      pending = { direction: "short", emaCrossIndex: i, priceCrossIndex: lastPriceCrossDown50Index, sessionStartIndex };
    }

    if (pending && (i - pending.emaCrossIndex > cfg.setupBarsAfterEmaCross || !inSession || activeTrade)) pending = null;

    if (pending?.direction === "long") {
      const [pivotLow, pivotLowIndex] = findLastPivotBefore(swingLowValues, swingLowBars, pending.priceCrossIndex, pending.sessionStartIndex, cfg);
      const [pivotHigh, pivotHighIndex] = findFirstPivotAfter(swingHighValues, swingHighBars, pending.priceCrossIndex, pending.sessionStartIndex, cfg);
      const impossible = pending.priceCrossIndex < pending.sessionStartIndex || pivotLow === null;
      const valid = pivotLow !== null && pivotHigh !== null && pivotLowIndex < pending.priceCrossIndex && pivotHighIndex >= pending.priceCrossIndex && pivotHigh > pivotLow;
      const trendOk = !cfg.crossTrendFilter || slow[i] > slow[i - cfg.crossSlopeBars];
      const structOk = pivotLow !== null && pivotHigh !== null && pivotLow < slow[pivotLowIndex] && pivotHigh > slow[pivotHighIndex];
      if (impossible || (valid && !(trendOk && structOk))) {
        pending = null;
      } else if (valid) {
        armed = buildSetup("long", pending.emaCrossIndex, pending.priceCrossIndex, pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, cfg, key);
        sessionSetupCount += 1;
        const preTouch = findPreCrossTouch(armed, bars, i, cfg);
        if (cfg.allowPreCrossTouchEntry && preTouch && closeStillBeforeTarget(armed, bar)) {
          activeTrade = startTrade(armed, i, bar, "pre_cross_touch", preTouch);
          tradedSessions.add(key);
          armed = null;
        }
        pending = null;
      }
    }

    if (pending?.direction === "short") {
      const [pivotHigh, pivotHighIndex] = findLastPivotBefore(swingHighValues, swingHighBars, pending.priceCrossIndex, pending.sessionStartIndex, cfg);
      const [pivotLow, pivotLowIndex] = findFirstPivotAfter(swingLowValues, swingLowBars, pending.priceCrossIndex, pending.sessionStartIndex, cfg);
      const impossible = pending.priceCrossIndex < pending.sessionStartIndex || pivotHigh === null;
      const valid = pivotLow !== null && pivotHigh !== null && pivotHighIndex < pending.priceCrossIndex && pivotLowIndex >= pending.priceCrossIndex && pivotHigh > pivotLow;
      const trendOk = !cfg.crossTrendFilter || slow[i] < slow[i - cfg.crossSlopeBars];
      const structOk = pivotHigh !== null && pivotLow !== null && pivotHigh > slow[pivotHighIndex] && pivotLow < slow[pivotLowIndex];
      if (impossible || (valid && !(trendOk && structOk))) {
        pending = null;
      } else if (valid) {
        armed = buildSetup("short", pending.emaCrossIndex, pending.priceCrossIndex, pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, cfg, key);
        sessionSetupCount += 1;
        const preTouch = findPreCrossTouch(armed, bars, i, cfg);
        if (cfg.allowPreCrossTouchEntry && preTouch && closeStillBeforeTarget(armed, bar)) {
          activeTrade = startTrade(armed, i, bar, "pre_cross_touch", preTouch);
          tradedSessions.add(key);
          armed = null;
        }
        pending = null;
      }
    }

    if (armed && (i - armed.setupIndex > cfg.retestBars || !inSession)) {
      armed = null;
      lastClosedSetupIndex = i;
    }

    if (armed) {
      const armedInvalid = armed.direction === "long" ? bar.close < armed.stop : bar.close > armed.stop;
      if (armedInvalid) {
        armed = null;
        lastClosedSetupIndex = i;
      } else if (entryFromBar(armed, bar, cfg)) {
        activeTrade = startTrade(armed, i, bar, "post_cross_retest", null);
        tradedSessions.add(key);
        armed = null;
      }
    }
  }
  return trades;
}

function buildSetup(direction, setupIndex, priceCrossIndex, pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, cfg, sessionKey) {
  const range = pivotHigh - pivotLow;
  if (direction === "long") {
    return {
      direction,
      sessionKey,
      setupIndex,
      priceCrossIndex,
      pivotLow,
      pivotLowIndex,
      pivotHigh,
      pivotHighIndex,
      fibDeep: pivotHigh - range * cfg.deepFib,
      fib50: pivotHigh - range * cfg.shallowFib,
      target: pivotHigh + range * (cfg.targetMultiple - 1),
      stop: pivotLow,
    };
  }
  return {
    direction,
    sessionKey,
    setupIndex,
    priceCrossIndex,
    pivotLow,
    pivotLowIndex,
    pivotHigh,
    pivotHighIndex,
    fibDeep: pivotLow + range * cfg.deepFib,
    fib50: pivotLow + range * cfg.shallowFib,
    target: pivotLow - range * (cfg.targetMultiple - 1),
    stop: pivotHigh,
  };
}

function findPreCrossTouch(setup, bars, currentIndex, cfg) {
  const start = setup.direction === "long" ? setup.pivotLowIndex : setup.pivotHighIndex;
  const zLo = Math.min(setup.fibDeep, setup.fib50);
  const zHi = Math.max(setup.fibDeep, setup.fib50);
  for (let i = Math.max(start, currentIndex - cfg.lookbackBars); i < currentIndex; i += 1) {
    const bar = bars[i];
    const touched = bar.low <= zHi && bar.high >= zLo;
    const closeOk = setup.direction === "long" ? bar.close >= setup.fib50 : bar.close <= setup.fib50;
    const colorOk = !cfg.requireCandleColor || (setup.direction === "long" ? bar.close > bar.open : bar.close < bar.open);
    if (touched && closeOk && colorOk) return { index: i, bar };
  }
  return null;
}

function closeStillBeforeTarget(setup, bar) {
  return setup.direction === "long" ? bar.close < setup.target : bar.close > setup.target;
}

function entryFromBar(setup, bar, cfg) {
  if (!touchesZone(setup, bar)) return false;
  if (setup.direction === "long") {
    return bar.close >= setup.fib50 && bar.close < setup.target && (!cfg.requireCandleColor || bar.close > bar.open);
  }
  return bar.close <= setup.fib50 && bar.close > setup.target && (!cfg.requireCandleColor || bar.close < bar.open);
}

function touchesZone(setup, bar) {
  const low = Math.min(setup.fibDeep, setup.fib50);
  const high = Math.max(setup.fibDeep, setup.fib50);
  return bar.low <= high && bar.high >= low;
}

function startTrade(setup, entryIndex, bar, confirmationMode, preTouch) {
  return {
    ...setup,
    entryIndex,
    entryAt: bar.at,
    entryDate: bar.ctDate,
    entryTimeCT: timeStr(bar),
    entryPrice: bar.close,
    stopPrice: setup.stop,
    confirmationMode,
    preTouchIndex: preTouch?.index ?? null,
    preTouchTimeCT: preTouch ? timeStr(preTouch.bar) : "",
  };
}

function maybeCloseTrade(trade, bars, index, cfg) {
  if (index <= trade.entryIndex) return null;
  const bar = bars[index];
  const risk = Math.abs(trade.fib50 - trade.stopPrice);
  const targetReached = trade.direction === "long" ? bar.high >= trade.target : bar.low <= trade.target;
  if (targetReached) return closeTrade(trade, bar, index, trade.target, "WIN", risk === 0 ? 0 : Math.abs(trade.target - trade.fib50) / risk, "target");

  const stopExit = htfStopExit(trade, bars, index, cfg);
  if (stopExit) {
    const r = risk === 0 ? 0 : realizedR(trade, stopExit.price, risk);
    return closeTrade(trade, stopExit.bar, stopExit.index, stopExit.price, r >= 0 ? "TIMEOUT" : "LOSS", r, stopExit.reason);
  }

  if (!inManagementSession(bar, cfg)) {
    const r = risk === 0 ? 0 : trade.direction === "long" ? (bar.close - trade.entryPrice) / risk : (trade.entryPrice - bar.close) / risk;
    return closeTrade(trade, bar, index, bar.close, "TIMEOUT", r, "session_timeout");
  }
  return null;
}

function htfStopExit(trade, bars, index, cfg) {
  const bar = bars[index];
  const prev = bars[index - 1];
  if (!prev) return null;
  const bucket = htfBucketKey(bar, cfg);
  const prevBucket = htfBucketKey(prev, cfg);
  if (bucket === prevBucket) return null;
  const beyond = trade.direction === "long" ? prev.close < trade.stopPrice : prev.close > trade.stopPrice;
  return beyond ? { price: prev.close, bar: prev, index: index - 1, reason: `${cfg.htfStopMinutes}m_close_stop` } : null;
}

function htfBucketKey(bar, cfg) {
  if (cfg.htfBoundaryMode !== "clock_hour") return Math.floor(bar.at.getTime() / (cfg.htfStopMinutes * 60000));
  return `${bar.ctDate}-${bar.ct.hour}-${Math.floor(bar.ct.minute / cfg.htfStopMinutes)}`;
}

function inEntrySession(bar, cfg) {
  if (!sessionDayAllowed(bar, cfg)) return false;
  return inWindow(bar.ctMinutes, cfg.sessionStart, cfg.sessionEnd);
}

function inManagementSession(bar, cfg) {
  if (!sessionDayAllowed(bar, cfg)) return false;
  return inWindow(bar.ctMinutes, cfg.sessionStart, cfg.managementEnd);
}

function inWindow(mins, start, end) {
  if (end === 0) end = 1440;
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

function sessionDayAllowed(bar, cfg) {
  if (cfg.includeSundayEvening && bar.ct.weekday === "Sun" && bar.ctMinutes >= 17 * 60) return true;
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(bar.ct.weekday);
}

function sessionInstanceKey(bar, cfg) {
  let date = bar.ctDate;
  if (cfg.sessionStart > cfg.sessionEnd && bar.ctMinutes < cfg.sessionEnd) date = previousDateKey(bar.at);
  return `${cfg.sessionName}-${date}-${hm(cfg.sessionStart)}-${hm(cfg.sessionEnd)}`;
}

function maybePreviousDate(date, zone = CT_ZONE) {
  const d = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  const parts = dateParts(d, zone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function previousDateKey(date) {
  return maybePreviousDate(date, CT_ZONE);
}

function addMinutes(mins, extra) {
  return (mins + extra) % 1440;
}

function windowLength(start, end) {
  if (end === 0) end = 1440;
  return end >= start ? end - start : 1440 - start + end;
}

function closeTrade(trade, bar, index, exitPrice, result, r, exitReason) {
  return {
    ...trade,
    exitIndex: index,
    exitAt: bar.at,
    exitDate: bar.ctDate,
    exitTimeCT: timeStr(bar),
    exitPrice,
    result,
    r,
    exitReason,
  };
}

function realizedR(trade, exitPrice, risk) {
  return trade.direction === "long" ? (exitPrice - trade.fib50) / risk : (trade.fib50 - exitPrice) / risk;
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

function findLastPivotBefore(values, indexes, boundaryIndex, sessionStartIndex, cfg) {
  let foundValue = null;
  let foundIndex = null;
  if (sessionStartIndex === null) return [null, null];
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
  if (sessionStartIndex === null) return [null, null];
  for (let i = 0; i < indexes.length; i += 1) {
    const idx = indexes[i];
    if (idx >= sessionStartIndex && idx >= boundaryIndex && idx - boundaryIndex <= cfg.lookbackBars && (foundIndex === null || idx < foundIndex)) {
      foundValue = values[i];
      foundIndex = idx;
    }
  }
  return [foundValue, foundIndex];
}

function metrics(trades) {
  const wins = trades.filter((t) => t.result === "WIN").length;
  const losses = trades.filter((t) => t.result === "LOSS").length;
  const timeouts = trades.filter((t) => t.result === "TIMEOUT").length;
  const decided = wins + losses;
  const decidedTrades = trades.filter((t) => t.result !== "TIMEOUT");
  return {
    trades: trades.length,
    wins,
    losses,
    timeouts,
    decided,
    winRate: decided ? (wins * 100) / decided : 0,
    avgR: decidedTrades.length ? decidedTrades.reduce((s, t) => s + t.r, 0) / decidedTrades.length : 0,
    avgAllR: trades.length ? trades.reduce((s, t) => s + t.r, 0) / trades.length : 0,
    long: trades.filter((t) => t.direction === "long").length,
    short: trades.filter((t) => t.direction === "short").length,
    pre: trades.filter((t) => t.confirmationMode === "pre_cross_touch").length,
    post: trades.filter((t) => t.confirmationMode === "post_cross_retest").length,
  };
}

function segmentText(trades, pred) {
  const m = metrics(trades.filter(pred));
  return `${m.trades} trades, ${m.wins}W/${m.losses}L/${m.timeouts}T, ${m.winRate.toFixed(1)}%, avgR ${m.avgR.toFixed(2)}`;
}

function report(bars, rows, best, byFamily) {
  const lines = [];
  lines.push("# Overnight 21/50 EMA Pocket Window Sweep");
  lines.push("");
  lines.push(`Data: ES 1-minute, ${bars[0].at.toISOString()} to ${bars.at?.toISOString ?? ""}${bars[bars.length - 1].at.toISOString()}, ${bars.length.toLocaleString()} bars.`);
  lines.push("Rules: current working Pine logic for cross setups only: 21/50 EMA, pivot L/R 1, pivot open must straddle the 50 EMA, 50-78.6 entry pocket, 1.618 target, opposite pivot stop, 32-minute clock-hour HTF close invalidation, first actual trade per session window.");
  lines.push("Important: pre-cross pocket entries are ON, so the test accepts both price cross -> pocket -> EMA cross and price cross -> EMA cross -> pocket.");
  lines.push("");
  lines.push("## Best windows with at least 8 decided trades");
  lines.push("");
  lines.push("| Rank | Family | Window CT | Manage | Trades | W | L | T | Win % | Avg R | Long | Short | Pre | Post |");
  lines.push("|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  best.slice(0, 20).forEach((row, idx) => {
    const m = row.metrics;
    lines.push(`| ${idx + 1} | ${row.family} | ${row.window} | ${row.manage} | ${m.trades} | ${m.wins} | ${m.losses} | ${m.timeouts} | ${m.winRate.toFixed(1)} | ${m.avgR.toFixed(2)} | ${m.long} | ${m.short} | ${m.pre} | ${m.post} |`);
  });
  lines.push("");
  lines.push("## Best by family");
  for (const family of ["Tokyo", "London"]) {
    lines.push("");
    lines.push(`### ${family}`);
    lines.push("");
    lines.push("| Window CT | Manage | Trades | W | L | T | Win % | Avg R | Long segment | Short segment |");
    lines.push("|---|---|---:|---:|---:|---:|---:|---:|---|---|");
    byFamily.filter((r) => r.family === family).slice(0, 10).forEach((row) => {
      const m = row.metrics;
      lines.push(`| ${row.window} | ${row.manage} | ${m.trades} | ${m.wins} | ${m.losses} | ${m.timeouts} | ${m.winRate.toFixed(1)} | ${m.avgR.toFixed(2)} | ${segmentText(row.trades, (t) => t.direction === "long")} | ${segmentText(row.trades, (t) => t.direction === "short")} |`);
    });
  }
  lines.push("");
  lines.push("## Caution");
  lines.push("");
  lines.push("A 100% row with fewer than about 20 decided trades is not enough to call production-safe. It can be useful as an alert-only candidate, but the morning RTH edge is still the cleaner baseline.");
  return lines.join("\n");
}

async function writeTrades(file, trades) {
  const headers = [
    "sessionKey",
    "result",
    "direction",
    "entryDate",
    "entryTimeCT",
    "exitDate",
    "exitTimeCT",
    "r",
    "confirmationMode",
    "preTouchTimeCT",
    "entryPrice",
    "target",
    "stopPrice",
    "pivotLow",
    "pivotHigh",
    "exitReason",
  ];
  const rows = [headers.join(",")];
  for (const t of trades) {
    rows.push(headers.map((h) => csvCell(t[h])).join(","));
  }
  await writeFile(file, rows.join("\n"));
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(typeof v === "number" ? Number(v.toFixed(6)) : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
      if (Number.isFinite(bar.at.getTime()) && [bar.open, bar.high, bar.low, bar.close].every((v) => Number.isFinite(v) && v > 0)) {
        const parts = dateParts(bar.at, CT_ZONE);
        bar.ct = parts;
        bar.ctMinutes = parts.hour * 60 + parts.minute;
        bar.ctDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        byTime.set(bar.at.getTime(), bar);
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

function ema(values, length) {
  const k = 2 / (length + 1);
  const out = new Array(values.length).fill(NaN);
  let prev = null;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    prev = prev === null ? value : value * k + prev * (1 - k);
    out[i] = prev;
  }
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

function parseHm(s) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function hm(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function timeStr(bar) {
  return `${String(bar.ct.hour).padStart(2, "0")}:${String(bar.ct.minute).padStart(2, "0")}`;
}

function slug(s) {
  return String(s).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
}
