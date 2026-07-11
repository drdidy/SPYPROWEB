import type { SPXSnapshot } from "./types";

// ---------------------------------------------------------------------------
// SPX mock snapshot - demo scenario: INSIDE_DESCENDING.
// Numbers are mathematically self-consistent against the ES previous-RTH
// ES Control Map framework
// so surfaces render the same level vocabulary in dev and production.
//
// Session date (CT): 2026-05-08
// As-of:             2026-05-08 09:35 CT (5 min into RTH)
//
// Previous RTH control high and dealer-pressure low are selected as pivots.
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
      "ES Control Map active with high-pivot and low-pivot references.",
  },

  fanRead: {
    zone: "BETWEEN_CEILINGS",
    label: "Between fan ceilings",
    summary:
      "Price is between the high-pivot and low-pivot boundaries; a clean rejection can rotate toward the next mapped level.",
    primaryReference: "PREV_RTH_HIGH_ASC",
    secondaryReference: "PREV_RTH_LOW_ASC",
  },

  // Four projected lines from previous RTH control pivots.
  lines: [
    {
      kind: "PREV_RTH_HIGH_ASC",
      name: "High-pivot upper boundary",
      anchorPrice: 5878.50,
      anchorTime: "2026-05-07T13:25:00-05:00",
      slopePerHour: 1.0,
      currentValue: 5899.48,
      distanceFromPrice: 19.48,
    },
    {
      kind: "PREV_RTH_HIGH_DESC",
      name: "High-pivot control boundary",
      anchorPrice: 5878.50,
      anchorTime: "2026-05-07T13:25:00-05:00",
      slopePerHour: -1.0,
      currentValue: 5857.52,
      distanceFromPrice: -22.48,
    },
    {
      kind: "SWING_HIGH_ASC",
      name: "Overnight Higher Pivot - Minor Ascending",
      anchorPrice: 5884.00,
      anchorTime: "2026-05-07T23:00:00-05:00",
      slopePerHour: 1.0,
      currentValue: 5894.40,
      distanceFromPrice: 14.40,
    },
    {
      kind: "PREV_RTH_LOW_ASC",
      name: "Low-pivot upper boundary",
      anchorPrice: 5849.00,
      anchorTime: "2026-05-07T09:42:00-05:00",
      slopePerHour: 1.0,
      currentValue: 5873.84,
      distanceFromPrice: -6.16,
    },
    {
      kind: "PREV_RTH_LOW_DESC",
      name: "Low-pivot lower boundary",
      anchorPrice: 5849.00,
      anchorTime: "2026-05-07T09:42:00-05:00",
      slopePerHour: -1.0,
      currentValue: 5824.16,
      distanceFromPrice: -55.84,
    },
  ],

  descendingDeviationFan: {
    anchor: { price: 5878.50, time: "2026-05-07T13:25:00-05:00" },
    slopePerHour: -1.0,
    spacing: 34,
    windowStart: "2026-05-08T08:00:00-05:00",
    entryReferenceTime: "2026-05-08T09:00:00-05:00",
    windowEnd: "2026-05-08T12:00:00-05:00",
    extensionEnd: "2026-05-08T14:00:00-05:00",
    entryMain: 5860.00,
    currentMain: 5860.00,
    openMain: 5860.50,
    openBias: {
      direction: "BULLISH",
      openPrice: 5871.50,
      mainValue: 5860.00,
      distanceFromMain: 11.50,
      note:
        "RTH opened above the Control Line; the Control Map marks a bullish day bias until price loses a gate on a closing basis.",
    },
    nearestLine: {
      index: 1,
      label: "North Gate I",
      value: 5894.00,
      currentValue: 5894.00,
      openValue: 5894.50,
      distanceFromPrice: 14.00,
      isMain: false,
    },
    zone: {
      label: "Between Control Line and North Gate I",
      posture: "UPPER_DEVIATION",
      lowerLine: "Control Line",
      upperLine: "North Gate I",
      nextReference: "North Gate I",
      distanceToNext: 12.00,
      guidance:
        "Price is above the Control Line and pressing toward North Gate I. A touch and close back below North Gate I is a sell trigger on the next candle; a clean hold above North Gate I keeps bullish continuation alive.",
    },
    activeWindow: {
      key: "PRIMARY",
      label: "9-12 primary entries",
      start: "2026-05-08T09:00:00-05:00",
      end: "2026-05-08T12:00:00-05:00",
      status: "ACTIVE",
      guidance:
        "Primary institutional window. Touch-and-close gate signals can be acted on the next completed candle.",
    },
    entryWindows: [
      {
        key: "SETUP",
        label: "8-9 setup",
        start: "2026-05-08T08:00:00-05:00",
        end: "2026-05-08T09:00:00-05:00",
        status: "CLOSED",
        guidance:
          "Use only to frame the 9 AM read; setup touches arm context instead of forcing the trade.",
      },
      {
        key: "PRIMARY",
        label: "9-12 primary entries",
        start: "2026-05-08T09:00:00-05:00",
        end: "2026-05-08T12:00:00-05:00",
        status: "ACTIVE",
        guidance:
          "Primary institutional window. Touch-and-close gate signals can be acted on the next completed candle.",
      },
      {
        key: "EXTENSION",
        label: "12-2 extension",
        start: "2026-05-08T12:00:00-05:00",
        end: "2026-05-08T14:00:00-05:00",
        status: "UPCOMING",
        guidance:
          "Treat touches as rejection or continuation confirmation. Size and chase discipline matter more after noon.",
      },
    ],
    hourlyCloses: [
      { hour: 8, label: "08:00", time: "2026-05-08T08:00:00-05:00", close: 5871.50 },
      { hour: 9, label: "09:00", time: "2026-05-08T09:00:00-05:00", close: 5880.00 },
      { hour: 10, label: "10:00", time: "2026-05-08T10:00:00-05:00", close: 5886.50 },
      { hour: 11, label: "11:00", time: "2026-05-08T11:00:00-05:00", close: 5891.25 },
      { hour: 12, label: "12:00", time: "2026-05-08T12:00:00-05:00", close: 5884.75 },
      { hour: 13, label: "13:00", time: "2026-05-08T13:00:00-05:00", close: 5876.00 },
      { hour: 14, label: "14:00", time: "2026-05-08T14:00:00-05:00", close: 5870.50 },
    ],
    lines: [
      { index: -3, label: "South Gate III", value: 5758.00, currentValue: 5758.00, openValue: 5758.50, distanceFromPrice: -122.00, isMain: false },
      { index: -2, label: "South Gate II", value: 5792.00, currentValue: 5792.00, openValue: 5792.50, distanceFromPrice: -88.00, isMain: false },
      { index: -1, label: "South Gate I", value: 5826.00, currentValue: 5826.00, openValue: 5826.50, distanceFromPrice: -54.00, isMain: false },
      { index: 0, label: "Control Line", value: 5860.00, currentValue: 5860.00, openValue: 5860.50, distanceFromPrice: -20.00, isMain: true },
      { index: 1, label: "North Gate I", value: 5894.00, currentValue: 5894.00, openValue: 5894.50, distanceFromPrice: 14.00, isMain: false },
      { index: 2, label: "North Gate II", value: 5928.00, currentValue: 5928.00, openValue: 5928.50, distanceFromPrice: 48.00, isMain: false },
      { index: 3, label: "North Gate III", value: 5962.00, currentValue: 5962.00, openValue: 5962.50, distanceFromPrice: 82.00, isMain: false },
    ],
    recentSignals: [],
  },

  controlTradePlan: {
    status: "ARMED",
    label: "Waiting for clean hourly touch",
    entryReferenceTime: "2026-05-08T08:00:00-05:00",
    signalWindowStart: "2026-05-08T08:00:00-05:00",
    signalWindowEnd: "2026-05-08T11:00:00-05:00",
    targetDistance: 17,
    primaryMap: {
      id: "DESCENDING_CLOSE",
      label: "Primary descending map",
      direction: "DESCENDING",
      anchor: { price: 5878.50, time: "2026-05-07T13:25:00-05:00" },
      slopePerHour: -0.98,
      controlValue: 5860.00,
      armDistance: 26,
      distanceFromOpen: 11.50,
      status: "ARMED",
    },
    oppositeMap: {
      id: "ASCENDING_LOW",
      label: "Opposite ascending map",
      direction: "ASCENDING",
      anchor: { price: 5849.00, time: "2026-05-07T11:00:00-05:00" },
      slopePerHour: 1.22,
      controlValue: 5882.50,
      armDistance: 31,
      distanceFromOpen: -11.00,
      status: "ARMED",
    },
    activeTrade: null,
    setups: [
      {
        side: "BUY",
        contractType: "CALL",
        mapId: "DESCENDING_CLOSE",
        mapLabel: "Primary descending map",
        entryLine: "PREV_RTH_HIGH_DESC",
        entryLineLabel: "Control Line",
        lineValue: 5860.00,
        entryPrice: 5860.00,
        targetPrice: 5877.00,
        targetDistance: 17,
        status: "WATCHING",
        thesis: "Support hold at Control Line; first objective is Half-Gate.",
      },
      {
        side: "SELL",
        contractType: "PUT",
        mapId: "DESCENDING_CLOSE",
        mapLabel: "Primary descending map",
        entryLine: "PREV_RTH_HIGH_DESC",
        entryLineLabel: "Control Line",
        lineValue: 5860.00,
        entryPrice: 5860.00,
        targetPrice: 5843.00,
        targetDistance: 17,
        status: "WATCHING",
        thesis: "Resistance hold at Control Line; first objective is Half-Gate.",
      },
    ],
    signals: [],
    guidance: "First clean 8, 9, or 10 AM candle touch controls the next hourly entry.",
  },

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
      "Inside the ES Control Map. Re-entry watch is dormant until active structure qualifies.",
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

