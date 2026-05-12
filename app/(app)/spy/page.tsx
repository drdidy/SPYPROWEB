import { ChannelShell } from "@/components/channel/ChannelShell";
import { enrichSpySnapshotWithOptions } from "@/lib/channel/options";
import { loadOptionsIntelBundle } from "@/lib/options-intel-fetch";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const [{ data: baseSnap, source, error }, options] = await Promise.all([
    loadLiveSnapshot(),
    loadOptionsIntelBundle(["SPY", "SPX"]),
  ]);
  const snap = enrichSpySnapshotWithOptions(baseSnap, options.data);

  return <ChannelShell engine="spy" data={{ snap, source, error }} />;
}
