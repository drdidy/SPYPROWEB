export const OPTION_TAPE_REGISTRY_KEY = "spyprophet.optionTape.registry.v1";
export const OPTION_MEMORY_KEY = "spyprophet.optionReplayMemory.v1";
export const OPTION_TAPE_PREFIX = "spyprophet.optionTape.v1.";

export interface OptionTapeTick {
  ts: string;
  contractLabel: string;
  symbol: string;
  streamerSymbol?: string | null;
  side: "CALL" | "PUT";
  strike: number;
  expiration: string | null;
  bid: number | null;
  ask: number | null;
  mark: number;
  role?:
    | "buy-bottom"
    | "sell-top"
    | "primary"
    | "alternate"
    | "manual"
    | "control-active"
    | "control-buy-support"
    | "control-sell-resistance";
  entryUnderlying: number | null;
  projectedEntryMark: number | null;
  projectedEntryAt?: string | null;
  targetUnderlying?: number | null;
  projectedTargetMark?: number | null;
  source?: "schwab_chain" | "tastytrade_backfill" | "manual" | "simulation";
}

export interface OptionReplayEvent {
  id: string;
  ts: string;
  contractLabel: string;
  side: "CALL" | "PUT";
  strike: number;
  expiration: string | null;
  mark: number;
  verdict: OptionMomentumRead["verdict"];
  detail: string;
}

export interface OptionMomentumRead {
  verdict: "building" | "watch" | "confirmed" | "failed";
  label: string;
  detail: string;
  oneMinuteCount: number;
  fiveMinuteCount: number;
  latestMark: number | null;
  sma200: number | null;
  ema8: number | null;
  ema21: number | null;
  aboveFiveMinuteSma: boolean;
  touchedFiveMinuteSma: boolean;
  emaCrossUp: boolean;
}

export interface OptionContractMemoryRead {
  contractLabel: string;
  symbol: string;
  streamerSymbol: string | null;
  side: "CALL" | "PUT";
  strike: number;
  expiration: string | null;
  role: OptionTapeTick["role"];
  tickCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  latestMark: number | null;
  projectedEntryMark: number | null;
  actualEntryMark: number | null;
  projectedTargetMark: number | null;
  maxMarkAfterEntry: number | null;
  maxGainFromEntry: number | null;
  entryError: number | null;
  entryErrorPct: number | null;
  momentum: OptionMomentumRead;
}

interface Bar {
  bucket: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function tapeStorageKey(contractLabel: string): string {
  return `${OPTION_TAPE_PREFIX}${contractLabel.replace(/[^A-Z0-9./_-]+/gi, "_")}`;
}

export function buildOptionMomentumRead(ticks: OptionTapeTick[]): OptionMomentumRead {
  const clean = ticks
    .filter((tick) => Number.isFinite(tick.mark) && tick.mark > 0)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const oneMinuteCount = clean.length;
  const latestMark = clean.at(-1)?.mark ?? null;
  const fiveMinuteBars = toFiveMinuteBars(clean);
  const fiveMinuteCount = fiveMinuteBars.length;
  const closes = fiveMinuteBars.map((bar) => bar.close);
  const sma200 = closes.length >= 200 ? average(closes.slice(-200)) : null;
  const latestFive = fiveMinuteBars.at(-1) ?? null;
  const previousFive = fiveMinuteBars.at(-2) ?? null;
  const aboveFiveMinuteSma = Boolean(sma200 !== null && latestFive && latestFive.close >= sma200);
  const touchedFiveMinuteSma = Boolean(
    sma200 !== null &&
      latestFive &&
      latestFive.low <= sma200 &&
      latestFive.close >= sma200,
  );
  const oneMinuteMarks = clean.map((tick) => tick.mark);
  const ema8Series = emaSeries(oneMinuteMarks, 8);
  const ema21Series = emaSeries(oneMinuteMarks, 21);
  const ema8 = ema8Series.at(-1) ?? null;
  const ema21 = ema21Series.at(-1) ?? null;
  const prevEma8 = ema8Series.at(-2) ?? null;
  const prevEma21 = ema21Series.at(-2) ?? null;
  const emaCrossUp = Boolean(
    ema8 !== null &&
      ema21 !== null &&
      prevEma8 !== null &&
      prevEma21 !== null &&
      prevEma8 <= prevEma21 &&
      ema8 > ema21,
  );

  if (oneMinuteCount < 21) {
    return {
      verdict: "building",
      label: "Building option tape",
      detail: "Premium history is still too thin for a momentum read. Keep the structure ticket visible, but wait for confirmation.",
      oneMinuteCount,
      fiveMinuteCount,
      latestMark,
      sma200,
      ema8,
      ema21,
      aboveFiveMinuteSma,
      touchedFiveMinuteSma,
      emaCrossUp,
    };
  }

  if (fiveMinuteCount < 200) {
    return {
      verdict: "watch",
      label: "Momentum watch",
      detail: "Fast premium momentum can be monitored now, but the full five-minute baseline is unavailable for this exact contract.",
      oneMinuteCount,
      fiveMinuteCount,
      latestMark,
      sma200,
      ema8,
      ema21,
      aboveFiveMinuteSma,
      touchedFiveMinuteSma,
      emaCrossUp,
    };
  }

  if ((aboveFiveMinuteSma || touchedFiveMinuteSma) && emaCrossUp) {
    return {
      verdict: "confirmed",
      label: "Momentum confirmed",
      detail: "Premium respected the five-minute 200 SMA and the one-minute 8 EMA crossed above the 21 EMA.",
      oneMinuteCount,
      fiveMinuteCount,
      latestMark,
      sma200,
      ema8,
      ema21,
      aboveFiveMinuteSma,
      touchedFiveMinuteSma,
      emaCrossUp,
    };
  }

  return {
    verdict: "failed",
    label: "No premium confirmation",
    detail: previousFive && sma200 !== null && previousFive.close >= sma200
      ? "Premium remains above the five-minute 200 SMA, but the one-minute 8/21 trigger has not crossed yet."
      : "Waiting for a clean five-minute 200 SMA support test and one-minute 8/21 cross.",
    oneMinuteCount,
    fiveMinuteCount,
    latestMark,
    sma200,
    ema8,
    ema21,
    aboveFiveMinuteSma,
    touchedFiveMinuteSma,
    emaCrossUp,
  };
}

export function buildOptionContractMemoryRead(ticks: OptionTapeTick[]): OptionContractMemoryRead | null {
  const clean = ticks
    .filter((tick) => Number.isFinite(tick.mark) && tick.mark > 0)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const first = clean[0];
  const latest = clean.at(-1);
  if (!first || !latest) return null;

  const projectedEntryAt = first.projectedEntryAt ? Date.parse(first.projectedEntryAt) : NaN;
  const entryTick = Number.isFinite(projectedEntryAt)
    ? clean.find((tick) => Date.parse(tick.ts) >= projectedEntryAt) ?? latest
    : first;
  const afterEntry = clean.filter((tick) => Date.parse(tick.ts) >= Date.parse(entryTick.ts));
  const maxMarkAfterEntry = afterEntry.length
    ? Math.max(...afterEntry.map((tick) => tick.mark))
    : null;
  const projectedEntryMark = first.projectedEntryMark ?? null;
  const actualEntryMark = entryTick.mark;
  const entryError =
    projectedEntryMark !== null ? roundMetric(actualEntryMark - projectedEntryMark) : null;

  return {
    contractLabel: first.contractLabel,
    symbol: first.symbol,
    streamerSymbol: first.streamerSymbol ?? null,
    side: first.side,
    strike: first.strike,
    expiration: first.expiration,
    role: first.role,
    tickCount: clean.length,
    firstSeen: first.ts,
    lastSeen: latest.ts,
    latestMark: latest.mark,
    projectedEntryMark,
    actualEntryMark,
    projectedTargetMark: first.projectedTargetMark ?? null,
    maxMarkAfterEntry,
    maxGainFromEntry:
      maxMarkAfterEntry !== null ? roundMetric(maxMarkAfterEntry - actualEntryMark) : null,
    entryError,
    entryErrorPct:
      entryError !== null && projectedEntryMark && projectedEntryMark > 0
        ? roundMetric((entryError / projectedEntryMark) * 100)
        : null,
    momentum: buildOptionMomentumRead(clean),
  };
}

export function appendOptionTick(ticks: OptionTapeTick[], tick: OptionTapeTick): OptionTapeTick[] {
  const minute = tick.ts.slice(0, 16);
  const withoutSameMinute = ticks.filter((item) => item.ts.slice(0, 16) !== minute);
  return [...withoutSameMinute, tick]
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(-1400);
}

function toFiveMinuteBars(ticks: OptionTapeTick[]): Bar[] {
  const buckets = new Map<number, Bar>();
  for (const tick of ticks) {
    const ts = Date.parse(tick.ts);
    if (!Number.isFinite(ts)) continue;
    const bucket = Math.floor(ts / 300_000) * 300_000;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, {
        bucket,
        open: tick.mark,
        high: tick.mark,
        low: tick.mark,
        close: tick.mark,
      });
    } else {
      existing.high = Math.max(existing.high, tick.mark);
      existing.low = Math.min(existing.low, tick.mark);
      existing.close = tick.mark;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.bucket - b.bucket);
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
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
