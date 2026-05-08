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
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

// Render at request time so we can read the live request host via
// next/headers and hit /api/snapshot on the same public hostname.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const {
    decision,
    signal,
    quality,
    candles,
    hourlyCandles,
    lines,
    pivots,
    currentPrice,
    bias,
    guardrails,
    waitDiscipline,
    optionsIntel,
    strikes,
    signalTicks,
  } = snap;

  return (
    <div className="max-w-[1440px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Workspace · 02"
        title="SPY Channel"
        lede="The deep read on SPY. Chart, triggers, options intel, signal tape, and the discipline that keeps you out of the wrong trades."
        source={source}
      />

      <DecisionSlate decision={decision} signal={signal} quality={quality} />

      <section className="space-y-5">
        <SectionLabel number="01">Structure</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-8">
            <ChartCard
              candles={candles}
              hourlyCandles={hourlyCandles}
              lines={lines}
              pivots={pivots}
              signal={signal ?? undefined}
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
            <SignalTape ticks={signalTicks} />
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
            <BiasMeter state={bias} />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <RiskGuardrails state={guardrails} />
          </div>
        </div>
      </section>
    </div>
  );
}
