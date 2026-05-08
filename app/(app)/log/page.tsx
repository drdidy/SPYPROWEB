import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="12"
      eyebrow="Journal"
      title="Signal Log"
      lede="The historical archive of every signal the engine has ever printed, grade and outcome attached. Search, filter, annotate, learn."
      bullets={[
        "Full-text search across explanations, warnings, and strengths.",
        "Filter by date, grade, line type, action label, or final outcome.",
        "Personal annotation per signal — what you saw, what you traded, what you'd do again.",
        "Export to CSV / Notion for trade-review rituals.",
      ]}
    />
  );
}
