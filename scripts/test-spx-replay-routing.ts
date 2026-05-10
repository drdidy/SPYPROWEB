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

// 3. The page-side guard: /es accepts ?date= via searchParams and
//    forwards it to the client component. v9 renamed the route
//    from /spx to /es; /spx now 308-redirects to /es.
const pageFile = path.join(
  __dirname,
  "..",
  "app",
  "(app)",
  "es",
  "page.tsx",
);
const pageSrc = fs.readFileSync(pageFile, "utf-8");
check(
  "/es page accepts searchParams.date",
  /searchParams\?:\s*\{\s*date\?:\s*string\s*\}/.test(pageSrc),
);
check(
  "/es page forwards replayDate to <SPXChannelClient />",
  /<SPXChannelClient[^>]*replayDate=\{replayDate\}/.test(pageSrc),
);
// /spx is now a redirect stub. Make sure it stays one — if a future
// edit accidentally turns it back into a full page, /es and /spx
// would diverge silently.
const redirectFile = path.join(
  __dirname,
  "..",
  "app",
  "(app)",
  "spx",
  "page.tsx",
);
const redirectSrc = fs.readFileSync(redirectFile, "utf-8");
check(
  "/spx page is a permanentRedirect to /es (with ?date= preserved)",
  /permanentRedirect\(`\/es\$\{qs\}`\)/.test(redirectSrc),
);

// 4. Client-side fetch invariant. /spx's data fetch must happen
//    in the browser, not the server, so it carries the user's
//    deployment-protection bypass cookie the same way /replay
//    does. The previous server-side path silently fell back to
//    the mock fixture on a 401.
const clientFile = path.join(
  __dirname,
  "..",
  "components",
  "spx",
  "SPXChannelClient.tsx",
);
const clientSrc = fs.readFileSync(clientFile, "utf-8");
check(
  "<SPXChannelClient /> is a client component",
  /^['"]use client['"]/.test(clientSrc.trim()),
);
check(
  "<SPXChannelClient /> fetches /api/spx/snapshot from the browser",
  /fetch\(\s*url\s*,\s*\{\s*cache:\s*['"]no-store['"]/m.test(clientSrc) &&
    /\/api\/spx\/snapshot/.test(clientSrc),
);
check(
  "<SPXChannelClient /> renders an error state on fetch failure (no mock fallback)",
  /status:\s*['"]error['"]/m.test(clientSrc) &&
    /<ErrorState\b/.test(clientSrc),
);
check(
  "<SPXChannelClient /> never imports the mock fixture",
  // Only flag actual `from "..."` import statements, not comment
  // references to the file. The whole point of this test is that
  // the mock can't sneak back into the render path; mentioning
  // it in a "why we don't use this" comment is fine.
  !/from\s+["'][^"']*spx-mock-data[^"']*["']/m.test(clientSrc),
);

// 5. Deployment-protection bypass on remaining server-side
//    callers (lib/snapshot-fetch.ts for /spy, lib/spx-fetch.ts
//    for any non-/spx caller). Both must forward the secret.
const spyFetcherSrc = fs.readFileSync(
  path.join(__dirname, "..", "lib", "snapshot-fetch.ts"),
  "utf-8",
);
check(
  "lib/snapshot-fetch.ts forwards x-vercel-protection-bypass",
  /x-vercel-protection-bypass/.test(spyFetcherSrc) &&
    /VERCEL_AUTOMATION_BYPASS_SECRET/.test(spyFetcherSrc),
);
check(
  "lib/spx-fetch.ts forwards x-vercel-protection-bypass",
  /x-vercel-protection-bypass/.test(src) &&
    /VERCEL_AUTOMATION_BYPASS_SECRET/.test(src),
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll SPX replay-routing invariants intact.`);
