import { RiskGuardrails as ExistingRiskGuardrails } from "@/components/dashboard/RiskGuardrails";
import type { RiskGuardrailState } from "@/lib/types";

export function RiskGuardrails({ state }: { state: RiskGuardrailState }) {
  return <ExistingRiskGuardrails state={state} />;
}
