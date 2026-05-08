import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="13"
      eyebrow="Journal"
      title="Analytics"
      lede="Performance under discipline. Win rate by grade, expected R per signal, equity curve, and the gap between engine signals and trades you actually took."
      bullets={[
        "Win rate, average R, and Sharpe — per grade, per line type, per session window.",
        "Equity curve with discipline mode (engine-perfect) versus actual P&L.",
        "Slippage report: how much edge was lost to chase, late entry, or early exit.",
        "Streak ledger and drawdown table with auto-flagged behavioral patterns.",
      ]}
    />
  );
}
