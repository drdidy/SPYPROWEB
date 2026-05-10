import { HeroSection } from "@/components/marketing/HeroSection";
import { PullQuote } from "@/components/marketing/PullQuote";
import { MethodologyTriad } from "@/components/marketing/MethodologyTriad";
import { MorningSection } from "@/components/marketing/MorningSection";
import { SurfacesGrid } from "@/components/marketing/SurfacesGrid";
import { Manifesto } from "@/components/marketing/Manifesto";
import { FAQ } from "@/components/marketing/FAQ";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import {
  OrganizationJsonLd,
  FAQPageJsonLd,
} from "@/components/marketing/JsonLd";
import { FAQS } from "@/content/faqs";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import type {
  StructureChartData,
  StructureChartLine,
} from "@/components/decision-slate/StructurePathChart";

// Render at request time so loadLiveSnapshot() can read the live host
// header and hit /api/snapshot. (See lib/snapshot-fetch.ts.)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const { data: snap, source } = await loadLiveSnapshot();
  const heroChart = buildHeroChart(snap);
  return (
    <>
      {/* JSON-LD: Organization (site identity) + FAQPage (rich-result
          eligibility for the six FAQ items below). Both render
          server-side as <script type="application/ld+json">. */}
      <OrganizationJsonLd />
      <FAQPageJsonLd faqs={FAQS} />

      <HeroSection
        decision={snap.decision}
        quote={{
          spy: snap.shellState.spy,
          change: snap.shellState.change,
          changePct: snap.shellState.changePct,
          vix: snap.shellState.vix,
        }}
        initialLive={source === "live"}
        chart={heroChart}
      />
      <PullQuote />
      <MethodologyTriad />
      <MorningSection />
      <SurfacesGrid />
      <Manifesto />
      <FAQ />
      <WaitlistForm />
    </>
  );
}

function buildHeroChart(
  snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"],
): StructureChartData | null {
  const bars = snap.candles
    .filter(
      (bar) =>
        !!bar.t &&
        Number.isFinite(bar.h) &&
        Number.isFinite(bar.l) &&
        Number.isFinite(bar.c),
    )
    .map((bar) => ({ t: bar.t, h: bar.h, l: bar.l, c: bar.c }))
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
  const primary = snap.lines.filter((line) => line.isPrimary);
  const selected = (primary.length > 0 ? primary : snap.lines)
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
    )
    .slice(0, 4);
  const lines: StructureChartLine[] = selected
    .map((line, index): StructureChartLine => {
      const tone: StructureChartLine["tone"] =
        index === 0
          ? "anchor"
          : line.currentValue >= snap.currentPrice
            ? "upper"
            : "lower";
      return {
        label: line.name,
        anchorTime: line.anchorTime,
        anchorPrice: line.anchorPrice,
        slopePerHour: line.slopePerHour,
        tone,
      };
    })
    .filter(
      (line) =>
        !!line.anchorTime &&
        Number.isFinite(line.anchorPrice) &&
        Number.isFinite(line.slopePerHour),
    );
  if (bars.length < 2 || lines.length === 0) return null;
  return {
    label: "SPY",
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(snap.asOf)),
    bars,
    lines,
  };
}
