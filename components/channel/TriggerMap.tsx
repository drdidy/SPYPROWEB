import { TriggerMap as ExistingTriggerMap } from "@/components/dashboard/TriggerMap";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import type { DynamicLine } from "@/lib/types";

export function TriggerMap({ lines }: { lines: DynamicLine[] }) {
  return (
    <ExistingTriggerMap
      lines={lines}
      healthAction={<PanelHeartbeat feedId="trigger-lines" />}
    />
  );
}
