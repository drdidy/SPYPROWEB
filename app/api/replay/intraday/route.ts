import { NextRequest, NextResponse } from "next/server";

import { readEmaFibAlerts } from "@/lib/ema-fib-alerts";

type Instrument = "SPY" | "ES";
type Bar = { t: string; o: number; h: number; l: number; c: number; v?: number };
type ReplayEvent = {
  id: string;
  at: string;
  symbol: "SPY" | "SPX" | "ES";
  kind: string;
  direction: "long" | "short";
  price: number;
  status: "accepted";
};
type WeeklyControl = {
  sourceDate: string;
  sourceWindow: string;
  anchorAt: string;
  anchorPrice: number;
  slopePerHour: number;
  spacing: number;
  zoneWidth: number | null;
  valueAtFirstBar: number;
  slopePerBar: number;
  gateIndices: number[];
  method: string;
};

const CT = "America/Chicago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "missing or invalid date" }, { status: 400 });
  }

  const historyStart = addDays(date, -10);
  const historyEnd = addDays(date, 1);
  const [massiveSpy, yahooSpy, yahooEs, yahooSpx, yahooVix, storedAlerts] = await Promise.all([
    fetchMassiveBars("SPY", historyStart, historyEnd),
    fetchYahooBars("SPY", historyStart, historyEnd),
    fetchYahooBars("ES=F", historyStart, historyEnd),
    fetchYahooBars("^GSPC", historyStart, historyEnd),
    fetchYahooBars("^VIX", historyStart, historyEnd),
    readEmaFibAlerts(500).catch(() => []),
  ]);
  const spyHistory = massiveSpy.length ? massiveSpy : yahooSpy;
  const esHistory = yahooEs;
  const spy = sessionBars(spyHistory, date, "SPY");
  const es = sessionBars(esHistory, date, "ES");
  const spxContext = cashSessionBars(yahooSpx, date);
  const vixContext = cashSessionBars(yahooVix, date);
  const events: ReplayEvent[] = storedAlerts
    .filter((record) => record.status === "accepted" && chicagoParts(new Date(record.payload.eventAt)).date === date)
    .map((record) => ({
      id: record.id,
      at: record.payload.eventAt,
      symbol: record.payload.symbol,
      kind: record.payload.kind,
      direction: record.payload.direction,
      price: record.payload.last,
      status: "accepted" as const,
    }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return NextResponse.json(
    {
      date,
      spy,
      es,
      controls: {
        spy: reconstructWeeklyControl(spyHistory, spy, date, "SPY"),
        es: reconstructWeeklyControl(esHistory, es, date, "ES"),
      },
      context: { spx: spxContext, vix: vixContext },
      events,
      source: {
        spy: massiveSpy.length ? "massive" : yahooSpy.length ? "yahoo" : "unavailable",
        es: yahooEs.length ? "yahoo" : "unavailable",
        spx: yahooSpx.length ? "yahoo" : "unavailable",
        vix: yahooVix.length ? "yahoo" : "unavailable",
        events: events.length ? "archived TradingView alerts" : "unavailable",
      },
      ...(!spy.length && !es.length
        ? { error: "No verified intraday bars are available for this completed session." }
        : {}),
    },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } },
  );
}

async function fetchMassiveBars(symbol: string, start: string, end: string): Promise<Bar[]> {
  const key = process.env.MASSIVE_API_KEY?.trim() || process.env.POLYGON_API_KEY?.trim();
  if (!key) return [];
  const url = new URL(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/5/minute/${start}/${end}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  url.searchParams.set("apiKey", key);
  try {
    const response = await timedFetch(url);
    if (!response.ok) return [];
    const payload = (await response.json()) as { results?: Array<Record<string, unknown>> };
    return sanitizeProviderBars(payload.results ?? [], start, end);
  } catch {
    return [];
  }
}

async function fetchYahooBars(symbol: string, start: string, end: string): Promise<Bar[]> {
  const from = Date.parse(`${start}T00:00:00Z`) - 24 * 60 * 60 * 1000;
  const through = Date.parse(`${end}T00:00:00Z`) + 2 * 24 * 60 * 60 * 1000;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(Math.floor(from / 1000)));
  url.searchParams.set("period2", String(Math.floor(through / 1000)));
  url.searchParams.set("interval", "5m");
  url.searchParams.set("includePrePost", "true");
  url.searchParams.set("events", "div,splits");
  try {
    const response = await timedFetch(url);
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> };
    };
    const result = payload.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp || !quote) return [];
    const rows = result.timestamp.map((seconds, index) => ({
      t: seconds * 1000,
      o: quote.open?.[index],
      h: quote.high?.[index],
      l: quote.low?.[index],
      c: quote.close?.[index],
      v: quote.volume?.[index],
    }));
    return sanitizeProviderBars(rows, start, end);
  } catch {
    return [];
  }
}

function sanitizeProviderBars(rows: Array<Record<string, unknown>>, start: string, end: string): Bar[] {
  const deduped = new Map<number, Bar>();
  for (const row of rows) {
    const stamp = number(row.t);
    const o = number(row.o);
    const h = number(row.h);
    const l = number(row.l);
    const c = number(row.c);
    const v = number(row.v);
    if (
      stamp === null || o === null || h === null || l === null || c === null ||
      o <= 0 || h <= 0 || l <= 0 || c <= 0 || h < l
    ) continue;
    const date = chicagoParts(new Date(stamp)).date;
    if (date < start || date > end) continue;
    deduped.set(stamp, { t: new Date(stamp).toISOString(), o, h, l, c, ...(v === null ? {} : { v }) });
  }
  return [...deduped.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

function sessionBars(history: Bar[], date: string, instrument: Instrument): Bar[] {
  const priorDate = addDays(date, -1);
  return history.filter((bar) => {
    const parts = chicagoParts(new Date(bar.t));
    const minute = parts.hour * 60 + parts.minute;
    if (instrument === "SPY") {
      return parts.date === date && minute >= 3 * 60 && minute <= 15 * 60;
    }
    return (parts.date === priorDate && minute >= 17 * 60) || (parts.date === date && minute <= 15 * 60);
  });
}

function cashSessionBars(history: Bar[], date: string): Bar[] {
  return history.filter((bar) => {
    const parts = chicagoParts(new Date(bar.t));
    const minute = parts.hour * 60 + parts.minute;
    return parts.date === date && minute >= 8 * 60 + 30 && minute <= 15 * 60;
  });
}

function reconstructWeeklyControl(
  history: Bar[],
  targetBars: Bar[],
  date: string,
  instrument: Instrument,
): WeeklyControl | null {
  if (!history.length || !targetBars.length) return null;
  const monday = weekMonday(date);
  const weekday = isoWeekday(date);
  const preferred = weekday >= 2 ? monday : addDays(monday, -3);
  const anchor = findAnchor(history, preferred, date);
  if (!anchor) return null;

  const slopePerHour = instrument === "SPY" ? 0.12 : 1.04;
  const spacing = instrument === "SPY" ? 3.4 : 34;
  const zoneWidth = instrument === "SPY" ? 0.4 : null;
  const slopePerBar = slopePerHour * (5 / 60);
  const firstStamp = Date.parse(targetBars[0].t);
  const clockBars = history.filter((bar) => {
    const stamp = Date.parse(bar.t);
    return stamp > anchor.stamp && stamp <= firstStamp && isTradingClockBar(bar, instrument);
  }).length;
  const valueAtFirstBar = anchor.bar.h - slopePerBar * clockBars;
  // Select the visible family from the first replay bar only. Using the full
  // session range here would leak information that was not known at the open.
  const centerIndex = Math.round((targetBars[0].c - valueAtFirstBar) / spacing);

  return {
    sourceDate: anchor.date,
    sourceWindow: "12:00-14:00 CT",
    anchorAt: anchor.bar.t,
    anchorPrice: round(anchor.bar.h),
    slopePerHour,
    spacing,
    zoneWidth,
    valueAtFirstBar: round(valueAtFirstBar, 4),
    slopePerBar: round(slopePerBar, 6),
    gateIndices: Array.from({ length: 9 }, (_, index) => centerIndex + index - 4),
    method: weekday >= 2 && anchor.date === monday
      ? "Completed Monday 12-2 CT high carried through the week"
      : "Latest completed 12-2 CT high used until Monday control is available",
  };
}

function findAnchor(history: Bar[], preferred: string, targetDate: string) {
  const candidates = [preferred, ...Array.from({ length: 7 }, (_, index) => addDays(preferred, -(index + 1)))];
  for (const candidate of candidates) {
    if (candidate >= targetDate && candidate !== preferred) continue;
    const window = history.filter((bar) => {
      const parts = chicagoParts(new Date(bar.t));
      const minute = parts.hour * 60 + parts.minute;
      return parts.date === candidate && minute >= 12 * 60 && minute < 14 * 60;
    });
    if (!window.length) continue;
    const bar = window.reduce((highest, current) => current.h > highest.h ? current : highest);
    return { date: candidate, bar, stamp: Date.parse(bar.t) };
  }
  return null;
}

function isTradingClockBar(bar: Bar, instrument: Instrument) {
  const parts = chicagoParts(new Date(bar.t));
  const minute = parts.hour * 60 + parts.minute;
  if (instrument === "SPY") return minute >= 3 * 60 && minute < 19 * 60;
  return minute < 16 * 60 || minute >= 17 * 60;
}

function weekMonday(date: string) {
  return addDays(date, 1 - isoWeekday(date));
}

function isoWeekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function chicagoParts(value: Date) {
  const pieces = new Intl.DateTimeFormat("en-CA", {
    timeZone: CT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => pieces.find((piece) => piece.type === type)?.value ?? "0";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function timedFetch(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
