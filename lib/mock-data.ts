import type {
  BiasState,
  Candle,
  DecisionState,
  DynamicLine,
  OptionsIntel,
  Pivot,
  RiskGuardrailState,
  SelectedStrikes,
  SignalQuality,
  TradeSignal,
  WaitDisciplineItem,
} from "./types";

// ---- Synthetic 4H candle series (60 bars) ----
function buildCandles(): Candle[] {
  const out: Candle[] = [];
  let price = 561.4;
  const start = new Date("2026-04-15T13:30:00-04:00").getTime();
  const dt = 4 * 60 * 60 * 1000;
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 60; i++) {
    const drift = Math.sin(i / 7) * 0.6 + (i / 60) * 22;
    const noise = (rand() - 0.5) * 1.6;
    const o = price;
    const c = +(561.4 + drift + noise).toFixed(2);
    const h = +(Math.max(o, c) + rand() * 1.2).toFixed(2);
    const l = +(Math.min(o, c) - rand() * 1.2).toFixed(2);
    const v = Math.round(60_000_000 + rand() * 30_000_000);
    out.push({ t: new Date(start + i * dt).toISOString(), o, h, l, c, v });
    price = c;
  }
  return out;
}

export const candles: Candle[] = buildCandles();
export const currentPrice = candles[candles.length - 1].c;

// ---- Anchor pivots ----
export const pivots: Pivot[] = [
  {
    kind: "HIGH",
    price: 585.42,
    time: "2026-05-02T14:30:00-04:00",
    source: "Daily swing",
    candleColor: "RED",
    fallbackUsed: false,
  },
  {
    kind: "LOW",
    price: 569.18,
    time: "2026-04-28T09:30:00-04:00",
    source: "RTH open print",
    candleColor: "GREEN",
    fallbackUsed: false,
  },
];

// ---- Dynamic fan lines (primary + secondary) ----
export const lines: DynamicLine[] = [
  {
    name: "UA-1",
    kind: "UA",
    anchorPrice: 569.18,
    anchorTime: pivots[1].time,
    slopePerHour: 0.2,
    direction: "ASCENDING",
    zoneType: "PRIMARY_TRIGGER",
    isPrimary: true,
    currentValue: 583.84,
    distanceFromPrice: +0.42,
  },
  {
    name: "UD-1",
    kind: "UD",
    anchorPrice: 585.42,
    anchorTime: pivots[0].time,
    slopePerHour: -0.2,
    direction: "DESCENDING",
    zoneType: "PRIMARY_TRIGGER",
    isPrimary: true,
    currentValue: 585.06,
    distanceFromPrice: +1.64,
  },
  {
    name: "LA-1",
    kind: "LA",
    anchorPrice: 569.18,
    anchorTime: pivots[1].time,
    slopePerHour: 0.2,
    direction: "ASCENDING",
    zoneType: "PRIMARY_TRIGGER",
    isPrimary: true,
    currentValue: 581.20,
    distanceFromPrice: -2.22,
  },
  {
    name: "LD-1",
    kind: "LD",
    anchorPrice: 585.42,
    anchorTime: pivots[0].time,
    slopePerHour: -0.2,
    direction: "DESCENDING",
    zoneType: "PRIMARY_TRIGGER",
    isPrimary: true,
    currentValue: 580.00,
    distanceFromPrice: -3.42,
  },
  {
    name: "S_ASC-1",
    kind: "S_ASC",
    anchorPrice: 569.18,
    anchorTime: pivots[1].time,
    slopePerHour: 0.2,
    direction: "ASCENDING",
    zoneType: "SECONDARY_TARGET",
    isPrimary: false,
    currentValue: 587.10,
    distanceFromPrice: +3.68,
  },
  {
    name: "S_DESC-1",
    kind: "S_DESC",
    anchorPrice: 585.42,
    anchorTime: pivots[0].time,
    slopePerHour: -0.2,
    direction: "DESCENDING",
    zoneType: "SECONDARY_TARGET",
    isPrimary: false,
    currentValue: 577.80,
    distanceFromPrice: -5.62,
  },
];

// ---- Bias state ----
export const biasState: BiasState = {
  bias: "BULLISH",
  strengthScore: 71,
  ua: { value: 583.84, touched: true },
  ud: { value: 585.06, touched: false },
  la: { value: 581.20, touched: false },
  ld: { value: 580.00, touched: false },
  explanation:
    "Price tested support twice with VIX falling. Upside lean. Overhead resistance hasn't been stressed yet.",
};

// ---- Latest signal ----
export const latestSignal: TradeSignal = {
  id: "SIG-2026-05-07-03",
  type: "CALL",
  status: "PENDING_CONFIRMATION",
  lineName: "UA-1",
  rejectionTime: "2026-05-07T09:38:00-04:00",
  rejectionPrice: 583.42,
  ohlc: { o: 583.10, h: 583.92, l: 582.84, c: 583.42 },
  entryPrice: 583.62,
  stopPrice: 582.78,
  targetPrice: 585.40,
  targetLineName: "UD-1",
  rr: 2.4,
  explanation:
    "Hourly close 0.04 above UA-1 with wick rejection ratio 0.62. Awaiting next-candle confirmation before arming.",
};

// ---- Signal quality ----
export const signalQuality: SignalQuality = {
  grade: "B",
  score: 76,
  closeDistance: 0.04,
  wickRejectionRatio: 0.62,
  bodyPositionScore: 0.71,
  riskRewardScore: 0.78,
  targetQuality: 0.66,
  strengths: [
    "Close right at the line",
    "Wick rejection looks strong",
    "R:R well above the floor",
  ],
  warnings: ["Target is a near line, so expect partial follow-through, not a runaway"],
  actionLabel: "SELECTIVE_TRADE",
};

// ---- Guardrails ----
export const guardrails: RiskGuardrailState = {
  chase: {
    status: "OK",
    detail: "Price still inside the chase budget. Don't pay up.",
  },
  retest: {
    status: "WAITING",
    detail: "Awaiting touch of UA-1 within $0.10 tolerance for confirmation.",
  },
  structure: {
    status: "INTACT",
    detail: "No close has invalidated UA-1 since rejection print.",
  },
  daily: {
    status: "OK",
    detail: "1 of 3 daily signal blocks used.",
  },
};

// ---- Decision ----
export const decision: DecisionState = {
  finalDecision: "WAIT_FOR_CONFIRMATION",
  verdict: "WAIT",
  conviction: 76,
  finalExplanation:
    "Setup formed at one of today's lines. We want one more candle to confirm before clicking. Risk is in budget.",
  windowET: "10:30–11:00 ET",
  updatedAt: "9:42 AM ET",
};

// ---- Wait discipline ----
export const waitDiscipline: WaitDisciplineItem[] = [
  {
    key: "candle_gate",
    label: "Candle Gate",
    status: "WAITING",
    detail: "Next hourly open in 18m. No entry until close confirms rejection.",
    countdownSec: 18 * 60,
  },
  {
    key: "chase_guard",
    label: "Chase Guard",
    status: "OK",
    detail: "Price is still inside the entry budget. Within reason to take it.",
  },
  {
    key: "contract_guard",
    label: "Contract Guard",
    status: "OK",
    detail: "Strike offset 2.0 OTM aligned with target. Premium flow neutral.",
  },
];

// ---- Options intel ----
export const optionsIntel: OptionsIntel = {
  putCallRatio: 0.84,
  maxPain: 584,
  callWall: 588,
  putWall: 578,
  highOI: [
    { strike: 580, oi: 21400, type: "PUT" },
    { strike: 585, oi: 18200, type: "CALL" },
    { strike: 590, oi: 12900, type: "CALL" },
    { strike: 575, oi: 11800, type: "PUT" },
  ],
  alignment: "ALIGNED",
  alignmentNote:
    "Max pain at 584 sits between rejection (583.62) and target (585.40). Dealer flow does not oppose the setup.",
};

// ---- Selected strikes ----
export const strikes: SelectedStrikes = {
  underlying: 583.42,
  callStrike: 585,
  putStrike: 582,
  expiration: "2026-05-07",
  dteLabel: "0DTE",
};

// ---- Top bar / shell ----
export const shellState = {
  spy: 583.42,
  change: 1.84,
  changePct: 0.32,
  vix: 14.27,
  isLive: true,
  sessionLabel: "RTH OPEN",
  sessionCloses: "closes 2h 14m",
};

// ---- Nav ----
export type NavItem = { label: string; href: string; group: string };

export const navIndex: NavItem[] = [
  { label: "Decision Slate", href: "/dashboard", group: "Workspace" },
  { label: "SPX Channel", href: "/spx", group: "Workspace" },
  { label: "Structure Read", href: "/structure", group: "Workspace" },
  { label: "Foresight", href: "/foresight", group: "Workspace" },
  { label: "Options Cockpit", href: "/options", group: "Execution" },
  { label: "Market Context", href: "/context", group: "Intelligence" },
  { label: "Order Flow", href: "/flow", group: "Intelligence" },
  { label: "Daily Brief", href: "/brief", group: "Intelligence" },
  { label: "Learning", href: "/learn", group: "Intelligence" },
  { label: "Signal Log", href: "/log", group: "Journal" },
  { label: "Configuration", href: "/settings", group: "Journal" },
];
