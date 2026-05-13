import type { SPXSnapshot } from "./types";

// ---------------------------------------------------------------------------
// SPX mock snapshot - demo scenario: INSIDE_DESCENDING.
// Numbers are mathematically self-consistent against the ES previous-RTH
// swing-close framework
// so surfaces render the same line vocabulary in dev and production.
//
// Session date (CT): 2026-05-08
// As-of:             2026-05-08 09:35 CT (5 min into RTH)
//
// Previous RTH swing-high and swing-low closes are selected as pivots.
// Ascending and descending lines are projected from both points.
// ---------------------------------------------------------------------------

export const spxSnapshot: SPXSnapshot = {
  symbol: "SPX",
  asOf: "2026-05-08T09:35:00-05:00", // CT (DST: -05:00)
  sessionDateCT: "2026-05-08",

  overnight: {
    window: {
      start: "2026-05-07T15:00:00-05:00",
      end: "2026-05-08T02:00:00-05:00",
    },
    high: { price: 5872.40, time: "2026-05-07T23:14:00-05:00" },
    low: { price: 5848.20, time: "2026-05-07T17:38:00-05:00" },
  },

  sessions: {
    sydney: {
      // 17:00-21:00 CT, retained as overnight diagnostics.
      high: 5862.10,
      low: 5849.00,
      highTime: "2026-05-07T20:48:00-05:00",
      lowTime: "2026-05-07T17:38:00-05:00",
    },
    tokyo: {
      // 21:00-02:00 CT, retained as overnight diagnostics.
      high: 5872.40,
      low: 5853.20,
      highTime: "2026-05-07T23:14:00-05:00",
      lowTime: "2026-05-07T21:18:00-05:00",
    },
  },

  channel: {
    direction: "ASCENDING",
    reason:
      "Previous-RTH swing-close framework active with four projected references.",
  },

  // Four projected lines from previous RTH swing-close pivots.
  lines: [
    {
      kind: "PREV_RTH_HIGH_ASC",
      name: "Prev RTH High - Ascending",
      anchorPrice: 5878.50,
      anchorTime: "2026-05-07T13:25:00-05:00",
      slopePerHour: 1.04,
      currentValue: 5899.48,
      distanceFromPrice: 27.48,
    },
    {
      kind: "PREV_RTH_HIGH_DESC",
      name: "Prev RTH High - Descending",
      anchorPrice: 5878.50,
      anchorTime: "2026-05-07T13:25:00-05:00",
      slopePerHour: -1.04,
      currentValue: 5857.52,
      distanceFromPrice: -14.48,
    },
    {
      kind: "PREV_RTH_LOW_ASC",
      name: "Prev RTH Low - Ascending",
      anchorPrice: 5849.00,
      anchorTime: "2026-05-07T09:42:00-05:00",
      slopePerHour: 1.04,
      currentValue: 5873.84,
      distanceFromPrice: 1.84,
    },
    {
      kind: "PREV_RTH_LOW_DESC",
      name: "Prev RTH Low - Descending",
      anchorPrice: 5849.00,
      anchorTime: "2026-05-07T09:42:00-05:00",
      slopePerHour: -1.04,
      currentValue: 5824.16,
      distanceFromPrice: -47.84,
    },
  ],

  price: {
    last: 5872.00,
    change: 6.40,
    changePct: 0.11,
  },

  // 5872.00 is inside the previous-RTH swing-close framework.
  scenario: "INSIDE_DESCENDING",
  scenarioExplanation:
    "Last print 5872.00 sits inside the ES framework. Wait for qualified confirmation near active structure.",

  plays: {
    primary: {
      side: "BUY",
      entryLine: "PREV_RTH_LOW_DESC",
      entryPrice: 5824.16,
      exitLine: "PREV_RTH_HIGH_DESC",
      exitPrice: 5857.52,
    },
    alternate: {
      side: "SELL",
      entryLine: "PREV_RTH_HIGH_DESC",
      entryPrice: 5857.52,
      exitLine: "PREV_RTH_LOW_DESC",
      exitPrice: 5824.16,
    },
  },

  contracts: {
    // SPX strikes are 5pt; round to standard board.
    forPrimary: {
      type: "CALL",
      strike: 5890,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5890 - 5824.16,
    },
    forAlternate: {
      type: "PUT",
      strike: 5840,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5840 - 5857.52,
    },
  },

  reentryWatch: {
    active: false,
    side: null,
    detail:
      "Inside the ES framework - re-entry watch dormant. Watch reactivates when active structure qualifies.",
  },

  confluence: {
    factors: [
      {
        key: "asian",
        label: "Asian session",
        value: 0.78,
        weight: 0.30,
        contribution: 0.234,
        note: "Overnight structure resolved before the RTH planning window.",
      },
      {
        key: "london",
        label: "London session",
        value: 0.66,
        weight: 0.30,
        contribution: 0.198,
        note: "London open held the lower swing reference once.",
      },
      {
        key: "reaction",
        label: "RTH reaction",
        value: 0.72,
        weight: 0.40,
        contribution: 0.288,
        note: "Open print is still inside the active swing pair.",
      },
    ],
    score: 72,
    action: "TAKE",
  },
};

