import { SignalTape } from "@/components/dashboard/SignalTape";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  return (
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Execution · 05"
        title="Signal Tape"
        lede="Every event as it crosses the wire. Reasoning attached to each one."
        source={source}
      />
      <SectionLabel number="01">Today's prints</SectionLabel>
      <SignalTape ticks={snap.signalTicks} />
    </div>
  );
}
