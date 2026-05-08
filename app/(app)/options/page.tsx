import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="06"
      eyebrow="Execution"
      title="Options Cockpit"
      lede="Strike selection, premium flow alignment, dealer positioning, and Greeks — all reading off the same anchors so options never disagree with the underlying read."
      bullets={[
        "0DTE / 1DTE strike picker with $2 OTM default and live premium spread mock.",
        "Max-pain, call wall, and put wall overlaid on the strike map; alignment vs. bias scored.",
        "Premium flow filter: enable/disable dealer-gamma alignment as a hard gate.",
        "Greeks ladder per candidate strike: Δ, Γ, Θ, Vega — color-coded by tolerance band.",
      ]}
    />
  );
}
