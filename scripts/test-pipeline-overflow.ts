// Static-analysis guard for the v5 #1 regression: the per-engine
// state pipeline stepper cannot push its parent grid track wider
// than the page container, even at 1024-1280px widths where seven
// labelled pills + connectors don't fit a half-screen card.
//
// The structural primitives that keep this from happening are:
//   - section: min-w-0 + overflow-hidden  (the shrink + clip guard)
//   - inner row: flex + min-w-0           (lets the section actually shrink)
//   - <ol> stepper: flex-1 + min-w-0 + overflow-hidden
//   - non-current step labels: collapse to a single-character glyph
//     below xl via a hidden xl:inline / xl:hidden split.
//
// If any of these drift, the dashboard goes back to forcing a
// horizontal scrollbar.

import * as fs from "fs";
import * as path from "path";

const file = path.join(
  __dirname,
  "..",
  "components",
  "decision-slate",
  "StatePipeline.tsx",
);
const src = fs.readFileSync(file, "utf-8");

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// Find the single section block — there's only one in the file.
const section = src.match(
  /<section[\s\S]*?aria-label=\{`\$\{engine\} engine state pipeline`\}[\s\S]*?<\/section>/m,
);
if (!section) {
  console.log("✗  Could not locate <section> block");
  process.exit(1);
}
const block = section[0];

// 1. Outer section must clip its content so the stepper can't push
//    the grid track wider.
check(
  "section has min-w-0 + overflow-hidden",
  /min-w-0/.test(block) && /overflow-hidden/.test(block),
  "missing one of: min-w-0, overflow-hidden",
);

// 2. The inner ol must allow itself to shrink and clip.
check(
  "<ol> has flex-1 + min-w-0 + overflow-hidden",
  /<ol[\s\S]*?className="[^"]*flex-1[^"]*min-w-0[^"]*overflow-hidden/m.test(
    block,
  ),
  "missing one of: flex-1, min-w-0, overflow-hidden on the <ol>",
);

// 3. v7 four-tier responsive collapse:
//    < lg: full label (vertical stack)
//    lg-xl: dot for inactive, full label for current
//    xl-(xl-plus): short abbreviation
//    xl-plus+: full label
check(
  "label uses xl-plus:inline for the widest tier (full label)",
  /xl-plus:inline/.test(block),
);
check(
  "label uses xl:inline xl-plus:hidden for the abbreviated tier",
  /hidden xl:inline xl-plus:hidden/.test(block),
);
check(
  "label uses lg:inline xl:hidden for the lg dot/current tier",
  /hidden lg:inline xl:hidden/.test(block),
);
check(
  "PHASE_DEFINITIONS exposes a `short` abbreviation",
  /phase\.short/.test(block),
);

// 4. The right-rail meta column must NOT reserve a hard min-width
//    that would crowd the stepper.
check(
  "meta column has no 160px min-width reservation",
  !/md:min-w-\[160px\]/.test(block),
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll StatePipeline overflow guards intact.`);
