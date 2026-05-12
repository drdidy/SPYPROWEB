export function usableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function nearReferencePrice(
  value: unknown,
  reference: unknown,
  options: { pct?: number; minPoints?: number } = {},
): number | null {
  if (!usableNumber(value) || !usableNumber(reference) || reference <= 0) {
    return null;
  }
  const pct = options.pct ?? 0.12;
  const minPoints = options.minPoints ?? 12;
  const maxDistance = Math.max(Math.abs(reference) * pct, minPoints);
  return Math.abs(value - reference) <= maxDistance ? value : null;
}

export function nearReferencePriceLabel(
  value: unknown,
  reference: unknown,
  options: {
    pct?: number;
    minPoints?: number;
    farLabel?: string;
    emptyLabel?: string;
  } = {},
): string {
  if (!usableNumber(value)) return options.emptyLabel ?? "-";
  const near = nearReferencePrice(value, reference, options);
  if (near === null) return options.farLabel ?? "Data quality hold";
  return near.toFixed(Number.isInteger(near) ? 0 : 2);
}
