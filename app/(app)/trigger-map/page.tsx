import { TriggerMap } from "@/components/dashboard/TriggerMap";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  return (
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Workspace · 02"
        title="Trigger Map"
        lede="Every line in play, ranked by how close price is to it. The closest lines arm; the rest stay on watch."
        source={source}
      />
      <SectionLabel number="01">Levels</SectionLabel>
      <TriggerMap lines={snap.lines} />
    </div>
  );
}
