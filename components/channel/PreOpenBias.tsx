import { BiasMeter } from "@/components/dashboard/BiasMeter";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import type { BiasState } from "@/lib/types";

export function PreOpenBias({ state }: { state: BiasState }) {
  return (
    <BiasMeter
      state={state}
      healthAction={<PanelHeartbeat feedId="pre-open-bias" />}
    />
  );
}
