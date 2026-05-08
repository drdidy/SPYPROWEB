import { Card, CardBody, CardHeader } from "@/components/ui/Card";
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
        eyebrow="Execution · 07"
        title="Replay Lab"
        lede="Walk back through any past session with today's rules. Coming online soon."
        source={source}
      />
      <SectionLabel number="01">Right now, on the live tape</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Today's session"
          title="What the engine sees"
          meta={`Last ${snap.currentPrice.toFixed(2)} · ${snap.candles.length} bars`}
        />
        <CardBody>
          <p className="text-[14px] text-ink-2 leading-relaxed">
            {snap.decision.finalExplanation || "Engine is initializing."}
          </p>
          <div className="hr-rule my-4" />
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <Stat label="Signals today" value={`${snap.signalTicks.length}`} />
            <Stat label="Lines armed" value={`${snap.lines.filter((l) => l.isPrimary).length}`} />
            <Stat label="Bias" value={snap.bias.bias} />
          </div>
        </CardBody>
      </Card>

      <SectionLabel number="02">Replay engine</SectionLabel>
      <Card>
        <CardBody>
          <div className="font-serif text-headline text-ink-3 italic font-light">
            Historical replay is in development.
          </div>
          <p className="mt-3 text-[13px] text-ink-3 max-w-md leading-relaxed">
            The engine and data layer are live. The session walker, P&amp;L
            ledger under discipline, and side-by-side compare lanes are
            shipping in a follow-up.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="font-mono text-sm font-semibold text-ink mt-0.5 tabular-nums" data-num>
        {value}
      </div>
    </div>
  );
}
