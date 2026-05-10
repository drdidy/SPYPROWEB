import { SignalTape as ExistingSignalTape } from "@/components/dashboard/SignalTape";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";

export function SignalTape({
  ticks,
}: {
  ticks: AdaptedSnapshot["signalTicks"];
}) {
  return <ExistingSignalTape ticks={ticks} />;
}
