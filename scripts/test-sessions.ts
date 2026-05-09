// Lightweight runtime test for lib/sessions.ts.
//
// We deliberately avoid pulling in vitest/jest just for this surface —
// run it with `tsx scripts/test-sessions.ts`. Exits non-zero on failure
// so CI can shell it.

import { getSessionInfo, type Engine, type SessionPhase } from "../lib/sessions";

interface Case {
  name: string;
  now: string; // ISO with explicit offset, so the test reads in CT.
  spy?: SessionPhase;
  spx?: SessionPhase;
}

const CASES: Case[] = [
  // The bug that started this PR — Saturday morning. SPY closed
  // (waiting for Mon 03:00 CT), SPX closed (waiting for Sun 17:00 CT).
  {
    name: "Sat May 9 09:24 CT — both engines closed for the weekend",
    now: "2026-05-09T09:24:00-05:00",
    spy: "CLOSED_WEEKEND",
    spx: "CLOSED_WEEKEND",
  },
  // Sun afternoon — SPX still closed; its config opens at 17:00.
  {
    name: "Sun May 10 16:30 CT — both still closed (SPX opens at 17)",
    now: "2026-05-10T16:30:00-05:00",
    spy: "CLOSED_WEEKEND",
    spx: "CLOSED_WEEKEND",
  },
  // Sun 18:00 CT — SPX is now in CONFIG_WINDOW; SPY still closed.
  {
    name: "Sun May 10 18:00 CT — SPX configuring, SPY closed",
    now: "2026-05-10T18:00:00-05:00",
    spy: "CLOSED_WEEKEND",
    spx: "CONFIG_WINDOW",
  },
  // Mon 02:30 CT — SPX config closed, SPY pre-config (its window
  // opens at 03:00).
  {
    name: "Mon May 11 02:30 CT — SPX post-config, SPY pre-config",
    now: "2026-05-11T02:30:00-05:00",
    spy: "PRE_CONFIG",
    spx: "POST_CONFIG",
  },
  // Mon 04:00 CT — SPY now in CONFIG_WINDOW, SPX past it.
  {
    name: "Mon May 11 04:00 CT — SPX post-config, SPY configuring",
    now: "2026-05-11T04:00:00-05:00",
    spy: "CONFIG_WINDOW",
    spx: "POST_CONFIG",
  },
  // Mon 09:00 CT — RTH open for both.
  {
    name: "Mon May 11 09:00 CT — both engines RTH_OPEN",
    now: "2026-05-11T09:00:00-05:00",
    spy: "RTH_OPEN",
    spx: "RTH_OPEN",
  },
  // Mon 16:00 CT — both engines POST_RTH.
  {
    name: "Mon May 11 16:00 CT — both POST_RTH",
    now: "2026-05-11T16:00:00-05:00",
    spy: "POST_RTH",
    spx: "POST_RTH",
  },
  // Christmas 10:00 CT — Friday holiday.
  {
    name: "Fri Dec 25 10:00 CT — holiday, both closed",
    now: "2026-12-25T10:00:00-06:00",
    spy: "CLOSED_HOLIDAY",
    spx: "CLOSED_HOLIDAY",
  },
  // Day before Independence Day — Thu Jul 2 11:00 CT, RTH open until 12:00.
  {
    name: "Thu Jul 2 11:00 CT — early-close day, still in RTH",
    now: "2026-07-02T11:00:00-05:00",
    spy: "RTH_OPEN",
    spx: "RTH_OPEN",
  },
  // Day before Independence Day — 13:00 CT, RTH closed (early close 12:00).
  {
    name: "Thu Jul 2 13:00 CT — early-close day, post-RTH",
    now: "2026-07-02T13:00:00-05:00",
    spy: "POST_RTH",
    spx: "POST_RTH",
  },
];

let failed = 0;

for (const c of CASES) {
  const now = new Date(c.now);
  const spy = getSessionInfo("SPY", now);
  const spx = getSessionInfo("SPX", now);

  const spyOk = !c.spy || spy.phase === c.spy;
  const spxOk = !c.spx || spx.phase === c.spx;

  if (spyOk && spxOk) {
    console.log(`✓  ${c.name}`);
    console.log(`     SPY=${spy.phase}  SPX=${spx.phase}`);
  } else {
    failed++;
    console.error(`✗  ${c.name}`);
    if (!spyOk) {
      console.error(`     SPY: expected ${c.spy}, got ${spy.phase}`);
    }
    if (!spxOk) {
      console.error(`     SPX: expected ${c.spx}, got ${spx.phase}`);
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${CASES.length} cases failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} cases passed.`);
