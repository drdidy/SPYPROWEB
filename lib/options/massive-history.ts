import type { ProjectionSide } from "@/lib/contract-projection";
import type { TastytradeOptionCandle } from "@/lib/options/tastytrade-history";

export interface MassiveOptionBackfillResult {
  ok: boolean;
  status: "available" | "unavailable" | "not_configured";
  detail: string;
  provider: "massive_rest";
  optionsTicker: string | null;
  candles: TastytradeOptionCandle[];
  diagnostic?: {
    status: number | null;
    resultCount: number;
    requestHost: string;
  };
}

const MASSIVE_BASE_URL = "https://api.massive.com";
const REQUEST_TIMEOUT_MS = 10_000;

export function hasMassiveHistoryConfig(): boolean {
  return Boolean(massiveApiKey());
}

export async function fetchMassiveOptionCandles({
  underlying = "SPX",
  expiration,
  strike,
  side,
  fallbackSymbol = null,
  from,
  to,
  period = "m",
}: {
  underlying?: string;
  expiration: string;
  strike: number;
  side: ProjectionSide;
  fallbackSymbol?: string | null;
  from: Date;
  to: Date;
  period?: "m" | "5m";
}): Promise<MassiveOptionBackfillResult> {
  const apiKey = massiveApiKey();
  if (!apiKey) {
    return emptyMassiveResult("not_configured", "Massive credentials are not configured.", null);
  }

  const ticker = massiveOptionTicker({ underlying, expiration, strike, side, fallbackSymbol });
  if (!ticker) {
    return emptyMassiveResult("unavailable", "No Massive-compatible options ticker could be built for this contract.", null);
  }

  const url = new URL(
    `${MASSIVE_BASE_URL}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${period === "5m" ? 5 : 1}/minute/${dateKey(from)}/${dateKey(to)}`,
  );
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  url.searchParams.set("apiKey", apiKey);

  try {
    const body = await fetchJson(url);
    const results = readResults(body);
    const candles = results
      .map(parseMassiveBar)
      .filter((candle): candle is TastytradeOptionCandle => candle !== null)
      .filter((candle) => {
        const ts = Date.parse(candle.ts);
        return ts >= from.getTime() && ts <= to.getTime();
      });
    return {
      ok: candles.length > 0,
      status: candles.length > 0 ? "available" : "unavailable",
      detail: candles.length > 0
        ? `Massive returned ${candles.length} historical option candles for the exact contract.`
        : "Massive connected, but no eligible historical option candles were returned for this contract window.",
      provider: "massive_rest",
      optionsTicker: ticker,
      candles,
      diagnostic: {
        status: 200,
        resultCount: results.length,
        requestHost: MASSIVE_BASE_URL.replace(/^https?:\/\//, ""),
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: "unavailable",
      detail: `Massive option backfill failed${error instanceof MassiveFetchError ? ` with HTTP ${error.status}` : ""}.`,
      provider: "massive_rest",
      optionsTicker: ticker,
      candles: [],
      diagnostic: {
        status: error instanceof MassiveFetchError ? error.status : null,
        resultCount: 0,
        requestHost: MASSIVE_BASE_URL.replace(/^https?:\/\//, ""),
      },
    };
  }
}

function massiveOptionTicker({
  underlying,
  expiration,
  strike,
  side,
  fallbackSymbol,
}: {
  underlying: string;
  expiration: string;
  strike: number;
  side: ProjectionSide;
  fallbackSymbol: string | null;
}): string | null {
  const fromFallback = tickerFromOrderSymbol(fallbackSymbol);
  if (fromFallback) return fromFallback;
  const root = underlying.toUpperCase() === "SPX" ? "SPXW" : underlying.toUpperCase();
  const yymmdd = expiration.replace(/-/g, "").slice(2);
  if (yymmdd.length !== 6) return null;
  const strikePart = String(Math.round(strike * 1000)).padStart(8, "0");
  return `O:${root}${yymmdd}${side === "CALL" ? "C" : "P"}${strikePart}`;
}

function tickerFromOrderSymbol(symbol: string | null): string | null {
  if (!symbol) return null;
  const compact = symbol.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  return match ? `O:${compact}` : null;
}

async function fetchJson(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new MassiveFetchError(res.status);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

class MassiveFetchError extends Error {
  constructor(public readonly status: number) {
    super(`Massive returned HTTP ${status}.`);
    this.name = "MassiveFetchError";
  }
}

function readResults(body: unknown): unknown[] {
  return isRecord(body) && Array.isArray(body.results) ? body.results : [];
}

function parseMassiveBar(value: unknown): TastytradeOptionCandle | null {
  if (!isRecord(value)) return null;
  const t = readNumber(value, "t");
  const open = readNumber(value, "o");
  const high = readNumber(value, "h");
  const low = readNumber(value, "l");
  const close = readNumber(value, "c");
  if (t === null || open === null || high === null || low === null || close === null) return null;
  return {
    ts: new Date(t).toISOString(),
    open,
    high,
    low,
    close,
    volume: readNumber(value, "v"),
  };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function massiveApiKey(): string | null {
  return process.env.MASSIVE_API_KEY?.trim() || process.env.POLYGON_API_KEY?.trim() || null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const parsed = typeof value[key] === "number" ? value[key] : Number(value[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function emptyMassiveResult(
  status: MassiveOptionBackfillResult["status"],
  detail: string,
  optionsTicker: string | null,
): MassiveOptionBackfillResult {
  return {
    ok: false,
    status,
    detail,
    provider: "massive_rest",
    optionsTicker,
    candles: [],
  };
}
