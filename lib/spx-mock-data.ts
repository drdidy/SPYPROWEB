import type { SPXSnapshot } from "./types";

// ---------------------------------------------------------------------------
// SPX mock snapshot - demo scenario: INSIDE_DESCENDING.
// Numbers are mathematically self-consistent against the ES six-line framework
// so surfaces render the same line vocabulary in dev and production.
//
// Session date (CT): 2026-05-08
// As-of:             2026-05-08 09:35 CT (5 min into RTH)
//
// Overnight swing-high and swing-low closes are selected before 02:00 CT.
// Ascending and descending lines are projected from both points; previous RTH
// high/low references complete the six-line framework.
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
      "Six-line ES framework active: previous RTH high ascending, previous RTH low descending, and ascending/descending lines from the overnight swing-high and swing-low closes before 02:00 CT.",
  },

  // Six projected lines from overnight swing closes and previous RTH anchors.
  lines: [
    {
      kind: "SWING_HIGH_ASC",
      name: "Swing High - Ascending",
      anchorPrice: 5872.40,
      anchorTime: "2026-05-07T23:14:00-05:00",
      slopePerHour: 1.04,
      currentValue: 5883.16,
      distanceFromPrice: 11.16,
    },
    {
      kind: "SWING_HIGH_DESC",
      name: "Swing High - Descending",
      anchorPrice: 5872.40,
      anchorTime: "2026-05-07T23:14:00-05:00",
      slopePerHour: -1.04,
      currentValue: 5861.64,
      distanceFromPrice: -10.36,
    },
    {
      kind: "SWING_LOW_ASC",
      name: "Swing Low - Ascending",
      anchorPrice: 5848.20,
      anchorTime: "2026-05-07T17:38:00-05:00",
      slopePerHour: 1.04,
      currentValue: 5864.79,
      distanceFromPrice: -7.21,
    },
    {
      kind: "SWING_LOW_DESC",
      name: "Swing Low - Descending",
      anchorPrice: 5848.20,
      anchorTime: "2026-05-07T17:38:00-05:00",
      slopePerHour: -1.04,
      currentValue: 5831.61,
      distanceFromPrice: -40.39,
    },
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

  // 5872.00 is inside the six-line framework.
  scenario: "INSIDE_DESCENDING",
  scenarioExplanation:
    "Last print 5872.00 sits inside the ES six-line framework. Wait for an hourly rejection into a line.",

  plays: {
    primary: {
      side: "BUY",
      entryLine: "SWING_HIGH_DESC",
      entryPrice: 5861.64,
      exitLine: "SWING_LOW_ASC",
      exitPrice: 5864.79,
    },
    alternate: {
      side: "SELL",
      entryLine: "SWING_LOW_ASC",
      entryPrice: 5864.79,
      exitLine: "SWING_HIGH_DESC",
      exitPrice: 5861.64,
    },
  },

  contracts: {
    // SPX strikes are 5pt; round to standard board.
    forPrimary: {
      type: "CALL",
      strike: 5890,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5890 - 5861.64,
    },
    forAlternate: {
      type: "PUT",
      strike: 5840,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5840 - 5864.79,
    },
  },

  reentryWatch: {
    active: false,
    side: null,
    detail:
      "Inside the six-line framework - re-entry watch dormant. Watch reactivates if price closes above or below the active swing pair.",
  },

  confluence: {
    factors: [
      {
        key: "asian",
        label: "Asian session",
        value: 0.78,
        weight: 0.30,
        contribution: 0.234,
        note: "Overnight swing-high and swing-low closes resolved before 02:00 CT.",
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
