import { headers } from "next/headers";

import { toOptionsRaw } from "@/lib/channel/options";
import type { ContractProjection } from "@/lib/contract-projection";
import { buildOptionSelfLearningSnapshot } from "@/lib/options/self-learning";
import {
  loadOptionsIntelBundle,
  type UwOptionChain,
} from "@/lib/options-intel-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import {
  buildSpxControlPlanContractProjections,
  normalizeEntryDebitCeiling,
  type SpxControlPlanContractProjections,
  type SpxReplayContractPreference,
} from "@/lib/spx-contract-projection";

export interface LiveReplayLearningSummary {
  reviewed: number;
  qualified: number;
  averageTargetGainPct: number | null;
  averageDrawdownPct: number | null;
  preferredStrikeDistance: number | null;
  bestEntryBand: { low: number; high: number } | null;
  confirmationRate: number | null;
  confidence?: "high" | "medium" | "learning";
  averageEntryErrorPct?: number | null;
  agentRead?: string;
}

export interface LiveSpxProjectionSnapshot {
  asOf: string;
  debitLimit: number;
  ticketLabel: string;
  latestSide: "BUY" | "SELL" | null;
  source: "live" | "mock";
  fairSpx: number | null;
  chainAtm: number | null;
  chainVolume: number | null;
  chainExpiration: string | null;
  chainStatus: string;
  chain: UwOptionChain | null;
  spxProjection: ContractProjection | null;
  controlPlan: SpxControlPlanContractProjections | null;
  zone: null;
  activeProjection: ContractProjection | null;
  learning: LiveReplayLearningSummary | null;
}

export async function buildLiveSpxProjectionSnapshot({
  debitLimit,
  origin,
}: {
  debitLimit: number;
  origin?: string | null;
}): Promise<LiveSpxProjectionSnapshot> {
  const normalizedDebit = normalizeEntryDebitCeiling(debitLimit);
  const [optionsLoaded, spxLoaded, replayLearning] = await Promise.all([
    loadOptionsIntelBundle(["SPX"]),
    loadSpxSnapshot(),
    loadSelfLearning(normalizedDebit, origin ?? resolveBase()),
  ]);

  const spxSymbol = optionsLoaded.data.symbols.SPX;
  const spxRawChain = toOptionsRaw(spxSymbol?.chain);
  const spxChain = spxRawChain
    ? { ...spxRawChain, asOf: optionsLoaded.fetchedAt }
    : null;
  const replayPreference = replayPreferenceFromSummary(replayLearning);
  const controlPlan = buildSpxControlPlanContractProjections({
    snap: spxLoaded.snap,
    chain: spxChain,
    maxEntryDebit: normalizedDebit,
    replayPreference,
  });
  const latestSide = spxLoaded.snap.controlTradePlan?.activeTrade?.side ?? null;
  const activeProjection =
    controlPlan?.active ??
    (latestSide === "BUY"
      ? controlPlan?.buySupport ?? null
      : latestSide === "SELL"
        ? controlPlan?.sellResistance ?? null
        : controlPlan?.buySupport ??
          controlPlan?.sellResistance ??
          null);
  const fairSpx =
    activeProjection?.translation?.basis !== null &&
    activeProjection?.translation?.basis !== undefined
      ? spxLoaded.snap.price.last + activeProjection.translation.basis
      : activeProjection?.underlyingNow ?? null;
  const chain = spxSymbol?.chain ?? null;

  return {
    asOf: new Date().toISOString(),
    debitLimit: normalizedDebit,
    ticketLabel: activeProjection
      ? `${activeProjection.contractLabel} ready`
      : chain
        ? "Waiting for setup"
        : "Chain waiting",
    latestSide,
    source: spxLoaded.source,
    fairSpx,
    chainAtm: chain?.atm ?? null,
    chainVolume: chain ? chain.totals.callVol + chain.totals.putVol : null,
    chainExpiration: chain?.expiration ?? null,
    chainStatus: chain ? chainStatus(chain) : "Waiting for contracts",
    chain,
    spxProjection: null,
    controlPlan,
    zone: null,
    activeProjection,
    learning: replayLearning,
  };
}

async function loadSelfLearning(
  debitLimit: number,
  origin: string | null,
): Promise<LiveReplayLearningSummary | null> {
  if (!origin) return null;
  try {
    const data = await buildOptionSelfLearningSnapshot({
      origin,
      lookback: 3,
      budget: debitLimit,
    });
    if (!data.ok && data.replay.summary.reviewed === 0) return null;
    return {
      reviewed: data.replay.summary.reviewed,
      qualified: data.replay.summary.qualified,
      averageTargetGainPct: data.replay.summary.averageTargetGainPct,
      averageDrawdownPct: data.replay.summary.averageDrawdownPct,
      preferredStrikeDistance: data.replay.summary.preferredStrikeDistance,
      bestEntryBand: data.replay.summary.bestEntryBand,
      confirmationRate: data.replay.summary.confirmationRate,
      confidence: data.confidence,
      averageEntryErrorPct: data.liveMemory.averageEntryErrorPct,
      agentRead: data.agentRead,
    };
  } catch {
    return null;
  }
}

function replayPreferenceFromSummary(
  summary: LiveReplayLearningSummary | null,
): SpxReplayContractPreference | null {
  if (!summary || (!summary.bestEntryBand && summary.preferredStrikeDistance === null)) return null;
  return {
    entryDebitBand: summary.bestEntryBand,
    preferredStrikeDistance: summary.preferredStrikeDistance,
    confidence: summary.confidence,
  };
}

function resolveBase(): string | null {
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

function chainStatus(chain: UwOptionChain): string {
  const rows = [...(chain.calls ?? []), ...(chain.puts ?? [])];
  const hasPricing = rows.some((row) => isDisplayNumber(row.bid) || isDisplayNumber(row.ask) || isDisplayNumber(row.mark));
  const hasInputs = rows.some((row) => isDisplayNumber(row.delta) && isDisplayNumber(row.gamma));
  if (hasPricing && hasInputs) return "pricing inputs loaded";
  if (hasPricing) return "pricing inputs partial";
  return "waiting for live quotes";
}

function isDisplayNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
