// Pure-function tests for lib/engine-labels.ts. The dashboard
// renames the SPX engine to "ES" at the render boundary; this
// script locks the helpers that drive that rename so a future
// touch can't silently regress it.
//
// Run: `npx tsx scripts/test-engine-labels.ts`.

import { displayEngine, relabelDashboardString } from "../lib/engine-labels";

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// --- displayEngine ---
check('displayEngine("SPY") === "SPY"', displayEngine("SPY") === "SPY");
check('displayEngine("SPX") === "ES"', displayEngine("SPX") === "ES");

// --- relabelDashboardString ---
check(
  '"SPX setup opens" → "ES setup opens"',
  relabelDashboardString("SPX setup opens") === "ES setup opens",
);
check(
  '"SPX RTH closes" → "ES RTH closes"',
  relabelDashboardString("SPX RTH closes") === "ES RTH closes",
);
check(
  '"SPY setup opens" → unchanged',
  relabelDashboardString("SPY setup opens") === "SPY setup opens",
);
check(
  "word-boundary safety: 'SPXES' is not relabelled",
  relabelDashboardString("SPXES junk") === "SPXES junk",
);
check(
  "case sensitivity: lowercase spx is not relabelled",
  relabelDashboardString("spx setup opens") === "spx setup opens",
);
check(
  "multiple SPX tokens all relabelled",
  relabelDashboardString("SPX session · SPX setup") === "ES session · ES setup",
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll engine-label cases passed.`);
