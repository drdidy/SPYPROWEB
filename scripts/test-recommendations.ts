// Behavior tests for the Decision Slate's "Recommended next step"
// dispatcher (lib/recommendations.ts). The map is small and pure, so
// a no-deps assertion script is enough to catch regressions:
//
//   - PRE_CONFIG / STAND_DOWN  → daily-brief
//   - WAIT / WATCH (SPY)       → live-spy
//   - WAIT / WATCH (SPX)       → live-spx
//   - ARMED / GO               → options-cockpit
//   - COOLDOWN                 → log-replay
//   - Combined: most-active engine wins (GO > ARMED > WAIT > WATCH …)
//
// Run with: `npx tsx scripts/test-recommendations.ts`. Exits non-zero
// on any drift.

import {
  forState,
  recommendationFor,
  type Recommendation,
} from "../lib/recommendations";

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function expectId(rec: Recommendation, id: Recommendation["id"], label: string) {
  check(label, rec.id === id, `got id=${rec.id}, expected ${id}`);
}

// --- per-state branches ---
expectId(forState("PRE_CONFIG", "SPY"), "daily-brief", "PRE_CONFIG → daily-brief");
expectId(forState("STAND_DOWN", "SPY"), "daily-brief", "STAND_DOWN → daily-brief");
expectId(forState("COOLDOWN", "SPY"), "log-replay", "COOLDOWN → log-replay");
expectId(forState("WATCH", "SPY"), "live-spy", "SPY WATCH → live-spy");
expectId(forState("WAIT", "SPY"), "live-spy", "SPY WAIT → live-spy");
expectId(forState("WATCH", "SPX"), "live-spx", "SPX WATCH → live-spx");
expectId(forState("WAIT", "SPX"), "live-spx", "SPX WAIT → live-spx");
expectId(forState("ARMED", "SPY"), "options-cockpit", "ARMED → options-cockpit");
expectId(forState("GO", "SPX"), "options-cockpit", "GO → options-cockpit");

// --- combined dispatcher (priority rule) ---
expectId(
  recommendationFor("PRE_CONFIG", "PRE_CONFIG"),
  "daily-brief",
  "both PRE_CONFIG → daily-brief",
);
expectId(
  recommendationFor("STAND_DOWN", "WATCH"),
  "live-spx",
  "SPX WATCH beats SPY STAND_DOWN",
);
expectId(
  recommendationFor("WATCH", "STAND_DOWN"),
  "live-spy",
  "SPY WATCH beats SPX STAND_DOWN",
);
expectId(
  recommendationFor("ARMED", "WAIT"),
  "options-cockpit",
  "SPY ARMED beats SPX WAIT",
);
expectId(
  recommendationFor("WAIT", "GO"),
  "options-cockpit",
  "SPX GO beats SPY WAIT",
);
expectId(
  recommendationFor("COOLDOWN", "PRE_CONFIG"),
  "log-replay",
  "SPY COOLDOWN beats SPX PRE_CONFIG",
);

// --- reason text mentions the driving engine state ---
const watchSpx = recommendationFor("STAND_DOWN", "WATCH");
check(
  'WATCH dispatcher reason names "spx watch"',
  watchSpx.reason.toLowerCase().includes("spx") &&
    watchSpx.reason.toLowerCase().includes("watch"),
  `got reason="${watchSpx.reason}"`,
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll recommendation cases passed.`);
