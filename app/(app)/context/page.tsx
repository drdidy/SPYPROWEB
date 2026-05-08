import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="08"
      eyebrow="Intelligence"
      title="Market Context"
      lede="The macro readout that frames today's lattice — VIX regime, sector rotation, breadth, FX, rates — distilled into a single context score that gates aggression."
      bullets={[
        "VIX term structure, contango/backwardation, and percentile rank.",
        "S&P sector rotation heatmap with intraday relative strength.",
        "DXY, US 10Y, and SPY correlation table — alignment vs. divergence scored.",
        "Composite context score: how trade-friendly is today, on a 0–100 scale.",
      ]}
    />
  );
}
