// Static-analysis guard for the new <StatePipeline /> stepper. The
// pipeline must:
//
//   1. render an <ol> as the stepper container (real list semantics)
//   2. mark the active step with aria-current="step"
//   3. carry per-step InfoTooltip wrappers so each phase reads as
//      keyboard-focusable / dismissible help
//   4. drive its label set from PHASE_DEFINITIONS (single source of
//      truth across the slate)
//   5. render a live <LiveCountdown> so the pipeline's "next event"
//      block ticks in real time
//
// Run with: `npx tsx scripts/test-state-pipeline.ts`. Exits non-zero
// on any drift, prints a short report on success.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "components/decision-slate/StatePipeline.tsx"),
  "utf8",
);

interface Check {
  label: string;
  test: (s: string) => boolean;
}

const checks: Check[] = [
  {
    label: "renders an <ol> container",
    test: (s) => /<ol[\s\S]*?role="list"/.test(s),
  },
  {
    label: 'marks active step with aria-current="step"',
    test: (s) => /aria-current=\{isCurrent \? "step" : undefined\}/.test(s),
  },
  {
    label: "wraps each step in <InfoTooltip>",
    test: (s) =>
      s.includes("<InfoTooltip") && /\.map\(\(state, i\)/.test(s),
  },
  {
    label: "drives labels from PHASE_DEFINITIONS",
    test: (s) =>
      /import \{ PHASE_DEFINITIONS \}/.test(s) &&
      /PHASE_DEFINITIONS\[state\]/.test(s),
  },
  {
    label: "renders a <Countdown> for the next event",
    // v2 renamed LiveCountdown → Countdown (LiveCountdown remains a
    // back-compat alias). Either reference satisfies the invariant.
    test: (s) => /<Countdown\b/.test(s) || /<LiveCountdown\b/.test(s),
  },
  {
    label: "exports an <EngineStatusChip /> helper",
    test: (s) => /export function EngineStatusChip/.test(s),
  },
];

let failed = 0;
for (const c of checks) {
  if (c.test(SRC)) {
    console.log(`✓  ${c.label}`);
  } else {
    console.log(`✗  ${c.label}`);
    failed++;
  }
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} StatePipeline invariants intact.`);
