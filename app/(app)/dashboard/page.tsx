import { DecisionSlate } from "@/components/dashboard/DecisionSlate";
import { ChartCard } from "@/components/chart/ChartCard";
import { AnchorSummary } from "@/components/dashboard/AnchorSummary";
import { TriggerMap } from "@/components/dashboard/TriggerMap";
import { WaitDiscipline } from "@/components/dashboard/WaitDiscipline";
import { SignalTape } from "@/components/dashboard/SignalTape";
import { OptionsIntelPanel } from "@/components/dashboard/OptionsIntel";
import { BiasMeter } from "@/components/dashboard/BiasMeter";
import { RiskGuardrails } from "@/components/dashboard/RiskGuardrails";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  decision,
  signalQuality,
  latestSignal,
  candles,
  lines,
  pivots,
  currentPrice,
  waitDiscipline,
  optionsIntel,
  strikes,
  biasState,
  guardrails,
} from "@/lib/mock-data";

export default function Page() {
  return (
    <div className="max-w-[1440px] mx-auto space-y-10 pb-16">
      {/* Editorial header */}
      <header className="flex items-end justify-between pt-2 pb-1">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              SPY · Decision · session today
            </span>
            <span className="h-px w-10 bg-rule-strong" />
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
              {todayLabel()}
            </span>
          </div>
          <h1 className="mt-3 text-display font-serif tracking-tight text-ink">
            The trading day,{" "}
            <span className="text-ink-3 italic font-light">read aloud.</span>
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-6 text-right">
          <Stat label="Bias" value={biasState.bias} highlight={biasState.bias} />
          <Stat label="Window" value={decision.windowET} />
          <Stat label="Slope" value="$0.20/hr" />
        </div>
      </header>

      <DecisionSlate
        decision={decision}
        signal={latestSignal}
        quality={signalQuality}
      />

      <section className="space-y-5">
        <SectionLabel number="01">Structure</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-8">
            <ChartCard
              candles={candles}
              lines={lines}
              pivots={pivots}
              signal={latestSignal}
              currentPrice={currentPrice}
            />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <AnchorSummary pivots={pivots} />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionLabel number="02">Execution</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <TriggerMap lines={lines} />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <WaitDiscipline items={waitDiscipline} />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionLabel number="03">Intelligence</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-7">
            <SignalTape />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <OptionsIntelPanel
              intel={optionsIntel}
              strikes={strikes}
              spy={currentPrice}
            />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionLabel number="04">Defense</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-8">
            <BiasMeter state={biasState} />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <RiskGuardrails state={guardrails} />
          </div>
        </div>
      </section>

      <footer className="pt-6 mt-6 border-t border-rule flex items-center justify-between text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em]">
        <span>Prophet · SPY anchor lattice</span>
        <span>End of slate</span>
      </footer>
    </div>
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
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[13px] font-semibold tabular-nums ${
          highlight === "BULLISH"
            ? "text-bull-ink"
            : highlight === "BEARISH"
              ? "text-bear-ink"
              : "text-ink"
        }`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}
