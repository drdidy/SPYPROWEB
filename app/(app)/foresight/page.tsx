import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOURS_AHEAD = [1, 2, 3, 4, 5, 6];

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const last = snap.currentPrice;

  return (
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Workspace · 04"
        title="Foresight"
        lede="Where every line will sit hour by hour. Run your eye across the table to see which level price is closest to in each window."
        source={source}
      />
      <SectionLabel number="01">Forward projection</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Lines projected forward"
          title="Hour-by-hour"
          meta={`Last ${last.toFixed(2)} · ${snap.lines.length} levels`}
        />
        <CardBody className="px-0 pb-0">
          {snap.lines.length === 0 ? (
            <div className="px-5 py-10 text-[13px] text-ink-3">
              No lines available yet. Lines populate once the engine resolves
              today&apos;s pivots and triggers.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr className="border-y border-rule text-ink-3 eyebrow">
                    <th className="text-left px-5 py-2.5">Line</th>
                    <th className="text-right px-3 py-2.5">Now</th>
                    {HOURS_AHEAD.map((h) => (
                      <th key={h} className="text-right px-3 py-2.5">
                        +{h}h
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {snap.lines.map((p) => (
                    <tr key={p.name}>
                      <td className="px-5 py-2.5 font-mono text-ink">
                        {p.name}
                        {p.isPrimary && (
                          <span className="ml-2 text-[9px] font-mono text-gold-ink uppercase tracking-[0.10em]">
                            armed
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-2.5 font-mono text-ink">
                        {p.currentValue.toFixed(2)}
                      </td>
                      {HOURS_AHEAD.map((h) => {
                        const v = p.currentValue + p.slopePerHour * h;
                        return (
                          <td
                            key={h}
                            className="text-right px-3 py-2.5 font-mono text-ink-2"
                          >
                            {v.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      <p className="text-[12px] text-ink-3 leading-relaxed max-w-2xl">
        Projection uses each line&apos;s own slope. Lines with no slope hold
        their current value across the hours.
      </p>
    </div>
  );
}
