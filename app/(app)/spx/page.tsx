import { permanentRedirect } from "next/navigation";

// v9: /spx → /es. The route was renamed because the engine is
// now consistently labeled "ES" across the user-facing app; the
// /spx URL stays alive as a permanent redirect so any bookmarks,
// shared links, or replay deep links from earlier rounds keep
// working.
//
// `permanentRedirect` (308) preserves the request method and is
// SEO-correct for a route rename. The `?date=` query string is
// carried through to the new URL.

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: { date?: string };
}

export default function Page({ searchParams }: PageProps) {
  const qs =
    searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? `?date=${searchParams.date}`
      : "";
  permanentRedirect(`/es${qs}`);
}
