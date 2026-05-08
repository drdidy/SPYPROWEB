import { StubPage } from "@/components/layout/StubPage";
export default function Page() {
  return (
    <StubPage
      number="11"
      eyebrow="Intelligence"
      title="Learning"
      lede="The methodology, expanded. Every term — anchor, fan, primary line, retest, candle gate — defined and demonstrated with live examples pulled from this week's tape."
      bullets={[
        "Glossary that links each term to the place in the engine where it's computed.",
        "Worked examples: real signals from the past week, replayed with full grade breakdown.",
        "Calibration notes: why the slope is $0.20/hr, why retest tolerance is $0.10.",
        "Discipline drills: short interactive prompts that test your read against the engine's.",
      ]}
    />
  );
}
