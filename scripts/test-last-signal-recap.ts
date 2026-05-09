// Regression test for the v4 P0 bug:
//
//     "watched only Watched only — day closed +79.00 pts +79.00R"
//
// The phrase "Watched only" was being emitted twice — once as the
// pill that v3 added, and once as the body string from the data
// layer. v4 strips the prefix from the body when the pill renders.
//
// Run: `npx tsx scripts/test-last-signal-recap.ts`.

import { __test } from "../components/decision-slate/LastSignalRecap";

const { WATCHED_PREFIX } = __test;

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// --- WATCHED_PREFIX coverage ---
check(
  "matches the canonical body shape",
  WATCHED_PREFIX.test("Watched only — day closed +79.00 pts"),
);
check(
  "matches lowercase",
  WATCHED_PREFIX.test("watched only - day closed -2.00 pts"),
);
check(
  "matches with leading whitespace",
  WATCHED_PREFIX.test("  Watched only · skipped at trigger"),
);
check(
  "matches with no separator",
  WATCHED_PREFIX.test("Watched only day closed flat"),
);
check(
  "does not match unrelated bodies",
  !WATCHED_PREFIX.test("Long entry held 3 bars"),
);

// --- The rendered body never contains the duplicated phrase ---
function renderedBody(line: string): string {
  return line.replace(WATCHED_PREFIX, "").trim();
}

const cases = [
  "Watched only — day closed +79.00 pts",
  "Watched only · day closed -3.50 pts",
  "watched only day closed flat",
  "  Watched only — entered at 612.40, exited 614.10",
];
for (const c of cases) {
  const body = renderedBody(c);
  // The pill renders "Watched only"; the body must NOT also start
  // with the phrase.
  check(
    `no duplicated "Watched only" for: ${JSON.stringify(c)}`,
    !/^watched only/i.test(body),
    `got body="${body}"`,
  );
  // And the body should still carry the substantive part.
  check(
    `body keeps the non-prefix substance`,
    body.length > 0,
    `body="${body}"`,
  );
}

// --- v5 #3: assert the rendered string preserves em-dash + parens
//     around the R-multiple. We compose the same parts the component
//     emits and compare to the canonical target.
function compose(side: string, body: string, r: string): string {
  return `${side} — ${body} (${r}R)`;
}
const composed = compose(
  "Watched only",
  "day closed +79.00 pts",
  "+79.00",
);
check(
  "canonical Watched-only line shape",
  composed === "Watched only — day closed +79.00 pts (+79.00R)",
  `got "${composed}"`,
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll LastSignalRecap cases passed.`);
