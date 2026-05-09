import { SPXChannelClient } from "@/components/spx/SPXChannelClient";

// v6 follow-up: this route's data fetch is now done from the
// browser by <SPXChannelClient />, not from the Server Component.
//
// Why the change:
//   The previous implementation called loadSnapshot() server-side
//   and silently fell back to the mock fixture (5872.00 / TAKE /
//   ASCENDING) whenever the server-to-server fetch couldn't reach
//   /api/spx/snapshot. The most common cause was Vercel preview
//   deployments enforcing Deployment Protection on the public URL
//   — the in-function fetch returned 401 without the user's
//   bypass cookie, and the page rendered the mock as if it were
//   live data. /replay fetches client-side and worked fine, which
//   is why the user kept seeing "real data on Replay, mock on the
//   SPX Channel tab".
//
//   Moving the fetch to the browser uses the same auth cookie
//   path as /replay; the symptom can't recur.
//
// `force-dynamic` no longer matters — the page is now mostly
// a static shell — but kept so the searchParams thread-through
// works as expected on every nav.

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
