import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const CT_ZONE = "America/Chicago";
const DATA_FILES = [
  "data/databento/ES_ohlcv-1m_2025-06-18_2026-06-17.csv",
  "data/databento/ES_ohlcv-1m_2026-06-17_tail.csv",
];
const TRADE_FILE = "outputs/es_marked_engine_settings/literal_pine_1500_management_trades.csv";
const OUT_DIR = "outputs/es_marked_engine_settings";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const bars = await loadBars(DATA_FILES);
  const indexByDateTime = new Map(bars.map((bar, index) => [`${bar.ctDate} ${bar.ctTime}`, index]));
  const trades = parseCsv(await readFile(TRADE_FILE, "utf8"));
  const losses = trades.filter((trade) => trade.result === "LOSS");
  const rows = losses.map((trade) => analyzeLoss(trade, bars, indexByDateTime));
  const summary = summarize(rows);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "loss_diagnostics.csv"), toCsv(rows), "utf8");
  await writeFile(path.join(OUT_DIR, "loss_diagnostics.md"), report(summary, rows), "utf8");
  console.log(report(summary, rows));
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
      };
      if (Number.isFinite(bar.at.getTime()) && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value))) {
        const parts = dateParts(bar.at, CT_ZONE);
        bar.ctDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        bar.ctTime = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
        bar.ctMinutes = parts.hour * 60 + parts.minute;
        byTime.set(bar.at.getTime(), bar);
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.at - b.at);
}

function analyzeLoss(trade, bars, indexByDateTime) {
  const entryIndex = indexByDateTime.get(`${trade.entryDate} ${trade.entryTimeCT}`);
  const exitIndex = indexByDateTime.get(`${trade.exitDate} ${trade.exitTimeCT}`);
  const direction = trade.direction;
  const pivotLow = Number(trade.pivotLow);
  const pivotHigh = Number(trade.pivotHigh);
  const fib50 = Number(trade.fib50);
  const stop = Number(trade.stop);
  const range = pivotHigh - pivotLow;
  const risk = Math.abs(fib50 - stop);
  const slice = bars.slice(entryIndex + 1, exitIndex + 1);
  const favorable = direction === "long"
    ? Math.max(...slice.map((bar) => bar.high))
    : Math.min(...slice.map((bar) => bar.low));
  const adverse = direction === "long"
    ? Math.min(...slice.map((bar) => bar.low))
    : Math.max(...slice.map((bar) => bar.high));
  const achievedMultiple = direction === "long"
    ? 1 + (favorable - pivotHigh) / range
    : 1 + (pivotLow - favorable) / range;
  const mfeR = direction === "long" ? (favorable - fib50) / risk : (fib50 - favorable) / risk;
  const maeR = direction === "long" ? (adverse - fib50) / risk : (fib50 - adverse) / risk;
  const hit = {};
  for (const multiple of [1.236, 1.382, 1.5, 1.55, 1.6, 1.618]) {
    const target = targetFor(direction, pivotLow, pivotHigh, multiple);
    const hitIndex = firstHit(slice, direction, target);
    hit[`hit_${String(multiple).replace(".", "_")}`] = hitIndex === null ? "no" : "yes";
    hit[`time_${String(multiple).replace(".", "_")}`] = hitIndex === null ? "" : slice[hitIndex].ctTime;
  }
  const entryBar = bars[entryIndex];
  const firstTen = bars.slice(entryIndex + 1, Math.min(entryIndex + 11, bars.length));
  const initialAdverseR = direction === "long"
    ? (Math.min(...firstTen.map((bar) => bar.low)) - fib50) / risk
    : (fib50 - Math.max(...firstTen.map((bar) => bar.high))) / risk;
  return {
    entryDate: trade.entryDate,
    entryTimeCT: trade.entryTimeCT,
    exitTimeCT: trade.exitTimeCT,
    direction,
    rLoss: Number(trade.r).toFixed(2),
    entryPrice: Number(trade.entryPrice).toFixed(2),
    fib50: fib50.toFixed(2),
    pivotLow: pivotLow.toFixed(2),
    pivotHigh: pivotHigh.toFixed(2),
    range: range.toFixed(2),
    stop: stop.toFixed(2),
    favorable: favorable.toFixed(2),
    achievedMultiple: achievedMultiple.toFixed(3),
    mfeR: mfeR.toFixed(2),
    maeR: maeR.toFixed(2),
    initialAdverseR: initialAdverseR.toFixed(2),
    entryCloseVsOpen: (entryBar.close - entryBar.open).toFixed(2),
    ...hit,
  };
}

function summarize(rows) {
  const hitCount = (field) => rows.filter((row) => row[field] === "yes").length;
  const longs = rows.filter((row) => row.direction === "long");
  const shorts = rows.filter((row) => row.direction === "short");
  const recoverableAt15 = rows.filter((row) => row.hit_1_5 === "yes");
  const almost = rows.filter((row) => Number(row.achievedMultiple) >= 1.45 && row.hit_1_5 !== "yes");
  const noFollow = rows.filter((row) => Number(row.mfeR) < 1);
  return {
    total: rows.length,
    longs: longs.length,
    shorts: shorts.length,
    hit1236: hitCount("hit_1_236"),
    hit1382: hitCount("hit_1_382"),
    hit15: hitCount("hit_1_5"),
    hit155: hitCount("hit_1_55"),
    hit16: hitCount("hit_1_6"),
    recoverableAt15,
    almost,
    noFollow,
    avgMfeR: avg(rows.map((row) => Number(row.mfeR))),
    avgMaeR: avg(rows.map((row) => Number(row.maeR))),
  };
}

function report(summary, rows) {
  const lines = [];
  lines.push("# ES marked settings loss diagnostics");
  lines.push("");
  lines.push(`Losses analyzed: ${summary.total} (${summary.longs} long, ${summary.shorts} short).`);
  lines.push("");
  lines.push("| Alternate target | Losing trades that would have hit before stop |");
  lines.push("|---|---:|");
  lines.push(`| 1.236 | ${summary.hit1236}/${summary.total} |`);
  lines.push(`| 1.382 | ${summary.hit1382}/${summary.total} |`);
  lines.push(`| 1.500 | ${summary.hit15}/${summary.total} |`);
  lines.push(`| 1.550 | ${summary.hit155}/${summary.total} |`);
  lines.push(`| 1.600 | ${summary.hit16}/${summary.total} |`);
  lines.push("");
  lines.push(`Average MFE before loss: ${summary.avgMfeR.toFixed(2)}R. Average MAE: ${summary.avgMaeR.toFixed(2)}R.`);
  lines.push("");
  lines.push("## Loss rows");
  lines.push("");
  lines.push("| Date | Dir | Entry | Exit | Loss R | Best fib multiple reached | MFE R | Hit 1.5? | Hit 1.382? | Hit 1.236? |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---|---|---|");
  for (const row of rows) {
    lines.push(`| ${row.entryDate} | ${row.direction} | ${row.entryTimeCT} | ${row.exitTimeCT} | ${row.rLoss} | ${row.achievedMultiple} | ${row.mfeR} | ${row.hit_1_5}${row.time_1_5 ? ` ${row.time_1_5}` : ""} | ${row.hit_1_382}${row.time_1_382 ? ` ${row.time_1_382}` : ""} | ${row.hit_1_236}${row.time_1_236 ? ` ${row.time_1_236}` : ""} |`);
  }
  lines.push("");
  lines.push("## Groups");
  lines.push("");
  lines.push(`Recovered by a 1.5 target: ${summary.recoverableAt15.map((row) => `${row.entryDate} ${row.direction}`).join(", ") || "none"}.`);
  lines.push(`Almost reached 1.5 but missed: ${summary.almost.map((row) => `${row.entryDate} ${row.direction} (${row.achievedMultiple})`).join(", ") || "none"}.`);
  lines.push(`No meaningful follow-through (<1R MFE): ${summary.noFollow.map((row) => `${row.entryDate} ${row.direction} (${row.mfeR}R)`).join(", ") || "none"}.`);
  return lines.join("\n");
}

function targetFor(direction, pivotLow, pivotHigh, multiple) {
  const range = pivotHigh - pivotLow;
  return direction === "long" ? pivotHigh + range * (multiple - 1) : pivotLow - range * (multiple - 1);
}

function firstHit(slice, direction, target) {
  for (let i = 0; i < slice.length; i += 1) {
    if (direction === "long" ? slice[i].high >= target : slice[i].low <= target) return i;
  }
  return null;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] ?? {});
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
  };
}

function avg(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}
