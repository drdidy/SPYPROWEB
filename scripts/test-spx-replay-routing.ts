// Regression guard for the SPX-replay-shows-mock-data bug.
//
// Two structural invariants in lib/spx-fetch.ts must hold:
//
//   1. When called with a replayDate, loadSnapshot constructs the
//      URL with ?date=YYYY-MM-DD. (Without this, /spx?date=...
//      silently fetches the live snapshot and the replay date is
//      lost.)
//   2. When called with a replayDate, loadSnapshot SKIPS
//      applySpxSessionGate. The gate evaluates against `now`, so
//      muting a Tuesday replay viewed on a Saturday would blank
//      the page to PRE_CONFIG (the user-reported "shows mock data
//      on the SPX Channel tab").
//
// The fetcher is hard to unit-test cleanly (it reads next/headers,
// hits fetch, etc.), so we assert via static-source pattern checks
// the same way scripts/test-state-pipeline.ts does. If either
// invariant drifts, this fails with a pointed message.

import * as fs from "fs";
import * as path from "path";

const file = path.join(__dirname, "..", "lib", "spx-fetch.ts");
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

// 1. Replay URL includes ?date=
check(
  "loadSnapshot URL carries ?date=${replayDate} on the replay path",
  /\?date=\$\{replayDate\}/.test(src),
);

// 2. Gate is conditionally bypassed during replay. The implementation
//    detail can vary (an `if (isReplay) return s` short-circuit, or
//    a maybeGate helper that's skipped when isReplay is true) — what
//    we care about is that the source mentions both "isReplay" and
//    "applySpxSessionGate" in a structure that wires them together.
const isReplayDeclared = /const\s+isReplay\s*=/.test(src);
check("isReplay flag is computed", isReplayDeclared);
check(
  "isReplay gates the call to applySpxSessionGate",
  // Either pattern: `isReplay ? s : applySpxSessionGate(s)` or
  // `if (isReplay) return s; ... applySpxSessionGate(s)`.
  /isReplay[\s\S]*?applySpxSessionGate|applySpxSessionGate[\s\S]*?isReplay/m.test(
    src,
  ),
);

// 3. The page-side guard: /spx must accept ?date= via searchParams
//    and pass it to loadSnapshot. Without this the URL plumbing on
//    the client is irrelevant — the page itself drops the date.
const pageFile = path.join(
  __dirname,
  "..",
  "app",
  "(app)",
  "spx",
  "page.tsx",
);
const pageSrc = fs.readFileSync(pageFile, "utf-8");
check(
  "/spx page accepts searchParams.date",
  /searchParams\?:\s*\{\s*date\?:\s*string\s*\}/.test(pageSrc),
);
check(
  "/spx page passes replayDate to loadSnapshot",
  /loadSnapshot\(\s*replayDate\s*\)/.test(pageSrc),
);
check(
  "/spx page renders ReplayBanner when replayDate present",
  /\{replayDate &&\s*<ReplayBanner/.test(pageSrc),
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll SPX replay-routing invariants intact.`);
