import { TriggerMap as ExistingTriggerMap } from "@/components/dashboard/TriggerMap";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import type { DynamicLine } from "@/lib/types";

export function TriggerMap({
  lines,
  currentPrice,
}: {
  lines: DynamicLine[];
  currentPrice: number;
}) {
  return (
    <ExistingTriggerMap
      lines={lines}
      currentPrice={currentPrice}
      healthAction={<PanelHeartbeat feedId="trigger-lines" />}
    />
  );
}
