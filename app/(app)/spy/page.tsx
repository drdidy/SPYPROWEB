import { ChannelShell } from "@/components/channel/ChannelShell";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source, error } = await loadLiveSnapshot();

  return <ChannelShell engine="spy" data={{ snap, source, error }} />;
}
