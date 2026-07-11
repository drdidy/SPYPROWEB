import { NextResponse } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import type { OptionsIntelBundle, UwOptionChain } from "@/lib/options-intel-fetch";
import { fetchOptionCandlesBackfill } from "@/lib/options/backfill";
import { fetchMassiveOptionCandles } from "@/lib/options/massive-history";
import {
  DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  buildSpxContractProjection,
} from "@/lib/spx-contract-projection";
import type { ContractProjection } from "@/lib/contract-projection";
import type { SPXSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const [spx, options] = await Promise.all([
    fetchJson<SPXSnapshot>(`${origin}/api/spx/snapshot`),
    fetchJson<OptionsIntelBundle>(`${origin}/api/options/intel?symbols=SPX`),
  ]);
  const chain = options.symbols?.SPX?.chain as UwOptionChain | null | undefined;
  const projection = buildSpxContractProjection({
    snap: spx,
    chain,
    maxEntryDebit: DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  });
  if (!projection) {
    return NextResponse.json({
      ok: false,
      status: "unavailable",
      detail: "No SPX projection was available to test exact option backfill.",
    });
  }

  const window = previousTradingWindow();
  const provider = url.searchParams.get("provider")?.toLowerCase() === "massive" ? "massive" : "auto";
  const result = await runProbe(projection, window, provider);
  const verbose = isAlertRequestAuthorized(request);
  return NextResponse.json({
    ...(verbose ? result : publicBackfillResult(result)),
    contractLabel: projection.contractLabel,
    expiration: projection.expiration,
    strike: projection.strike,
    side: projection.side,
    window: verbose
      ? {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        }
      : undefined,
    candles: verbose ? result.candles.slice(0, 5) : undefined,
    candleCount: result.candles.length,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function runProbe(
  projection: ContractProjection,
  window: { from: Date; to: Date },
  provider: "auto" | "massive" = "auto",
) {
  const input = {
    underlying: "SPX",
    expiration: projection.expiration ?? "",
    strike: projection.strike,
    side: projection.side,
    fallbackSymbol: projection.optionSymbol,
    from: window.from,
    to: window.to,
    period: "m" as const,
  };
  if (provider === "massive") {
    const massive = await fetchMassiveOptionCandles(input);
    return {
      ok: massive.ok,
      status: massive.status,
      detail: massive.detail,
      provider: massive.provider,
      streamerSymbol: null,
      orderSymbol: projection.optionSymbol,
      optionsTicker: massive.optionsTicker,
      candles: massive.candles,
      diagnostic: massive.diagnostic,
    };
  }
  return fetchOptionCandlesBackfill({
    ...input,
  });
}

function publicBackfillResult(result: Awaited<ReturnType<typeof runProbe>>) {
  return {
    ok: result.ok,
    status: result.status,
    detail: result.ok
      ? "Historical option backfill is available for the selected contract."
      : "Historical option backfill is currently unavailable for the selected contract.",
    provider: "premium_backfill",
  };
}

function previousTradingWindow(now: Date = new Date()): { from: Date; to: Date } {
  const cursor = new Date(now);
  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (!isTradingDate(cursor));
  return {
    from: chicagoDateAt(cursor, 9, 0),
    to: chicagoDateAt(cursor, 14, 0),
  };
}

function isTradingDate(date: Date): boolean {
  const key = date.toISOString().slice(0, 10);
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !NYSE_HOLIDAYS_2026.has(key);
}

function chicagoDateAt(date: Date, hour: number, minute: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute);
  const noonGuess = new Date(Date.UTC(year, month - 1, day, 17, 0));
  return new Date(wallUtc - chicagoOffsetMin(noonGuess) * 60_000);
}

function chicagoOffsetMin(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wallMs - d.getTime()) / 60_000);
}

async function fetchJson<T>(target: string): Promise<T> {
  const headers: HeadersInit = {};
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
    headers["x-vercel-set-bypass-cookie"] = "samesitenone";
  }
  const res = await fetch(target, { cache: "no-store", headers });
  if (!res.ok) throw new Error(`${target} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

const NYSE_HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);
