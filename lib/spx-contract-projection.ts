import {
  buildContractProjection,
  projectionChainFromRows,
  type ContractProjection,
  type ProjectionChain,
} from "@/lib/contract-projection";
import type {
  SPXContractSuggestion,
  SPXControlPlanSetup,
  SPXSnapshot,
  SPXTrade,
} from "@/lib/types";

export interface SpxProjectionContractRow {
  optionSymbol?: string | null;
  streamerSymbol?: string | null;
  strike: number | null;
  bid: number | null;
  ask: number | null;
  mark?: number | null;
  iv?: number | null;
  delta: number | null;
  gamma: number | null;
  theta?: number | null;
  vega?: number | null;
}

export interface SpxProjectionChainInput {
  expiration?: string | null;
  atm?: number | null;
  asOf?: string | null;
  calls: SpxProjectionContractRow[];
  puts: SpxProjectionContractRow[];
}

export interface SpxZoneContractProjections {
  zoneLabel: string;
  lowerLabel: string;
  upperLabel: string;
  buyBottom: ContractProjection | null;
  sellTop: ContractProjection | null;
}

export interface SpxControlPlanContractProjections {
  label: string;
  status: string;
  targetDistance: number;
  active: ContractProjection | null;
  buySupport: ContractProjection | null;
  sellResistance: ContractProjection | null;
}

export interface SpxReplayContractPreference {
  entryDebitBand: { low: number; high: number } | null;
  preferredStrikeDistance: number | null;
  confidence?: "high" | "medium" | "learning";
}

export const SPX_ENTRY_DEBIT_PRESETS = [7, 10, 20] as const;
export const DEFAULT_SPX_ENTRY_DEBIT_CEILING = 10.0;
const SPX_MAX_OTM_DISTANCE = 45;
const ES_RTH_ENTRY_HOUR_CT = 9;
const ES_RTH_ENTRY_MIN_CT = 0;

export function buildSpxContractProjection({
  snap,
  chain,
  trade,
  contract,
  maxEntryDebit = DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  replayPreference = null,
  now = new Date(),
}: {
  snap: SPXSnapshot;
  chain: SpxProjectionChainInput | null | undefined;
  trade?: SPXTrade | null;
  contract?: SPXContractSuggestion | null;
  maxEntryDebit?: number;
  replayPreference?: SpxReplayContractPreference | null;
  now?: Date;
}): ContractProjection | null {
  const debitLimit = normalizeEntryDebitCeiling(maxEntryDebit);
  const selected = selectSpxTicketSetup(snap, trade, contract);
  trade = selected.trade;
  contract = selected.contract;
  if (!trade || !contract || !chain) return null;
  const normalized = normalizeSpxChain(chain);
  const basisRead = spxBasisFromSnapshot(snap, chain);
  const basis = basisRead.basis;
  const spxNow = spxSpotFromSnapshot(snap, basis, chain);
  const entryUnderlying = trade.entryPrice + basis;
  const targetUnderlying = trade.exitPrice + basis;
  if (Math.abs(targetUnderlying - entryUnderlying) < 0.25) return null;
  const side = contract.type;
  const minutesToEntry = minutesUntilNextEsRthEntry(now);
  const entryAt = nextEsRthEntryIso(now);
  const targetAt = targetProjectionIso(minutesToEntry, now);

  const budgetProjection = selectBudgetOtmProjection({
    symbol: "SPX",
    chain: normalized,
    side,
    underlyingNow: spxNow,
    entryUnderlying,
    targetUnderlying,
    esEntryUnderlying: trade.entryPrice,
    esTargetUnderlying: trade.exitPrice,
    basis: basisRead.basis,
    basisSource: basisRead.source,
    maxEntryMark: debitLimit,
    maxOtmDistance: SPX_MAX_OTM_DISTANCE,
    minutesToEntry,
    minutesToTarget: minutesToEntry + 45,
    projectedEntryAt: entryAt,
    projectedTargetAt: targetAt,
    chainAsOf: chain.asOf ?? snap._meta?.quoteCapturedAt ?? snap.asOf ?? null,
    replayPreference,
  });
  if (budgetProjection) return withSpxBasisNote(budgetProjection, minutesToEntry, debitLimit);

  return null;
}

export function buildSpxZoneContractProjections({
  snap,
  chain,
  maxEntryDebit = DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  replayPreference = null,
  now = new Date(),
}: {
  snap: SPXSnapshot;
  chain: SpxProjectionChainInput | null | undefined;
  maxEntryDebit?: number;
  replayPreference?: SpxReplayContractPreference | null;
  now?: Date;
}): SpxZoneContractProjections | null {
  const debitLimit = normalizeEntryDebitCeiling(maxEntryDebit);
  const fan = snap.descendingDeviationFan;
  if (!fan || !chain) return null;
  const lowerLabel = fan.zone.lowerLine;
  const upperLabel = fan.zone.upperLine;
  if (!lowerLabel || !upperLabel) return null;
  const lowerLine = fan.lines.find((line) => line.label === lowerLabel);
  const upperLine = fan.lines.find((line) => line.label === upperLabel);
  if (!lowerLine || !upperLine) return null;

  const normalized = normalizeSpxChain(chain);
  const basisRead = spxBasisFromSnapshot(snap, chain);
  const basis = basisRead.basis;
  const spxNow = spxSpotFromSnapshot(snap, basis, chain);
  const minutesToEntry = minutesUntilNextEsRthEntry(now);
  const entryAt = nextEsRthEntryIso(now);
  const targetAt = targetProjectionIso(minutesToEntry, now);
  const lowerEntry = lowerLine.value + basis;
  const upperEntry = upperLine.value + basis;
  if (Math.abs(upperEntry - lowerEntry) < 0.25) return null;

  const buyBottom = selectBudgetOtmProjection({
    symbol: "SPX",
    chain: normalized,
    side: "CALL",
    underlyingNow: spxNow,
    entryUnderlying: lowerEntry,
    targetUnderlying: upperEntry,
    esEntryUnderlying: lowerLine.value,
    esTargetUnderlying: upperLine.value,
    basis: basisRead.basis,
    basisSource: basisRead.source,
    maxEntryMark: debitLimit,
    maxOtmDistance: SPX_MAX_OTM_DISTANCE,
    minutesToEntry,
    minutesToTarget: minutesToEntry + 45,
    projectedEntryAt: entryAt,
    projectedTargetAt: targetAt,
    chainAsOf: chain.asOf ?? snap._meta?.quoteCapturedAt ?? snap.asOf ?? null,
    replayPreference,
  });
  const sellTop = selectBudgetOtmProjection({
    symbol: "SPX",
    chain: normalized,
    side: "PUT",
    underlyingNow: spxNow,
    entryUnderlying: upperEntry,
    targetUnderlying: lowerEntry,
    esEntryUnderlying: upperLine.value,
    esTargetUnderlying: lowerLine.value,
    basis: basisRead.basis,
    basisSource: basisRead.source,
    maxEntryMark: debitLimit,
    maxOtmDistance: SPX_MAX_OTM_DISTANCE,
    minutesToEntry,
    minutesToTarget: minutesToEntry + 45,
    projectedEntryAt: entryAt,
    projectedTargetAt: targetAt,
    chainAsOf: chain.asOf ?? snap._meta?.quoteCapturedAt ?? snap.asOf ?? null,
    replayPreference,
  });

  return {
    zoneLabel: fan.zone.label,
    lowerLabel,
    upperLabel,
    buyBottom: buyBottom ? withZoneNote(buyBottom, "Buy bottom", lowerLabel, upperLabel, minutesToEntry, debitLimit) : null,
    sellTop: sellTop ? withZoneNote(sellTop, "Sell top", upperLabel, lowerLabel, minutesToEntry, debitLimit) : null,
  };
}

export function buildSpxControlPlanContractProjections({
  snap,
  chain,
  maxEntryDebit = DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  replayPreference = null,
  now = new Date(),
}: {
  snap: SPXSnapshot;
  chain: SpxProjectionChainInput | null | undefined;
  maxEntryDebit?: number;
  replayPreference?: SpxReplayContractPreference | null;
  now?: Date;
}): SpxControlPlanContractProjections | null {
  const plan = snap.controlTradePlan;
  if (!plan) return null;

  const project = (setup: SPXControlPlanSetup | null | undefined) => {
    if (!setup) return null;
    return buildSpxContractProjection({
      snap,
      chain,
      trade: controlSetupTrade(setup),
      contract: controlSetupContract(setup, snap, chain),
      maxEntryDebit,
      replayPreference,
      now,
    });
  };

  const buySetup = plan.setups.find((setup) => setup.side === "BUY") ?? null;
  const sellSetup = plan.setups.find((setup) => setup.side === "SELL") ?? null;
  const active = plan.activeTrade ? project(plan.activeTrade) : null;

  return {
    label: plan.label,
    status: plan.status,
    targetDistance: plan.targetDistance,
    active,
    buySupport: project(buySetup),
    sellResistance: project(sellSetup),
  };
}

export function normalizeEntryDebitCeiling(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SPX_ENTRY_DEBIT_CEILING;
  return Math.min(50, Math.max(1, Math.round(parsed * 100) / 100));
}

function selectSpxTicketSetup(
  snap: SPXSnapshot,
  trade?: SPXTrade | null,
  contract?: SPXContractSuggestion | null,
): {
  trade: SPXTrade | null;
  contract: SPXContractSuggestion | null;
} {
  if (trade || contract) {
    return {
      trade: trade ?? snap.plays.primary,
      contract: contract ?? snap.contracts.forPrimary,
    };
  }

  const activeControl = snap.controlTradePlan?.activeTrade;
  if (activeControl) {
    return {
      trade: controlSetupTrade(activeControl),
      contract: controlSetupContract(activeControl, snap, null),
    };
  }

  return {
    trade: null,
    contract: null,
  };
}

function controlSetupTrade(setup: SPXControlPlanSetup): SPXTrade {
  return {
    side: setup.side,
    entryLine: setup.entryLine,
    entryPrice: setup.entryPrice,
    exitLine: setup.entryLine,
    exitPrice: setup.targetPrice,
  };
}

function controlSetupContract(
  setup: SPXControlPlanSetup,
  snap: SPXSnapshot,
  chain: SpxProjectionChainInput | null | undefined,
): SPXContractSuggestion {
  const otmDistance = preferredOtmDistance(DEFAULT_SPX_ENTRY_DEBIT_CEILING);
  const strikeRaw =
    setup.contractType === "CALL"
      ? setup.entryPrice + otmDistance
      : setup.entryPrice - otmDistance;
  const strike = Math.round(strikeRaw / 5) * 5;
  return {
    type: setup.contractType,
    strike,
    expiration: chain?.expiration ?? snap.sessionDateCT,
    dteLabel: "0DTE",
    distanceFromSpot: strike - snap.price.last,
  };
}

function normalizeSpxChain(chain: SpxProjectionChainInput): ProjectionChain {
  const calls = chain.calls
    .filter((row): row is Required<Pick<SpxProjectionContractRow, "strike">> & SpxProjectionContractRow => row.strike !== null)
    .map((row) => ({ ...row, strike: row.strike! }));
  const puts = chain.puts
    .filter((row): row is Required<Pick<SpxProjectionContractRow, "strike">> & SpxProjectionContractRow => row.strike !== null)
    .map((row) => ({ ...row, strike: row.strike! }));
  return projectionChainFromRows({
    calls,
    puts,
    expiration: chain.expiration ?? null,
  });
}

function selectBudgetOtmProjection({
  symbol,
  chain,
  side,
  underlyingNow,
  entryUnderlying,
  targetUnderlying,
  esEntryUnderlying,
  esTargetUnderlying,
  basis,
  basisSource,
  maxEntryMark,
  maxOtmDistance,
  minutesToEntry,
  minutesToTarget,
  projectedEntryAt,
  projectedTargetAt,
  chainAsOf,
  replayPreference,
}: {
  symbol: string;
  chain: ProjectionChain;
  side: "CALL" | "PUT";
  underlyingNow: number;
  entryUnderlying: number;
  targetUnderlying: number;
  esEntryUnderlying: number | null;
  esTargetUnderlying: number | null;
  basis: number | null;
  basisSource: SpxBasisSource;
  maxEntryMark: number;
  maxOtmDistance?: number;
  minutesToEntry: number;
  minutesToTarget: number;
  projectedEntryAt: string | null;
  projectedTargetAt: string | null;
  chainAsOf: string | null;
  replayPreference?: SpxReplayContractPreference | null;
}): ContractProjection | null {
  if (Math.abs(targetUnderlying - entryUnderlying) < 0.25) return null;
  const rows = side === "CALL" ? chain.calls : chain.puts;
  const minimumDistance = minimumOtmDistance(maxEntryMark, replayPreference);
  const projections = rows
    .filter((row) => isOtmAtEntry(side, row.strike, entryUnderlying))
    .map((row) =>
      buildContractProjection({
        symbol,
        chain,
        side,
        preferredStrike: row.strike,
        underlyingNow,
        entryUnderlying,
        targetUnderlying,
        stopUnderlying: null,
        maxOtmDistance,
        minutesToEntry,
        minutesToTarget,
        maxEntryDebit: maxEntryMark,
        projectedEntryAt,
        projectedTargetAt,
        chainAsOf,
        translation: {
          esEntry: esEntryUnderlying,
          spxEntry: entryUnderlying,
          esTarget: esTargetUnderlying,
          spxTarget: targetUnderlying,
          basis,
          basisSource,
        },
        selectionReasons: [
          `Entry is ${entryUnderlying.toFixed(2)} SPX after ES translation`,
          `Target is ${targetUnderlying.toFixed(2)} SPX after ES translation`,
          ...replaySelectionReasons(replayPreference),
        ],
      }),
    )
    .filter((projection): projection is ContractProjection => projection !== null);

  const underBudget = projections.filter(
    (projection) => projection.projectedEntry.mark <= maxEntryMark,
  );
  if (underBudget.length === 0) return null;

  const properDistance = underBudget.filter(
    (projection) => Math.abs(projection.strikeDistanceFromEntry) >= minimumDistance,
  );
  const selectionPool = properDistance.length > 0 ? properDistance : underBudget;

  return selectionPool.sort((a, b) =>
    projectionRank(a, entryUnderlying, maxEntryMark, replayPreference) -
      projectionRank(b, entryUnderlying, maxEntryMark, replayPreference),
  )[0];
}

function projectionRank(
  projection: ContractProjection,
  entryUnderlying: number,
  maxEntryMark: number,
  replayPreference?: SpxReplayContractPreference | null,
): number {
  const naturalDistance = Math.abs(projection.strike - entryUnderlying);
  const preferredDistance = preferredOtmDistance(maxEntryMark, replayPreference);
  const distancePenalty =
    Math.abs(Math.abs(projection.strikeDistanceFromEntry) - preferredDistance) * 1.8;
  const band = highConfidenceReplayPreference(replayPreference)?.entryDebitBand ?? null;
  const debitAnchor = band ? (band.low + band.high) / 2 : maxEntryMark * 0.72;
  const bandPenalty = band
    ? distanceFromBand(projection.projectedEntry.mark, band) * 4.5
    : Math.abs(projection.projectedEntry.mark - debitAnchor) * 0.55;
  const staleSurfacePenalty =
    projection.pricingModel === "iv_model" && projection.currentMark > maxEntryMark * 3
      ? (projection.currentMark / Math.max(0.01, maxEntryMark) - 3) * 1.5
      : 0;
  const naturalPenalty = naturalDistance * 0.05;
  return distancePenalty + bandPenalty + naturalPenalty + staleSurfacePenalty;
}

function preferredOtmDistance(
  maxEntryMark: number,
  replayPreference?: SpxReplayContractPreference | null,
): number {
  const learned =
    replayPreference?.confidence === "high" &&
    typeof replayPreference.preferredStrikeDistance === "number" &&
    Number.isFinite(replayPreference.preferredStrikeDistance)
      ? replayPreference.preferredStrikeDistance
      : null;
  if (learned !== null) return clamp(learned, 12, SPX_MAX_OTM_DISTANCE);
  if (maxEntryMark <= 7.01) return 30;
  if (maxEntryMark <= 10.01) return 25;
  if (maxEntryMark <= 20.01) return 18;
  return 12;
}

function minimumOtmDistance(
  maxEntryMark: number,
  replayPreference?: SpxReplayContractPreference | null,
): number {
  const preferred = preferredOtmDistance(maxEntryMark, replayPreference);
  if (replayPreference?.confidence === "high") return Math.max(8, preferred * 0.55);
  if (maxEntryMark <= 10.01) return 15;
  if (maxEntryMark <= 20.01) return 10;
  return 5;
}

function distanceFromBand(value: number, band: { low: number; high: number }): number {
  if (value < band.low) return band.low - value;
  if (value > band.high) return value - band.high;
  return 0;
}

function replaySelectionReasons(replayPreference?: SpxReplayContractPreference | null): string[] {
  if (!replayPreference) return [];
  if (replayPreference.confidence !== "high") {
    return replayPreference.confidence && replayPreference.confidence !== "learning"
      ? ["Replay learning is advisory until it reaches high confidence"]
      : [];
  }
  const reasons: string[] = [];
  if (replayPreference.entryDebitBand) {
    reasons.push(
      `Self-learning favors entry debit around $${replayPreference.entryDebitBand.low.toFixed(2)}-$${replayPreference.entryDebitBand.high.toFixed(2)}`,
    );
  }
  if (typeof replayPreference.preferredStrikeDistance === "number" && Number.isFinite(replayPreference.preferredStrikeDistance)) {
    reasons.push(`Self-learning favors about ${Math.round(replayPreference.preferredStrikeDistance)} SPX points OTM`);
  }
  if (replayPreference.confidence) {
    reasons.push(`Self-learning confidence is ${replayPreference.confidence}`);
  }
  return reasons;
}

function highConfidenceReplayPreference(
  replayPreference?: SpxReplayContractPreference | null,
): SpxReplayContractPreference | null {
  return replayPreference?.confidence === "high" ? replayPreference : null;
}

function isOtmAtEntry(side: "CALL" | "PUT", strike: number, entryUnderlying: number): boolean {
  return side === "CALL" ? strike > entryUnderlying : strike < entryUnderlying;
}

type SpxBasisSource = "live_pair" | "chain_atm" | "unavailable";

function spxBasisFromSnapshot(
  snap: SPXSnapshot,
  chain: SpxProjectionChainInput,
): { basis: number; source: SpxBasisSource } {
  const meta = snap._meta;
  if (isFiniteNumber(meta?.computedOffset)) {
    return { basis: meta!.computedOffset!, source: "live_pair" };
  }
  if (isFiniteNumber(meta?.spxSpot) && isFiniteNumber(meta?.esSpot)) {
    return { basis: meta!.spxSpot! - meta!.esSpot!, source: "live_pair" };
  }
  if (isFiniteNumber(chain.atm) && isFiniteNumber(snap.price.last)) {
    return { basis: chain.atm! - snap.price.last, source: "chain_atm" };
  }
  return { basis: 0, source: "unavailable" };
}

function spxSpotFromSnapshot(
  snap: SPXSnapshot,
  basis: number,
  chain: SpxProjectionChainInput,
): number {
  if (isFiniteNumber(chain.atm)) return chain.atm;
  return isFiniteNumber(snap._meta?.spxSpot) ? snap._meta!.spxSpot! : basis;
}

function withSpxBasisNote(projection: ContractProjection, minutesToEntry: number, debitLimit: number): ContractProjection {
  const hours = Math.max(0, minutesToEntry) / 60;
  const timeLabel = hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.max(0, minutesToEntry).toFixed(0)}m`;
  return {
    ...projection,
    modelNote: `ES is translated into SPX before pricing. Entry debit is projected for the next 9:00 AM CT window (${timeLabel} forward), filtered by the selected debit limit of $${debitLimit.toFixed(2)}, and shown as a planning range.`,
  };
}

function withZoneNote(
  projection: ContractProjection,
  action: "Buy bottom" | "Sell top",
  entryLabel: string,
  targetLabel: string,
  minutesToEntry: number,
  debitLimit: number,
): ContractProjection {
  const hours = Math.max(0, minutesToEntry) / 60;
  const timeLabel = hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.max(0, minutesToEntry).toFixed(0)}m`;
  return {
    ...projection,
    modelNote: `${action} ticket: entry is the 9:00 AM ${entryLabel} gate and target is the opposite ${targetLabel} gate. Debit is projected ${timeLabel} forward, filtered by the selected debit limit of $${debitLimit.toFixed(2)}, and ranked near the proper OTM distance for that budget.`,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function minutesUntilNextEsRthEntry(now: Date = new Date()): number {
  const parts = chicagoParts(now);
  const currentWallMinutes = parts.hour * 60 + parts.minute;
  let candidate = { year: parts.year, month: parts.month, day: parts.day };
  const entryWallMinutes = ES_RTH_ENTRY_HOUR_CT * 60 + ES_RTH_ENTRY_MIN_CT;
  if (!isTradingDate(candidate) || currentWallMinutes >= entryWallMinutes) {
    candidate = nextTradingDate(candidate);
  }
  const entryMs = chicagoDateAt(candidate, ES_RTH_ENTRY_HOUR_CT, ES_RTH_ENTRY_MIN_CT).getTime();
  return Math.max(0, Math.ceil((entryMs - now.getTime()) / 60_000));
}

function nextEsRthEntryIso(now: Date = new Date()): string {
  const parts = chicagoParts(now);
  const currentWallMinutes = parts.hour * 60 + parts.minute;
  let candidate = { year: parts.year, month: parts.month, day: parts.day };
  const entryWallMinutes = ES_RTH_ENTRY_HOUR_CT * 60 + ES_RTH_ENTRY_MIN_CT;
  if (!isTradingDate(candidate) || currentWallMinutes >= entryWallMinutes) {
    candidate = nextTradingDate(candidate);
  }
  return chicagoDateAt(candidate, ES_RTH_ENTRY_HOUR_CT, ES_RTH_ENTRY_MIN_CT).toISOString();
}

function targetProjectionIso(minutesToEntry: number, now: Date = new Date()): string {
  return new Date(now.getTime() + Math.max(0, minutesToEntry + 45) * 60_000).toISOString();
}

function chicagoParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
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
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function chicagoDateAt(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
): Date {
  const wallUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const noonGuess = new Date(Date.UTC(date.year, date.month - 1, date.day, 17, 0));
  return new Date(wallUtc - chicagoOffsetMin(noonGuess) * 60_000);
}

function chicagoOffsetMin(d: Date): number {
  const p = chicagoParts(d);
  const wallMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((wallMs - d.getTime()) / 60_000);
}

function nextTradingDate(date: { year: number; month: number; day: number }): {
  year: number;
  month: number;
  day: number;
} {
  const cursor = new Date(Date.UTC(date.year, date.month - 1, date.day, 12, 0));
  for (let i = 0; i < 14; i += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const candidate = {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
    };
    if (isTradingDate(candidate)) return candidate;
  }
  return date;
}

function isTradingDate(date: { year: number; month: number; day: number }): boolean {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day, 12, 0));
  const dow = probe.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !NYSE_HOLIDAYS_2026.has(dateKey(date));
}

function dateKey(date: { year: number; month: number; day: number }): string {
  return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
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
