import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import type { Grade } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID: readonly string[] = ["A+", "A", "B", "C", "D"];

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const ticks = snap.signalTicks;

  return (
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Journal · 12"
        title="Signal Log"
        lede="Every event the engine printed today. Historical archive arrives next."
        source={source}
      />
      <SectionLabel number="01">Today</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Live tape"
          title={`${ticks.length} event${ticks.length === 1 ? "" : "s"}`}
          meta="Today's session"
        />
        <CardBody className="px-0 pb-0">
          {ticks.length === 0 ? (
            <div className="px-5 py-10 text-[13px] text-ink-3">
              No signals printed yet today. They&apos;ll arrive here as the
              engine resolves rejections.
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {ticks.map((t, i) => (
                <li key={i} className="grid grid-cols-12 gap-3 px-5 py-3 items-center">
                  <span className="col-span-1 font-mono text-[11px] text-ink-3 tabular-nums">
                    {t.time}
                  </span>
                  <span
                    className={`col-span-1 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] ${
                      t.type === "CALL"
                        ? "text-bull-ink"
                        : t.type === "PUT"
                          ? "text-bear-ink"
                          : "text-ink-3"
                    }`}
                  >
                    {t.type}
                  </span>
                  <span className="col-span-2 font-mono text-[11px] text-ink-2">
                    {t.line ?? "—"}
                  </span>
                  <span className="col-span-7 text-[13px] text-ink-2 leading-snug">
                    {t.body}
                  </span>
                  <span className="col-span-1 flex justify-end">
                    {t.grade && VALID.includes(t.grade) && (
                      <GradeBadge grade={t.grade as Grade} size="sm" />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <SectionLabel number="02">Archive</SectionLabel>
      <Card>
        <CardBody>
          <div className="font-serif text-headline text-ink-3 italic font-light">
            Historical archive coming soon.
          </div>
          <p className="mt-3 text-[13px] text-ink-3 leading-relaxed max-w-md">
            Every signal the engine prints accumulates here over time. Search,
            filter, annotate, and export when the storage layer lands.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
