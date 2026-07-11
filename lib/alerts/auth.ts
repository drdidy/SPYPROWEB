export function hasAlertSecret(): boolean {
  return alertSecrets().length > 0;
}

export function isAlertRequestAuthorized(request: Request): boolean {
  const url = new URL(request.url);
  const provided =
    bearerToken(request.headers.get("authorization")) ||
    request.headers.get("x-spyprophet-secret") ||
    request.headers.get("x-alert-secret") ||
    url.searchParams.get("secret") ||
    url.searchParams.get("token");
  const allowed = alertSecrets();

  if (allowed.length === 0) return false;
  return Boolean(provided?.trim() && allowed.includes(provided.trim()));
}

function alertSecrets(): string[] {
  return [
    process.env.SPYPROPHET_TRADINGVIEW_WEBHOOK_SECRET,
    process.env.ALERT_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function bearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
