// Regression guard for the v9 "secret sauce" rule: the engine's
// per-hour slope values for ES and SPY are
// proprietary and must not appear in any user-visible string on
// the dashboard, the channel pages, or the replay workspace.
//
// Internal references (consts in component files, animation
// easing curves like `[0.2, 0.8, 0.2, 1]`, mock-data fixtures,
// pytest cases) are fine — they don't reach the rendered
// surface. This script reads the source of the user-facing
// components and grep-fails if a value-bearing slope phrase
// returns.
//
// Run: `npx tsx scripts/test-no-slope-leak.ts`.

import * as fs from "fs";
import * as path from "path";

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// Components that render to the user — every file here is
// surfaced on /dashboard, /es, /spy, or /replay.
const files = [
  "components/spx/SPXChannelHero.tsx",
  "components/spx/SPXChannelClient.tsx",
  "components/spx/SPXLineLadder.tsx",
  "components/spy/SPYChannelHero.tsx",
  "components/stocks/StocksEngineClient.tsx",
  "components/crypto/CryptoEngineClient.tsx",
  "components/replay/ReplayWorkspace.tsx",
  "app/(app)/dashboard/page.tsx",
  "app/(marketing)/methodology/stocks/page.tsx",
  "app/(marketing)/methodology/crypto/page.tsx",
  "components/marketing/SurfacesGrid.tsx",
];

// Patterns that would put a slope value on the rendered page.
// Each is a tight phrase — easing curves like `[0.2, 0.8, 0.2, 1]`
// and CSS values like `1.05rem` won't match any of these.
const leaks = [
  /\b1\.00 pts(?:\/hr)?\b/,
  /\b1\.04 pts(?:\/hr)?\b/,
  /\b0\.20 pts(?:\/hr)?\b/,
  /\bslope[^a-z]{0,4}\d+\.\d{1,2}\s*pts/i,
  /\bSlope\s*[±\-‑]\s*\d+\.\d{1,2}\s*pts/,
  /decaying at \d+\.\d+ pts/,
  /Bands decay at .*\d+\.\d+ pts/,
  /\b0\.(?:027|040|049|060|066|100)%\b/,
  /Hard-coded sector table/i,
  /Tracked equities only/i,
  /SectorSlope Rate/i,
  /sector-calibrated/i,
  /sector bucket/i,
  /\b34\s*(?:pts|points)(?:\s*\/\s*hr|\s*per\s*hour)?\b/i,
  /\b680\s*(?:pts|points)\b/i,
  /\b0\.95\s*(?:pts|points)(?:\s*\/\s*hr|\s*per\s*hour)?\b/i,
  /\b14\s*(?:pt|pts|point|points)\s*move\b/i,
  /slope.*BTC/i,
  /slope.*ETH/i,
];

for (const rel of files) {
  const abs = path.join(__dirname, "..", rel);
  if (!fs.existsSync(abs)) {
    check(`${rel}: file exists`, false, "file not found");
    continue;
  }
  const src = fs.readFileSync(abs, "utf-8");
  // Strip line and block comments — internal const declarations
  // ("const SLOPE_PER_HOUR = 0.2") are explanation, not display.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const re of leaks) {
    const m = re.exec(stripped);
    check(
      `${rel}: no slope leak matching ${re}`,
      !m,
      m ? `matched ${JSON.stringify(m[0])}` : undefined,
    );
  }
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll slope-leak guards intact.`);
