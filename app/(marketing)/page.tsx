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
import { loadIntradayReplay } from "@/lib/intraday-replay-fetch";
import { getSessionInfo } from "@/lib/sessions";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import type { SPXSnapshot } from "@/lib/types";
import type {
  StructureChartBar,
  StructureChartData,
  StructureChartLine,
} from "@/components/decision-slate/StructurePathChart";

// Render at request time so loadLiveSnapshot() can read the live host
// header and hit /api/snapshot. (See lib/snapshot-fetch.ts.)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const now = new Date();
  const chartDate = chartSessionDateISO(now);
  const [liveLoaded, replayLoaded, spxReplayLoaded, intraday] = await Promise.all([
    loadLiveSnapshot(),
    loadLiveSnapshot(chartDate),
    loadSpxSnapshot(chartDate),
    loadIntradayReplay(chartDate),
  ]);
  const liveChart = buildHeroChart(liveLoaded.data, null);
  const replayChart = buildHeroChart(replayLoaded.data, intraday?.spy ?? null);
  const useReplay = !!replayChart || !liveChart;
  const snap = useReplay ? replayLoaded.data : liveLoaded.data;
  const heroChart = (useReplay ? replayChart : liveChart) ?? MARKETING_SPY_CHART;
  const spxChart =
    buildSpxHeroChart(spxReplayLoaded.snap, intraday?.es ?? null, chartDate) ??
    MARKETING_ES_CHART;
  const quote = buildHeroQuote(snap, heroChart);
  return (
    <>
      {/* JSON-LD: Organization (site identity) + FAQPage (rich-result
          eligibility for the six FAQ items below). Both render
          server-side as <script type="application/ld+json">. */}
      <OrganizationJsonLd />
      <FAQPageJsonLd faqs={FAQS} />

      <HeroSection
        decision={snap.decision}
        quote={quote}
        initialLive={liveLoaded.source === "live" && !useReplay}
        chart={heroChart}
        spxChart={spxChart}
        previewLabel={useReplay ? "Last completed session" : "Live structure"}
        chartDate={heroChart.date}
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

const MARKETING_SPY_CHART: StructureChartData = {
  label: "SPY",
  date: "2026-05-08",
  bars: [
    { t: "2026-05-08T08:30:00-05:00", h: 735.32, l: 734.69, c: 735.28 },
    { t: "2026-05-08T09:10:00-05:00", h: 736.89, l: 736.24, c: 736.8 },
    { t: "2026-05-08T09:50:00-05:00", h: 737.28, l: 737.0, c: 737.28 },
    { t: "2026-05-08T10:30:00-05:00", h: 736.97, l: 736.31, c: 736.95 },
    { t: "2026-05-08T11:10:00-05:00", h: 737.45, l: 737.1, c: 737.38 },
    { t: "2026-05-08T11:50:00-05:00", h: 737.31, l: 736.97, c: 737.04 },
    { t: "2026-05-08T12:30:00-05:00", h: 737.8, l: 737.6, c: 737.7 },
    { t: "2026-05-08T13:10:00-05:00", h: 737.83, l: 737.35, c: 737.78 },
    { t: "2026-05-08T13:50:00-05:00", h: 737.03, l: 736.43, c: 736.58 },
    { t: "2026-05-08T14:30:00-05:00", h: 737.05, l: 736.52, c: 737.04 },
    { t: "2026-05-08T14:55:00-05:00", h: 737.59, l: 737.13, c: 737.53 },
  ],
  lines: [
    {
      label: "Upper",
      anchorTime: "2026-05-08T05:00:00-05:00",
      anchorPrice: 737.82,
      slopePerHour: -0.2,
      tone: "upper",
    },
    {
      label: "Anchor",
      anchorTime: "2026-05-08T05:00:00-05:00",
      anchorPrice: 734.42,
      slopePerHour: -0.2,
      tone: "anchor",
    },
    {
      label: "Lower",
      anchorTime: "2026-05-08T05:00:00-05:00",
      anchorPrice: 731.02,
      slopePerHour: -0.2,
      tone: "lower",
    },
  ],
};

const MARKETING_ES_CHART: StructureChartData = {
  label: "ES",
  date: "2026-05-08",
  bars: [
    { t: "2026-05-08T08:30:00-05:00", h: 7399.75, l: 7393.25, c: 7399.25 },
    { t: "2026-05-08T09:10:00-05:00", h: 7416.0, l: 7409.5, c: 7415.25 },
    { t: "2026-05-08T09:50:00-05:00", h: 7420.25, l: 7417.25, c: 7420.0 },
    { t: "2026-05-08T10:30:00-05:00", h: 7417.0, l: 7410.0, c: 7416.5 },
    { t: "2026-05-08T11:10:00-05:00", h: 7421.5, l: 7417.75, c: 7420.75 },
    { t: "2026-05-08T11:50:00-05:00", h: 7420.25, l: 7416.75, c: 7417.25 },
    { t: "2026-05-08T12:30:00-05:00", h: 7424.75, l: 7422.5, c: 7423.75 },
    { t: "2026-05-08T13:10:00-05:00", h: 7425.5, l: 7420.25, c: 7425.0 },
    { t: "2026-05-08T13:50:00-05:00", h: 7417.0, l: 7411.0, c: 7412.5 },
    { t: "2026-05-08T14:30:00-05:00", h: 7417.25, l: 7411.5, c: 7416.75 },
    { t: "2026-05-08T15:00:00-05:00", h: 7425.0, l: 7418.5, c: 7423.5 },
  ],
  lines: [
    {
      label: "Floor",
      anchorTime: "2026-05-07T17:00:00-05:00",
      anchorPrice: 7327.93,
      slopePerHour: 1.04,
      tone: "lower",
    },
    {
      label: "Ceil",
      anchorTime: "2026-05-08T01:00:00-05:00",
      anchorPrice: 7366.43,
      slopePerHour: 1.04,
      tone: "upper",
    },
    {
      label: "Prev H",
      anchorTime: "2026-05-07T10:00:00-05:00",
      anchorPrice: 7388.43,
      slopePerHour: 1.04,
      tone: "reference",
    },
    {
      label: "Prev L",
      anchorTime: "2026-05-07T13:00:00-05:00",
      anchorPrice: 7323.93,
      slopePerHour: -1.04,
      tone: "reference",
    },
  ],
};

function buildSpxHeroChart(
  snap: SPXSnapshot,
  intradayBars: StructureChartBar[] | null,
  date: string,
): StructureChartData | null {
  const offset = snap._meta?.appliedOffset ?? 0;
  const bars = normalizeChartBars(intradayBars ?? []).map((bar) => ({
    t: bar.t,
    h: bar.h + offset,
    l: bar.l + offset,
    c: bar.c + offset,
  }));
  const lines = snap.lines
    .map((line): StructureChartLine => ({
      label: shortSpxLineLabel(line.kind),
      anchorTime: line.anchorTime,
      anchorPrice: line.anchorPrice,
      slopePerHour: line.slopePerHour,
      tone:
        line.kind === "SWING_HIGH_DESC"
          ? "upper"
          : line.kind === "SWING_LOW_ASC"
            ? "lower"
            : "reference",
    }))
    .filter(
      (line) =>
        !!line.anchorTime &&
        Number.isFinite(line.anchorPrice) &&
        Number.isFinite(line.slopePerHour),
    );
  if (bars.length < 2 || lines.length === 0) return null;
  return { label: "ES", date, bars, lines };
}

function normalizeChartBars(
  bars: Array<{ t: string; h: number; l: number; c: number }> | null | undefined,
): StructureChartBar[] {
  return (bars ?? [])
    .filter(
      (bar) =>
        !!bar.t &&
        Number.isFinite(bar.h) &&
        Number.isFinite(bar.l) &&
        Number.isFinite(bar.c),
    )
    .map((bar) => ({ t: bar.t, h: bar.h, l: bar.l, c: bar.c }))
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
}

function shortSpxLineLabel(kind: string): string {
  const labels: Record<string, string> = {
    SWING_HIGH_DESC: "Swing H dn",
    SWING_LOW_ASC: "Swing L up",
    PREV_RTH_HIGH_ASC: "Prev H",
    PREV_RTH_LOW_DESC: "Prev L",
    SWING_HIGH_ASC: "Swing H up",
    SWING_LOW_DESC: "Swing L dn",
  };
  return labels[kind] || "Ref";
}

function buildHeroChart(
  snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"],
  intradayBars: StructureChartBar[] | null,
): StructureChartData | null {
  const sourceBars =
    intradayBars && intradayBars.length > 1 ? intradayBars : snap.candles;
  const bars = sourceBars
    .filter(
      (bar) =>
        !!bar.t &&
        Number.isFinite(bar.h) &&
        Number.isFinite(bar.l) &&
        Number.isFinite(bar.c),
    )
    .map((bar) => ({ t: bar.t, h: bar.h, l: bar.l, c: bar.c }))
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
  const anchorLines = buildAnchorBandLines(snap);
  const lines: StructureChartLine[] =
    anchorLines.length > 0 ? anchorLines : buildDynamicLines(snap);
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

function buildAnchorBandLines(
  snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"],
): StructureChartLine[] {
  const anchor = snap.anchor?.primary;
  const slope = Number(snap.anchor?.slopePerHour);
  if (!anchor || !Number.isFinite(slope)) return [];
  return [
    makeSpyBand("Upper", anchor.bands.upper.anchorPrice, anchor.anchorTime, slope, "upper"),
    makeSpyBand("Anchor", anchor.bands.main.anchorPrice, anchor.anchorTime, slope, "anchor"),
    makeSpyBand("Lower", anchor.bands.lower.anchorPrice, anchor.anchorTime, slope, "lower"),
  ].filter(Boolean) as StructureChartLine[];
}

function makeSpyBand(
  label: string,
  anchorPrice: number | null,
  anchorTime: string,
  slopePerHour: number,
  tone: StructureChartLine["tone"],
): StructureChartLine | null {
  if (!Number.isFinite(anchorPrice ?? NaN)) return null;
  return {
    label,
    anchorTime,
    anchorPrice: Number(anchorPrice),
    slopePerHour,
    tone,
  };
}

function buildDynamicLines(
  snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"],
): StructureChartLine[] {
  const primary = snap.lines.filter((line) => line.isPrimary);
  return (primary.length > 0 ? primary : snap.lines)
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
    )
    .slice(0, 4)
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
}

function buildHeroQuote(
  snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"],
  chart: StructureChartData | null,
): { spy: number; change: number; changePct: number; vix: number } {
  const last = chart?.bars.at(-1);
  const prior = chart && chart.bars.length > 1 ? chart.bars.at(-2) : null;
  const spy = snap.shellState.spy || last?.c || snap.currentPrice || 0;
  const change =
    snap.shellState.change ||
    (last && prior ? last.c - prior.c : 0);
  const base = prior?.c || spy;
  const changePct =
    snap.shellState.changePct ||
    (base ? (change / base) * 100 : 0);
  return {
    spy,
    change,
    changePct,
    vix: snap.shellState.vix,
  };
}

function chartSessionDateISO(now: Date): string {
  const session = getSessionInfo("SPY", now);
  if (session.phase === "RTH_OPEN" || session.phase === "POST_RTH") {
    return chicagoDateISO(session.rthClose);
  }
  return previousTradingDateISO("SPY", now);
}

function chicagoDateISO(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function previousTradingDateISO(engine: "SPY" | "SPX", now: Date): string {
  const todayISO = chicagoDateISO(now);
  for (let offset = 1; offset <= 14; offset++) {
    const probe = new Date(now.getTime() - offset * 86_400_000);
    if (chicagoDateISO(probe) === todayISO) continue;
    const session = getSessionInfo(engine, probe);
    const tradingDateISO = chicagoDateISO(session.rthClose);
    if (tradingDateISO < todayISO) return tradingDateISO;
  }
  return todayISO;
}
