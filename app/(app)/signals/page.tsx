import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="05"
      eyebrow="Execution"
      title="Signal Tape"
      lede="Every rejection print as it crosses the wire — graded, scored, and explained. Pendings, confirms, breaches, and notes in a single chronological feed."
      bullets={[
        "Every CALL / PUT / NOTE event with timestamp, line name, OHLC, and grade.",
        "Inline score breakdown: close distance, wick rejection ratio, body position, target quality.",
        "Action label per signal: TRADE, SELECTIVE_TRADE, WAIT_FOR_RETEST, NO_TRADE.",
        "Filter by grade, line, type, or session. Export to journal in one keystroke.",
      ]}
    />
  );
}
