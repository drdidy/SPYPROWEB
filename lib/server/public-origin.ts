const PRODUCTION_ORIGIN = "https://www.spyprophet.app";

export function resolvePublicOrigin(request: Request): string {
  const configured =
    cleanOrigin(process.env.NEXT_PUBLIC_API_BASE) ||
    cleanOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    cleanOrigin(process.env.SITE_URL);
  const url = new URL(request.url);
  const host = url.host.toLowerCase();

  if (host.endsWith(".vercel.app") && !host.startsWith("localhost")) {
    return configured || PRODUCTION_ORIGIN;
  }

  return url.origin;
}

function cleanOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    return null;
  }
}
