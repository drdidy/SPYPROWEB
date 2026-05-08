import { SectionLabel } from "@/components/ui/SectionLabel";
import { SPXChannelHero } from "@/components/spx/SPXChannelHero";
import { SPXPlaysSlate } from "@/components/spx/SPXPlaysSlate";
import { SPXLineLadder } from "@/components/spx/SPXLineLadder";
import { SPXSessionOrigin } from "@/components/spx/SPXSessionOrigin";
import { SPXConfluence } from "@/components/spx/SPXConfluence";
import { loadSnapshot } from "@/lib/spx-fetch";

export const revalidate = 30;

export default async function Page() {
  const { snap, source, error } = await loadSnapshot();

  return (
    <div className="max-w-[1440px] mx-auto space-y-10 pb-16">
      {/* Editorial header */}
      <header className="flex items-end justify-between pt-2 pb-1">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              SPX · Channel · session {snap.sessionDateCT}
            </span>
            <span className="h-px w-10 bg-rule-strong" />
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              {dayLabel(snap.sessionDateCT)}
            </span>
            <SourceBadge source={source} error={error} />
          </div>
          <h1 className="mt-3 text-display font-serif tracking-tight text-ink">
            The corridor,{" "}
            <span className="text-ink-3 italic font-light">read aloud.</span>
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-6 text-right">
          <Stat
            label="Direction"
            value={snap.channel.direction}
            highlight={snap.channel.direction}
          />
          <Stat label="Scenario" value={snap.scenario.replace(/_/g, " ")} />
          <Stat label="Slope" value="±$1.05/hr" />
        </div>
      </header>

      <SPXChannelHero snap={snap} />

      <section className="space-y-5">
        <SectionLabel number="01">Plays</SectionLabel>
        <SPXPlaysSlate snap={snap} />
      </section>

      <section className="space-y-5">
        <SectionLabel number="02">Lines</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <SPXLineLadder lines={snap.lines} price={snap.price.last} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <SPXConfluence
              factors={snap.confluence.factors}
              score={snap.confluence.score}
              action={snap.confluence.action}
            />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionLabel number="03">Origin</SectionLabel>
        <SPXSessionOrigin snap={snap} />
      </section>

      <footer className="pt-6 mt-6 border-t border-rule flex items-center justify-between text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em]">
        <span>Prophet · SPX channel</span>
        <span>End of slate</span>
      </footer>
    </div>
  );
}

function SourceBadge({
  source,
  error,
}: {
  source: "live" | "mock";
  error?: string;
}) {
  const liveCls =
    "bg-bull-tint text-bull-ink shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]";
  const mockCls =
    "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]";
  return (
    <span
      title={error || (source === "live" ? "Live snapshot from API" : "Mock data — set NEXT_PUBLIC_API_BASE to use live")}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${source === "live" ? liveCls : mockCls}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${source === "live" ? "bg-bull animate-breathe" : "bg-ink-4"}`}
      />
      {source}
    </span>
  );
}

function dayLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return d
    .toLocaleDateString("en-US", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  const tone =
    highlight === "ASCENDING"
      ? "text-bull-ink"
      : highlight === "DESCENDING"
        ? "text-bear-ink"
        : "text-ink";
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[13px] font-semibold tabular-nums ${tone}`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}
