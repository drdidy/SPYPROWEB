import { MarketAtlas } from "@/components/rebirth/MarketAtlas";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const [spyLoaded, spxLoaded] = await Promise.all([loadLiveSnapshot(), loadSpxSnapshot()]);
  return <MarketAtlas spy={spyLoaded.data} spx={spxLoaded.snap} spySource={spyLoaded.source} spxSource={spxLoaded.source} />;
}
