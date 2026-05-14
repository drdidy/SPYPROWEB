import type { SPXSnapshot } from "./types";

// ---------------------------------------------------------------------------
// SPX mock snapshot - demo scenario: INSIDE_DESCENDING.
// Numbers are mathematically self-consistent against the ES previous-RTH
// ES Pivot Fan framework
// so surfaces render the same line vocabulary in dev and production.
//
// Session date (CT): 2026-05-08
// As-of:             2026-05-08 09:35 CT (5 min into RTH)
//
// Previous RTH high close and post-noon low wick are selected as pivots.
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
      "ES Pivot Fan active with High Fan and Low Fan references.",
  },

  fanRead: {
    zone: "BETWEEN_CEILINGS",
    label: "Between fan ceilings",
    summary:
      "Price is between High Fan Ceiling and Low Fan Ceiling; sell rejection at the high fan can rotate toward High Fan Floor, while a low-fan reclaim can press through High Fan Ceiling.",
    primaryReference: "PREV_RTH_HIGH_ASC",
    secondaryReference: "PREV_RTH_LOW_ASC",
  },

  // Four projected lines from previous RTH high-close / post-noon-low pivots.
  lines: [
    {
      kind: "PREV_RTH_HIGH_ASC",
      name: "High Fan Ceiling",
      anchorPrice: 5878.50,
      anchorTime: "2026-05-07T13:25:00-05:00",
      slopePerHour: 1.04,
      currentValue: 5899.48,
      distanceFromPrice: 19.48,
    },
    {
      kind: "PREV_RTH_HIGH_DESC",
      name: "High Fan Floor",
      anchorPrice: 5878.50,
      anchorTime: "2026-05-07T13:25:00-05:00",
      slopePerHour: -1.04,
      currentValue: 5857.52,
      distanceFromPrice: -22.48,
    },
    {
      kind: "SWING_HIGH_ASC",
      name: "Overnight Higher Pivot - Minor Ascending",
      anchorPrice: 5884.00,
      anchorTime: "2026-05-07T23:00:00-05:00",
      slopePerHour: 1.04,
      currentValue: 5894.40,
      distanceFromPrice: 14.40,
    },
    {
      kind: "PREV_RTH_LOW_ASC",
      name: "Low Fan Ceiling",
      anchorPrice: 5849.00,
      anchorTime: "2026-05-07T09:42:00-05:00",
      slopePerHour: 1.04,
      currentValue: 5873.84,
      distanceFromPrice: -6.16,
    },
    {
      kind: "PREV_RTH_LOW_DESC",
      name: "Low Fan Floor",
      anchorPrice: 5849.00,
      anchorTime: "2026-05-07T09:42:00-05:00",
      slopePerHour: -1.04,
      currentValue: 5824.16,
      distanceFromPrice: -55.84,
    },
  ],

  price: {
    last: 5880.00,
    change: 14.40,
    changePct: 0.25,
  },

  // 5880.00 is between the two fan ceilings.
  scenario: "INSIDE_ASCENDING",
  scenarioExplanation:
    "Last print 5880.00 sits between the fan ceilings. Wait for qualified confirmation near active structure.",

  plays: {
    primary: {
      side: "SELL",
      entryLine: "PREV_RTH_HIGH_ASC",
      entryPrice: 5899.48,
      exitLine: "PREV_RTH_HIGH_DESC",
      exitPrice: 5857.52,
    },
    alternate: {
      side: "BUY",
      entryLine: "PREV_RTH_LOW_ASC",
      entryPrice: 5873.84,
      exitLine: "PREV_RTH_HIGH_ASC",
      exitPrice: 5899.48,
    },
  },

  contracts: {
    // SPX strikes are 5pt; round to standard board.
    forPrimary: {
      type: "PUT",
      strike: 5900,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5900 - 5899.48,
    },
    forAlternate: {
      type: "CALL",
      strike: 5875,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5875 - 5873.84,
    },
  },

  reentryWatch: {
    active: false,
    side: null,
    detail:
      "Inside the ES Pivot Fan - re-entry watch dormant. Watch reactivates when active structure qualifies.",
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

