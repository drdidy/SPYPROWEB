import { buildHistoricalOptionScout, type HistoricalScoutSession } from "@/lib/options/historical-scout";
import { fetchMassiveOptionCandles } from "@/lib/options/massive-history";
import { fetchTastytradeOptionCandles, type TastytradeOptionCandle } from "@/lib/options/tastytrade-history";
import { normalizeEntryDebitCeiling } from "@/lib/spx-contract-projection";
import type { SPXSnapshot } from "@/lib/types";

type IntradayBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
};

type IntradayResponse = {
  es?: IntradayBar[];
};

type OptionSide = "CALL" | "PUT";

export type OptionReplayContractAssessment = {
  date: string;
  side: OptionSide;
  room: string;
  entryLine: string;
  targetLine: string;
  entryTime: string;
  targetTime: string | null;
  strike: number;
  strikeDistance: number;
  entryMark: number;
  targetMark: number | null;
  maxMark: number;
  maxGain: number;
  maxGainPct: number;
  drawdown: number;
  drawdownPct: number;
  targetGain: number | null;
  targetGainPct: number | null;
  candleCount: number;
  emaState: "confirmed" | "late" | "not_confirmed";
  emaConfirmTime: string | null;
  fiveMinuteState: "above_200" | "testing_200" | "below_200" | "insufficient";
  fiveMinuteSma200: number | null;
  score: number;
  grade: "A" | "B" | "C" | "Review";
};

export type OptionReplaySessionAssessment = {
  date: string;
  verdict: HistoricalScoutSession["verdict"];
  room: string;
  side: OptionSide | null;
  entryLine: string | null;
  targetLine: string | null;
  entryTime: string | null;
  targetTime: string | null;
  spxEntry: number | null;
  spxTarget: number | null;
  candidatesReviewed: number;
  best: OptionReplayContractAssessment | null;
  note: string;
};

export type OptionReplayIntelligenceSnapshot = {
  ok: boolean;
  asOf: string;
  lookback: number;
  budget: number;
  sessions: OptionReplaySessionAssessment[];
  summary: {
    reviewed: number;
    qualified: number;
    averageEntryMark: number | null;
    averageTargetGainPct: number | null;
    averageMaxGainPct: number | null;
    averageDrawdownPct: number | null;
    preferredStrikeDistance: number | null;
    bestEntryBand: { low: number; high: number } | null;
    confirmationRate: number | null;
    agentRead: string;
  };
};

const CT_ZONE = "America/Chicago";
const STRIKE_STEP = 5;
const MAX_STRIKE_DISTANCE = 80;
const DEFAULT_LOOKBACK = 3;

export async function buildOptionReplayIntelligence({
  origin,
  lookback = DEFAULT_LOOKBACK,
  budget = 10,
}: {
  origin: string;
  lookback?: number;
  budget?: number;
}): Promise<OptionReplayIntelligenceSnapshot> {
  const normalizedLookback = Number.isFinite(lookback) ? Math.min(5, Math.max(2, Math.round(lookback))) : DEFAULT_LOOKBACK;
  const normalizedBudget = normalizeEntryDebitCeiling(budget);
  const scout = await buildHistoricalOptionScout({ origin, lookback: normalizedLookback });
  const sessions = await Promise.all(
    scout.sessions.map((session) =>
      assessSession({ origin, session, budget: normalizedBudget }).catch(() => incompleteSession(session)),
    ),
  );
  const qualified = sessions
    .map((session) => session.best)
    .filter((item): item is OptionReplayContractAssessment => item !== null);

  return {
    ok: qualified.length > 0,
    asOf: new Date().toISOString(),
    lookback: normalizedLookback,
    budget: normalizedBudget,
    sessions,
    summary: summarizeAssessments(qualified),
  };
}

async function assessSession({
  origin,
  session,
  budget,
}: {
  origin: string;
  session: HistoricalScoutSession;
  budget: number;
}): Promise<OptionReplaySessionAssessment> {
  if (
    !session.entryTime ||
    session.entryValue === null ||
    session.targetValue === null ||
    !session.entryLine ||
    !session.targetLine
  ) {
    return incompleteSession(session);
  }
  const side = sideFromVerdict(session.verdict);
  if (!side) return incompleteSession(session);

  const [snap, intraday] = await Promise.all([
    fetchJson<SPXSnapshot>(`${origin}/api/spx/snapshot?date=${session.date}`),
    fetchJson<IntradayResponse>(`${origin}/api/replay/intraday?date=${session.date}`),
  ]);
  const basis = spxBasis(snap);
  const spxEntry = session.entryValue + basis;
  const spxTarget = session.targetValue + basis;
  const targetTime = targetTimeForSession(intraday.es ?? [], session, side);
  const strikes = candidateStrikes(side, spxEntry);
  const from = chicagoDateAt(session.date, 8, 30);
  const to = chicagoDateAt(session.date, 15, 0);

  const candidates = (
    await Promise.all(
      strikes.map((strike) =>
        assessContract({
          date: session.date,
          side,
          room: session.room,
          entryLine: session.entryLine!,
          targetLine: session.targetLine!,
          entryTime: session.entryTime!,
          targetTime,
          strike,
          spxEntry,
          from,
          to,
        }).catch(() => null),
      ),
    )
  ).filter((item): item is OptionReplayContractAssessment => item !== null);

  const affordable = candidates.filter((item) => item.entryMark <= budget);
  const best = affordable.sort((a, b) => b.score - a.score)[0] ?? null;
  const bestWithBaseline = best ? await attachFiveMinuteBaseline(best).catch(() => best) : null;
  const overBudgetBest = candidates.sort((a, b) => b.score - a.score)[0] ?? null;

  return {
    date: session.date,
    verdict: session.verdict,
    room: session.room,
    side,
    entryLine: session.entryLine,
    targetLine: session.targetLine,
    entryTime: session.entryTime,
    targetTime,
    spxEntry: roundMoney(spxEntry),
    spxTarget: roundMoney(spxTarget),
    candidatesReviewed: candidates.length,
    best: bestWithBaseline,
    note: bestWithBaseline
      ? `${side === "CALL" ? "Call" : "Put"} contract behavior was strongest around ${formatStrikeDistance(bestWithBaseline.strikeDistance)} from the SPX entry.`
      : overBudgetBest
        ? `The cleanest replayed contract opened near $${overBudgetBest.entryMark.toFixed(2)}, above the selected debit limit. The agent is not using it for this budget.`
        : "No usable historical premium candles were found for the candidate contracts inside this debit limit.",
  };
}

async function assessContract({
  date,
  side,
  room,
  entryLine,
  targetLine,
  entryTime,
  targetTime,
  strike,
  spxEntry,
  from,
  to,
}: {
  date: string;
  side: OptionSide;
  room: string;
  entryLine: string;
  targetLine: string;
  entryTime: string;
  targetTime: string | null;
  strike: number;
  spxEntry: number;
  from: Date;
  to: Date;
}): Promise<OptionReplayContractAssessment | null> {
  const candles = (await fetchHistoricalOptionCandles({
    underlying: "SPX",
    expiration: date,
    strike,
    side,
    from,
    to,
    period: "m",
  })).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (candles.length < 8) return null;

  const entryIndex = firstIndexAtOrAfter(candles, entryTime);
  if (entryIndex === -1) return null;
  const entry = candles[entryIndex];
  const targetIndex = targetTime ? firstIndexAtOrAfter(candles, targetTime) : -1;
  const exitIndex = targetIndex >= 0 ? targetIndex : candles.length - 1;
  const forward = candles.slice(entryIndex, Math.max(entryIndex + 1, exitIndex + 1));
  if (!forward.length) return null;

  const entryMark = entry.open || entry.close;
  const targetMark = targetIndex >= 0 ? candles[targetIndex].close : null;
  const maxMark = Math.max(...forward.map((candle) => candle.high));
  const minMark = Math.min(...forward.map((candle) => candle.low));
  const maxGain = maxMark - entryMark;
  const drawdown = Math.max(0, entryMark - minMark);
  const targetGain = targetMark !== null ? targetMark - entryMark : null;
  const ema = emaConfirmation(candles, entryIndex);
  const base: OptionReplayContractAssessment = {
    date,
    side,
    room,
    entryLine,
    targetLine,
    entryTime,
    targetTime,
    strike,
    strikeDistance: Math.abs(strike - spxEntry),
    entryMark: roundMoney(entryMark),
    targetMark: targetMark !== null ? roundMoney(targetMark) : null,
    maxMark: roundMoney(maxMark),
    maxGain: roundMoney(maxGain),
    maxGainPct: pct(maxGain, entryMark),
    drawdown: roundMoney(drawdown),
    drawdownPct: pct(drawdown, entryMark),
    targetGain: targetGain !== null ? roundMoney(targetGain) : null,
    targetGainPct: targetGain !== null ? pct(targetGain, entryMark) : null,
    candleCount: candles.length,
    emaState: ema.state,
    emaConfirmTime: ema.time,
    fiveMinuteState: "insufficient",
    fiveMinuteSma200: null,
    score: 0,
    grade: "Review",
  };
  return gradeAssessment({ ...base, score: scoreAssessment(base) });
}

async function attachFiveMinuteBaseline(
  assessment: OptionReplayContractAssessment,
): Promise<OptionReplayContractAssessment> {
  const from = new Date(chicagoDateAt(assessment.date, 8, 30));
  from.setUTCDate(from.getUTCDate() - 14);
  const to = chicagoDateAt(assessment.date, 15, 0);
  const bars = (await fetchHistoricalOptionCandles({
    underlying: "SPX",
    expiration: assessment.date,
    strike: assessment.strike,
    side: assessment.side,
    from,
    to,
    period: "5m",
  })).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const entryIndex = lastIndexAtOrBefore(bars, assessment.entryTime);
  if (entryIndex < 0) return assessment;
  const previous = bars.slice(0, entryIndex + 1);
  if (previous.length < 200) return assessment;
  const sma200 = average(previous.slice(-200).map((bar) => bar.close));
  const entryBar = bars[entryIndex];
  const fiveMinuteState: OptionReplayContractAssessment["fiveMinuteState"] =
    entryBar.low <= sma200 && entryBar.high >= sma200
      ? "testing_200"
      : entryBar.close >= sma200
        ? "above_200"
        : "below_200";
  const next = {
    ...assessment,
    fiveMinuteState,
    fiveMinuteSma200: roundMoney(sma200),
  };
  return gradeAssessment({ ...next, score: scoreAssessment(next) });
}

async function fetchHistoricalOptionCandles(input: {
  underlying: "SPX";
  expiration: string;
  strike: number;
  side: OptionSide;
  from: Date;
  to: Date;
  period: "m" | "5m";
}): Promise<TastytradeOptionCandle[]> {
  const massive = await fetchMassiveOptionCandles(input);
  if (massive.ok && massive.candles.length) return massive.candles;

  const tasty = await fetchTastytradeOptionCandles(input);
  if (tasty.ok && tasty.candles.length) return tasty.candles;

  return [];
}

function scoreAssessment(input: OptionReplayContractAssessment): number {
  const targetScore = Math.max(0, input.targetGainPct ?? input.maxGainPct) * 1.4;
  const drawdownPenalty = Math.max(0, input.drawdownPct) * 0.8;
  const confirmationBonus = input.emaState === "confirmed" ? 18 : input.emaState === "late" ? 7 : 0;
  const baselineBonus = input.fiveMinuteState === "above_200" || input.fiveMinuteState === "testing_200" ? 8 : 0;
  const liquidityBonus = Math.min(12, input.candleCount / 8);
  return Math.round((targetScore - drawdownPenalty + confirmationBonus + baselineBonus + liquidityBonus) * 10) / 10;
}

function gradeAssessment(input: OptionReplayContractAssessment): OptionReplayContractAssessment {
  const grade =
    input.score >= 95 && input.drawdownPct <= 35
      ? "A"
      : input.score >= 55 && input.drawdownPct <= 55
        ? "B"
        : input.score >= 25
          ? "C"
          : "Review";
  return { ...input, grade };
}

function summarizeAssessments(items: OptionReplayContractAssessment[]): OptionReplayIntelligenceSnapshot["summary"] {
  if (!items.length) {
    return {
      reviewed: 0,
      qualified: 0,
      averageEntryMark: null,
      averageTargetGainPct: null,
      averageMaxGainPct: null,
      averageDrawdownPct: null,
      preferredStrikeDistance: null,
      bestEntryBand: null,
      confirmationRate: null,
      agentRead: "The premium analyzer needs more historical samples before it can improve the option ticket read.",
    };
  }
  const entryMarks = items.map((item) => item.entryMark).sort((a, b) => a - b);
  const confirmed = items.filter((item) => item.emaState === "confirmed").length;
  const preferredStrikeDistance = average(items.map((item) => item.strikeDistance));
  const averageTargetGainPct = average(
    items.map((item) => item.targetGainPct ?? item.maxGainPct).filter(Number.isFinite),
  );
  const averageMaxGainPct = average(items.map((item) => item.maxGainPct));
  const averageDrawdownPct = average(items.map((item) => item.drawdownPct));
  const low = percentile(entryMarks, 0.25);
  const high = percentile(entryMarks, 0.75);

  return {
    reviewed: items.length,
    qualified: items.filter((item) => item.grade === "A" || item.grade === "B").length,
    averageEntryMark: roundMoney(average(entryMarks)),
    averageTargetGainPct: roundPct(averageTargetGainPct),
    averageMaxGainPct: roundPct(averageMaxGainPct),
    averageDrawdownPct: roundPct(averageDrawdownPct),
    preferredStrikeDistance: roundMoney(preferredStrikeDistance),
    bestEntryBand: low !== null && high !== null ? { low: roundMoney(low), high: roundMoney(high) } : null,
    confirmationRate: Math.round((confirmed / items.length) * 100),
    agentRead: agentRead({
      qualified: items.filter((item) => item.grade === "A" || item.grade === "B").length,
      reviewed: items.length,
      averageTargetGainPct,
      averageDrawdownPct,
      preferredStrikeDistance,
      low,
      high,
    }),
  };
}

function agentRead(input: {
  qualified: number;
  reviewed: number;
  averageTargetGainPct: number;
  averageDrawdownPct: number;
  preferredStrikeDistance: number;
  low: number | null;
  high: number | null;
}): string {
  if (input.reviewed === 0) return "No premium sample is ready yet.";
  const band = input.low !== null && input.high !== null
    ? `$${roundMoney(input.low).toFixed(2)} to $${roundMoney(input.high).toFixed(2)}`
    : "the observed debit band";
  if (input.qualified / input.reviewed >= 0.67 && input.averageTargetGainPct > input.averageDrawdownPct) {
    return `Recent winners clustered near ${formatStrikeDistance(input.preferredStrikeDistance)} OTM, with entries around ${band}. Favor that debit zone when the next Control Map entry appears.`;
  }
  return `Recent premium behavior was mixed. Keep the ticket smaller, require option momentum confirmation, and avoid entries outside ${band}.`;
}

function sideFromVerdict(verdict: HistoricalScoutSession["verdict"]): OptionSide | null {
  if (verdict === "CALL_EDGE") return "CALL";
  if (verdict === "PUT_EDGE") return "PUT";
  return null;
}

function targetTimeForSession(
  bars: IntradayBar[],
  session: HistoricalScoutSession,
  side: OptionSide,
): string | null {
  if (!session.entryTime || !session.targetValue) return null;
  const entryMs = Date.parse(session.entryTime);
  const forward = bars.filter((bar) => Date.parse(bar.t) >= entryMs);
  const hit = forward.find((bar) =>
    side === "CALL" ? bar.h >= session.targetValue! : bar.l <= session.targetValue!,
  );
  return hit?.t ?? null;
}

function candidateStrikes(side: OptionSide, spxEntry: number): number[] {
  let strike = side === "CALL"
    ? Math.ceil(spxEntry / STRIKE_STEP) * STRIKE_STEP
    : Math.floor(spxEntry / STRIKE_STEP) * STRIKE_STEP;
  if (side === "CALL" && strike <= spxEntry) strike += STRIKE_STEP;
  if (side === "PUT" && strike >= spxEntry) strike -= STRIKE_STEP;
  const out: number[] = [];
  for (let distance = 0; distance <= MAX_STRIKE_DISTANCE; distance += STRIKE_STEP) {
    out.push(side === "CALL" ? strike + distance : strike - distance);
  }
  return out;
}

function emaConfirmation(candles: Array<{ ts: string; close: number }>, entryIndex: number): {
  state: OptionReplayContractAssessment["emaState"];
  time: string | null;
} {
  const closes = candles.map((candle) => candle.close);
  const ema8 = emaSeries(closes, 8);
  const ema21 = emaSeries(closes, 21);
  if (ema8[entryIndex] !== undefined && ema21[entryIndex] !== undefined && ema8[entryIndex] >= ema21[entryIndex]) {
    return { state: "confirmed", time: candles[entryIndex].ts };
  }
  for (let index = Math.max(1, entryIndex + 1); index < candles.length; index += 1) {
    if (
      ema8[index - 1] !== undefined &&
      ema21[index - 1] !== undefined &&
      ema8[index] !== undefined &&
      ema21[index] !== undefined &&
      ema8[index - 1] <= ema21[index - 1] &&
      ema8[index] > ema21[index]
    ) {
      return {
        state: index - entryIndex <= 10 ? "confirmed" : "late",
        time: candles[index].ts,
      };
    }
  }
  return { state: "not_confirmed", time: null };
}

function spxBasis(snap: SPXSnapshot): number {
  const meta = snap._meta;
  if (isFiniteNumber(meta?.computedOffset)) return meta!.computedOffset!;
  if (isFiniteNumber(meta?.spxSpot) && isFiniteNumber(meta?.esSpot)) return meta!.spxSpot! - meta!.esSpot!;
  return 0;
}

function firstIndexAtOrAfter(candles: Array<{ ts: string }>, iso: string): number {
  const ms = Date.parse(iso);
  return candles.findIndex((candle) => Date.parse(candle.ts) >= ms);
}

function lastIndexAtOrBefore(candles: Array<{ ts: string }>, iso: string): number {
  const ms = Date.parse(iso);
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (Date.parse(candles[index].ts) <= ms) return index;
  }
  return -1;
}

function chicagoDateAt(dateISO: string, hour: number, minute: number): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute);
  const noonGuess = new Date(Date.UTC(year, month - 1, day, 17, 0));
  return new Date(wallUtc - chicagoOffsetMin(noonGuess) * 60_000);
}

function chicagoOffsetMin(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wallMs - date.getTime()) / 60_000);
}

function incompleteSession(session: HistoricalScoutSession): OptionReplaySessionAssessment {
  return {
    date: session.date,
    verdict: session.verdict,
    room: session.room,
    side: sideFromVerdict(session.verdict),
    entryLine: session.entryLine,
    targetLine: session.targetLine,
    entryTime: session.entryTime,
    targetTime: null,
    spxEntry: null,
    spxTarget: null,
    candidatesReviewed: 0,
    best: null,
    note: "The premium analyzer could not grade premium behavior for this session.",
  };
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

function emaSeries(values: number[], length: number): number[] {
  if (values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: number[] = [];
  for (const value of values) {
    const previous = out.at(-1);
    out.push(previous === undefined ? value : value * alpha + previous * (1 - alpha));
  }
  return out;
}

function average(values: number[]): number {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function percentile(values: number[], point: number): number | null {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * point)));
  return values[index];
}

function pct(value: number, basis: number): number {
  return basis > 0 ? roundPct((value / basis) * 100) : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatStrikeDistance(value: number): string {
  return `${Math.round(value)} points`;
}
