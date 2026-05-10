import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { CommandStat } from "@/components/ui/CommandStat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOURS_AHEAD = [1, 2, 3, 4, 5, 6];

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const last = snap.currentPrice;
  const closest = [...snap.lines].sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];

  return (
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Workspace - 04"
        title="Foresight"
        lede="Where every line will sit hour by hour. Run your eye across the table to see which level price is closest to in each window."
        source={source}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CommandStat label="Last" value={last.toFixed(2)} note="Snapshot price" tone="gold" />
        <CommandStat label="Resolved lines" value={snap.lines.length} note="Projected forward" />
        <CommandStat label="Nearest line" value={closest?.name ?? "-"} note={closest ? `${closest.distanceFromPrice >= 0 ? "+" : ""}${closest.distanceFromPrice.toFixed(2)} pts` : "Waiting"} tone="teal" />
      </div>

      <SectionLabel number="01">Forward projection</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Lines projected forward"
          title="Hour-by-hour"
          meta={`Last ${last.toFixed(2)} - ${snap.lines.length} levels`}
        />
        <CardBody className="px-0 pb-0">
          {snap.lines.length === 0 ? (
            <div className="p-5">
              <CommandEmptyState
                eyebrow="Projection matrix"
                title="No lines are available yet."
                body="Forward projections populate only after the engine resolves today's pivots, anchors, and active structural lines."
                rows={[
                  { label: "Levels", value: "0" },
                  { label: "Matrix", value: "Waiting" },
                  { label: "Source", value: source },
                ]}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] tabular-nums">
                  <thead>
                    <tr className="border-y border-rule text-ink-3 eyebrow">
                      <th className="text-left px-5 py-2.5">Line</th>
                      <th className="text-right px-3 py-2.5">Now</th>
                      {HOURS_AHEAD.map((h) => (
                        <th key={h} className="text-right px-3 py-2.5">+{h}h</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {snap.lines.map((p) => (
                      <tr key={p.name}>
                        <td className="px-5 py-2.5 font-mono text-ink">
                          {p.name}
                          {p.isPrimary && <span className="ml-2 text-[9px] font-mono text-gold-ink uppercase tracking-[0.10em]">armed</span>}
                        </td>
                        <td className="text-right px-3 py-2.5 font-mono text-ink">{p.currentValue.toFixed(2)}</td>
                        {HOURS_AHEAD.map((h) => {
                          const v = p.currentValue + p.slopePerHour * h;
                          return (
                            <td key={h} className="text-right px-3 py-2.5 font-mono text-ink-2">
                              {v.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ProjectionScope lines={snap.lines.slice(0, 8)} />
            </div>
          )}
        </CardBody>
      </Card>
      <p className="text-[12px] text-ink-3 leading-relaxed max-w-2xl">
        Projection uses each line's own slope. Lines with no slope hold their current value across the hours.
      </p>
    </div>
  );
}

function ProjectionScope({
  lines,
}: {
  lines: Array<{ name: string; currentValue: number; slopePerHour: number }>;
}) {
  const allValues = lines.flatMap((line) => [line.currentValue, ...HOURS_AHEAD.map((h) => line.currentValue + line.slopePerHour * h)]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = Math.max(max - min, 1);
  return (
    <div className="border-t xl:border-t-0 xl:border-l border-rule bg-[#071116] text-paper p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">Projection scope</div>
      <div className="mt-5 space-y-3">
        {lines.map((line) => {
          const start = ((line.currentValue - min) / range) * 100;
          const end = ((line.currentValue + line.slopePerHour * 6 - min) / range) * 100;
          return (
            <div key={line.name}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] text-paper/55 truncate">{line.name}</span>
                <span className="font-mono text-[10px] text-paper/70">{line.currentValue.toFixed(2)}</span>
              </div>
              <div className="relative mt-2 h-5 rounded-soft bg-paper/8 overflow-hidden">
                <div
                  className="absolute top-1/2 h-px bg-gold"
                  style={{
                    left: `${Math.min(start, end)}%`,
                    width: `${Math.max(2, Math.abs(end - start))}%`,
                  }}
                />
                <span className="absolute top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-gold" style={{ left: `${start}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
