import { BiasMeter } from "@/components/dashboard/BiasMeter";
import type { BiasState } from "@/lib/types";

export function PreOpenBias({ state }: { state: BiasState }) {
  return <BiasMeter state={state} />;
}
