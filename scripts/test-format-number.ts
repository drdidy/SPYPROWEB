// Pure-function tests for lib/format-number.ts. Verifies that the
// helper never returns a literal "." (the v4 TopBar bug) and that
// every input shape (null / undefined / NaN / Infinity / finite)
// maps to a sane output.

import { formatNumber, isLoadedNumber } from "../lib/format-number";

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// --- formatNumber ---
check("null → em-dash", formatNumber(null) === "—");
check("undefined → em-dash", formatNumber(undefined) === "—");
check("NaN → em-dash", formatNumber(Number.NaN) === "—");
check("Infinity → em-dash", formatNumber(Infinity) === "—");
check("-Infinity → em-dash", formatNumber(-Infinity) === "—");
check("0 → 0.00", formatNumber(0) === "0.00");
check("612.4 → 612.40", formatNumber(612.4) === "612.40");
check("decimals=4 honored", formatNumber(1.23456, 4) === "1.2346");

// The v4 bug: a partial value would render as "." in the UI. Make
// sure no input shape produces that string.
const samples = [null, undefined, Number.NaN, Infinity, -Infinity, 0, 12.34];
for (const s of samples) {
  const out = formatNumber(s);
  check(
    `formatNumber(${String(s)}) never literal "."`,
    out !== "." && !out.startsWith("."),
    `got "${out}"`,
  );
}

// --- isLoadedNumber ---
check("null is not loaded", !isLoadedNumber(null));
check("NaN is not loaded", !isLoadedNumber(Number.NaN));
check("0 default is not loaded", !isLoadedNumber(0));
check(
  "0 with allowZero is loaded",
  isLoadedNumber(0, true),
);
check("12.34 is loaded", isLoadedNumber(12.34));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll formatNumber cases passed.`);
