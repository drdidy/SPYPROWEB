export interface ReplayLikeBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface ReplayPriceLens {
  center: number;
  min: number;
  max: number;
}

export function buildReplayPriceLens(bars: ReplayLikeBar[]): ReplayPriceLens {
  const closes = bars
    .map((bar) => bar.c)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (closes.length === 0) {
    return { center: 0, min: -1, max: 1 };
  }

  const center = quantile(closes, 0.5);
  const middleRange = Math.max(0.01, quantile(closes, 0.9) - quantile(closes, 0.1));
  const instrumentFloor = Math.abs(center) > 2000 ? 55 : 6;
  const radius = Math.max(instrumentFloor, Math.abs(center) * 0.012, middleRange * 2.4);

  return {
    center,
    min: center - radius,
    max: center + radius,
  };
}

export function safeReplayBarRange(
  bar: ReplayLikeBar,
  lens: ReplayPriceLens,
): { low: number; high: number } {
  const body = [bar.o, bar.c].filter((value) => Number.isFinite(value));
  const values = [bar.o, bar.h, bar.l, bar.c].filter(
    (value) => Number.isFinite(value) && value >= lens.min && value <= lens.max,
  );
  const usable = values.length > 0 ? values : body;
  if (usable.length === 0) return { low: lens.center, high: lens.center };

  return {
    low: Math.min(...usable),
    high: Math.max(...usable),
  };
}

export function buildReplayYDomain(
  bars: ReplayLikeBar[],
  lineValues: number[],
): { min: number; max: number; lens: ReplayPriceLens } {
  const lens = buildReplayPriceLens(bars);
  const yPoints: number[] = [];

  for (const bar of bars) {
    const range = safeReplayBarRange(bar, lens);
    yPoints.push(range.low, range.high);
  }

  for (const value of lineValues) {
    if (Number.isFinite(value) && value >= lens.min && value <= lens.max) {
      yPoints.push(value);
    }
  }

  let min = yPoints.length ? Math.min(...yPoints) : lens.min;
  let max = yPoints.length ? Math.max(...yPoints) : lens.max;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = Math.max((max - min) * 0.14, Math.abs(lens.center) > 2000 ? 4 : 0.65);

  return {
    min: min - pad,
    max: max + pad,
    lens,
  };
}

export function lineTouchesSafeBar(
  bar: ReplayLikeBar,
  lineValue: number,
  lens: ReplayPriceLens,
): boolean {
  if (!Number.isFinite(lineValue)) return false;
  const range = safeReplayBarRange(bar, lens);
  return range.low <= lineValue && range.high >= lineValue;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
