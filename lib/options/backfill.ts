import type { ProjectionSide } from "@/lib/contract-projection";
import { fetchMassiveOptionCandles, hasMassiveHistoryConfig } from "@/lib/options/massive-history";
import {
  fetchTastytradeOptionCandles,
  hasTastytradeHistoryConfig,
  type TastytradeOptionCandle,
} from "@/lib/options/tastytrade-history";

export interface OptionBackfillResult {
  ok: boolean;
  status: "available" | "unavailable" | "not_configured";
  detail: string;
  provider: "tastytrade_dxlink" | "massive_rest" | "none";
  streamerSymbol: string | null;
  orderSymbol: string | null;
  optionsTicker?: string | null;
  candles: TastytradeOptionCandle[];
  rawMessages?: number;
  diagnostic?: unknown;
  fallback?: {
    provider: "tastytrade_dxlink" | "massive_rest";
    status: "available" | "unavailable" | "not_configured";
    detail: string;
    candleCount: number;
  };
}

export function hasOptionBackfillConfig(): boolean {
  return hasTastytradeHistoryConfig() || hasMassiveHistoryConfig();
}

export async function fetchOptionCandlesBackfill(input: {
  underlying?: string;
  expiration: string;
  strike: number;
  side: ProjectionSide;
  fallbackSymbol?: string | null;
  from: Date;
  to: Date;
  period?: "m" | "5m";
}): Promise<OptionBackfillResult> {
  const tasty = await fetchTastytradeOptionCandles(input);
  if (tasty.ok) {
    return {
      ...tasty,
      provider: "tastytrade_dxlink",
    };
  }

  const massive = await fetchMassiveOptionCandles(input);
  if (massive.ok) {
    return {
      ok: true,
      status: "available",
      detail: `${massive.detail} Tastytrade fallback note: ${tasty.detail}`,
      provider: "massive_rest",
      streamerSymbol: tasty.streamerSymbol,
      orderSymbol: tasty.orderSymbol,
      optionsTicker: massive.optionsTicker,
      candles: massive.candles,
      diagnostic: massive.diagnostic,
      fallback: {
        provider: "tastytrade_dxlink",
        status: tasty.status,
        detail: tasty.detail,
        candleCount: tasty.candles.length,
      },
    };
  }

  return {
    ok: false,
    status: hasOptionBackfillConfig() ? "unavailable" : "not_configured",
    detail: [tasty.detail, massive.detail].filter(Boolean).join(" "),
    provider: "none",
    streamerSymbol: tasty.streamerSymbol,
    orderSymbol: tasty.orderSymbol,
    optionsTicker: massive.optionsTicker,
    candles: [],
    rawMessages: tasty.rawMessages,
    diagnostic: {
      tastytrade: tasty.diagnostic,
      massive: massive.diagnostic,
    },
  };
}
