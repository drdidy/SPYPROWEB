import { AnchorSummary } from "@/components/dashboard/AnchorSummary";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const armed = snap.lines.filter((l) => l.isPrimary);
  return (
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Workspace · 03"
        title="Structure Read"
        lede="What's holding, what's not, where buyers and sellers are showing up."
        source={source}
      />
      <SectionLabel number="01">Anchors</SectionLabel>
      <AnchorSummary pivots={snap.pivots} />

      <SectionLabel number="02">Active structure</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Armed lines"
          title={`${armed.length} of ${snap.lines.length} levels armed`}
          meta={`Last ${snap.currentPrice.toFixed(2)}`}
        />
        <CardBody>
          {armed.length === 0 ? (
            <div className="py-6">
              <div className="font-serif text-title text-ink-3 italic">
                No armed lines yet.
              </div>
              <p className="mt-2 text-[13px] text-ink-3">
                Lines arm as price approaches them. Watch the Trigger Map.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {armed.map((l) => (
                <li
                  key={l.name}
                  className="flex items-center justify-between py-3 text-[13px]"
                >
                  <span className="font-mono text-ink">{l.name}</span>
                  <span className="font-mono tabular-nums text-ink-2">
                    {l.currentValue.toFixed(2)}{" "}
                    <span
                      className={
                        l.distanceFromPrice >= 0 ? "text-bull-ink" : "text-bear-ink"
                      }
                    >
                      ({l.distanceFromPrice >= 0 ? "+" : ""}
                      {l.distanceFromPrice.toFixed(2)})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <SectionLabel number="03">Bias</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Today's lean"
          title={
            snap.bias.bias === "BULLISH"
              ? "Lean bullish"
              : snap.bias.bias === "BEARISH"
                ? "Lean bearish"
                : "Neutral"
          }
          meta={`Strength ${snap.bias.strengthScore}/100`}
        />
        <CardBody>
          <p className="text-[14px] text-ink-2 leading-relaxed">
            {snap.bias.explanation || "No commentary yet."}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
