import { headers } from "next/headers";

export interface UwFlowSummary {
  ticker: string;
  sessionDate?: string;
  bullishCount: number;
  bearishCount: number;
  premiumNet: number;
  lean: "BULLISH" | "BEARISH" | "BALANCED" | string;
  topPrints: UwFlowPrint[];
}

export interface UwFlowPrint {
  strike: number | null;
  side: string | null;
  premium: number | null;
  ts: string | null;
}

export interface UwFlowAlert {
  ticker: string;
  sessionDate?: string;
  optionSymbol: string | null;
  side: "CALL" | "PUT" | "UNKNOWN" | string;
  strike: number | null;
  expiration: string | null;
  premium: number | null;
  volume: number | null;
  sentiment: string | null;
  ts: string | null;
}

export interface UwGexSummary {
  ticker: string;
  sessionDate?: string;
  totalGEX: number;
  regime: "POSITIVE" | "NEGATIVE" | "FLAT" | string;
  flipPoint: number | null;
}

export interface UwDarkPool {
  ticker: string;
  sessionDate?: string;
  count: number;
  totalPremium: number;
  totalVolume: number;
  avgPrice: number | null;
  topPrints: Array<{
    price: number | null;
    volume: number | null;
    premium: number | null;
    ts: string | null;
  }>;
}

export interface UwOptionContract {
  sessionDate?: string;
  optionSymbol: string | null;
  expiration: string | null;
  dte: number | null;
  strike: number | null;
  side: "CALL" | "PUT" | "UNKNOWN" | string;
  bid: number | null;
  ask: number | null;
  mark: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  oi: number;
  volume: number;
}

export interface UwOptionChain {
  ticker: string;
  sessionDate?: string;
  expiration: string | null;
  calls: UwOptionContract[];
  puts: UwOptionContract[];
  totals: {
    callOi: number;
    putOi: number;
    callVol: number;
    putVol: number;
    pcr: number | null;
  };
}

export interface UwGreekRow {
  sessionDate?: string;
  strike: number | null;
  expiration: string | null;
  side: "CALL" | "PUT" | "UNKNOWN" | string;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  gex: number | null;
}

export interface UwSymbolIntel {
  ticker: string;
  sessionDate?: string;
  available: boolean;
  flow: UwFlowSummary | null;
  gex: UwGexSummary | null;
  flowAlerts: UwFlowAlert[];
  darkPool: UwDarkPool | null;
  chain: UwOptionChain | null;
  greeks: UwGreekRow[];
}

export interface OptionsIntelBundle {
  available: boolean;
  asOf: string;
  sessionDate?: string;
  isHistoricalSession?: boolean;
  symbols: Record<string, UwSymbolIntel>;
}

export interface LoadedOptionsIntel {
  data: OptionsIntelBundle;
  source: "live" | "empty" | "error";
  fetchedAt: string;
  error?: string;
}

function emptyBundle(symbols: string[] = ["SPY", "SPX"]): OptionsIntelBundle {
  return {
    available: false,
    asOf: new Date().toISOString(),
    symbols: Object.fromEntries(
      symbols.map((ticker) => [
        ticker,
        {
          ticker,
          available: false,
          flow: null,
          gex: null,
          flowAlerts: [],
          darkPool: null,
          chain: null,
          greeks: [],
        } satisfies UwSymbolIntel,
      ]),
    ),
  };
}

function resolveBase(): string | null {
  const override = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (override) return override;
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    return null;
  }
  return null;
}

function buildFetchHeaders(): HeadersInit {
  const out: Record<string, string> = {};
  try {
    const cookie = headers().get("cookie");
    if (cookie) out.cookie = cookie;
  } catch {
    // Request headers are only available during dynamic server renders.
  }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    out["x-vercel-protection-bypass"] = bypass;
    out["x-vercel-set-bypass-cookie"] = "samesitenone";
  }
  return out;
}

export async function loadOptionsIntelBundle(
  symbols: string[] = ["SPY", "SPX"],
  sessionDate?: string,
): Promise<LoadedOptionsIntel> {
  const clean = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  const fetchedAt = new Date().toISOString();
  const base = resolveBase();
  if (!base) {
    return { data: emptyBundle(clean), source: "error", fetchedAt, error: "no request host" };
  }
  const params = new URLSearchParams({ symbols: clean.join(",") });
  if (sessionDate) params.set("date", sessionDate);
  const target = `${base}/api/options/intel?${params.toString()}`;
  try {
    const res = await fetch(target, { cache: "no-store", headers: buildFetchHeaders() });
    if (!res.ok) {
      return {
        data: emptyBundle(clean),
        source: "error",
        fetchedAt,
        error: `API returned ${res.status}`,
      };
    }
    const data = (await res.json()) as OptionsIntelBundle;
    return { data, source: data.available ? "live" : "empty", fetchedAt };
  } catch (e) {
    return {
      data: emptyBundle(clean),
      source: "error",
      fetchedAt,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
