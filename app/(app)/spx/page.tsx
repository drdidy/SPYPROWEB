import { permanentRedirect } from "next/navigation";

// v9: /spx → /es. The route was renamed because the engine is
// now consistently labeled "ES" across the user-facing app; the
// /spx URL stays alive as a permanent redirect so any bookmarks,
// shared links, or replay deep links from earlier rounds keep
// working.
//
// `permanentRedirect` (308) preserves the request method and is
// SEO-correct for a route rename. Query parameters are carried
// through so older replay/channel deep links do not lose their
// timestamp, session, event, or overlay context.

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default function Page({ searchParams }: PageProps) {
  const qs = buildQueryString(searchParams);
  permanentRedirect(`/es${qs}`);
}

function buildQueryString(
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  if (!searchParams) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!isSafeQueryKey(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) appendSafeValue(params, key, item);
    } else {
      appendSafeValue(params, key, value);
    }
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function appendSafeValue(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  if (typeof value !== "string" || value.length === 0 || value.length > 160) return;
  params.append(key, value);
}

function isSafeQueryKey(key: string): boolean {
  return /^[a-zA-Z0-9_-]{1,48}$/.test(key);
}
