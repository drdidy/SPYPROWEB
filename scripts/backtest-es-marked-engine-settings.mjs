import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CT_ZONE = "America/Chicago";

const CONFIG = {
  fastEmaLength: process.env.ES_MARKED_FAST_EMA_LENGTH ? Number(process.env.ES_MARKED_FAST_EMA_LENGTH) : 21,
  slowEmaLength: process.env.ES_MARKED_SLOW_EMA_LENGTH ? Number(process.env.ES_MARKED_SLOW_EMA_LENGTH) : 50,
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
  setupsPerSession: process.env.ES_MARKED_SETUPS_PER_SESSION || "First only",
  enableCross: true,
  enableStraddle: false,
  requireGateTouch: false,
  sessionStart: envTimeToMinutes("ES_MARKED_SESSION_START", 8 * 60 + 50),
  sessionEnd: envTimeToMinutes("ES_MARKED_SESSION_END", 15 * 60),
  managementStart: 8 * 60 + 50,
  managementEnd: envTimeToMinutes("ES_MARKED_MANAGEMENT_END", 12 * 60),
  flatAtSessionEnd: true,
  maxBarsInTrade: 0,
  shallowFib: 0.618,
  deepFib: 0.786,
  targetMultiple: 1.618,
  targetZoneFar: 1.786,
  stopRule: process.env.ES_MARKED_STOP_RULE || "htf_close",
  htfStopMinutes: process.env.ES_MARKED_HTF_STOP_MINUTES ? Number(process.env.ES_MARKED_HTF_STOP_MINUTES) : 32,
  consecutiveStopCloses: process.env.ES_MARKED_CONSECUTIVE_STOP_CLOSES ? Number(process.env.ES_MARKED_CONSECUTIVE_STOP_CLOSES) : 10,
  // TradingView's custom minute bars are interpreted here the way the user's
  // chart behaves for a 32-minute stop: 09:00-09:31 closes, then 09:32 starts
  // the next invalidation candle. The previous epoch-bucket version created a
  // false June 17 stop at 09:23.
  htfBoundaryMode: "clock_hour",
  maxLossR: process.env.ES_MARKED_MAX_LOSS_R ? Number(process.env.ES_MARKED_MAX_LOSS_R) : null,
  firstTradePerDay: process.env.ES_MARKED_FIRST_TRADE_PER_DAY === "false" ? false : true,
  allowPreCrossTouchEntry: false,
  requirePivotOpenStraddle50: true,
  dayGate830: false,
  dayGateMinutes: 30,
  htfCrossGateMinutes: process.env.ES_MARKED_HTF_CROSS_MINS ? Number(process.env.ES_MARKED_HTF_CROSS_MINS) : null,
  htfCrossGateMa: process.env.ES_MARKED_HTF_CROSS_MA || "ema50",
  htfSlopeGateMinutes: null,
  htfSlopeGateMa: "ema50",
  htfSlopeGateBars: 1,
  rthOpenSideGate: false,
  openShockCountertrendBlock: false,
  openShockThreshold: 40,
  openShockCutoff: 10 * 60,
  overnight0204Gate: false,
  overnight0204Mode: "net",
  pivotSpanMinBars: null,
  pivotSpanMaxBars: null,
  pivotSelectionMode: "price_cross_bracket",
};

const DATA_FILES = process.env.ES_MARKED_DATA_FILES
  ? process.env.ES_MARKED_DATA_FILES.split(";").map((item) => item.trim()).filter(Boolean)
  : [
  "data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv",
  "data/databento/ES_ohlcv-1m_2026-06-17_tail.csv",
  "data/databento/ES_ohlcv-1m_2026-06-30_intraday.csv",
];
const OUT_DIR = process.env.ES_MARKED_OUT_DIR || "outputs/es_marked_engine_settings";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function envTimeToMinutes(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function main() {
  const bars = await loadBars(DATA_FILES);
  const variants = process.env.ES_MARKED_SWEEP === "targets"
    ? targetSweepVariants()
    : process.env.ES_MARKED_SWEEP === "day_gate_830"
      ? dayGate830Variants()
    : process.env.ES_MARKED_SWEEP === "direction_filters"
      ? directionFilterVariants()
    : process.env.ES_MARKED_SWEEP === "htf_ma_filters"
      ? htfMaFilterVariants()
    : process.env.ES_MARKED_SWEEP === "outside_box_filters"
      ? outsideBoxFilterVariants()
    : process.env.ES_MARKED_SWEEP === "pivot_span"
      ? pivotSpanVariants()
    : process.env.ES_MARKED_SWEEP === "pivot_selection"
      ? pivotSelectionVariants()
    : [
        { id: "intended_noon_management", label: "Marked settings, management cutoff 12:00 CT", cfg: { ...CONFIG, literalPineManagement: false } },
        { id: "literal_pine_1500_management", label: "Literal Pine window behavior, exits can manage until 15:00 CT", cfg: { ...CONFIG, literalPineManagement: true } },
        { id: "practical_no_new_entries_after_noon", label: "Same settings, but no new entries after 12:00 CT", cfg: { ...CONFIG, sessionEnd: 12 * 60, literalPineManagement: false } },
      ];

  await mkdir(OUT_DIR, { recursive: true });
  const rows = [];
  for (const variant of variants) {
    const trades = runBacktest(bars, variant.cfg);
    rows.push({ ...variant, trades, metrics: metrics(trades), monthly: monthly(trades), last14: lastNSessions(trades, bars, 14) });
    await writeTrades(path.join(OUT_DIR, `${variant.id}_trades.csv`), trades);
  }
  await writeReport(path.join(OUT_DIR, "report.md"), bars, rows);
  console.log(reportText(bars, rows));
}

function targetSweepVariants() {
  return [
    { id: "target_1_236", label: "Literal Pine behavior, target 1.236", cfg: { ...CONFIG, literalPineManagement: true, targetMultiple: 1.236, targetZoneFar: 1.382 } },
    { id: "target_1_382", label: "Literal Pine behavior, target 1.382", cfg: { ...CONFIG, literalPineManagement: true, targetMultiple: 1.382, targetZoneFar: 1.5 } },
    { id: "target_1_500", label: "Literal Pine behavior, target 1.500", cfg: { ...CONFIG, literalPineManagement: true, targetMultiple: 1.5, targetZoneFar: 1.618 } },
    { id: "target_1_550", label: "Literal Pine behavior, target 1.550", cfg: { ...CONFIG, literalPineManagement: true, targetMultiple: 1.55, targetZoneFar: 1.618 } },
    { id: "target_1_600", label: "Literal Pine behavior, target 1.600", cfg: { ...CONFIG, literalPineManagement: true, targetMultiple: 1.6, targetZoneFar: 1.786 } },
    { id: "target_1_618", label: "Literal Pine behavior, target 1.618 baseline", cfg: { ...CONFIG, literalPineManagement: true, targetMultiple: 1.618, targetZoneFar: 1.786 } },
  ];
}

function dayGate830Variants() {
  return [
    { id: "baseline_first_valid_cross", label: "Baseline: first valid 21/50 setup, either direction", cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false } },
    { id: "day830_30m_gate", label: "8:30 CT 30m EMA50 gate: above = first bullish setup, below = first bearish setup", cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, dayGate830: true } },
    { id: "day830_30m_gate_no_1m_slope", label: "8:30 CT 30m EMA50 gate, no 1m 50-slope filter", cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, dayGate830: true, crossTrendFilter: false } },
  ];
}

function directionFilterVariants() {
  const htfMinutes = [3, 5, 10, 15, 20, 30, 45, 60];
  const variants = [
    { id: "baseline_first_valid_cross", label: "Baseline: first valid 21/50 setup, either direction", cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false } },
  ];
  for (const minutes of htfMinutes) {
    variants.push({
      id: `cross_htf${minutes}_ema50`,
      label: `Require direction to agree with ${minutes}m EMA50 at the 21/50 cross`,
      cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, htfCrossGateMinutes: minutes },
    });
  }
  variants.push({
    id: "cross_htf20_ema50_span_2_5",
    label: "Require 20m EMA50 agreement at 21/50 cross plus pivot span 2-5 bars",
    cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, htfCrossGateMinutes: 20, pivotSpanMinBars: 2, pivotSpanMaxBars: 5 },
  });
  for (const minutes of htfMinutes) {
    variants.push({
      id: `day830_htf${minutes}_ema50`,
      label: `8:30 CT direction gate from ${minutes}m EMA50`,
      cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, dayGate830: true, dayGateMinutes: minutes },
    });
  }
  variants.push({
    id: "overnight_0200_0400_direction",
    label: "2:00-4:00 CT direction gate: 04:00 close above 02:00 open = long bias, below = short bias",
    cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, overnight0204Gate: true },
  });
  for (const mode of ["ema20", "ema30", "range_mid", "extreme_order", "ny0850_range_break"]) {
    variants.push({
      id: `overnight_0200_0400_${mode}`,
      label: `2:00-4:00 CT direction gate: ${overnightModeLabel(mode)}`,
      cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, overnight0204Gate: true, overnight0204Mode: mode },
    });
  }
  variants.push({
    id: "overnight_0200_0400_plus_cross5",
    label: "2:00-4:00 CT direction gate plus 5m EMA50 agreement at cross",
    cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, overnight0204Gate: true, htfCrossGateMinutes: 5 },
  });
  variants.push({
    id: "overnight_0200_0400_plus_cross15",
    label: "2:00-4:00 CT direction gate plus 15m EMA50 agreement at cross",
    cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, overnight0204Gate: true, htfCrossGateMinutes: 15 },
  });
  return variants;
}

function htfMaFilterVariants() {
  const htfMinutes = [3, 5, 10, 15, 20, 30, 45, 60];
  const variants = [
    { id: "baseline_first_valid_cross", label: "Baseline: first valid 21/50 setup, either direction", cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false } },
  ];
  for (const ma of ["ema21", "ema50", "both"]) {
    for (const minutes of htfMinutes) {
      variants.push({
        id: `cross_htf${minutes}_${ma}`,
        label: `Require direction to agree with ${minutes}m ${ma.toUpperCase()} at the 21/50 cross`,
        cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, htfCrossGateMinutes: minutes, htfCrossGateMa: ma },
      });
    }
  }
  for (const ma of ["ema21", "ema50", "both"]) {
    variants.push({
      id: `cross_htf20_${ma}_span_2_5`,
      label: `Require 20m ${ma.toUpperCase()} agreement at 21/50 cross plus pivot span 2-5 bars`,
      cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, htfCrossGateMinutes: 20, htfCrossGateMa: ma, pivotSpanMinBars: 2, pivotSpanMaxBars: 5 },
    });
  }
  return variants;
}

function outsideBoxFilterVariants() {
  const variants = [
    { id: "baseline_first_valid_cross", label: "Baseline: first valid 21/50 setup, either direction", cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false } },
    { id: "rth_open_side_gate", label: "RTH open side gate: longs above 08:30 open, shorts below 08:30 open", cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, rthOpenSideGate: true } },
  ];
  for (const cutoff of [9 * 60 + 45, 10 * 60, 10 * 60 + 15]) {
    for (const threshold of [25, 30, 35, 40, 45, 50, 60]) {
      variants.push({
        id: `open_shock_${threshold}_${minutesToHm(cutoff).replace(":", "")}`,
        label: `Open shock block: fade first ${threshold}+ pt RTH drive until ${minutesToHm(cutoff)} CT`,
        cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, openShockCountertrendBlock: true, openShockThreshold: threshold, openShockCutoff: cutoff },
      });
    }
  }
  for (const ma of ["ema21", "ema50", "both"]) {
    for (const minutes of [3, 5, 10, 15, 20, 30]) {
      for (const slopeBars of [1, 2, 3]) {
        variants.push({
          id: `htf_slope_${minutes}_${ma}_${slopeBars}`,
          label: `Require ${minutes}m ${ma.toUpperCase()} slope agreement over ${slopeBars} HTF bar${slopeBars === 1 ? "" : "s"}`,
          cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, htfSlopeGateMinutes: minutes, htfSlopeGateMa: ma, htfSlopeGateBars: slopeBars },
        });
      }
    }
  }
  for (const threshold of [30, 35, 40, 45, 50]) {
    variants.push({
      id: `open_shock_${threshold}_plus_5m_slope50`,
      label: `Open shock ${threshold}+ block plus 5m EMA50 slope agreement`,
      cfg: { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false, openShockCountertrendBlock: true, openShockThreshold: threshold, openShockCutoff: 10 * 60, htfSlopeGateMinutes: 5, htfSlopeGateMa: "ema50", htfSlopeGateBars: 1 },
    });
  }
  return variants;
}

function pivotSpanVariants() {
  const base = { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false };
  return [
    { id: "baseline_0850_1150", label: "Baseline: no pivot-span filter", cfg: base },
    { id: "pivot_span_2_4", label: "Pivot span filter: high/low pivots 2-4 bars apart", cfg: { ...base, pivotSpanMinBars: 2, pivotSpanMaxBars: 4 } },
    { id: "pivot_span_2_5", label: "Pivot span filter: high/low pivots 2-5 bars apart", cfg: { ...base, pivotSpanMinBars: 2, pivotSpanMaxBars: 5 } },
    { id: "pivot_span_3_5", label: "Pivot span filter: high/low pivots 3-5 bars apart", cfg: { ...base, pivotSpanMinBars: 3, pivotSpanMaxBars: 5 } },
    { id: "pivot_span_2_6", label: "Pivot span filter: high/low pivots 2-6 bars apart", cfg: { ...base, pivotSpanMinBars: 2, pivotSpanMaxBars: 6 } },
    { id: "pivot_span_7_8", label: "Pivot span filter: high/low pivots exactly 7-8 bars apart", cfg: { ...base, pivotSpanMinBars: 7, pivotSpanMaxBars: 8 } },
    { id: "pivot_span_6_9", label: "Pivot span filter: high/low pivots 6-9 bars apart", cfg: { ...base, pivotSpanMinBars: 6, pivotSpanMaxBars: 9 } },
    { id: "pivot_span_5_10", label: "Pivot span filter: high/low pivots 5-10 bars apart", cfg: { ...base, pivotSpanMinBars: 5, pivotSpanMaxBars: 10 } },
    { id: "pivot_span_4_12", label: "Pivot span filter: high/low pivots 4-12 bars apart", cfg: { ...base, pivotSpanMinBars: 4, pivotSpanMaxBars: 12 } },
  ];
}

function pivotSelectionVariants() {
  const base = { ...CONFIG, sessionEnd: CONFIG.sessionEnd, literalPineManagement: false };
  return [
    {
      id: "price_cross_bracket",
      label: "Current: pivot pair brackets the price cross of EMA50, then 21/50 confirms",
      cfg: { ...base, pivotSelectionMode: "price_cross_bracket" },
    },
    {
      id: "ema_cross_before",
      label: "Alternative: both pivots are before the 21/50 EMA cross",
      cfg: { ...base, pivotSelectionMode: "ema_cross_before" },
    },
    {
      id: "ema_cross_bracket",
      label: "Alternative: pivot pair brackets the 21/50 EMA cross",
      cfg: { ...base, pivotSelectionMode: "ema_cross_bracket" },
    },
    {
      id: "ema_cross_bracket_span_2_5",
      label: "Alternative brackets 21/50 cross, plus pivot span 2-5 bars",
      cfg: { ...base, pivotSelectionMode: "ema_cross_bracket", pivotSpanMinBars: 2, pivotSpanMaxBars: 5 },
    },
    {
      id: "ema_cross_before_span_2_5",
      label: "Alternative before 21/50 cross, plus pivot span 2-5 bars",
      cfg: { ...base, pivotSelectionMode: "ema_cross_before", pivotSpanMinBars: 2, pivotSpanMaxBars: 5 },
    },
    {
      id: "price_cross_bracket_span_2_5",
      label: "Current price-cross bracket, plus pivot span 2-5 bars",
      cfg: { ...base, pivotSelectionMode: "price_cross_bracket", pivotSpanMinBars: 2, pivotSpanMaxBars: 5 },
    },
  ];
}

function overnightModeLabel(mode) {
  if (mode === "ema20") return "04:00 close above/below completed 20m EMA50";
  if (mode === "ema30") return "04:00 close above/below completed 30m EMA50";
  if (mode === "range_mid") return "04:00 close in upper/lower half of 02:00-04:00 range";
  if (mode === "extreme_order") return "low before high = long, high before low = short";
  if (mode === "ny0850_range_break") return "08:50 price above/below 02:00-04:00 range";
  return "04:00 close above/below 02:00 open";
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
      if (
        Number.isFinite(bar.at.getTime()) &&
        [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)
      ) {
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

function isWeekday(bar) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(bar.ct.weekday);
}

function inEntrySession(bar, cfg) {
  return isWeekday(bar) && bar.ctMinutes >= cfg.sessionStart && bar.ctMinutes < cfg.sessionEnd;
}

function inManagementSession(bar, cfg) {
  if (cfg.literalPineManagement) return inEntrySession(bar, cfg) || (isWeekday(bar) && bar.ctMinutes >= cfg.managementStart && bar.ctMinutes < cfg.managementEnd);
  return isWeekday(bar) && bar.ctMinutes >= cfg.managementStart && bar.ctMinutes < cfg.managementEnd;
}

function runBacktest(bars, cfg) {
  const fast = ema(bars.map((bar) => bar.close), cfg.fastEmaLength);
  const slow = ema(bars.map((bar) => bar.close), cfg.slowEmaLength);
  const overnightHtfMinutes = cfg.overnight0204Mode === "ema20" ? 20 : cfg.overnight0204Mode === "ema30" ? 30 : null;
  const htfGateMinutes = [...new Set([cfg.dayGate830 ? cfg.dayGateMinutes : null, cfg.htfCrossGateMinutes, overnightHtfMinutes].filter(Boolean))];
  const htfByKey = new Map();
  const getHtf = (minutes, length) => {
    const key = `${minutes}:${length}`;
    if (!htfByKey.has(key)) htfByKey.set(key, htfEmaToMinuteBars(bars, minutes, length));
    return htfByKey.get(key);
  };
  const htfByMinutes = new Map(htfGateMinutes.map((minutes) => [minutes, getHtf(minutes, cfg.slowEmaLength)]));
  const htfCrossFast = cfg.htfCrossGateMinutes && (cfg.htfCrossGateMa === "ema21" || cfg.htfCrossGateMa === "both")
    ? getHtf(cfg.htfCrossGateMinutes, cfg.fastEmaLength)
    : null;
  const htfCrossSlow = cfg.htfCrossGateMinutes && (cfg.htfCrossGateMa === "ema50" || cfg.htfCrossGateMa === "both")
    ? getHtf(cfg.htfCrossGateMinutes, cfg.slowEmaLength)
    : null;
  const htfSlopeFast = cfg.htfSlopeGateMinutes && (cfg.htfSlopeGateMa === "ema21" || cfg.htfSlopeGateMa === "both")
    ? getHtf(cfg.htfSlopeGateMinutes, cfg.fastEmaLength)
    : null;
  const htfSlopeSlow = cfg.htfSlopeGateMinutes && (cfg.htfSlopeGateMa === "ema50" || cfg.htfSlopeGateMa === "both")
    ? getHtf(cfg.htfSlopeGateMinutes, cfg.slowEmaLength)
    : null;
  const dayGates = cfg.dayGate830 ? computeDayGates(bars, htfByMinutes.get(cfg.dayGateMinutes)) : new Map();
  const overnightGates = cfg.overnight0204Gate ? computeOvernight0204Gates(bars, cfg.overnight0204Mode, htfByMinutes.get(overnightHtfMinutes)) : new Map();
  const rthContext = (cfg.rthOpenSideGate || cfg.openShockCountertrendBlock) ? computeRthOpenContext(bars) : null;
  const trades = [];
  const swingLowValues = [];
  const swingLowBars = [];
  const swingHighValues = [];
  const swingHighBars = [];
  const tradedDays = new Set();

  let alertSessionStartIndex = null;
  let wasInSession = false;
  let sessionSetupCount = 0;
  let lastPriceCrossUp50Index = null;
  let lastPriceCrossDown50Index = null;
  let lastClosedSetupIndex = null;
  let pendingEmaCross = null;
  let armed = null;
  let tradeActive = null;
  let setupCount = 0;
  let expiredSetups = 0;
  let canceledSetups = 0;

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const inSession = inEntrySession(bar, cfg);
    if (inSession && !wasInSession) {
      alertSessionStartIndex = i;
      sessionSetupCount = 0;
    }
    if (!inSession && wasInSession) alertSessionStartIndex = null;
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

    if (tradeActive) {
      const closed = maybeCloseTrade(tradeActive, bars, i, cfg);
      if (closed) {
        trades.push(closed);
        tradeActive = null;
        lastClosedSetupIndex = i;
      }
    }

    const cooldownSatisfied = lastClosedSetupIndex === null || i - lastClosedSetupIndex >= cfg.setupCooldownBars;
    const setupLimit = cfg.setupsPerSession === "First only" ? 1 : cfg.setupsPerSession === "First and second" ? 2 : 100000;
    const canStartNewSetup = sessionSetupCount < setupLimit && (!cfg.firstTradePerDay || !tradedDays.has(bar.ctDate));

    const oppositeResetCrossUp = armed && armed.direction === "short" && rawCrossUp && inSession && cooldownSatisfied && !tradeActive;
    const oppositeResetCrossDown = armed && armed.direction === "long" && rawCrossDown && inSession && cooldownSatisfied && !tradeActive;
    if (oppositeResetCrossUp || oppositeResetCrossDown) armed = null;

    const dayGate = cfg.dayGate830 ? dayGates.get(bar.ctDate) : null;
    const overnightGate = cfg.overnight0204Gate ? overnightGates.get(bar.ctDate) : null;
    const htfCrossFastValue = htfCrossFast?.[i];
    const htfCrossSlowValue = htfCrossSlow?.[i];
    const htfSlopeLag = cfg.htfSlopeGateMinutes ? cfg.htfSlopeGateMinutes * cfg.htfSlopeGateBars : 0;
    const htfSlopeFastNow = htfSlopeFast?.[i];
    const htfSlopeFastPrev = htfSlopeFast?.[i - htfSlopeLag];
    const htfSlopeSlowNow = htfSlopeSlow?.[i];
    const htfSlopeSlowPrev = htfSlopeSlow?.[i - htfSlopeLag];
    const rth = rthContext?.[i];
    const gateAllowsLong = !cfg.dayGate830 || dayGate?.direction === "long";
    const gateAllowsShort = !cfg.dayGate830 || dayGate?.direction === "short";
    const overnightAllowsLong = !cfg.overnight0204Gate || overnightGate?.direction === "long";
    const overnightAllowsShort = !cfg.overnight0204Gate || overnightGate?.direction === "short";
    const htfFastLongOk = !htfCrossFast || (Number.isFinite(htfCrossFastValue) && bar.close > htfCrossFastValue);
    const htfFastShortOk = !htfCrossFast || (Number.isFinite(htfCrossFastValue) && bar.close < htfCrossFastValue);
    const htfSlowLongOk = !htfCrossSlow || (Number.isFinite(htfCrossSlowValue) && bar.close > htfCrossSlowValue);
    const htfSlowShortOk = !htfCrossSlow || (Number.isFinite(htfCrossSlowValue) && bar.close < htfCrossSlowValue);
    const htfAllowsLong = !cfg.htfCrossGateMinutes || (htfFastLongOk && htfSlowLongOk);
    const htfAllowsShort = !cfg.htfCrossGateMinutes || (htfFastShortOk && htfSlowShortOk);
    const htfSlopeFastLongOk = !htfSlopeFast || (Number.isFinite(htfSlopeFastNow) && Number.isFinite(htfSlopeFastPrev) && htfSlopeFastNow > htfSlopeFastPrev);
    const htfSlopeFastShortOk = !htfSlopeFast || (Number.isFinite(htfSlopeFastNow) && Number.isFinite(htfSlopeFastPrev) && htfSlopeFastNow < htfSlopeFastPrev);
    const htfSlopeSlowLongOk = !htfSlopeSlow || (Number.isFinite(htfSlopeSlowNow) && Number.isFinite(htfSlopeSlowPrev) && htfSlopeSlowNow > htfSlopeSlowPrev);
    const htfSlopeSlowShortOk = !htfSlopeSlow || (Number.isFinite(htfSlopeSlowNow) && Number.isFinite(htfSlopeSlowPrev) && htfSlopeSlowNow < htfSlopeSlowPrev);
    const htfSlopeAllowsLong = !cfg.htfSlopeGateMinutes || (htfSlopeFastLongOk && htfSlopeSlowLongOk);
    const htfSlopeAllowsShort = !cfg.htfSlopeGateMinutes || (htfSlopeFastShortOk && htfSlopeSlowShortOk);
    const rthOpenAllowsLong = !cfg.rthOpenSideGate || (rth && Number.isFinite(rth.open) && bar.close > rth.open);
    const rthOpenAllowsShort = !cfg.rthOpenSideGate || (rth && Number.isFinite(rth.open) && bar.close < rth.open);
    const shockUp = rth && Number.isFinite(rth.open) ? rth.high - rth.open : 0;
    const shockDown = rth && Number.isFinite(rth.open) ? rth.open - rth.low : 0;
    const shockBlocksLong = cfg.openShockCountertrendBlock && bar.ctMinutes < cfg.openShockCutoff && shockDown >= cfg.openShockThreshold && shockDown >= shockUp;
    const shockBlocksShort = cfg.openShockCountertrendBlock && bar.ctMinutes < cfg.openShockCutoff && shockUp >= cfg.openShockThreshold && shockUp >= shockDown;
    const crossUp = gateAllowsLong && overnightAllowsLong && htfAllowsLong && htfSlopeAllowsLong && rthOpenAllowsLong && !shockBlocksLong && cfg.enableCross && rawCrossUp && inSession && cooldownSatisfied && canStartNewSetup && !tradeActive && (!armed || oppositeResetCrossUp);
    const crossDown = gateAllowsShort && overnightAllowsShort && htfAllowsShort && htfSlopeAllowsShort && rthOpenAllowsShort && !shockBlocksShort && cfg.enableCross && rawCrossDown && inSession && cooldownSatisfied && canStartNewSetup && !tradeActive && (!armed || oppositeResetCrossDown);

    if (crossUp && lastPriceCrossUp50Index !== null) {
      pendingEmaCross = { direction: "long", emaCrossIndex: i, priceCrossIndex: lastPriceCrossUp50Index };
    }
    if (crossDown && lastPriceCrossDown50Index !== null) {
      pendingEmaCross = { direction: "short", emaCrossIndex: i, priceCrossIndex: lastPriceCrossDown50Index };
    }

    if (pendingEmaCross && (i - pendingEmaCross.emaCrossIndex > cfg.setupBarsAfterEmaCross || !inSession || tradeActive)) {
      pendingEmaCross = null;
    }

    if (pendingEmaCross?.direction === "long") {
      const boundaryIndex = pivotSelectionBoundary(pendingEmaCross, cfg);
      const [pivotLow, pivotLowIndex] = findLongLowPivot(swingLowValues, swingLowBars, boundaryIndex, alertSessionStartIndex, cfg);
      const [pivotHigh, pivotHighIndex] = findLongHighPivot(swingHighValues, swingHighBars, boundaryIndex, alertSessionStartIndex, cfg);
      const impossible = pendingEmaCross.priceCrossIndex < alertSessionStartIndex || pivotLow === null;
      const valid = validLongPivotSequence(pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, boundaryIndex, cfg);
      const spanOk = pivotSpanOk(pivotLowIndex, pivotHighIndex, cfg);
      const trendOk = !cfg.crossTrendFilter || slow[i] > slow[i - cfg.crossSlopeBars];
      const structOk = pivotLow !== null && pivotHigh !== null && pivotLow < slow[pivotLowIndex] && pivotHigh > slow[pivotHighIndex] && bars[pivotLowIndex].open < slow[pivotLowIndex] && bars[pivotHighIndex].open > slow[pivotHighIndex];
      if (impossible || (valid && !(trendOk && structOk && spanOk))) {
        pendingEmaCross = null;
      } else if (valid) {
        armed = buildSetup("long", pendingEmaCross.emaCrossIndex, pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, cfg);
        setupCount += 1;
        sessionSetupCount += 1;
        pendingEmaCross = null;
      }
    }

    if (pendingEmaCross?.direction === "short") {
      const boundaryIndex = pivotSelectionBoundary(pendingEmaCross, cfg);
      const [pivotHigh, pivotHighIndex] = findShortHighPivot(swingHighValues, swingHighBars, boundaryIndex, alertSessionStartIndex, cfg);
      const [pivotLow, pivotLowIndex] = findShortLowPivot(swingLowValues, swingLowBars, boundaryIndex, alertSessionStartIndex, cfg);
      const impossible = pendingEmaCross.priceCrossIndex < alertSessionStartIndex || pivotHigh === null;
      const valid = validShortPivotSequence(pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, boundaryIndex, cfg);
      const spanOk = pivotSpanOk(pivotLowIndex, pivotHighIndex, cfg);
      const trendOk = !cfg.crossTrendFilter || slow[i] < slow[i - cfg.crossSlopeBars];
      const structOk = pivotHigh !== null && pivotLow !== null && pivotHigh > slow[pivotHighIndex] && pivotLow < slow[pivotLowIndex] && bars[pivotHighIndex].open > slow[pivotHighIndex] && bars[pivotLowIndex].open < slow[pivotLowIndex];
      if (impossible || (valid && !(trendOk && structOk && spanOk))) {
        pendingEmaCross = null;
      } else if (valid) {
        armed = buildSetup("short", pendingEmaCross.emaCrossIndex, pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, cfg);
        setupCount += 1;
        sessionSetupCount += 1;
        pendingEmaCross = null;
      }
    }

    if (armed && (i - armed.setupIndex > cfg.retestBars || !inSession)) {
      armed = null;
      lastClosedSetupIndex = i;
      expiredSetups += 1;
    }

    if (armed) {
      const armedInvalid = armed.direction === "long" ? bar.close < armed.stop : bar.close > armed.stop;
      if (armedInvalid) {
        armed = null;
        lastClosedSetupIndex = i;
        canceledSetups += 1;
      } else if (entryFromBar(armed, bar, cfg)) {
        tradeActive = startTrade(armed, i, bar);
        tradedDays.add(bar.ctDate);
        armed = null;
      } else if (touchesZone(armed, bar)) {
        armed.zoneTouchAlerted = true;
      }
    }
  }

  for (const trade of trades) {
    trade.setupCount = setupCount;
    trade.expiredSetups = expiredSetups;
    trade.canceledSetups = canceledSetups;
  }
  trades.meta = { setupCount, expiredSetups, canceledSetups };
  return trades;
}

function pivotSelectionBoundary(pendingEmaCross, cfg) {
  return cfg.pivotSelectionMode === "price_cross_bracket" ? pendingEmaCross.priceCrossIndex : pendingEmaCross.emaCrossIndex;
}

function findLongLowPivot(values, indexes, boundaryIndex, sessionStartIndex, cfg) {
  return findLastPivotBefore(values, indexes, boundaryIndex, sessionStartIndex, cfg);
}

function findLongHighPivot(values, indexes, boundaryIndex, sessionStartIndex, cfg) {
  return cfg.pivotSelectionMode === "ema_cross_before"
    ? findLastPivotBefore(values, indexes, boundaryIndex, sessionStartIndex, cfg)
    : findFirstPivotAfter(values, indexes, boundaryIndex, sessionStartIndex, cfg);
}

function findShortHighPivot(values, indexes, boundaryIndex, sessionStartIndex, cfg) {
  return findLastPivotBefore(values, indexes, boundaryIndex, sessionStartIndex, cfg);
}

function findShortLowPivot(values, indexes, boundaryIndex, sessionStartIndex, cfg) {
  return cfg.pivotSelectionMode === "ema_cross_before"
    ? findLastPivotBefore(values, indexes, boundaryIndex, sessionStartIndex, cfg)
    : findFirstPivotAfter(values, indexes, boundaryIndex, sessionStartIndex, cfg);
}

function validLongPivotSequence(pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, boundaryIndex, cfg) {
  if (pivotLow === null || pivotHigh === null || pivotHigh <= pivotLow) return false;
  if (cfg.pivotSelectionMode === "ema_cross_before") {
    return pivotLowIndex < pivotHighIndex && pivotHighIndex < boundaryIndex;
  }
  return pivotLowIndex < boundaryIndex && pivotHighIndex >= boundaryIndex;
}

function validShortPivotSequence(pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, boundaryIndex, cfg) {
  if (pivotLow === null || pivotHigh === null || pivotHigh <= pivotLow) return false;
  if (cfg.pivotSelectionMode === "ema_cross_before") {
    return pivotHighIndex < pivotLowIndex && pivotLowIndex < boundaryIndex;
  }
  return pivotHighIndex < boundaryIndex && pivotLowIndex >= boundaryIndex;
}

function pivotSpanOk(pivotLowIndex, pivotHighIndex, cfg) {
  if (!Number.isFinite(cfg.pivotSpanMinBars) || !Number.isFinite(cfg.pivotSpanMaxBars)) return true;
  if (pivotLowIndex === null || pivotHighIndex === null) return false;
  const span = Math.abs(pivotHighIndex - pivotLowIndex);
  return span >= cfg.pivotSpanMinBars && span <= cfg.pivotSpanMaxBars;
}

function buildSetup(direction, setupIndex, pivotLow, pivotLowIndex, pivotHigh, pivotHighIndex, cfg) {
  const range = pivotHigh - pivotLow;
  if (direction === "long") {
    return {
      direction,
      setupType: "cross",
      setupIndex,
      pivotLow,
      pivotLowIndex,
      pivotHigh,
      pivotHighIndex,
      pivotSpanBars: Math.abs(pivotHighIndex - pivotLowIndex),
      fibDeep: pivotHigh - range * cfg.deepFib,
      fib50: pivotHigh - range * cfg.shallowFib,
      target: pivotHigh + range * (cfg.targetMultiple - 1),
      targetFar: pivotHigh + range * (cfg.targetZoneFar - 1),
      stop: pivotLow,
    };
  }
  return {
    direction,
    setupType: "cross",
    setupIndex,
    pivotLow,
    pivotLowIndex,
    pivotHigh,
    pivotHighIndex,
    pivotSpanBars: Math.abs(pivotHighIndex - pivotLowIndex),
    fibDeep: pivotLow + range * cfg.deepFib,
    fib50: pivotLow + range * cfg.shallowFib,
    target: pivotLow - range * (cfg.targetMultiple - 1),
    targetFar: pivotLow - range * (cfg.targetZoneFar - 1),
    stop: pivotHigh,
  };
}

function entryFromBar(setup, bar, cfg) {
  const touched = touchesZone(setup, bar);
  if (!touched) return false;
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

function startTrade(setup, entryIndex, bar) {
  return {
    ...setup,
    entryIndex,
    entryAt: bar.at,
    entryDate: bar.ctDate,
    entryTimeCT: `${String(bar.ct.hour).padStart(2, "0")}:${String(bar.ct.minute).padStart(2, "0")}`,
    entryPrice: bar.close,
    stopPrice: setup.stop,
    confirmationMode: "post_cross_retest",
  };
}

function maybeCloseTrade(trade, bars, index, cfg) {
  if (index <= trade.entryIndex) return null;
  const bar = bars[index];
  const risk = Math.abs(trade.fib50 - trade.stopPrice);
  const targetReached = trade.direction === "long" ? bar.high >= trade.target : bar.low <= trade.target;
  if (targetReached) {
    return closeTrade(trade, bar, index, trade.target, "WIN", risk === 0 ? 0 : Math.abs(trade.target - trade.fib50) / risk, "target");
  }

  if (cfg.maxLossR && risk > 0) {
    const maxLossPrice = trade.direction === "long" ? trade.fib50 - risk * cfg.maxLossR : trade.fib50 + risk * cfg.maxLossR;
    const maxLossTouched = trade.direction === "long" ? bar.low <= maxLossPrice : bar.high >= maxLossPrice;
    if (maxLossTouched) {
      return closeTrade(trade, bar, index, maxLossPrice, "LOSS", -cfg.maxLossR, "max_loss_r");
    }
  }

  const stopExit = htfStopExit(trade, bars, index, cfg);
  if (stopExit) {
    const r = realizedR(trade, stopExit.price, risk);
    return closeTrade(trade, stopExit.bar, stopExit.index, stopExit.price, r >= 0 ? "TIMEOUT" : "LOSS", r, stopExit.reason);
  }

  const timedOut = (cfg.flatAtSessionEnd && !inManagementSession(bar, cfg)) || (cfg.maxBarsInTrade > 0 && index - trade.entryIndex >= cfg.maxBarsInTrade);
  if (timedOut) {
    const r = risk === 0 ? 0 : trade.direction === "long" ? (bar.close - trade.entryPrice) / risk : (trade.entryPrice - bar.close) / risk;
    return closeTrade(trade, bar, index, bar.close, "TIMEOUT", r, "session_timeout");
  }
  return null;
}

function closeTrade(trade, bar, index, exitPrice, result, r, exitReason = "") {
  return {
    ...trade,
    exitIndex: index,
    exitAt: bar.at,
    exitDate: bar.ctDate,
    exitTimeCT: `${String(bar.ct.hour).padStart(2, "0")}:${String(bar.ct.minute).padStart(2, "0")}`,
    exitPrice,
    result,
    r,
    exitReason,
  };
}

function htfStopExit(trade, bars, index, cfg) {
  const bar = bars[index];
  if (cfg.stopRule === "wick") {
    const touched = trade.direction === "long" ? bar.low <= trade.stopPrice : bar.high >= trade.stopPrice;
    return touched ? { price: trade.stopPrice, bar, index, reason: "wick_stop" } : null;
  }
  if (cfg.stopRule === "close") {
    const beyond = trade.direction === "long" ? bar.close < trade.stopPrice : bar.close > trade.stopPrice;
    return beyond ? { price: bar.close, bar, index, reason: "close_stop" } : null;
  }
  if (cfg.stopRule === "htf_or_consecutive_closes") {
    const htfExit = htfCloseStopExit(trade, bars, index, cfg);
    const consecutiveExit = consecutiveCloseStopExit(trade, bars, index, cfg);
    if (htfExit && consecutiveExit) return htfExit.index <= consecutiveExit.index ? htfExit : consecutiveExit;
    return htfExit ?? consecutiveExit;
  }
  return htfCloseStopExit(trade, bars, index, cfg);
}

function htfCloseStopExit(trade, bars, index, cfg) {
  const bar = bars[index];
  const prev = bars[index - 1];
  if (!prev) return null;
  const bucket = htfBucketKey(bar, cfg);
  const prevBucket = htfBucketKey(prev, cfg);
  if (bucket === prevBucket) return null;
  const beyond = trade.direction === "long" ? prev.close < trade.stopPrice : prev.close > trade.stopPrice;
  return beyond ? { price: prev.close, bar: prev, index: index - 1, reason: `${cfg.htfStopMinutes}m_close_stop` } : null;
}

function consecutiveCloseStopExit(trade, bars, index, cfg) {
  const count = cfg.consecutiveStopCloses ?? 10;
  if (count <= 1) {
    const bar = bars[index];
    const beyond = trade.direction === "long" ? bar.close < trade.stopPrice : bar.close > trade.stopPrice;
    return beyond ? { price: bar.close, bar, index, reason: "consecutive_close_stop" } : null;
  }
  if (index - trade.entryIndex < count) return null;
  for (let offset = 0; offset < count; offset += 1) {
    const bar = bars[index - offset];
    const beyond = trade.direction === "long" ? bar.close < trade.stopPrice : bar.close > trade.stopPrice;
    if (!beyond) return null;
  }
  return { price: bars[index].close, bar: bars[index], index, reason: `${count}_consecutive_1m_close_stop` };
}

function htfBucketKey(bar, cfg) {
  if (cfg.htfBoundaryMode !== "clock_hour") {
    return Math.floor(bar.at.getTime() / (cfg.htfStopMinutes * 60000));
  }
  const minutesInHour = bar.ct.minute;
  const slot = Math.floor(minutesInHour / cfg.htfStopMinutes);
  return `${bar.ctDate}-${bar.ct.hour}-${slot}`;
}

function computeRthOpenContext(bars) {
  const out = new Array(bars.length).fill(null);
  let currentDate = null;
  let open = NaN;
  let high = NaN;
  let low = NaN;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar.ctDate !== currentDate) {
      currentDate = bar.ctDate;
      open = NaN;
      high = NaN;
      low = NaN;
    }
    if (!isWeekday(bar) || bar.ctMinutes < 8 * 60 + 30) {
      out[i] = null;
      continue;
    }
    if (!Number.isFinite(open)) {
      open = bar.open;
      high = bar.high;
      low = bar.low;
    } else {
      high = Math.max(high, bar.high);
      low = Math.min(low, bar.low);
    }
    out[i] = { open, high, low };
  }
  return out;
}

function computeDayGates(bars, htf30) {
  const gates = new Map();
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (!isWeekday(bar) || bar.ctMinutes < 8 * 60 + 30 || gates.has(bar.ctDate)) continue;
    const ema30 = htf30[i];
    if (!Number.isFinite(ema30)) continue;
    gates.set(bar.ctDate, {
      index: i,
      price: bar.close,
      ema30,
      direction: bar.close >= ema30 ? "long" : "short",
    });
  }
  return gates;
}

function computeOvernight0204Gates(bars, mode = "net", htf = []) {
  const byDate = new Map();
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (!isWeekday(bar) || bar.ctMinutes < 2 * 60 || bar.ctMinutes >= 4 * 60) continue;
    let group = byDate.get(bar.ctDate);
    if (!group) {
      group = { first: bar, firstIndex: index, last: bar, lastIndex: index, high: bar.high, highIndex: index, low: bar.low, lowIndex: index };
      byDate.set(bar.ctDate, group);
    } else {
      group.last = bar;
      group.lastIndex = index;
      if (bar.high > group.high) {
        group.high = bar.high;
        group.highIndex = index;
      }
      if (bar.low < group.low) {
        group.low = bar.low;
        group.lowIndex = index;
      }
    }
  }
  const gates = new Map();
  for (const [date, group] of byDate.entries()) {
    let direction = null;
    if (mode === "ema20" || mode === "ema30") {
      const emaValue = htf[group.lastIndex];
      direction = Number.isFinite(emaValue) ? (group.last.close >= emaValue ? "long" : "short") : null;
    } else if (mode === "range_mid") {
      const mid = (group.high + group.low) / 2;
      direction = group.last.close >= mid ? "long" : "short";
    } else if (mode === "extreme_order") {
      direction = group.lowIndex < group.highIndex ? "long" : "short";
    } else if (mode === "ny0850_range_break") {
      const nyBar = bars.find((bar) => bar.ctDate === date && isWeekday(bar) && bar.ctMinutes >= 8 * 60 + 50);
      if (nyBar?.close > group.high) direction = "long";
      else if (nyBar?.close < group.low) direction = "short";
    } else {
      direction = group.last.close >= group.first.open ? "long" : "short";
    }
    if (!direction) continue;
    gates.set(date, {
      date,
      open: group.first.open,
      close: group.last.close,
      high: group.high,
      low: group.low,
      direction,
    });
  }
  return gates;
}

function htfEmaToMinuteBars(bars, minutes, length) {
  const htfBars = [];
  let current = null;
  for (let i = 0; i < bars.length; i += 1) {
    const key = htfBucketForMinutes(bars[i], minutes);
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

function htfBucketForMinutes(bar, minutes) {
  return `${bar.ctDate}-${bar.ct.hour}-${Math.floor(bar.ct.minute / minutes)}`;
}

function realizedR(trade, exitPrice, risk) {
  if (!risk) return 0;
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

function ema(values, length) {
  const out = [];
  const alpha = 2 / (length + 1);
  let prev = values[0];
  for (const value of values) {
    prev = prev == null ? value : alpha * value + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

function metrics(trades) {
  const wins = trades.filter((trade) => trade.result === "WIN");
  const losses = trades.filter((trade) => trade.result === "LOSS");
  const timeouts = trades.filter((trade) => trade.result === "TIMEOUT");
  const decided = wins.length + losses.length;
  const rDecided = [...wins, ...losses].map((trade) => trade.r);
  const rAll = trades.map((trade) => trade.r);
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    decided,
    winRate: decided ? (wins.length * 100) / decided : 0,
    avgR: avg(rDecided),
    avgAllR: avg(rAll),
    avgTimeoutR: avg(timeouts.map((trade) => trade.r)),
    worstLossR: Math.min(0, ...losses.map((trade) => trade.r)),
    maxDrawdownR: maxDrawdown(rAll),
    longestLosingStreak: longestLosingStreak(trades),
    setupCount: trades.meta?.setupCount ?? null,
    expiredSetups: trades.meta?.expiredSetups ?? null,
    canceledSetups: trades.meta?.canceledSetups ?? null,
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
    if (trade.result === "LOSS") {
      current += 1;
      longest = Math.max(longest, current);
    } else if (trade.result === "WIN") {
      current = 0;
    }
  }
  return longest;
}

function monthly(trades) {
  const groups = new Map();
  for (const trade of trades) {
    const key = trade.entryDate.slice(0, 7);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([month, group]) => ({ month, ...metrics(group) }));
}

function lastNSessions(trades, bars, n) {
  const sessionDates = [...new Set(bars.filter((bar) => isWeekday(bar) && bar.ctMinutes >= CONFIG.sessionStart && bar.ctMinutes < CONFIG.sessionEnd).map((bar) => bar.ctDate))];
  const dates = sessionDates.slice(-n);
  const byDate = new Map(dates.map((date) => [date, []]));
  for (const trade of trades) {
    if (byDate.has(trade.entryDate)) byDate.get(trade.entryDate).push(trade);
  }
  return dates.map((date) => ({ date, trades: byDate.get(date) ?? [], metrics: metrics(byDate.get(date) ?? []) }));
}

async function writeTrades(file, trades) {
  const fields = [
    "entryDate",
    "entryTimeCT",
    "exitDate",
    "exitTimeCT",
    "direction",
    "result",
    "r",
    "entryPrice",
    "exitPrice",
    "pivotLow",
    "pivotLowIndex",
    "pivotHigh",
    "pivotHighIndex",
    "pivotSpanBars",
    "fib50",
    "fibDeep",
    "target",
    "stop",
    "confirmationMode",
    "exitReason",
  ];
  const lines = [fields.join(",")];
  for (const trade of trades) {
    lines.push(fields.map((field) => csvCell(trade[field])).join(","));
  }
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeReport(file, bars, rows) {
  await writeFile(file, reportText(bars, rows), "utf8");
}

function reportText(bars, rows) {
  const first = bars[0];
  const last = bars[bars.length - 1];
  const baseCfg = rows[0]?.cfg ?? CONFIG;
  const lines = [];
  lines.push("# ES marked Engine v2/v4 settings backtest");
  lines.push("");
  lines.push(`Data: ${bars.length.toLocaleString()} ES 1-minute bars, ${first.ctDate} ${hm(first)} CT to ${last.ctDate} ${hm(last)} CT.`);
  lines.push("");
  lines.push(`Settings used: 21/50 EMA, pivot left/right 1, pivot candle open must straddle the 50 EMA, rejection candle color required, no Heikin Ashi, no straddle, no gate touch, no pre-cross entries, first setup per NY session, ${minutesToHm(baseCfg.sessionStart)}-${minutesToHm(baseCfg.sessionEnd)} CT entry session, 0.618-0.786 entry band, target swept per section, ${stopRuleLabel(baseCfg)}.`);
  lines.push("");
  lines.push(`HTF stop alignment: ${baseCfg.htfStopMinutes}-minute stops are clock-hour aligned. Example: for 30 minutes, the 09:00-09:29 candle is evaluated at 09:30.`);
  lines.push("");
  lines.push("Important: Control Grid source link was unchecked in the screenshots, so grid bias/room/confluence rows were treated as warnings only and did not block trades.");
  lines.push("");
  for (const row of rows) {
    const m = row.metrics;
    lines.push(`## ${row.label}`);
    lines.push("");
    lines.push(`Setups armed: ${m.setupCount}, expired: ${m.expiredSetups}, canceled before entry: ${m.canceledSetups}.`);
    lines.push("");
    lines.push("| Trades | Wins | Losses | Timeouts | Decided win % | Avg R decided | Avg R all | Avg timeout R | Worst loss R | Max DD R | Longest L streak |");
    lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    lines.push(`| ${m.trades} | ${m.wins} | ${m.losses} | ${m.timeouts} | ${m.winRate.toFixed(1)} | ${m.avgR.toFixed(2)} | ${m.avgAllR.toFixed(2)} | ${m.avgTimeoutR.toFixed(2)} | ${m.worstLossR.toFixed(2)} | ${m.maxDrawdownR.toFixed(2)} | ${m.longestLosingStreak} |`);
    lines.push("");
    lines.push("Segments:");
    lines.push(`- Long: ${segment(row.trades, (trade) => trade.direction === "long")}`);
    lines.push(`- Short: ${segment(row.trades, (trade) => trade.direction === "short")}`);
    lines.push("");
    lines.push("Monthly:");
    lines.push("| Month | Trades | W | L | T | Win % | Avg R decided | Avg R all |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const item of row.monthly) {
      lines.push(`| ${item.month} | ${item.trades} | ${item.wins} | ${item.losses} | ${item.timeouts} | ${item.winRate.toFixed(1)} | ${item.avgR.toFixed(2)} | ${item.avgAllR.toFixed(2)} |`);
    }
    lines.push("");
    lines.push("Last 14 ES sessions in the file:");
    lines.push("| Date | Trades | Result | Direction | Entry CT | Exit CT | R |");
    lines.push("|---|---:|---|---|---|---|---:|");
    for (const day of row.last14) {
      if (!day.trades.length) {
        lines.push(`| ${day.date} | 0 | no trade | - | - | - | 0.00 |`);
      } else {
        for (const trade of day.trades) {
          lines.push(`| ${day.date} | 1 | ${trade.result} | ${trade.direction} | ${trade.entryTimeCT} | ${trade.exitTimeCT} | ${trade.r.toFixed(2)} |`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function hm(bar) {
  return `${String(bar.ct.hour).padStart(2, "0")}:${String(bar.ct.minute).padStart(2, "0")}`;
}

function minutesToHm(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function stopRuleLabel(cfg) {
  if (cfg.stopRule === "htf_or_consecutive_closes") {
    return `${cfg.htfStopMinutes}-minute close beyond pivot OR ${cfg.consecutiveStopCloses} consecutive 1-minute closes beyond pivot stop`;
  }
  if (cfg.stopRule === "wick") return "wick/touch pivot stop";
  if (cfg.stopRule === "close") return "1-minute close beyond pivot stop";
  return `${cfg.htfStopMinutes}-minute close beyond pivot stop`;
}

function segment(trades, predicate) {
  const group = trades.filter(predicate);
  const m = metrics(group);
  return `${m.trades} trades, ${m.wins}W ${m.losses}L ${m.timeouts}T, win ${m.winRate.toFixed(1)}%, avgR ${m.avgR.toFixed(2)}, avg all ${m.avgAllR.toFixed(2)}`;
}
