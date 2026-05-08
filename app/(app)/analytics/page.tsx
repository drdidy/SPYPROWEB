import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const armed = snap.lines.filter((l) => l.isPrimary).length;
  const total = snap.lines.length;
  const sigCount = snap.signalTicks.length;

  return (
    <div className="max-w-[1100px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Journal · 13"
        title="Analytics"
        lede="Performance under discipline. Today's session at a glance; historical aggregates arrive next."
        source={source}
      />
      <SectionLabel number="01">Today</SectionLabel>
      <div className="grid grid-cols-12 gap-4">
        <Tile label="Signals printed" value={`${sigCount}`} />
        <Tile label="Lines armed" value={`${armed} / ${total}`} />
        <Tile
          label="Bias strength"
          value={`${snap.bias.strengthScore}/100`}
        />
        <Tile
          label="Conviction"
          value={`${snap.decision.conviction}/100`}
        />
      </div>

      <SectionLabel number="02">Historical</SectionLabel>
      <Card>
        <CardBody>
          <div className="font-serif text-headline text-ink-3 italic font-light">
            Historical analytics coming soon.
          </div>
          <p className="mt-3 text-[13px] text-ink-3 leading-relaxed max-w-md">
            Win rate by setup, expected R per signal, equity under discipline
            against actual P&amp;L — all available once the journal storage
            layer lands.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-span-6 md:col-span-3">
      <Card>
        <CardHeader eyebrow={label} title="" />
        <CardBody>
          <div
            className="font-mono text-2xl font-semibold tabular-nums text-ink"
            data-num
          >
            {value}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
