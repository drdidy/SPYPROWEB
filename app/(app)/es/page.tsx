import { SPXChannelClient } from "@/components/spx/SPXChannelClient";

// v9: ES Channel page (renamed from /spx). The user-visible name
// for this engine is now "ES" everywhere except inside the
// Options Cockpit and 0DTE contract surfaces, which still trade
// real SPX option contracts.
//
// The wire identifier (`SPX`), the API URL (`/api/spx/snapshot`),
// the file paths (`components/spx/*`, `lib/spx-fetch.ts`), and
// the underlying Python engine all keep their SPX naming —
// they're internal implementation details. Only the route URL,
// nav labels, and rendered copy on this page changed.
//
// Why the data fetch lives in <SPXChannelClient />:
//   The previous server-side path silently fell back to the mock
//   fixture (5872.00 / TAKE / ASCENDING) whenever the server-to-
//   server fetch couldn't reach /api/spx/snapshot — most
//   commonly because Vercel preview deployments enforce
//   Deployment Protection on the public URL, and the in-function
//   fetch returned 401 without the user's bypass cookie. Moving
//   the fetch to the browser uses the same auth cookie path as
//   /replay; the symptom can't recur.

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams?: { date?: string };
}

export default function Page({ searchParams }: PageProps) {
  const replayDate =
    searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : undefined;
  return <SPXChannelClient replayDate={replayDate} />;
}
