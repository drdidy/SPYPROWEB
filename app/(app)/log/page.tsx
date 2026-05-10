import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
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
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Journal - 12"
        title="Signal Log"
        lede="Every event the engine printed today. Historical archive arrives next."
        source={source}
      />

      <SectionLabel number="01">Today</SectionLabel>
      <Card>
        <CardHeader eyebrow="Live tape" title={`${ticks.length} event${ticks.length === 1 ? "" : "s"}`} meta="Today's session" />
        <CardBody>
          {ticks.length === 0 ? (
            <CommandEmptyState
              eyebrow="Signal tape"
              title="No signals printed today."
              body="The live log stays blank until the engine resolves a rejection, confirmation, or note. This is a real empty session state, not a hidden archive."
              rows={[
                { label: "Events", value: "0" },
                { label: "Session", value: "Today" },
                { label: "Archive", value: "Pending storage" },
              ]}
            />
          ) : (
            <ol className="relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-rule">
              {ticks.map((t, i) => (
                <li key={i} className="relative pb-4 last:pb-0">
                  <span
                    className={`absolute -left-[18px] top-3 h-3 w-3 rounded-full ring-4 ring-paper ${
                      t.type === "CALL" ? "bg-bull" : t.type === "PUT" ? "bg-bear" : "bg-gold"
                    }`}
                  />
                  <div className="grid grid-cols-12 gap-3 rounded-card border border-rule bg-paper-2/45 px-4 py-3 items-center">
                    <span className="col-span-2 md:col-span-1 font-mono text-[11px] text-ink-3 tabular-nums">{t.time}</span>
                    <span
                      className={`col-span-2 md:col-span-1 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] ${
                        t.type === "CALL" ? "text-bull-ink" : t.type === "PUT" ? "text-bear-ink" : "text-ink-3"
                      }`}
                    >
                      {t.type}
                    </span>
                    <span className="col-span-3 md:col-span-2 font-mono text-[11px] text-ink-2 truncate">{t.line ?? "-"}</span>
                    <span className="col-span-5 md:col-span-7 text-[13px] text-ink-2 leading-snug">{t.body}</span>
                    <span className="hidden md:flex col-span-1 justify-end">
                      {t.grade && VALID.includes(t.grade) && <GradeBadge grade={t.grade as Grade} size="sm" />}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <SectionLabel number="02">Archive</SectionLabel>
      <Card>
        <CardBody>
          <div className="rounded-card bg-[#071116] text-paper border border-[#243138] p-7">
            <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">Historical layer</div>
            <div className="mt-3 font-serif text-[32px] leading-none text-paper">Archive is ready for storage wiring.</div>
            <p className="mt-4 text-[13px] text-paper/62 leading-relaxed max-w-2xl">
              The production UI shell is in place. Search, filter, annotation, and export can attach here once the persistence layer begins writing historical signal events.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
