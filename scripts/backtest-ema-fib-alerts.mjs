const CT_ZONE = "America/Chicago";
const LOOKBACK_BARS = 90;
const RETEST_BARS = 60;
const SETUP_BARS_AFTER_EMA_CROSS = 8;
const SETUP_COOLDOWN_BARS = 10;
const TARGET_MULTIPLE = 1.236;
const PIVOT_LEFT = 1;
const PIVOT_RIGHT = 1;
const EPS = 1e-8;
const BACKTEST_RANGE = process.env.BACKTEST_RANGE || "8d";
const REQUESTED_SAMPLE_SIZE = Number(process.env.SETUP_SAMPLE_SIZE || 100);

const SYMBOLS = [
  { label: "SPY", yahoo: "SPY" },
  { label: "SPX", yahoo: "^GSPC" },
];

const PROFILES = [
  { name: "Conservative", fast: 21, slow: 50 },
  { name: "Aggressive", fast: 14, slow: 50 },
];

const BACKTEST_MODES = [
  { label: "All valid", firstTradeOnly: false },
  { label: "First/session", firstTradeOnly: true },
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const results = [];

  for (const symbol of SYMBOLS) {
    const bars = await fetchYahooBars(symbol.yahoo);
    for (const profile of PROFILES) {
      for (const mode of BACKTEST_MODES) {
        const trades = runBacktest(bars, profile, mode);
        results.push({ symbol: symbol.label, profile, mode, trades });
      }
    }
  }

  printSummary(results);
  printLastSampleStats(results, REQUESTED_SAMPLE_SIZE);
  printRecentTrades(results);
}

async function fetchYahooBars(symbol) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("interval", "1m");
  url.searchParams.set("range", BACKTEST_RANGE);
  url.searchParams.set("includePrePost", "false");

  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 SPYProphet/1.0",
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} returned HTTP ${res.status}`);

  const body = await res.json();
  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps?.length || !quote) throw new Error(`Yahoo ${symbol} returned no 1m bars`);

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

function runBacktest(bars, profile, mode = BACKTEST_MODES[0]) {
  const fast = ema(bars.map((bar) => bar.close), profile.fast);
  const slow = ema(bars.map((bar) => bar.close), profile.slow);
  const trades = [];

  let armed = null;
  let tradeActive = null;
  let pendingEmaCross = null;
  let lastClosedSetupIndex = null;
  let lastPriceCrossUp50Index = null;
  let lastPriceCrossDown50Index = null;
  let currentSessionStartIndex = null;
  let wasInSession = false;
  let sessionTradeTaken = false;
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

    const inSession = isNewEntryWindow(bars[i].at);
    if (inSession && !wasInSession) {
      currentSessionStartIndex = i;
      sessionTradeTaken = false;
    }
    if (!inSession) currentSessionStartIndex = null;
    wasInSession = inSession;
    const sessionEntryAllowed = !mode.firstTradeOnly || !sessionTradeTaken;
    if (armed && (!inSession || i - armed.armedIndex > RETEST_BARS)) {
      armed = null;
      lastClosedSetupIndex = i;
    }

    if (armed && inSession && sessionEntryAllowed && !tradeActive) {
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
            sessionTradeTaken = true;
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
      sessionEntryAllowed &&
      !tradeActive &&
      ((armed.direction === "long" && crossDown) ||
        (armed.direction === "short" && crossUp));
    if (oppositeResetCross) {
      armed = null;
    }
    if (inSession && sessionEntryAllowed && cooldownSatisfied && !tradeActive && !armed) {
      if (crossUp && lastPriceCrossUp50Index !== null) {
        pendingEmaCross = {
          direction: "long",
          emaCrossIndex: i,
          priceCrossIndex: lastPriceCrossUp50Index,
          sessionStartIndex: currentSessionStartIndex,
        };
      } else if (crossDown && lastPriceCrossDown50Index !== null) {
        pendingEmaCross = {
          direction: "short",
          emaCrossIndex: i,
          priceCrossIndex: lastPriceCrossDown50Index,
          sessionStartIndex: currentSessionStartIndex,
        };
      }
    }

    if (
      pendingEmaCross &&
      (!inSession ||
        tradeActive ||
        !sessionEntryAllowed ||
        i - pendingEmaCross.emaCrossIndex > SETUP_BARS_AFTER_EMA_CROSS)
    ) {
      pendingEmaCross = null;
    }

    if (pendingEmaCross && inSession && !tradeActive) {
      const hasRequiredPrePivot =
        pendingEmaCross.direction === "long"
          ? Boolean(
              findLastPivotBefore(
                swingLows,
                pendingEmaCross.priceCrossIndex,
                pendingEmaCross.sessionStartIndex,
              ),
            )
          : Boolean(
              findLastPivotBefore(
                swingHighs,
                pendingEmaCross.priceCrossIndex,
                pendingEmaCross.sessionStartIndex,
              ),
            );
      if (
        pendingEmaCross.priceCrossIndex < pendingEmaCross.sessionStartIndex ||
        !hasRequiredPrePivot
      ) {
        pendingEmaCross = null;
        continue;
      }

      const setup =
        pendingEmaCross.direction === "long"
          ? buildLongSetup(pendingEmaCross, bars, swingLows, swingHighs)
          : buildShortSetup(pendingEmaCross, bars, swingLows, swingHighs);
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
          sessionTradeTaken = true;
        }
      } else {
        armed = setup;
      }
      pendingEmaCross = null;
    }
  }

  return trades;
}

function buildLongSetup(pending, bars, swingLows, swingHighs) {
  const pivotLowSource = findLastPivotBefore(
    swingLows,
    pending.priceCrossIndex,
    pending.sessionStartIndex,
  );
  const pivotHighSource = findFirstPivotAfter(
    swingHighs,
    pending.priceCrossIndex,
    pending.sessionStartIndex,
  );
  if (!pivotLowSource || !pivotHighSource) return null;
  const valid =
    pivotLowSource.index >= pending.sessionStartIndex &&
    pivotHighSource.index >= pending.sessionStartIndex &&
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
    armedIndex: pending.emaCrossIndex,
    signalAt: bars[pending.emaCrossIndex].at,
    pivotLow,
    pivotHigh,
    fib618: pivotHigh - range * 0.618,
    fib50: pivotLow + range * 0.5,
    targetMultiple: TARGET_MULTIPLE,
    extension150: pivotLow + range * TARGET_MULTIPLE,
    stop: pivotLow,
    startIndex: pivotLowSource.index,
    priceCrossIndex: pending.priceCrossIndex,
  };
}

function buildShortSetup(pending, bars, swingLows, swingHighs) {
  const pivotHighSource = findLastPivotBefore(
    swingHighs,
    pending.priceCrossIndex,
    pending.sessionStartIndex,
  );
  const pivotLowSource = findFirstPivotAfter(
    swingLows,
    pending.priceCrossIndex,
    pending.sessionStartIndex,
  );
  if (!pivotHighSource || !pivotLowSource) return null;
  const valid =
    pivotHighSource.index >= pending.sessionStartIndex &&
    pivotLowSource.index >= pending.sessionStartIndex &&
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
    armedIndex: pending.emaCrossIndex,
    signalAt: bars[pending.emaCrossIndex].at,
    pivotLow,
    pivotHigh,
    fib618: pivotLow + range * 0.618,
    fib50: pivotHigh - range * 0.5,
    targetMultiple: TARGET_MULTIPLE,
    extension150: pivotHigh - range * TARGET_MULTIPLE,
    stop: pivotHigh,
    startIndex: pivotHighSource.index,
    priceCrossIndex: pending.priceCrossIndex,
  };
}

function findLastPivotBefore(pivots, boundaryIndex, minIndex) {
  let found = null;
  for (const pivot of pivots) {
    if (
      pivot.index >= minIndex &&
      pivot.index < boundaryIndex &&
      boundaryIndex - pivot.index <= LOOKBACK_BARS
    ) {
      found = pivot;
    }
  }
  return found;
}

function findFirstPivotAfter(pivots, boundaryIndex, minIndex) {
  for (const pivot of pivots) {
    if (
      pivot.index >= minIndex &&
      pivot.index >= boundaryIndex &&
      pivot.index - boundaryIndex <= LOOKBACK_BARS
    ) {
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
    const closeOk = isLong ? bar.close >= setup.fib50 - EPS : bar.close <= setup.fib50 + EPS;
    const colorOk = isLong ? bar.close > bar.open : bar.close < bar.open;
    if (touched && closeOk && colorOk) return { ...bar, index };
  }
  return null;
}

function entryFromBar(setup, bar) {
  const zoneLow = Math.min(setup.fib618, setup.fib50);
  const zoneHigh = Math.max(setup.fib618, setup.fib50);
  const touched = bar.low <= zoneHigh + EPS && bar.high >= zoneLow - EPS;
  if (!touched) return false;
  if (setup.direction === "long") {
    return bar.close >= setup.fib50 - EPS && bar.close > bar.open;
  }
  return bar.close <= setup.fib50 + EPS && bar.close < bar.open;
}

function startTrade(setup, entryBar, entryIndex, mode, touchBar) {
  return {
    ...setup,
    entry: entryBar.open,
    entryAt: entryBar.at,
    entryIndex,
    mode,
    touchAt: touchBar.at,
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

function isNewEntryWindow(date) {
  const parts = ctParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 8 * 60 + 50 && minutes < 11 * 60 + 50;
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

function printSummary(results) {
  console.log("\nEMA/Fib continuation comparison");
  console.log(
    `Rules: 1m pivots, Fib 50-61.8 rejection, entries 08:50-11:50 CT, target Fib ${TARGET_MULTIPLE}, source Yahoo ${BACKTEST_RANGE}.`,
  );
  console.log(
    [
      "Symbol",
      "Profile",
      "Mode",
      "Trades",
      "Wins",
      "Losses",
      "Win rate",
      "Net pts",
      "Avg pts",
    ].join("\t"),
  );

  for (const row of results) {
    const wins = row.trades.filter((trade) => trade.pnl > 0).length;
    const losses = row.trades.filter((trade) => trade.pnl <= 0).length;
    const net = row.trades.reduce((sum, trade) => sum + trade.pnl, 0);
    const avg = row.trades.length ? net / row.trades.length : 0;
    const winRate = row.trades.length ? (wins / row.trades.length) * 100 : 0;
    console.log(
      [
        row.symbol,
        `${row.profile.name} ${row.profile.fast}/${row.profile.slow}`,
        row.mode.label,
        row.trades.length,
        wins,
        losses,
        `${winRate.toFixed(1)}%`,
        net.toFixed(2),
        avg.toFixed(2),
      ].join("\t"),
    );
  }
}

function printLastSampleStats(results, requestedSize) {
  console.log(`\nLast ${requestedSize} completed-entry profit probability`);
  console.log(
    [
      "Symbol",
      "Profile",
      "Mode",
      "Requested",
      "Available",
      "Wins",
      "Losses",
      "Profit probability",
      "Net pts",
      "Avg pts",
      "First entry",
      "Last entry",
    ].join("\t"),
  );

  for (const row of results) {
    const sample = row.trades.slice(-requestedSize);
    const wins = sample.filter((trade) => trade.pnl > 0).length;
    const losses = sample.filter((trade) => trade.pnl <= 0).length;
    const net = sample.reduce((sum, trade) => sum + trade.pnl, 0);
    const avg = sample.length ? net / sample.length : 0;
    const probability = sample.length ? (wins / sample.length) * 100 : 0;
    const first = sample[0]?.entryAt ? formatCt(sample[0].entryAt) : "—";
    const last = sample.at(-1)?.entryAt ? formatCt(sample.at(-1).entryAt) : "—";
    console.log(
      [
        row.symbol,
        `${row.profile.name} ${row.profile.fast}/${row.profile.slow}`,
        row.mode.label,
        requestedSize,
        sample.length,
        wins,
        losses,
        `${probability.toFixed(1)}%`,
        net.toFixed(2),
        avg.toFixed(2),
        first,
        last,
      ].join("\t"),
    );
  }

  const shortRows = results.filter((row) => row.trades.length < requestedSize);
  if (shortRows.length) {
    console.log(
      `\nNote: Yahoo currently allows only 8 days of 1-minute bars per request. Rows with Available < ${requestedSize} are the full available sample, not a true 100-setup study.`,
    );
  }
}

function printRecentTrades(results) {
  for (const row of results) {
    console.log(
      `\n${row.symbol} ${row.profile.name} ${row.profile.fast}/${row.profile.slow} · ${row.mode.label}`,
    );
    if (!row.trades.length) {
      console.log("  No trades.");
      continue;
    }
    const byDate = groupBy(row.trades, (trade) => ctParts(trade.entryAt).date);
    for (const date of Object.keys(byDate).slice(-3)) {
      console.log(`  ${date}`);
      for (const trade of byDate[date]) {
        console.log(
          [
            `    ${trade.direction.toUpperCase()}`,
            trade.mode,
            `signal ${formatCt(trade.signalAt).slice(11)}`,
            `touch ${formatCt(trade.touchAt).slice(11)}`,
            `entry ${formatCt(trade.entryAt).slice(11)} @ ${trade.entry.toFixed(2)}`,
            `zone ${Math.min(trade.fib618, trade.fib50).toFixed(2)}-${Math.max(
              trade.fib618,
              trade.fib50,
            ).toFixed(2)}`,
            `exit ${formatCt(trade.exitAt).slice(11)} @ ${trade.exit.toFixed(2)}`,
            trade.result,
            `P/L ${trade.pnl.toFixed(2)}`,
          ].join(" | "),
        );
      }
    }
  }
}

function groupBy(values, keyFn) {
  const out = {};
  for (const value of values) {
    const key = keyFn(value);
    out[key] ??= [];
    out[key].push(value);
  }
  return out;
}
