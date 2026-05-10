import { SPYChannelHero } from "@/components/spy/SPYChannelHero";
import { TriggerMap } from "@/components/dashboard/TriggerMap";
import { SignalTape } from "@/components/dashboard/SignalTape";
import { OptionsIntelPanel } from "@/components/dashboard/OptionsIntel";
import { BiasMeter } from "@/components/dashboard/BiasMeter";
import { RiskGuardrails } from "@/components/dashboard/RiskGuardrails";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source, error } = await loadLiveSnapshot();
  const {
    decision,
    lines,
    currentPrice,
    bias,
    guardrails,
    optionsIntel,
    strikes,
    signalTicks,
  } = snap;

  return (
    <div className="w-full max-w-[1440px] space-y-10 pb-16">
      {/* Editorial header — matches /spx */}
      <header className="relative overflow-hidden rounded-[18px] border border-[#D6BC75]/45 bg-[#071116] px-5 py-5 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-7 md:py-6">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
        />
        <div
          aria-hidden
          className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-gold/20"
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[10px] text-gold-soft/82 tracking-[0.20em] uppercase">
              SPY · Channel · session today
            </span>
            <span className="h-px w-10 bg-gold/45 hidden sm:block" />
            <span className="font-mono text-[10px] text-paper/48 tracking-[0.20em] uppercase">
              {todayLabel()}
            </span>
            <SourceBadge source={source} error={error} />
          </div>
          <h1 className="mt-3 text-[36px] font-serif leading-none tracking-tight text-paper md:text-[46px]">
            The trading day,{" "}
            <span className="text-gold-soft/72 italic font-light">read aloud.</span>
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-6 text-right">
          <Stat label="Bias" value={bias.bias} highlight={bias.bias} />
          <Stat label="Window" value={decision.windowET || "—"} />
          <Stat label="Last" value={currentPrice.toFixed(2)} />
        </div>
        </div>
      </header>

      {/* Hero — anchor framework. */}
      <SPYChannelHero snap={snap} />

      <section className="space-y-5">
        <SectionLabel number="01">Plays</SectionLabel>
        <OptionsIntelPanel
          intel={optionsIntel}
          strikes={strikes}
          spy={currentPrice}
        />
      </section>

      <section className="space-y-5">
        <SectionLabel number="02">Lines</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <TriggerMap lines={lines} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <BiasMeter state={bias} />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionLabel number="03">Tape</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <SignalTape ticks={signalTicks} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <RiskGuardrails state={guardrails} />
          </div>
        </div>
      </section>

      <footer className="pt-6 mt-6 border-t border-rule flex items-center justify-between text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em]">
        <span>Prophet · SPY channel</span>
        <span>End of slate</span>
      </footer>
    </div>
  );
}

function SourceBadge({
  source,
  error,
}: {
  source: "live" | "degraded" | "seed" | "mock" | "error";
  error?: string;
}) {
  const live = source === "live";
  const degraded = source === "degraded";
  const cls = live
    ? "bg-bull-tint text-bull-ink shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]"
    : degraded
      ? "bg-gold-tint text-gold-ink shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]"
      : "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]";
  return (
    <span
      title={error || `Source: ${source}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${live ? "bg-bull animate-breathe" : degraded ? "bg-gold" : "bg-ink-4"}`}
      />
      {source}
    </span>
  );
}

function todayLabel(): string {
  return new Date()
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
  return (
    <div>
      <div className="eyebrow text-paper/45 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[13px] font-semibold tabular-nums ${
          highlight === "BULLISH"
            ? "text-bull-ink"
            : highlight === "BEARISH"
              ? "text-bear-ink"
            : "text-paper"
        }`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}
