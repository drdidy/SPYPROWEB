import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="09"
      eyebrow="Intelligence"
      title="Order Flow"
      lede="Cumulative delta, footprint patterns, and volume-at-price overlaid against the lattice — answers the 'are buyers actually showing up at this line?' question."
      bullets={[
        "Cumulative delta curve with divergence markers when price and flow disagree.",
        "Bid/ask imbalance histogram per 4H bar, banded by 20-day percentile.",
        "Volume profile overlaid on the chart; high-volume nodes flagged as hidden anchors.",
        "Sweep alerts: large single-print blocks that often precede rejection or follow-through.",
      ]}
    />
  );
}
