const CT_ZONE = "America/Chicago";
const DAY_SECONDS = 24 * 60 * 60;
const EPS = 1e-8;

const CONFIG = {
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
  enableStraddle: true,
  straddleStartMins: 9 * 60 + 40,
  straddleTrendFilter: true,
  alertStartMins: 8 * 60 + 50,
  alertEndMins: 11 * 60 + 50,
  deepFib: 0.618,
  targetMultiple: 2.0,
  targetZoneFar: 2.236,
  requireGateTouch: false,
  gateLine: 0,
  gateTolerance: 0.25,
  gateLookbackBars: 20,
  flatAtSessionEnd: true,
  maxBarsInTrade: 0,
};

const SYMBOLS = [
  { label: "SPY", yahoo: "SPY" },
  { label: "SPX", yahoo: "^GSPC" },
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const symbols = SYMBOLS.filter((symbol) => args.symbols.has(symbol.label));
  const rows = [];

  for (const symbol of symbols) {
    const bars = await fetchYahoo1mChunked(symbol.yahoo, args.days);
    const trades = runBacktest(bars, CONFIG);
    rows.push({ symbol, bars, trades, summary: summarize(trades) });
  }

  printReport(rows, args);
}

function parseArgs(argv) {
  const out = {
    days: 28,
    symbols: new Set(["SPY", "SPX"]),
  };
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key === "days") out.days = Math.max(1, Math.min(29, Number(value) || 28));
    if (key === "symbols") {
      out.symbols = new Set(
        value
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
      );
    }
  }
  return out;
}

async function fetchYahoo1mChunked(symbol, days) {
  const now = Math.floor(Date.now() / 1000);
  const earliest = now - days * DAY_SECONDS;
  const chunkSeconds = 7 * DAY_SECONDS;
  const byTime = new Map();

  for (let period1 = earliest; period1 < now; period1 += chunkSeconds) {
    const period2 = Math.min(period1 + chunkSeconds, now);
    const bars = await fetchYahooBars(symbol, period1, period2);
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
  url.searchParams.set("includePrePost", "false");

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
    );
}

function runBacktest(bars, cfg) {
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, cfg.fastEmaLength);
  const slow = ema(closes, cfg.slowEmaLength);
  const ha = heikinAshi(bars);
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

  for (let i = 1; i < bars.length; i += 1) {
    const inSession = isAlertSession(bars[i].at, cfg);
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
    if ((rawCrossUp || rawCrossDown) && inSession) crossThisSession = true;
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
        alertSessionStartIndex !== null &&
        sPhIndex >= alertSessionStartIndex &&
        sessionMinutes(bars[sPhIndex].at) >= cfg.straddleStartMins
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
        alertSessionStartIndex !== null &&
        sPlIndex >= alertSessionStartIndex &&
        sessionMinutes(bars[sPlIndex].at) >= cfg.straddleStartMins
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
    const canStartNewSetup = sessionSetupCount < setupLimit;

    if (tradeActive) {
      const closed = maybeCloseTrade(tradeActive, bars[i], i, inSession, cfg);
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
      rawCrossUp &&
      inSession &&
      gateSatisfied &&
      cooldownSatisfied &&
      canStartNewSetup &&
      !tradeActive &&
      (!armed || oppositeResetCrossUp);
    const crossDown =
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
          longPivotHigh > slow[longPivotHighIndex]);
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
        sessionSetupCount += 1;
        const started = maybeStartPreTouchTrade(setup, bars, i, cfg);
        if (started) tradeActive = started;
        else armed = setup;
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
          shortPivotLow < slow[shortPivotLowIndex]);
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
        sessionSetupCount += 1;
        const started = maybeStartPreTouchTrade(setup, bars, i, cfg);
        if (started) tradeActive = started;
        else armed = setup;
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
      sessionMinutes(bars[i].at) >= cfg.straddleStartMins;
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
      sessionSetupCount += 1;
      const started = maybeStartPreTouchTrade(setup, bars, i, cfg);
      if (started) tradeActive = started;
      else armed = setup;
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
  };
}

function maybeStartPreTouchTrade(setup, bars, i, cfg) {
  const preTouch = findPreCrossTouch(bars, setup, i, cfg);
  const targetAhead = setup.direction === "long" ? bars[i].close < setup.target : bars[i].close > setup.target;
  if (preTouch && targetAhead) return startTrade(setup, i, bars[i], "pre_cross_touch", preTouch);
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
  return {
    ...setup,
    entryIndex,
    entryAt: entryBar.at,
    entryPrice: entryBar.close,
    confirmationMode: mode,
    touchIndex: touch?.index ?? null,
  };
}

function maybeCloseTrade(trade, bar, index, inSession, cfg) {
  if (index <= trade.entryIndex) return null;
  const targetReached =
    trade.direction === "long" ? bar.high >= trade.target : bar.low <= trade.target;
  const invalidated =
    trade.direction === "long" ? bar.close < trade.stop : bar.close > trade.stop;
  const timedOut =
    (cfg.flatAtSessionEnd && !inSession) ||
    (cfg.maxBarsInTrade > 0 && index - trade.entryIndex >= cfg.maxBarsInTrade);
  const risk = Math.abs(trade.fib50 - trade.stop);
  const targetR = risk === 0 ? 0 : Math.abs(trade.target - trade.fib50) / risk;
  if (targetReached) {
    return { ...trade, exitIndex: index, exitAt: bar.at, exitPrice: trade.target, result: "WIN", r: targetR };
  }
  if (invalidated) {
    return { ...trade, exitIndex: index, exitAt: bar.at, exitPrice: bar.close, result: "LOSS", r: -1 };
  }
  if (timedOut) {
    const r =
      risk === 0
        ? 0
        : trade.direction === "long"
          ? (bar.close - trade.entryPrice) / risk
          : (trade.entryPrice - bar.close) / risk;
    return { ...trade, exitIndex: index, exitAt: bar.at, exitPrice: bar.close, result: "TIMEOUT", r };
  }
  return null;
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

function isAlertSession(date, cfg) {
  const mins = sessionMinutes(date);
  const day = Number(formatInZone(date, "weekdayNumber"));
  return day >= 1 && day <= 5 && mins >= cfg.alertStartMins && mins <= cfg.alertEndMins;
}

function sessionMinutes(date) {
  const parts = dateParts(date);
  return parts.hour * 60 + parts.minute;
}

function dateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_ZONE,
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
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: CT_ZONE, weekday: "short" }).format(date);
    return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekday] ?? 0;
  }
  const parts = dateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} CT`;
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
