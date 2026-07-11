import { NextRequest, NextResponse } from "next/server";

type Bar = { t: string; o: number; h: number; l: number; c: number; v?: number };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "missing or invalid date" }, { status: 400 });
  }

  const [massiveSpy, yahooSpy, yahooEs] = await Promise.all([
    fetchMassiveBars("SPY", date),
    fetchYahooBars("SPY", date),
    fetchYahooBars("ES=F", date),
  ]);
  const spy = massiveSpy.length ? massiveSpy : yahooSpy;
  const es = yahooEs;

  return NextResponse.json(
    {
      date,
      spy,
      es,
      source: {
        spy: massiveSpy.length ? "massive" : yahooSpy.length ? "yahoo" : "unavailable",
        es: yahooEs.length ? "yahoo" : "unavailable",
      },
      ...(!spy.length && !es.length
        ? { error: "No verified intraday bars are available for this completed session." }
        : {}),
    },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } },
  );
}

async function fetchMassiveBars(symbol: string, date: string): Promise<Bar[]> {
  const key = process.env.MASSIVE_API_KEY?.trim() || process.env.POLYGON_API_KEY?.trim();
  if (!key) return [];
  const url = new URL(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/5/minute/${date}/${date}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "5000");
  url.searchParams.set("apiKey", key);
  try {
    const response = await timedFetch(url);
    if (!response.ok) return [];
    const payload = (await response.json()) as { results?: Array<Record<string, unknown>> };
    return sanitizeProviderBars(payload.results ?? [], date, "SPY");
  } catch {
    return [];
  }
}

async function fetchYahooBars(symbol: string, date: string): Promise<Bar[]> {
  const center = Date.parse(`${date}T12:00:00Z`);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(Math.floor((center - 36 * 60 * 60 * 1000) / 1000)));
  url.searchParams.set("period2", String(Math.floor((center + 36 * 60 * 60 * 1000) / 1000)));
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
    return sanitizeProviderBars(rows, date, symbol === "SPY" ? "SPY" : "ES");
  } catch {
    return [];
  }
}

function sanitizeProviderBars(rows: Array<Record<string, unknown>>, date: string, instrument: "SPY" | "ES"): Bar[] {
  return rows.flatMap((row) => {
    const stamp = number(row.t);
    const o = number(row.o);
    const h = number(row.h);
    const l = number(row.l);
    const c = number(row.c);
    const v = number(row.v);
    if (stamp === null || o === null || h === null || l === null || c === null) return [];
    const parts = chicagoParts(new Date(stamp));
    if (parts.date !== date) return [];
    const minute = parts.hour * 60 + parts.minute;
    const inWindow = instrument === "SPY"
      ? minute >= 3 * 60 && minute <= 15 * 60
      : minute >= 0 && minute <= 15 * 60;
    if (!inWindow) return [];
    return [{ t: new Date(stamp).toISOString(), o, h, l, c, ...(v === null ? {} : { v }) }];
  }).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

function chicagoParts(value: Date) {
  const pieces = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
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
