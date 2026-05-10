import { RiskGuardrails as ExistingRiskGuardrails } from "@/components/dashboard/RiskGuardrails";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import type { RiskGuardrailState } from "@/lib/types";

export function RiskGuardrails({ state }: { state: RiskGuardrailState }) {
  return (
    <ExistingRiskGuardrails
      state={state}
      healthAction={<PanelHeartbeat feedId="risk-guardrails" />}
    />
  );
}
