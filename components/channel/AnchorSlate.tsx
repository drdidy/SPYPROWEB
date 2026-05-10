import { SPYChannelHero } from "@/components/spy/SPYChannelHero";
import type { Engine } from "@/lib/contracts/channel";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";

export function AnchorSlate({
  engine,
  snap,
}: {
  engine: Engine;
  snap: AdaptedSnapshot;
}) {
  if (engine === "spy") {
    return <SPYChannelHero snap={snap} />;
  }

  return null;
}
