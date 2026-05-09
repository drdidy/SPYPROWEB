// Pure-function tests for the Countdown's format() + pickInterval()
// helpers. The component itself is exercised at runtime; these
// assertions cover the deterministic parts (formatting + interval
// tiering) so a regression in either lands as a CI failure.
//
// Run with: `npx tsx scripts/test-countdown.ts`.

import { __test } from "../components/decision-slate/Countdown";

const { format, pickInterval } = __test;

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓  ${label}`);
  } else {
    console.log(`✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ---- format() ----
check(
  "≤10s renders imminentLabel",
  format(5 * SEC, "in", "Opening now") === "Opening now",
);
check(
  "≤10s respects custom imminentLabel",
  format(0, "in", "Now!") === "Now!",
);
check(
  ">24h: Xd Yh form",
  format(2 * DAY + 3 * HOUR, "in", "now") === "in 2d 3h",
);
check(
  "1–24h: Xh Ym form",
  format(2 * HOUR + 14 * MIN, "in", "now") === "in 2h 14m",
);
check(
  "<1h: Mm Ss form",
  format(5 * MIN + 30 * SEC, "in", "now") === "in 5m 30s",
);
check(
  "empty verb omits prefix",
  format(2 * MIN + 30 * SEC, "", "now") === "2m 30s",
);
check(
  "custom verb",
  format(45 * MIN, "Closes", "now") === "Closes 45m 0s",
);

// ---- pickInterval() ----
check(
  "<1h ticks every second",
  pickInterval(30 * SEC) === SEC,
);
check(
  "<1h boundary still 1s",
  pickInterval(59 * MIN + 30 * SEC) === SEC,
);
check(
  ">=1h ticks every minute",
  pickInterval(2 * HOUR) === MIN,
);
check(
  ">1d ticks every minute",
  pickInterval(3 * DAY) === MIN,
);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll Countdown cases passed.`);
