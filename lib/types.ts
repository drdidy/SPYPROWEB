// Domain types modeled on api/prophet_core.py

export type LineKind =
  | "UA"
  | "UD"
  | "LA"
  | "LD"
  | "ANC_ASC"
  | "ANC_DESC"
  | "PDH"
  | "PDL"
  | "DAY_OPEN";
export type Direction = "ASCENDING" | "DESCENDING";
export type ZoneType = "PRIMARY_TRIGGER" | "SECONDARY_TARGET" | "RETEST";

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type FinalDecision =
  | "TRADE_ALLOWED"
  | "WAIT_FOR_CONFIRMATION"
  | "WAIT_FOR_RETEST"
  | "SELECTIVE_TRADE"
  | "NO_TRADE"
  | "STOP_TRADING";
export type Verdict = "LONG" | "SHORT" | "WAIT" | "STAND DOWN";

export type Grade = "A+" | "A" | "B" | "C" | "D" | "NO_TRADE";

export type SignalStatus = "PENDING_CONFIRMATION" | "CONFIRMED" | "BREACHED" | "EXPIRED";
export type GuardStatus = "INTACT" | "BROKEN" | "WAITING" | "MISSED_ENTRY" | "OK";

export interface Pivot {
  kind: "HIGH" | "LOW";
  price: number;
  time: string; // ISO local
  source: string;
  candleColor: "GREEN" | "RED" | "DOJI";
  fallbackUsed: boolean;
}

export interface DynamicLine {
  name: string; // e.g. "UA-1", "S_DESC-2"
  kind: LineKind | "S_ASC" | "S_DESC";
  anchorPrice: number;
  anchorTime: string;
  slopePerHour: number;
  direction: Direction;
  zoneType: ZoneType;
  isPrimary: boolean;
  currentValue: number; // value at "now"
  entryValue?: number; // value at the 08:00 CT operating reference
  entryReferenceTime?: string;
  touchWindowStart?: string;
  touchWindowEnd?: string;
  liveValue?: number | null; // current projected value when currentValue is entry-anchored for display
  distanceFromPrice: number; // signed dollars
}

export interface BiasState {
  bias: Bias;
  strengthScore: number; // 0..100
  ua: { value: number; touched: boolean };
  ud: { value: number; touched: boolean };
  la: { value: number; touched: boolean };
  ld: { value: number; touched: boolean };
  explanation: string;
}

export interface TradeSignal {
  id: string;
  type: "CALL" | "PUT";
  status: SignalStatus;
  lineName: string;
  rejectionTime: string;
  rejectionPrice: number;
  ohlc: { o: number; h: number; l: number; c: number };
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  targetLineName: string;
  rr: number;
  explanation: string;
}

export interface SignalQuality {
  grade: Grade;
  score: number; // 0..100
  closeDistance: number;
  wickRejectionRatio: number;
  bodyPositionScore: number;
  riskRewardScore: number;
  targetQuality: number;
  warnings: string[];
  strengths: string[];
  actionLabel: string;
}

export interface RiskGuardrailState {
  chase: { status: GuardStatus; detail: string };
  retest: { status: GuardStatus; detail: string };
  structure: { status: GuardStatus; detail: string };
  daily: { status: GuardStatus; detail: string };
}

export interface DecisionState {
  finalDecision: FinalDecision;
  verdict: Verdict;
  conviction: number; // 0..100, alias of quality.score
  finalExplanation: string;
  windowET: string; // e.g. "10:30–11:00 ET"
  updatedAt: string; // "9:42 AM"
}

export interface WaitDisciplineItem {
  key: "candle_gate" | "chase_guard" | "contract_guard";
  label: string;
  status: GuardStatus;
  detail: string;
  countdownSec?: number;
}

export interface OptionsIntel {
  putCallRatio: number;
  maxPain: number;
  callWall: number;
  putWall: number;
  highOI: { strike: number; oi: number; type: "CALL" | "PUT" }[];
  alignment: "ALIGNED" | "MIXED" | "OPPOSED";
  alignmentNote: string;
}

export interface SelectedStrikes {
  underlying: number;
  callStrike: number;
  putStrike: number;
  expiration: string;
  dteLabel: string;
  warning?: string;
}

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ---------------------------------------------------------------------------
// SPX Prophet — second symbol surface
// Modeled on the SPPRO engine: ES Pivot Fan + previous-day RTH refs,
// scenario classifier, primary + alternate plays, confluence score.
// ---------------------------------------------------------------------------

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

export type SPXFanZone =
  | "ABOVE_BOTH_CEILINGS"
  | "BETWEEN_CEILINGS"
  | "BELOW_BOTH_CEILINGS"
  | "BELOW_HIGH_FLOOR"
  | "PENDING";

export type SPXLineKind =
  | "PREV_RTH_HIGH_ASC"
  | "PREV_RTH_HIGH_DESC"
  | "PREV_RTH_LOW_ASC"
  | "PREV_RTH_LOW_DESC"
  | "SWING_HIGH_ASC"
  | "SWING_HIGH_DESC"
  | "SWING_LOW_ASC"
  | "SWING_LOW_DESC";

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
  name: string; // e.g. "Channel Ceiling"
  anchorPrice: number;
  anchorTime: string;
  slopePerHour: number; // +1.04 or -1.04
  currentValue: number; // projected to as-of
  entryValue?: number | null; // projected to the 08:00 CT operating reference
  entryReferenceTime?: string | null;
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
  distanceFromSpot: number; // signed; ~20–25 OTM by spec
}

export interface SPXConfluenceFactor {
  key: "asian" | "london" | "reaction";
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

export interface SPXSnapshotMeta {
  fetcher: string;
  barsSource: string;
  quoteSource: string;
  barsError: string | null;
  quoteError: string | null;
  barsCount: number;
  lookbackHours: number;
  // Offset actually fed into the ES structure engine. This should be 0
  // because ES lines must remain in native ES coordinates.
  appliedOffset: number;
  // Offset derived from the live quote pair, ignoring any override.
  // Useful for noticing when yfinance and your broker disagree.
  computedOffset?: number;
  // Offset requested by env/config for diagnostics. Not applied to ES lines.
  requestedOffset?: number;
  // "computed" or "env_override" — tells you whether the displayed
  // offset is from the live quote or from SPX_ES_OFFSET_OVERRIDE.
  offsetSource?: "native_es" | "computed" | "env_override" | "historical_replay";
  // Sub-algorithm that produced the offset when offsetSource is
  // "computed". One of:
  //   "close_anchored"   — daily SPX close + ES bar whose close
  //                        lands at the cash-session close. This
  //                        is the preferred path because the
  //                        displayed SPX (= live ES + close offset)
  //                        is "exact" against the most recent
  //                        cash print.
  //   "intersection_1m"  — last common ES + SPX 1m print.
  //   "latest_of_each"   — defensive: latest tick of each.
  // Null when the offset was overridden or sourced historically.
  offsetMethod?: "close_anchored" | "intersection_1m" | "latest_of_each" | null;
  spxSpot: number;
  esSpot: number;
  quoteCapturedAt: string;
  asOf: string;
}

export interface SPXSnapshot {
  symbol: "SPX";
  asOf: string; // ISO timestamp
  sessionDateCT: string; // YYYY-MM-DD
  // Optional operator diagnostic surface: which backend served bars
  // and quote, the offset that was applied, and any errors.
  _meta?: SPXSnapshotMeta;

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

  fanRead?: {
    zone: SPXFanZone;
    label: string;
    summary: string;
    primaryReference: SPXLineKind | null;
    secondaryReference: SPXLineKind | null;
  } | null;

  lines: SPXLine[];

  price: {
    last: number;
    change: number;
    changePct: number;
  };

  scenario: SPXScenario;
  scenarioExplanation: string;

  plays: {
    primary: SPXTrade | null; // null when OUTSIDE_PLAY
    alternate: SPXTrade | null;
  };

  contracts: {
    forPrimary: SPXContractSuggestion | null;
    forAlternate: SPXContractSuggestion | null;
  };

  reentryWatch: SPXReentryWatch;

  confluence: {
    factors: SPXConfluenceFactor[];
    score: number; // 0..100
    action: SPXAction;
  };

  // Phase-1 hardening: decision-trace surface (mirrors the SPY shape
  // and the Pydantic schema in api/_lib/spx/schema.py). Optional so
  // older payloads continue to typecheck.
  currentState?: import("./states").EngineState;
  flipCondition?: string;
  stateHistory?: Array<{ ts: string; state: import("./states").EngineState }>;
  decisionTrace?: Array<{ ts: string; event: string; weight?: "info" | "key" }>;
  invalidation?: { level: number; stopOffset: number } | null;
  plannedEnvelope?: { low: number; high: number } | null;
  scoreBands?: {
    standDown: [number, number];
    watch: [number, number];
    go: [number, number];
  };
  rthBias?: {
    direction: "BULLISH" | "BEARISH" | "PENDING";
    openPrice: number | null;
    referenceLine: SPXLineKind | null;
    referenceValue: number | null;
    continuationLine: SPXLineKind | null;
    continuationValue: number | null;
    note: string;
  } | null;
}
