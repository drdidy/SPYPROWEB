const CT_TIME_ZONE = "America/Chicago";

export function formatSessionTime(
  input: string | number | Date | null | undefined,
  options: { seconds?: boolean; fallback?: string } = {},
): string {
  const fallback = options.fallback ?? "--:-- CT";
  const date = coerceDate(input);
  if (!date) return fallback;

  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: CT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: options.seconds ? "2-digit" : undefined,
    hour12: false,
  }).format(date)} CT`;
}

export function formatSessionDate(
  input: string | number | Date | null | undefined,
  options: { fallback?: string } = {},
): string {
  const fallback = options.fallback ?? "SESSION DATE";
  const date = coerceDate(input);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT_TIME_ZONE,
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function coerceDate(input: string | number | Date | null | undefined): Date | null {
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input : null;
  }
  if (typeof input === "number") {
    const date = new Date(input);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof input === "string") {
    const ms = Date.parse(input);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  return null;
}
