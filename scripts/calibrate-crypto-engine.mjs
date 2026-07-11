#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outPath = path.resolve(root, ".data/crypto-calibration-audit.json");
const assets = {
  BTC: { productId: "BTC-USD", slopePtsPerHour: 34, deviationPts: 680 },
  ETH: { productId: "ETH-USD", slopePtsPerHour: 0.95, deviationPts: 14 },
};

const days = Number(process.argv.find((arg) => arg.startsWith("--days="))?.split("=")[1] ?? 90);

const generatedAt = new Date().toISOString();
const reports = [];

for (const [asset, calibration] of Object.entries(assets)) {
  console.log(`[${asset}] fetching ${days}d of hourly Coinbase candles...`);
  const candles = await fetchCoinbaseCandles(calibration.productId, days);
  const sessions = buildSessions(candles);
  const graded = gradeSessions(asset, sessions, calibration);
  reports.push({
    asset,
    productId: calibration.productId,
    days,
    calibration,
    sessionsTested: graded.length,
    confidence: confidenceFor(graded),
    validation: summarize(graded),
    samples: graded.slice(-20),
  });
}

const report = {
  generatedAt,
  method: {
    anchor: "highest_bearish_close_inside_new_york_active_session",
    controlLine: "anchor_close_projected_forward_by_asset_slope",
    gates: "asset_specific_distance_above_and_below_control_line",
    validation: "touch_plus_next_gate_resolution_scan",
  },
  reports,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Crypto calibration audit written to ${path.relative(root, outPath)}`);
for (const row of reports) {
  console.log(`[${row.asset}] ${row.confidence} ${row.validation}`);
}

async function fetchCoinbaseCandles(productId, lookbackDays) {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const all = [];
  let cursor = start;
  while (cursor < end) {
    const chunkEnd = new Date(Math.min(end.getTime(), cursor.getTime() + 280 * 60 * 60 * 1000));
    const url = new URL(`https://api.exchange.coinbase.com/products/${productId}/candles`);
    url.searchParams.set("granularity", "3600");
    url.searchParams.set("start", cursor.toISOString());
    url.searchParams.set("end", chunkEnd.toISOString());
    const res = await fetch(url, { headers: { "User-Agent": "SPYProphetCalibration/1.0" } });
    if (!res.ok) throw new Error(`${productId} Coinbase HTTP ${res.status}`);
    const rows = await res.json();
    for (const row of rows) {
      const [seconds, low, high, open, close, volume] = row;
      all.push({
        timestamp: new Date(seconds * 1000).toISOString(),
        low: Number(low),
        high: Number(high),
        open: Number(open),
        close: Number(close),
        volume: Number(volume),
      });
    }
    cursor = new Date(chunkEnd.getTime() + 60 * 60 * 1000);
  }
  return Array.from(new Map(all.map((c) => [c.timestamp, c])).values()).sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
}

function buildSessions(candles) {
  const byDate = new Map();
  for (const candle of candles) {
    const key = nyDateKey(candle.timestamp);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(candle);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, candles: rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)) }));
}

function gradeSessions(asset, sessions, calibration) {
  const out = [];
  for (let index = 1; index < sessions.length; index += 1) {
    const prior = sessions[index - 1];
    const current = sessions[index];
    const anchor = highestBearishNyClose(prior.candles);
    if (!anchor) continue;
    const tradeCandles = current.candles.filter((c) => nyHour(c.timestamp) >= 8 && nyHour(c.timestamp) <= 13);
    if (tradeCandles.length === 0) continue;
    const lines = tradeCandles.map((c) => {
      const hours = Math.max(0, (Date.parse(c.timestamp) - Date.parse(anchor.timestamp)) / 3_600_000);
      const main = anchor.close - calibration.slopePtsPerHour * hours;
      return {
        timestamp: c.timestamp,
        main,
        upper: main + calibration.deviationPts,
        lower: main - calibration.deviationPts,
      };
    });
    const touches = [];
    for (let i = 0; i < tradeCandles.length; i += 1) {
      const candle = tradeCandles[i];
      const line = lines[i];
      for (const key of ["lower", "main", "upper"]) {
        if (candle.low <= line[key] && candle.high >= line[key]) {
          touches.push({ candle, line, key });
        }
      }
    }
    const first = touches[0] ?? null;
    let result = "skip";
    if (first) {
      const target =
        first.key === "lower" ? first.line.main : first.key === "upper" ? first.line.main : first.candle.close >= first.line.main ? first.line.upper : first.line.lower;
      const after = tradeCandles.filter((c) => Date.parse(c.timestamp) > Date.parse(first.candle.timestamp));
      result = after.some((c) => c.low <= target && c.high >= target) ? "win" : "unresolved";
    }
    out.push({
      asset,
      date: current.date,
      anchorTimestamp: anchor.timestamp,
      anchorClose: round(anchor.close),
      touches: touches.length,
      result,
    });
  }
  return out;
}

function highestBearishNyClose(candles) {
  return candles
    .filter((c) => nyHour(c.timestamp) >= 8 && nyHour(c.timestamp) <= 17 && c.close < c.open)
    .sort((a, b) => b.close - a.close)[0] ?? null;
}

function confidenceFor(rows) {
  const graded = rows.filter((r) => r.result === "win" || r.result === "unresolved");
  const wins = graded.filter((r) => r.result === "win").length;
  const hitRate = graded.length ? (wins / graded.length) * 100 : 0;
  if (graded.length >= 12 && hitRate >= 68) return "high";
  if (graded.length >= 8 && hitRate >= 58) return "medium";
  return "needs_review";
}

function summarize(rows) {
  const wins = rows.filter((r) => r.result === "win").length;
  const unresolved = rows.filter((r) => r.result === "unresolved").length;
  const skips = rows.filter((r) => r.result === "skip").length;
  const graded = wins + unresolved;
  const hitRate = graded ? Math.round((wins / graded) * 100) : 0;
  return `${hitRate}% ${wins}W ${unresolved}U ${skips}S`;
}

function nyDateKey(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function nyHour(iso) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}
