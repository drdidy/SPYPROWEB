import type { SPXSnapshot } from "./types";

// ---------------------------------------------------------------------------
// SPX mock snapshot — demo scenario: INSIDE_ASCENDING.
// Numbers are mathematically self-consistent against slope = +1.05/hr so the
// surface looks honest (channel floor / ceiling project correctly from the
// overnight anchors to the as-of timestamp).
//
// Session date (CT): 2026-05-08
// As-of:             2026-05-08 09:35 CT (5 min into RTH)
//
// Channel direction is ASCENDING because Tokyo (21:00–02:00 CT) printed
// HH + HL versus Sydney (17:00–21:00 CT). Floor anchors at the overnight low,
// ceiling anchors at the overnight high; both rise at +1.05/hr.
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
      // 17:00–21:00 CT
      high: 5862.10,
      low: 5849.00,
      highTime: "2026-05-07T20:48:00-05:00",
      lowTime: "2026-05-07T17:38:00-05:00",
    },
    tokyo: {
      // 21:00–02:00 CT — HH + HL vs Sydney → ascending
      high: 5872.40,
      low: 5853.20,
      highTime: "2026-05-07T23:14:00-05:00",
      lowTime: "2026-05-07T21:18:00-05:00",
    },
  },

  channel: {
    direction: "ASCENDING",
    reason:
      "Tokyo printed a higher high (5872.40 vs 5862.10) and higher low (5853.20 vs 5849.00) than Sydney. Range is rising — ascending channel.",
  },

  // Slope = +1.05/hr applied to four lines.
  // Floor:    5848.20 + 15.95h * 1.05 ≈ 5864.95
  // Ceiling:  5872.40 + 10.35h * 1.05 ≈ 5883.27
  // PrevH:    5878.50 + 20.17h * 1.05 ≈ 5899.68 (asc from prev RTH high)
  // PrevL:    5849.00 - 23.88h * 1.05 ≈ 5823.93 (desc from prev RTH low)
  lines: [
    {
      kind: "CHANNEL_FLOOR",
      name: "Channel Floor",
      anchorPrice: 5848.20,
      anchorTime: "2026-05-07T17:38:00-05:00",
      slopePerHour: 1.05,
      currentValue: 5864.95,
      distanceFromPrice: -7.05, // price is above floor
    },
    {
      kind: "CHANNEL_CEILING",
      name: "Channel Ceiling",
      anchorPrice: 5872.40,
      anchorTime: "2026-05-07T23:14:00-05:00",
      slopePerHour: 1.05,
      currentValue: 5883.27,
      distanceFromPrice: 11.27, // price is below ceiling
    },
    {
      kind: "PREV_RTH_HIGH_ASC",
      name: "Prev RTH High · Ascending",
      anchorPrice: 5878.50,
      anchorTime: "2026-05-07T13:25:00-05:00",
      slopePerHour: 1.05,
      currentValue: 5899.68,
      distanceFromPrice: 27.68,
    },
    {
      kind: "PREV_RTH_LOW_DESC",
      name: "Prev RTH Low · Descending",
      anchorPrice: 5849.00,
      anchorTime: "2026-05-07T09:42:00-05:00",
      slopePerHour: -1.05,
      currentValue: 5823.93,
      distanceFromPrice: -48.07,
    },
  ],

  price: {
    last: 5872.00,
    change: 6.40,
    changePct: 0.11,
  },

  // 5872.00 is between 5864.95 (floor) and 5883.27 (ceiling) → INSIDE_ASCENDING
  scenario: "INSIDE_ASCENDING",
  scenarioExplanation:
    "Last print 5872.00 sits inside the ascending channel — 7.05 pts above floor, 11.27 pts below ceiling. Mid-channel: both rails are reachable on the session.",

  plays: {
    primary: {
      side: "BUY",
      entryLine: "CHANNEL_FLOOR",
      entryPrice: 5864.95,
      exitLine: "CHANNEL_CEILING",
      exitPrice: 5883.27,
    },
    alternate: {
      side: "SELL",
      entryLine: "CHANNEL_CEILING",
      entryPrice: 5883.27,
      exitLine: "CHANNEL_FLOOR",
      exitPrice: 5864.95,
    },
  },

  contracts: {
    // SPX strikes are 5pt; round to standard board.
    forPrimary: {
      type: "CALL",
      strike: 5890,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5890 - 5864.95, // 25.05 OTM from entry
    },
    forAlternate: {
      type: "PUT",
      strike: 5860,
      expiration: "2026-05-08",
      dteLabel: "0DTE",
      distanceFromSpot: 5860 - 5883.27, // -23.27 OTM from entry
    },
  },

  reentryWatch: {
    active: false,
    side: null,
    detail:
      "Inside channel — re-entry watch dormant. Watch reactivates if price closes above ceiling or below floor.",
  },

  confluence: {
    factors: [
      {
        key: "asian",
        label: "Asian session",
        value: 0.78,
        weight: 0.20,
        contribution: 0.156,
        note: "Tokyo HH+HL clean; Sydney bracketed inside Tokyo range.",
      },
      {
        key: "london",
        label: "London session",
        value: 0.66,
        weight: 0.20,
        contribution: 0.132,
        note: "London open held overnight low — floor confirmed once.",
      },
      {
        key: "reaction",
        label: "RTH reaction",
        value: 0.72,
        weight: 0.25,
        contribution: 0.180,
        note: "Open print rejected near ceiling proxy; first 30-min builds inside range.",
      },
      {
        key: "factor4_tbd",
        label: "Factor 4 (TBD)",
        value: 0.60,
        weight: 0.15,
        contribution: 0.090,
        note: "Placeholder until you specify the fourth confluence factor.",
      },
      {
        key: "factor5_tbd",
        label: "Factor 5 (TBD)",
        value: 0.84,
        weight: 0.20,
        contribution: 0.168,
        note: "Placeholder until you specify the fifth confluence factor.",
      },
    ],
    score: 73, // 0.726 * 100, rounded
    action: "TAKE",
  },
};
