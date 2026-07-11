const CT_ZONE = "America/Chicago";
const LOOKBACK_BARS = 90;
const RETEST_BARS = 60;
const SETUP_BARS_AFTER_TRIGGER = 8;
const SETUP_COOLDOWN_BARS = 10;
const TARGET_MULTIPLE = 1.236;
const PIVOT_LEFT = 1;
const PIVOT_RIGHT = 1;
const EPS = 1e-8;
const DAY_SECONDS = 24 * 60 * 60;

const SYMBOLS = [
  { label: "SPY", yahoo: "SPY" },
  { label: "SPX", yahoo: "^GSPC" },
];

const PROFILES = [
  { name: "21/50", fast: 21, slow: 50 },
  { name: "14/50", fast: 14, slow: 50 },
];

const TRIGGERS = [
  { name: "EMA-confirmed", mode: "ema_cross" },
  { name: "Price/50 break", mode: "price50_break" },
];

const WINDOWS = [
  { name: "Current", start: "08:50", end: "11:50" },
  { name: "User focus", start: "09:00", end: "10:00" },
  { name: "Institutional", start: "09:00", end: "11:00" },
  { name: "Open push", start: "08:30", end: "10:00" },
];

const TIMEFRAMES = [
  { label: "1m", yahooInterval: "1m", minutes: 1, source: "chunked_1m" },
  { label: "5m", yahooInterval: "5m", minutes: 5, range: "60d" },
  { label: "15m", yahooInterval: "15m", minutes: 15, range: "60d" },
  { label: "30m", yahooInterval: "30m", minutes: 30, range: "60d" },
  { label: "1h", yahooInterval: "60m", minutes: 60, range: "6mo" },
  {
    label: "4h",
    yahooInterval: "60m",
    minutes: 240,
    range: "6mo",
    aggregateMinutes: 240,
  },
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selectedSymbols = selectByLabel(SYMBOLS, args.symbols, "symbols");
  const selectedTimeframes = selectByLabel(TIMEFRAMES, args.timeframes, "timeframes");
  const selectedWindows = selectWindows(args.windows);
  const selectedTriggers = selectTriggers(args.triggers);
  const selectedProfiles = selectByName(PROFILES, args.profiles, "profiles");
  const coverage = [];
  const rows = [];

  for (const symbol of selectedSymbols) {
    for (const timeframe of selectedTimeframes) {
      const bars = await loadBars(symbol, timeframe, args);
      coverage.push({
        symbol: symbol.label,
        timeframe: timeframe.label,
        bars,
        source: timeframe.source === "chunked_1m" ? `Yahoo 1m chunked ${args.days1m}d` : `Yahoo ${timeframe.yahooInterval} ${timeframe.range}`,
      });

      for (const window of selectedWindows) {
        for (const trigger of selectedTriggers) {
          for (const profile of selectedProfiles) {
            const trades = runBacktest(bars, profile, {
              triggerMode: trigger.mode,
              entryWindow: window,
            });
            rows.push({
              symbol: symbol.label,
              timeframe: timeframe.label,
              timeframeMinutes: timeframe.minutes,
              source: timeframe.source,
              window,
              trigger,
              profile,
              trades,
              summary: summarizeTrades(trades),
            });
          }
        }
      }
    }
  }

  printCoverage(coverage);
  printSummary(rows);
  printBestCandidates(rows, args.minTrades);
  printFocusTrades(rows);
  printNotes();
}

function parseArgs(argv) {
  const args = {
    symbols: ["SPY", "SPX"],
    timeframes: ["1m", "5m", "15m", "30m", "1h", "4h"],
    windows: null,
    triggers: null,
    profiles: null,
    days1m: 28,
    minTrades: 3,
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue = ""] = arg.slice(2).split("=");
    const values = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (key === "symbols" && values.length) args.symbols = values;
    if (key === "timeframes" && values.length) args.timeframes = values;
    if (key === "windows" && values.length) args.windows = values;
    if (key === "triggers" && values.length) args.triggers = values;
    if (key === "profiles" && values.length) args.profiles = values;
    if (key === "days1m" && Number.isFinite(Number(rawValue))) {
      args.days1m = Math.max(1, Math.min(29, Number(rawValue)));
    }
    if (key === "minTrades" && Number.isFinite(Number(rawValue))) {
      args.minTrades = Math.max(1, Number(rawValue));
    }
  }

  return args;
}

function selectByLabel(items, selected, label) {
  const wanted = new Set(selected.map((value) => value.toLowerCase()));
  const found = items.filter((item) => wanted.has(item.label.toLowerCase()));
  if (found.length !== wanted.size) {
    throw new Error(`Unknown ${label}. Available: ${items.map((item) => item.label).join(", ")}`);
  }
  return found;
}

function selectByName(items, selected, label) {
  if (!selected) return items;
  const wanted = new Set(selected.map((value) => value.toLowerCase()));
  const found = items.filter((item) => wanted.has(item.name.toLowerCase()));
  if (found.length !== wanted.size) {
    throw new Error(`Unknown ${label}. Available: ${items.map((item) => item.name).join(", ")}`);
  }
  return found;
}

function selectWindows(selected) {
  if (!selected) return WINDOWS;
  return selected.map((value) => {
    const known = WINDOWS.find((window) => window.name.toLowerCase() === value.toLowerCase());
    if (known) return known;
    const match = value.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) {
      throw new Error(
        `Unknown window "${value}". Use one of ${WINDOWS.map((window) => window.name).join(", ")} or HH:MM-HH:MM.`,
      );
    }
    return { name: value, start: match[1], end: match[2] };
  });
}

function selectTriggers(selected) {
  if (!selected) return TRIGGERS;
  const aliases = {
    ema: "ema_cross",
    ema_cross: "ema_cross",
    "ema-confirmed": "ema_cross",
    price: "price50_break",
    price50: "price50_break",
    price50_break: "price50_break",
  };
  const wanted = new Set(selected.map((value) => aliases[value.toLowerCase()] ?? value.toLowerCase()));
  const found = TRIGGERS.filter((trigger) => wanted.has(trigger.mode));
  if (found.length !== wanted.size) {
    throw new Error(`Unknown triggers. Available: ema, price50`);
  }
  return found;
}

async function loadBars(symbol, timeframe, args) {
  if (timeframe.source === "chunked_1m") {
    return fetchYahoo1mChunked(symbol.yahoo, args.days1m);
  }

  const bars = await fetchYahooBars(symbol.yahoo, {
    interval: timeframe.yahooInterval,
    range: timeframe.range,
  });

  return timeframe.aggregateMinutes ? aggregateBars(bars, timeframe.aggregateMinutes) : bars;
}

async function fetchYahoo1mChunked(symbol, days) {
  const now = Math.floor(Date.now() / 1000);
  const earliest = now - days * DAY_SECONDS;
  const chunkSeconds = 7 * DAY_SECONDS;
  const byTime = new Map();

  for (let period1 = earliest; period1 < now; period1 += chunkSeconds) {
    const period2 = Math.min(period1 + chunkSeconds, now);
    const bars = await fetchYahooBars(symbol, {
      interval: "1m",
      period1,
      period2,
    });
    for (const bar of bars) byTime.set(bar.at.getTime(), bar);
  }

  return [...byTime.values()].sort((a, b) => a.at - b.at);
}

async function fetchYahooBars(symbol, params) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("interval", params.interval);
  url.searchParams.set("includePrePost", "false");
  if (params.range) url.searchParams.set("range", params.range);
  if (params.period1) url.searchParams.set("period1", String(params.period1));
  if (params.period2) url.searchParams.set("period2", String(params.period2));

  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 SPYProphet/1.0",
    },
  });
  const body = await res.json();
  if (!res.ok) {
    const description = body.chart?.error?.description ?? `HTTP ${res.status}`;
    throw new Error(`Yahoo ${symbol} ${params.interval} failed: ${description}`);
  }

  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps?.length || !quote) throw new Error(`Yahoo ${symbol} returned no ${params.interval} bars`);

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

function aggregateBars(bars, minutes) {
  const buckets = new Map();
  for (const bar of bars) {
    const parts = ctParts(bar.at);
    const minuteOfDay = parts.hour * 60 + parts.minute;
    const regularSessionStart = 8 * 60 + 30;
    if (minuteOfDay < regularSessionStart) continue;
    const bucketIndex = Math.floor((minuteOfDay - regularSessionStart) / minutes);
    const key = `${parts.date}:${bucketIndex}`;
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { ...bar, sourceCount: 1 });
      continue;
    }
    bucket.high = Math.max(bucket.high, bar.high);
    bucket.low = Math.min(bucket.low, bar.low);
    bucket.close = bar.close;
    bucket.volume += bar.volume;
    bucket.sourceCount += 1;
  }

  return [...buckets.values()]
    .map(({ sourceCount: _sourceCount, ...bar }) => bar)
    .sort((a, b) => a.at - b.at);
}

function runBacktest(bars, profile, config) {
  const fast = ema(bars.map((bar) => bar.close), profile.fast);
  const slow = ema(bars.map((bar) => bar.close), profile.slow);
  const trades = [];

  let armed = null;
  let tradeActive = null;
  let pendingTrigger = null;
  let lastClosedSetupIndex = null;
  let lastPriceCrossUp50Index = null;
  let lastPriceCrossDown50Index = null;
  const swingLows = [];
  const swingHighs = [];

  for (let i = 1; i < bars.length; i += 1) {
    const pivotIndex = i - PIVOT_RIGHT;
    if (pivotIndex >= PIVOT_LEFT) {
      if (isPivotLow(bars, pivotIndex)) {
        swingLows.push({ index: pivotIndex, value: bars[pivotIndex].low });
        trimPivotList(swingLows, i);
      }

      if (isPivotHigh(bars, pivotIndex)) {
        swingHighs.push({ index: pivotIndex, value: bars[pivotIndex].high });
        trimPivotList(swingHighs, i);
      }
    }

    const priceCrossUp50 = bars[i - 1].close <= slow[i - 1] && bars[i].close > slow[i];
    const priceCrossDown50 = bars[i - 1].close >= slow[i - 1] && bars[i].close < slow[i];
    if (priceCrossUp50) lastPriceCrossUp50Index = i;
    if (priceCrossDown50) lastPriceCrossDown50Index = i;

    if (tradeActive) {
      const closed = maybeCloseTrade(tradeActive, bars[i], i);
      if (closed) {
        trades.push(closed);
        tradeActive = null;
        lastClosedSetupIndex = i;
      }
    }

    const inSession = isInWindow(bars[i].at, config.entryWindow);
    if (armed && (!inSession || i - armed.armedIndex > RETEST_BARS)) {
      armed = null;
      lastClosedSetupIndex = i;
    }

    if (armed && inSession && !tradeActive) {
      if (
        (armed.direction === "long" && bars[i].close < armed.stop - EPS) ||
        (armed.direction === "short" && bars[i].close > armed.stop + EPS)
      ) {
        armed = null;
        lastClosedSetupIndex = i;
      } else {
        const entrySignal = entryFromBar(armed, bars[i]);
        if (entrySignal && i + 1 < bars.length) {
          const candidate = startTrade(armed, bars[i + 1], i + 1, "post_cross_retest", bars[i]);
          if (isActionableEntry(candidate)) {
            tradeActive = candidate;
          }
          armed = null;
        }
      }
    }

    const crossUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const crossDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    const cooldownSatisfied =
      lastClosedSetupIndex === null || i - lastClosedSetupIndex >= SETUP_COOLDOWN_BARS;
    const oppositeResetCross =
      armed &&
      inSession &&
      cooldownSatisfied &&
      !tradeActive &&
      ((armed.direction === "long" && crossDown) ||
        (armed.direction === "short" && crossUp));
    if (oppositeResetCross) {
      armed = null;
    }

    if (inSession && cooldownSatisfied && !tradeActive && !armed) {
      if (config.triggerMode === "ema_cross") {
        if (crossUp && lastPriceCrossUp50Index !== null) {
          pendingTrigger = {
            direction: "long",
            triggerIndex: i,
            priceCrossIndex: lastPriceCrossUp50Index,
            triggerMode: config.triggerMode,
          };
        } else if (crossDown && lastPriceCrossDown50Index !== null) {
          pendingTrigger = {
            direction: "short",
            triggerIndex: i,
            priceCrossIndex: lastPriceCrossDown50Index,
            triggerMode: config.triggerMode,
          };
        }
      } else if (config.triggerMode === "price50_break") {
        if (priceCrossUp50) {
          pendingTrigger = {
            direction: "long",
            triggerIndex: i,
            priceCrossIndex: i,
            triggerMode: config.triggerMode,
          };
        } else if (priceCrossDown50) {
          pendingTrigger = {
            direction: "short",
            triggerIndex: i,
            priceCrossIndex: i,
            triggerMode: config.triggerMode,
          };
        }
      }
    }

    if (
      pendingTrigger &&
      (!inSession ||
        tradeActive ||
        i - pendingTrigger.triggerIndex > SETUP_BARS_AFTER_TRIGGER)
    ) {
      pendingTrigger = null;
    }

    if (pendingTrigger && inSession && !tradeActive) {
      const setup =
        pendingTrigger.direction === "long"
          ? buildLongSetup(pendingTrigger, bars, swingLows, swingHighs, profile)
          : buildShortSetup(pendingTrigger, bars, swingLows, swingHighs, profile);
      if (!setup) continue;

      const preTouch = findPreCrossTouch(bars, setup, setup.direction === "long", i);
      const targetAhead =
        setup.direction === "long"
          ? bars[i].close < setup.extension150 - EPS
          : bars[i].close > setup.extension150 + EPS;

      if (preTouch && targetAhead && i + 1 < bars.length) {
        const candidate = startTrade(setup, bars[i + 1], i + 1, "pre_cross_touch", preTouch);
        if (isActionableEntry(candidate)) {
          tradeActive = candidate;
        }
      } else {
        armed = setup;
      }
      pendingTrigger = null;
    }
  }

  return trades;
}

function buildLongSetup(pending, bars, swingLows, swingHighs, profile) {
  const pivotLowSource = findLastPivotBefore(swingLows, pending.priceCrossIndex);
  const pivotHighSource = findFirstPivotAfter(swingHighs, pending.priceCrossIndex);
  if (!pivotLowSource || !pivotHighSource) return null;
  const valid =
    pivotLowSource.index < pending.priceCrossIndex &&
    pivotHighSource.index >= pending.priceCrossIndex &&
    pending.priceCrossIndex - pivotLowSource.index <= LOOKBACK_BARS &&
    pivotHighSource.index - pending.priceCrossIndex <= LOOKBACK_BARS &&
    pivotHighSource.value > pivotLowSource.value;
  if (!valid) return null;

  const pivotLow = pivotLowSource.value;
  const pivotHigh = pivotHighSource.value;
  const range = pivotHigh - pivotLow;
  return {
    direction: "long",
    armedIndex: pending.triggerIndex,
    signalAt: bars[pending.triggerIndex].at,
    pivotLow,
    pivotHigh,
    fib618: pivotHigh - range * 0.618,
    fib50: pivotLow + range * 0.5,
    targetMultiple: TARGET_MULTIPLE,
    extension150: pivotLow + range * TARGET_MULTIPLE,
    stop: pivotLow,
    startIndex: pivotLowSource.index,
    priceCrossIndex: pending.priceCrossIndex,
    triggerMode: pending.triggerMode,
    profile,
  };
}

function buildShortSetup(pending, bars, swingLows, swingHighs, profile) {
  const pivotHighSource = findLastPivotBefore(swingHighs, pending.priceCrossIndex);
  const pivotLowSource = findFirstPivotAfter(swingLows, pending.priceCrossIndex);
  if (!pivotHighSource || !pivotLowSource) return null;
  const valid =
    pivotHighSource.index < pending.priceCrossIndex &&
    pivotLowSource.index >= pending.priceCrossIndex &&
    pending.priceCrossIndex - pivotHighSource.index <= LOOKBACK_BARS &&
    pivotLowSource.index - pending.priceCrossIndex <= LOOKBACK_BARS &&
    pivotHighSource.value > pivotLowSource.value;
  if (!valid) return null;

  const pivotHigh = pivotHighSource.value;
  const pivotLow = pivotLowSource.value;
  const range = pivotHigh - pivotLow;
  return {
    direction: "short",
    armedIndex: pending.triggerIndex,
    signalAt: bars[pending.triggerIndex].at,
    pivotLow,
    pivotHigh,
    fib618: pivotLow + range * 0.618,
    fib50: pivotHigh - range * 0.5,
    targetMultiple: TARGET_MULTIPLE,
    extension150: pivotHigh - range * TARGET_MULTIPLE,
    stop: pivotHigh,
    startIndex: pivotHighSource.index,
    priceCrossIndex: pending.priceCrossIndex,
    triggerMode: pending.triggerMode,
    profile,
  };
}

function findLastPivotBefore(pivots, boundaryIndex) {
  let found = null;
  for (const pivot of pivots) {
    if (pivot.index < boundaryIndex && boundaryIndex - pivot.index <= LOOKBACK_BARS) {
      found = pivot;
    }
  }
  return found;
}

function findFirstPivotAfter(pivots, boundaryIndex) {
  for (const pivot of pivots) {
    if (pivot.index >= boundaryIndex && pivot.index - boundaryIndex <= LOOKBACK_BARS) {
      return pivot;
    }
  }
  return null;
}

function trimPivotList(pivots, index) {
  while (pivots.length && index - pivots[0].index > LOOKBACK_BARS * 2) {
    pivots.shift();
  }
}

function findPreCrossTouch(bars, setup, isLong, currentIndex = setup.armedIndex) {
  const zoneLow = Math.min(setup.fib618, setup.fib50);
  const zoneHigh = Math.max(setup.fib618, setup.fib50);
  for (let offset = 1; offset <= LOOKBACK_BARS; offset += 1) {
    const index = currentIndex - offset;
    if (index < setup.startIndex || index < 0) continue;
    const bar = bars[index];
    const touched = bar.low <= zoneHigh + EPS && bar.high >= zoneLow - EPS;
    const touchedFib50 = bar.low <= setup.fib50 + EPS && bar.high >= setup.fib50 - EPS;
    const closeOk = isLong ? bar.close >= setup.fib50 - EPS : bar.close <= setup.fib50 + EPS;
    const colorOk = isLong ? bar.close > bar.open : bar.close < bar.open;
    if (touched && touchedFib50 && closeOk && colorOk) return { ...bar, index };
  }
  return null;
}

function entryFromBar(setup, bar) {
  const zoneLow = Math.min(setup.fib618, setup.fib50);
  const zoneHigh = Math.max(setup.fib618, setup.fib50);
  const touched = bar.low <= zoneHigh + EPS && bar.high >= zoneLow - EPS;
  const touchedFib50 = bar.low <= setup.fib50 + EPS && bar.high >= setup.fib50 - EPS;
  if (!touched || !touchedFib50) return false;
  if (setup.direction === "long") {
    return bar.close >= setup.fib50 - EPS && bar.close > bar.open;
  }
  return bar.close <= setup.fib50 + EPS && bar.close < bar.open;
}

function startTrade(setup, entryBar, entryIndex, mode, touchBar) {
  const touchCloseDistance = Math.abs(touchBar.close - setup.fib50);
  const swingRange = Math.abs(setup.pivotHigh - setup.pivotLow);
  return {
    ...setup,
    entry: entryBar.open,
    entryAt: entryBar.at,
    entryIndex,
    mode,
    touchAt: touchBar.at,
    touchCloseDistanceToFib50: touchCloseDistance,
    touchCloseDistancePctOfRange: swingRange > 0 ? (touchCloseDistance / swingRange) * 100 : 0,
  };
}

function isActionableEntry(trade) {
  return trade.direction === "long"
    ? trade.entry < trade.extension150 - EPS
    : trade.entry > trade.extension150 + EPS;
}

function maybeCloseTrade(trade, bar, index) {
  const hitTarget =
    trade.direction === "long"
      ? bar.high >= trade.extension150 - EPS
      : bar.low <= trade.extension150 + EPS;
  const hitStop =
    trade.direction === "long" ? bar.low <= trade.stop + EPS : bar.high >= trade.stop - EPS;
  if (!hitTarget && !hitStop) return null;

  const exit = hitTarget ? trade.extension150 : trade.stop;
  const pnl = trade.direction === "long" ? exit - trade.entry : trade.entry - exit;
  return {
    ...trade,
    exit,
    exitAt: bar.at,
    exitIndex: index,
    result: hitTarget ? "target" : "stop",
    pnl,
    holdMinutes: Math.max(0, Math.round((bar.at - trade.entryAt) / 60000)),
    sameDayExit: ctParts(bar.at).date === ctParts(trade.entryAt).date,
  };
}

function ema(values, length) {
  const k = 2 / (length + 1);
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    out[i] = i === 0 ? values[i] : values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function isPivotLow(bars, index) {
  const value = bars[index].low;
  const left = bars[index - 1]?.low;
  const right = bars[index + 1]?.low;
  return value <= left && value <= right && (value < left || value < right);
}

function isPivotHigh(bars, index) {
  const value = bars[index].high;
  const left = bars[index - 1]?.high;
  const right = bars[index + 1]?.high;
  return value >= left && value >= right && (value > left || value > right);
}

function isInWindow(date, window) {
  const parts = ctParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= parseTime(window.start) && minutes < parseTime(window.end);
}

function parseTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function ctParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function formatCt(date) {
  const parts = ctParts(date);
  return `${parts.date} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(
    2,
    "0",
  )} CT`;
}

function summarizeTrades(trades) {
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const losses = trades.filter((trade) => trade.pnl <= 0).length;
  const net = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const avg = trades.length ? net / trades.length : 0;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const holdMinutes = trades.map((trade) => trade.holdMinutes).filter(Number.isFinite);
  const medianHold = median(holdMinutes);
  const sameDayRate = trades.length
    ? (trades.filter((trade) => trade.sameDayExit).length / trades.length) * 100
    : 0;
  const medianCloseDistancePct = median(
    trades.map((trade) => trade.touchCloseDistancePctOfRange).filter(Number.isFinite),
  );
  return {
    trades: trades.length,
    wins,
    losses,
    winRate,
    net,
    avg,
    medianHold,
    sameDayRate,
    medianCloseDistancePct,
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function printCoverage(coverage) {
  console.log("\nEMA/Fib research data coverage");
  for (const item of coverage) {
    if (!item.bars.length) {
      console.log(`${item.symbol}\t${item.timeframe}\t${item.source}\t0 bars`);
      continue;
    }
    console.log(
      [
        item.symbol,
        item.timeframe,
        item.source,
        `${item.bars.length} bars`,
        formatCt(item.bars[0].at),
        "->",
        formatCt(item.bars[item.bars.length - 1].at),
      ].join("\t"),
    );
  }
}

function printSummary(rows) {
  console.log("\nEMA/Fib window and timeframe research");
  console.log(
    `Rules: Fib 50 line must trade through and reject, 50-61.8 zone context, target Fib ${TARGET_MULTIPLE}, cooldown ${SETUP_COOLDOWN_BARS} bars.`,
  );
  console.log(
    [
      "Symbol",
      "TF",
      "Window CT",
      "Trigger",
      "Profile",
      "Trades",
      "Wins",
      "Losses",
      "Win rate",
      "Net pts",
      "Avg pts",
      "Med hold",
      "Same day",
      "Close/Fib50",
      "Expiry lane",
    ].join("\t"),
  );

  for (const row of rows) {
    const summary = row.summary;
    console.log(
      [
        row.symbol,
        row.timeframe,
        `${row.window.start}-${row.window.end}`,
        row.trigger.name,
        row.profile.name,
        summary.trades,
        summary.wins,
        summary.losses,
        `${summary.winRate.toFixed(1)}%`,
        summary.net.toFixed(2),
        summary.avg.toFixed(2),
        formatHold(summary.medianHold),
        `${summary.sameDayRate.toFixed(0)}%`,
        `${summary.medianCloseDistancePct.toFixed(1)}%`,
        expiryLane(summary, row.timeframeMinutes),
      ].join("\t"),
    );
  }
}

function printBestCandidates(rows, minTrades) {
  const candidates = rows
    .filter((row) => row.symbol === "SPY" && row.summary.trades >= minTrades)
    .sort((a, b) => {
      const winDiff = b.summary.winRate - a.summary.winRate;
      if (Math.abs(winDiff) > EPS) return winDiff;
      return b.summary.net - a.summary.net;
    })
    .slice(0, 12);

  console.log(`\nBest SPY candidates with at least ${minTrades} trades`);
  if (!candidates.length) {
    console.log("No rows met the minimum trade threshold.");
    return;
  }
  for (const row of candidates) {
    const summary = row.summary;
    console.log(
      [
        `${row.timeframe} ${row.window.start}-${row.window.end}`,
        row.trigger.name,
        row.profile.name,
        `${summary.trades} trades`,
        `${summary.winRate.toFixed(1)}%`,
        `${summary.net.toFixed(2)} pts`,
        `median ${formatHold(summary.medianHold)}`,
        expiryLane(summary, row.timeframeMinutes),
      ].join(" | "),
    );
  }
}

function printFocusTrades(rows) {
  const focusRows = rows.filter(
    (row) =>
      row.symbol === "SPY" &&
      row.timeframe === "1m" &&
      row.window.start === "09:00" &&
      row.window.end === "10:00",
  );

  console.log("\nSPY 1m 09:00-10:00 CT trade detail");
  for (const row of focusRows) {
    console.log(`\n${row.trigger.name} ${row.profile.name}`);
    if (!row.trades.length) {
      console.log("  No trades.");
      continue;
    }
    for (const trade of row.trades.slice(-12)) {
      console.log(
        [
          `  ${trade.direction.toUpperCase()}`,
          trade.mode,
          `signal ${formatCt(trade.signalAt)}`,
          `touch ${formatCt(trade.touchAt)}`,
          `entry ${formatCt(trade.entryAt)} @ ${trade.entry.toFixed(2)}`,
          `zone ${Math.min(trade.fib618, trade.fib50).toFixed(2)}-${Math.max(
            trade.fib618,
            trade.fib50,
          ).toFixed(2)}`,
          `target ${trade.extension150.toFixed(2)}`,
          `stop ${trade.stop.toFixed(2)}`,
          `exit ${formatCt(trade.exitAt)} @ ${trade.exit.toFixed(2)}`,
          trade.result,
          `P/L ${trade.pnl.toFixed(2)}`,
        ].join(" | "),
      );
    }
  }
}

function printNotes() {
  console.log("\nNotes");
  console.log("- The Price/50 break trigger is research-only. It does not change the live TradingView v13 COOL10 alert.");
  console.log("- Expiry lane is inferred from underlying hold time only. It is not an options-chain or Greeks backtest.");
  console.log("- Yahoo 1m history is chunked inside the latest 29 calendar days; use TradingView/Tastytrade exports for deeper proof.");
}

function formatHold(minutes) {
  if (!minutes) return "-";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function expiryLane(summary, timeframeMinutes) {
  if (!summary.trades) return "Needs samples";
  if (timeframeMinutes <= 5 && summary.sameDayRate >= 90 && summary.medianHold <= 60) {
    return "0DTE scalp";
  }
  if (timeframeMinutes <= 15 && summary.sameDayRate >= 80 && summary.medianHold <= 180) {
    return "0-1DTE";
  }
  if (summary.medianHold <= 420) return "1-3DTE";
  if (summary.medianHold <= 1950) return "3-7DTE";
  return "7-21DTE";
}
