// Static-analysis guard for the TopBar layout. The TopBar has now
// regressed three times — text segments overlapping each other when
// flex constraints drift. A real visual-regression runner (Playwright)
// would be ideal but isn't installed; this assertion script enforces
// the structural invariants that prevented the bug at the source so
// CI can shell it.
//
// Run with: `npx tsx scripts/test-topbar-layout.ts`
//
// Fails non-zero if any of these invariants drift:
//   - <header> has overflow-hidden + min-w-0 + gap-?
//   - every data-segment has whitespace-nowrap + shrink-0
//   - quote ribbon has min-w-0 + overflow-hidden
//   - SymbolChip carries shrink-0 + whitespace-nowrap
//
// TODO: replace with a Playwright visual-regression test that loads
// /dashboard at 1440 / 1280 / 1024 and asserts no two top-bar text
// elements have overlapping bounding rects.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const TOPBAR = readFileSync(
  join(process.cwd(), "components/layout/TopBar.tsx"),
  "utf8",
);

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

function assertContains(name: string, needles: string[], hay: string): Check {
  const missing = needles.filter((n) => !hay.includes(n));
  return {
    name,
    ok: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : undefined,
  };
}

function extractBlock(start: string, end: string): string {
  const s = TOPBAR.indexOf(start);
  if (s === -1) return "";
  const e = TOPBAR.indexOf(end, s);
  return TOPBAR.slice(s, e);
}

const headerBlock = extractBlock("<header", ">");
const pillsBlock = extractBlock('data-segment="pills"', "</div>");
const metaBlock = extractBlock('data-segment="meta"', "</div>");
const symbolChipBlock = extractBlock("function SymbolChip", "function Quote");

const checks: Check[] = [
  // Header is the regression-proof root: a single flex row with
  // overflow-hidden + min-w-0 so a long segment can't push others
  // off-screen.
  assertContains(
    "<header> overflow-hidden + min-w-0 + flex + gap",
    ["overflow-hidden", "min-w-0", "flex", "gap-"],
    headerBlock,
  ),
  // Pills zone never flexes; never wraps.
  assertContains(
    "pills zone shrink-0 + whitespace-nowrap",
    ["shrink-0", "whitespace-nowrap"],
    pillsBlock,
  ),
  // Meta zone (session line + updated + feed health) same.
  assertContains(
    "meta zone shrink-0 + whitespace-nowrap",
    ["shrink-0", "whitespace-nowrap"],
    metaBlock,
  ),
  // Quote ribbon must allow itself to truncate (min-w-0 +
  // overflow-hidden) so it never pushes against the right cluster.
  assertContains(
    "quote ribbon min-w-0 + overflow-hidden",
    ["min-w-0 overflow-hidden", "flex-1"],
    TOPBAR,
  ),
  // SymbolChip — every chip carries shrink-0 + whitespace-nowrap so
  // it survives the lowest priority drops without word-wrapping.
  assertContains(
    "SymbolChip shrink-0 + whitespace-nowrap",
    ["whitespace-nowrap shrink-0"],
    symbolChipBlock,
  ),
  // PRE-CONFIG palette wired up so the pill matches the StateLadder
  // tone when an engine is in PRE_CONFIG.
  assertContains(
    'verbPalette["PRE-CONFIG"]',
    ['"PRE-CONFIG":', "text-state-armed"],
    TOPBAR,
  ),
];

let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`✓  ${c.name}`);
  } else {
    failed++;
    console.error(`✗  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} of ${checks.length} TopBar invariants drifted.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} TopBar invariants intact.`);
