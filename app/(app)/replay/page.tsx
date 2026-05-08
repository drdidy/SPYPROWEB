import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="07"
      eyebrow="Execution"
      title="Replay Lab"
      lede="Step through any historical session at 1×, 2×, 4× speed. The engine re-scores every signal with today's rules so you can study how the lattice would behave on past markets."
      bullets={[
        "Date picker spans the full archive; jump to any anchor or rejection event.",
        "Bar-by-bar playback with synthetic Decision Slate updates as bars print.",
        "Compare lanes: replay two days side-by-side to A/B different anchor configurations.",
        "Outcome ledger: every replayed session emits a P&L curve under live discipline.",
      ]}
    />
  );
}
