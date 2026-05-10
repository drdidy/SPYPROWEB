import { TriggerMap as ExistingTriggerMap } from "@/components/dashboard/TriggerMap";
import type { DynamicLine } from "@/lib/types";

export function TriggerMap({ lines }: { lines: DynamicLine[] }) {
  return <ExistingTriggerMap lines={lines} />;
}
