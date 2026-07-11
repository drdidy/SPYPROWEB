import { TodayConsole } from "@/components/rebirth/TodayConsole";
import { enrichSpySnapshotWithOptions, toOptionsRaw } from "@/lib/channel/options";
import { loadOptionsIntelBundle } from "@/lib/options-intel-fetch";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { buildSpxContractProjection } from "@/lib/spx-contract-projection";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const [spyLoaded, spxLoaded, optionsLoaded] = await Promise.all([
    loadLiveSnapshot(),
    loadSpxSnapshot(),
    loadOptionsIntelBundle(["SPY", "SPX"]),
  ]);

  const spy = enrichSpySnapshotWithOptions(spyLoaded.data, optionsLoaded.data);
  const spx = spxLoaded.snap;
  const chain = toOptionsRaw(optionsLoaded.data.symbols.SPX?.chain);
  const projection =
    spxLoaded.source === "live" && optionsLoaded.source === "live"
      ? buildSpxContractProjection({ snap: spx, chain })
      : null;

  return (
    <TodayConsole
      spy={spy}
      spx={spx}
      spySource={spyLoaded.source}
      spxSource={spxLoaded.source}
      projection={projection}
      optionsSource={optionsLoaded.source}
    />
  );
}
