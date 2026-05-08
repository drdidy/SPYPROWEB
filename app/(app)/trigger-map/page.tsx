import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="02"
      eyebrow="Workspace"
      title="Trigger Map"
      lede="A full-screen reading of every primary and secondary line — distance, slope, time-to-touch, alignment with bias — sortable, filterable, with one-click arming."
      bullets={[
        "Every UA / UD / LA / LD primary line plus all secondary targets, ranked by proximity to current price.",
        "Live time-to-touch estimate using the $0.20/hr fan slope and current drift.",
        "Per-line conviction score blending wick history, retest count, and structure integrity.",
        "Click-to-arm: dry-run a hypothetical rejection against the line and preview the resulting Decision Slate.",
      ]}
    />
  );
}
