import { SignalTape as ExistingSignalTape } from "@/components/dashboard/SignalTape";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";

export function SignalTape({
  ticks,
}: {
  ticks: AdaptedSnapshot["signalTicks"];
}) {
  return (
    <ExistingSignalTape
      ticks={ticks}
      healthAction={<PanelHeartbeat feedId="signal-tape" />}
    />
  );
}
