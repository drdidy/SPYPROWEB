import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="10"
      eyebrow="Intelligence"
      title="Daily Brief"
      lede="A single-page editorial brief read at the open. Yesterday's close, overnight action, today's anchors and bias — written in plain English so you walk in knowing the day."
      bullets={[
        "Yesterday's close and overnight session summary in 60 seconds.",
        "Today's lattice in narrative form: which anchors are in force, where the read leans.",
        "Pre-open checklist: levels to watch first, conditions that promote or veto trades.",
        "End-of-day debrief auto-published at 4:01 PM ET with replay links.",
      ]}
    />
  );
}
