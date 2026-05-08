// SPX Prophet snapshot types — mirror of api/_lib/spx/schema.py.
//
// Shape of /api/spx/snapshot. The Python schema and these TS types
// stay in lockstep; if you change one, change both.
//
// Kept separate from lib/types.ts (which holds the SPY domain model
// the existing dashboard already consumes) so SPX can grow without
// touching SPY's surface.

export type SPXChannelDirection = "ASCENDING" | "DESCENDING" | "NONE";
export type SPXNoChannelReason = "EXPANSION" | "CONTRACTION";
export type SPXScenario =
  | "ABOVE_ASCENDING"
  | "INSIDE_ASCENDING"
  | "BELOW_ASCENDING"
  | "ABOVE_DESCENDING"
  | "INSIDE_DESCENDING"
  | "BELOW_DESCENDING"
  | "OUTSIDE_PLAY"; // scenario 7: stand down

export type SPXLineKind =
  | "CHANNEL_CEILING"
  | "CHANNEL_FLOOR"
  | "PREV_RTH_HIGH_ASC"
  | "PREV_RTH_LOW_DESC";

export type SPXAction = "TAKE" | "SELECTIVE" | "STAND_DOWN";

export interface SPXAnchor {
  price: number;
  time: string; // ISO, CT-anchored
}

export interface SPXSessionRange {
  high: number;
  low: number;
  highTime: string;
  lowTime: string;
}

export interface SPXLine {
  kind: SPXLineKind;
  name: string;
  anchorPrice: number;
  anchorTime: string;
  slopePerHour: number; // +1.05 or -1.05
  currentValue: number; // projected to as-of
  distanceFromPrice: number; // signed
}

export interface SPXTrade {
  side: "BUY" | "SELL";
  entryLine: SPXLineKind;
  entryPrice: number;
  exitLine: SPXLineKind;
  exitPrice: number;
}

export interface SPXContractSuggestion {
  type: "CALL" | "PUT";
  strike: number;
  expiration: string; // ISO date
  dteLabel: "0DTE" | "1DTE" | string;
  distanceFromSpot: number; // signed; ~22.5 OTM by spec
}

export interface SPXConfluenceFactor {
  key: "asian" | "london" | "reaction" | "factor4_tbd" | "factor5_tbd";
  label: string;
  value: number; // 0..1 normalized
  weight: number; // 0..1
  contribution: number; // value * weight
  note?: string;
}

export interface SPXReentryWatch {
  active: boolean;
  side: "BUY_FROM_ABOVE" | "SELL_FROM_BELOW" | null;
  detail: string;
}

export interface SPXSnapshot {
  symbol: "SPX";
  asOf: string;
  sessionDateCT: string;

  overnight: {
    window: { start: string; end: string };
    high: SPXAnchor;
    low: SPXAnchor;
  };

  sessions: {
    sydney: SPXSessionRange;
    tokyo: SPXSessionRange;
  };

  channel: {
    direction: SPXChannelDirection;
    reason: string;
    noChannelReason?: SPXNoChannelReason;
  };

  lines: SPXLine[];

  price: {
    last: number;
    change: number;
    changePct: number;
  };

  scenario: SPXScenario;
  scenarioExplanation: string;

  plays: {
    primary: SPXTrade | null;
    alternate: SPXTrade | null;
  };

  contracts: {
    forPrimary: SPXContractSuggestion | null;
    forAlternate: SPXContractSuggestion | null;
  };

  reentryWatch: SPXReentryWatch;

  confluence: {
    factors: SPXConfluenceFactor[];
    score: number;
    action: SPXAction;
  };
}
