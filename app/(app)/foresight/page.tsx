import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="04"
      eyebrow="Workspace"
      title="Foresight"
      lede="Forward projection of every fan ray across the next session. Where the lattice will sit at 9:30, 10:30, 14:00 — overlaid with the economic calendar and known catalysts."
      bullets={[
        "Hour-by-hour projected line values across RTH and extended session (3:00–18:00 CT).",
        "Catalyst overlay: FOMC, CPI, NFP, OPEX windows pinned to projected windows.",
        "Probabilistic touch likelihood per line based on past-30-day reach distributions.",
        "Pre-market plan: which lines to watch first, which to discard if RTH opens above/below thresholds.",
      ]}
    />
  );
}
