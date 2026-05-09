// Strict number formatter for slate UI surfaces. v5 fixes a P0 bug
// where the TopBar VIX slot rendered a literal "." (the leading
// character of an unfinished value clipped by overflow). The contract:
//
//   - null / undefined / NaN / non-finite → returns "—"
//   - a finite number                     → returns toFixed(decimals)
//
// The literal string "." can never escape this helper. A separate
// `Skeleton` placeholder is rendered by the consumer when the value
// hasn't loaded yet — formatNumber itself does not know about
// skeletons; it only cares about the data shape.

export function formatNumber(
  value: number | null | undefined,
  decimals: number = 2,
): string {
  if (value == null) return "—";
  if (typeof value !== "number") return "—";
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

/**
 * Loaded predicate used by header quote slots to decide between
 * rendering a value vs. a skeleton bar. A 0.00 value is treated as
 * unloaded for VIX/SPY/SPX where 0 is never a real reading; callers
 * can pass `allowZero: true` for fields where 0 is a legitimate
 * value (e.g. delta).
 */
export function isLoadedNumber(
  value: number | null | undefined,
  allowZero: boolean = false,
): boolean {
  if (value == null) return false;
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value)) return false;
  if (!allowZero && value === 0) return false;
  return true;
}
