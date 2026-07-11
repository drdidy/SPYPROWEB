import { NextResponse } from "next/server";

import { isAlertRequestAuthorized } from "@/lib/alerts/auth";
import { resolvePublicOrigin } from "@/lib/server/public-origin";
import type { OptionsIntelBundle, UwOptionChain } from "@/lib/options-intel-fetch";
import { appendOptionMemoryTick, rememberBackfillStatus } from "@/lib/options/memory-store";
import { fetchOptionCandlesBackfill, hasOptionBackfillConfig } from "@/lib/options/backfill";
import { buildOptionSelfLearningSnapshot } from "@/lib/options/self-learning";
import {
  DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  buildSpxControlPlanContractProjections,
  type SpxReplayContractPreference,
} from "@/lib/spx-contract-projection";
import type { ContractProjection } from "@/lib/contract-projection";
import type { SPXSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAlertRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = resolvePublicOrigin(request);
  const result = await recordCurrentSpxOptionTickets(origin).catch((error) => ({
    ok: false,
    recorded: 0,
    candidates: 0,
    labels: [],
    errors: [`Recorder failed: ${errorText(error)}`],
  }));
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

async function recordCurrentSpxOptionTickets(origin: string): Promise<{
  ok: boolean;
  recorded: number;
  candidates: number;
  labels: string[];
  errors: string[];
}> {
  const errors: string[] = [];
  const labels: string[] = [];
  let recorded = 0;

  const [spx, options] = await Promise.all([
    fetchJson<SPXSnapshot>(`${origin}/api/spx/snapshot`),
    fetchJson<OptionsIntelBundle>(`${origin}/api/options/intel?symbols=SPX`),
  ]);
  const chain = options.symbols?.SPX?.chain as UwOptionChain | null | undefined;
  const replayPreference = await loadSpxReplayPreference(origin).catch((error) => {
    errors.push(`Replay learning: ${errorText(error)}`);
    return null;
  });
  const controlPlan = buildSpxControlPlanContractProjections({
    snap: spx,
    chain,
    maxEntryDebit: DEFAULT_SPX_ENTRY_DEBIT_CEILING,
    replayPreference,
  });
  const projections = [
    projectionRole(controlPlan?.active ?? null, "control-active"),
    projectionRole(controlPlan?.buySupport ?? null, "control-buy-support"),
    projectionRole(controlPlan?.sellResistance ?? null, "control-sell-resistance"),
  ].filter((item): item is ProjectionWithRole => item !== null);

  const backfillProbe = await probeTastytradeBackfill(projections[0]?.projection ?? null).catch((error) => {
    errors.push(`Backfill probe: ${errorText(error)}`);
    return null;
  });
  try {
    await rememberBackfillStatus(
      backfillProbe
        ? {
            status: backfillProbe.status,
            detail: backfillProbe.detail,
          }
        : {
            status: hasTastytradeConfig() ? "testing" : "unavailable",
            detail: hasTastytradeConfig()
              ? "Historical premium backfill is being tested for exact SPX contracts. Live recording is active now."
              : "Live recording is active. Historical premium backfill needs the premium-data credentials before it can import old candles.",
          },
    );
  } catch (error) {
    errors.push(`Backfill status: ${errorText(error)}`);
  }

  for (const item of dedupeProjections(projections)) {
    const tick = projectionToTick(item.projection, item.role);
    if (!tick) continue;
    const stored = await appendOptionMemoryTick(tick).catch((error) => {
      errors.push(`${tick.contractLabel}: ${errorText(error)}`);
      return null;
    });
    if (stored?.stored) {
      recorded += 1;
      labels.push(tick.contractLabel);
    } else if (stored?.reason) {
      errors.push(`${tick.contractLabel}: ${stored.reason}`);
    }
  }

  return {
    ok: errors.length === 0,
    recorded,
    candidates: projections.length,
    labels,
    errors,
  };
}

async function loadSpxReplayPreference(origin: string): Promise<SpxReplayContractPreference | null> {
  const intelligence = await buildOptionSelfLearningSnapshot({
    origin,
    lookback: 3,
    budget: DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  });
  const summary = intelligence.replay.summary;
  if (!intelligence.ok && summary.reviewed === 0) return null;
  if (!summary.bestEntryBand && summary.preferredStrikeDistance === null) return null;
  return {
    entryDebitBand: summary.bestEntryBand,
    preferredStrikeDistance: summary.preferredStrikeDistance,
    confidence: intelligence.confidence,
  };
}

type ProjectionRole =
  | "control-active"
  | "control-buy-support"
  | "control-sell-resistance";
type ProjectionWithRole = { projection: ContractProjection; role: ProjectionRole };

function projectionRole(
  projection: ContractProjection | null,
  role: ProjectionRole,
): ProjectionWithRole | null {
  return projection ? { projection, role } : null;
}

function dedupeProjections(items: ProjectionWithRole[]): ProjectionWithRole[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.projection.optionSymbol || item.projection.contractLabel;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function projectionToTick(projection: ContractProjection, role: ProjectionRole) {
  const mark = projection.currentMark;
  if (!Number.isFinite(mark) || mark <= 0) return null;
  return {
    ts: new Date().toISOString(),
    contractLabel: projection.contractLabel,
    symbol: projection.optionSymbol ?? projection.contractLabel,
    streamerSymbol: projection.streamerSymbol ?? projection.optionSymbol ?? null,
    side: projection.side,
    strike: projection.strike,
    expiration: projection.expiration,
    bid: projection.currentBid,
    ask: projection.currentAsk,
    mark,
    role,
    entryUnderlying: projection.entryUnderlying,
    projectedEntryMark: projection.projectedEntry.mark,
    projectedEntryAt: projection.projectedEntryAt,
    targetUnderlying: projection.targetUnderlying,
    projectedTargetMark: projection.projectedTarget?.mark ?? null,
    source: "schwab_chain" as const,
  };
}

async function probeTastytradeBackfill(projection: ContractProjection | null) {
  if (!projection?.expiration) return null;
  const window = previousTradingWindow();
  const result = await fetchOptionCandlesBackfill({
    underlying: "SPX",
    expiration: projection.expiration,
    strike: projection.strike,
    side: projection.side,
    fallbackSymbol: projection.optionSymbol,
    from: window.from,
    to: window.to,
    period: "m",
  });
  return {
    status: result.status,
    detail: result.ok
      ? `Exact SPX option backfill is available: ${result.candles.length} one-minute candles returned for ${projection.contractLabel}.`
      : `${result.detail} Live recording remains active for ${projection.contractLabel}.`,
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

function hasTastytradeConfig(): boolean {
  return hasOptionBackfillConfig();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
