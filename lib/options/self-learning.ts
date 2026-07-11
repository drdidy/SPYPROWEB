import {
  buildOptionReplayIntelligence,
  type OptionReplayIntelligenceSnapshot,
} from "@/lib/options/replay-intelligence";
import { loadOptionReplayMemory } from "@/lib/options/memory-store";
import { normalizeEntryDebitCeiling } from "@/lib/spx-contract-projection";

export type OptionLearningConfidence = "high" | "medium" | "learning";

export type OptionSelfLearningSnapshot = {
  ok: boolean;
  asOf: string;
  mode: "deterministic_replay";
  budget: number;
  lookback: number;
  minimumSamples: number;
  llmNeeded: false;
  confidence: OptionLearningConfidence;
  telegramReady: boolean;
  replay: OptionReplayIntelligenceSnapshot;
  liveMemory: {
    configured: boolean;
    contractsTracked: number;
    confirmedMomentumEvents: number;
    averageEntryError: number | null;
    averageEntryErrorPct: number | null;
    averageLift: number | null;
    latestContract: string | null;
  };
  adjustments: {
    entryDebitBand: { low: number; high: number } | null;
    preferredStrikeDistance: number | null;
    expectedTargetGainPct: number | null;
    expectedDrawdownPct: number | null;
    entryBiasPct: number | null;
  };
  agentRead: string;
  nextActions: string[];
};

const DEFAULT_LOOKBACK = 3;
const MINIMUM_SAMPLES = 3;

export async function buildOptionSelfLearningSnapshot({
  origin,
  lookback = DEFAULT_LOOKBACK,
  budget = 10,
}: {
  origin: string;
  lookback?: number;
  budget?: number;
}): Promise<OptionSelfLearningSnapshot> {
  const normalizedBudget = normalizeEntryDebitCeiling(budget);
  const normalizedLookback = Number.isFinite(lookback)
    ? Math.min(5, Math.max(2, Math.round(lookback)))
    : DEFAULT_LOOKBACK;
  const [replay, memory] = await Promise.all([
    buildOptionReplayIntelligence({
      origin,
      lookback: normalizedLookback,
      budget: normalizedBudget,
    }),
    loadOptionReplayMemory().catch(() => null),
  ]);
  const liveMemory = summarizeLiveMemory(memory);
  const confidence = learningConfidence(replay, liveMemory);
  const telegramReady = confidence !== "learning" && replay.summary.bestEntryBand !== null;
  const adjustments = {
    entryDebitBand: replay.summary.bestEntryBand,
    preferredStrikeDistance: replay.summary.preferredStrikeDistance,
    expectedTargetGainPct: replay.summary.averageTargetGainPct,
    expectedDrawdownPct: replay.summary.averageDrawdownPct,
    entryBiasPct: liveMemory.averageEntryErrorPct,
  };

  return {
    ok: true,
    asOf: new Date().toISOString(),
    mode: "deterministic_replay",
    budget: normalizedBudget,
    lookback: normalizedLookback,
    minimumSamples: MINIMUM_SAMPLES,
    llmNeeded: false,
    confidence,
    telegramReady,
    replay,
    liveMemory,
    adjustments,
    agentRead: buildAgentRead({ confidence, replay, liveMemory, budget: normalizedBudget }),
    nextActions: buildNextActions({ confidence, replay, liveMemory }),
  };
}

function summarizeLiveMemory(
  memory: Awaited<ReturnType<typeof loadOptionReplayMemory>> | null,
): OptionSelfLearningSnapshot["liveMemory"] {
  const contracts = memory?.contracts ?? [];
  const confirmedMomentumEvents = (memory?.events ?? []).filter(
    (event) => event.verdict === "confirmed",
  ).length;
  const entryErrors = contracts
    .map((contract) => contract.entryError)
    .filter(isFiniteNumber);
  const entryErrorPcts = contracts
    .map((contract) => contract.entryErrorPct)
    .filter(isFiniteNumber);
  const lifts = contracts
    .map((contract) => contract.maxGainFromEntry)
    .filter(isFiniteNumber);

  return {
    configured: Boolean(memory?.configured),
    contractsTracked: contracts.length,
    confirmedMomentumEvents,
    averageEntryError: entryErrors.length ? roundMoney(average(entryErrors)) : null,
    averageEntryErrorPct: entryErrorPcts.length ? roundPct(clamp(average(entryErrorPcts), -35, 35)) : null,
    averageLift: lifts.length ? roundMoney(average(lifts)) : null,
    latestContract: contracts[0]?.contractLabel ?? null,
  };
}

function learningConfidence(
  replay: OptionReplayIntelligenceSnapshot,
  liveMemory: OptionSelfLearningSnapshot["liveMemory"],
): OptionLearningConfidence {
  const summary = replay.summary;
  const targetBeatsHeat =
    (summary.averageTargetGainPct ?? 0) > Math.max(5, (summary.averageDrawdownPct ?? 0) * 1.15);
  const enoughReplay = summary.reviewed >= MINIMUM_SAMPLES && summary.qualified >= 2;
  const strongConfirmation = (summary.confirmationRate ?? 0) >= 50 || liveMemory.confirmedMomentumEvents >= 1;
  if (enoughReplay && targetBeatsHeat && strongConfirmation) return "high";
  if (summary.qualified >= 1 || liveMemory.contractsTracked >= 1) return "medium";
  return "learning";
}

function buildAgentRead({
  confidence,
  replay,
  liveMemory,
  budget,
}: {
  confidence: OptionLearningConfidence;
  replay: OptionReplayIntelligenceSnapshot;
  liveMemory: OptionSelfLearningSnapshot["liveMemory"];
  budget: number;
}): string {
  const band = replay.summary.bestEntryBand
    ? `$${replay.summary.bestEntryBand.low.toFixed(2)} to $${replay.summary.bestEntryBand.high.toFixed(2)}`
    : `under $${budget.toFixed(2)}`;
  if (confidence === "high") {
    return `The option analyzer has enough recent evidence to favor contracts opening near ${band}, with strike distance and exit behavior guided by replayed SPX tickets.`;
  }
  if (confidence === "medium") {
    return `The option analyzer has started learning from real premium behavior. Use the suggested range, but require momentum confirmation before acting.`;
  }
  if (liveMemory.configured) {
    return "The option analyzer is recording new tickets. It needs more completed entry-to-exit samples before tightening the price guide.";
  }
  return "The option analyzer can use historical replay now. Cloud memory will make the learning loop compound after each live ticket.";
}

function buildNextActions({
  confidence,
  replay,
  liveMemory,
}: {
  confidence: OptionLearningConfidence;
  replay: OptionReplayIntelligenceSnapshot;
  liveMemory: OptionSelfLearningSnapshot["liveMemory"];
}): string[] {
  if (confidence === "high") {
    return [
      "Use the learned debit band when the next SPX gate entry appears.",
      "Let the momentum gate confirm before acting.",
      "Record the live ticket so the next replay can tighten the guide.",
    ];
  }
  const actions = [
    replay.summary.reviewed < MINIMUM_SAMPLES
      ? "Add more completed replay sessions before raising confidence."
      : "Keep grading contract behavior after each completed session.",
    "Avoid contracts outside the selected debit limit.",
  ];
  if (!liveMemory.configured) {
    actions.push("Enable cloud memory to persist live contract behavior.");
  }
  return actions;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}
