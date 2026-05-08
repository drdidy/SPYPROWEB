// Map main's /api/snapshot response (the seeded/yfinance-backed Snapshot
// shape that the SPY pipeline already produces) onto the typed shapes the
// editorial UI components expect. The editorial UI was built mock-first
// against my own type system; this adapter is the bridge so the same
// components render against live data without rewriting them.
//
// Conservative mapping: where main supplies the field, we use it;
// where it doesn't, we fall back to a stable placeholder so the
// component still renders. The dashboard's headline numbers
// (verdict, conviction, last/chg/vix, pivots, triggers, candles) come
// from main; the secondary panels (SignalQuality breakdown,
// WaitDiscipline, RiskGuardrails, OptionsIntel) keep their mock
// values until those endpoints exist.
import type {
  BiasState,
  Candle,
  DecisionState,
  DynamicLine,
  FinalDecision,
  Pivot,
  RiskGuardrailState,
  SignalQuality,
  TradeSignal,
  Verdict,
  WaitDisciplineItem,
  OptionsIntel,
  SelectedStrikes,
} from "./types";
import {
  signalQuality as mockQuality,
  latestSignal as mockSignal,
  waitDiscipline as mockWaitDiscipline,
  guardrails as mockGuardrails,
  optionsIntel as mockOptionsIntel,
  strikes as mockStrikes,
} from "./mock-data";

// ---------------------------------------------------------------------------
// Raw shape returned by /api/snapshot (subset; see api/_lib/seed_snapshot.py)
// ---------------------------------------------------------------------------

export interface RawSnapshot {
  asOf: string;
  source: "seed" | "live" | "degraded" | "error";
  bias: { label: string; score: number; note: string };
  quote: {
    last: number;
    chg: number;
    chgPct: number;
    open: number;
    high: number;
    low: number;
    prevClose: number;
  };
  context: { vix: number; dxy: number; vvix: number };
  spark: number[];
  triggers: Array<{
    line: string;
    level: number;
    dist: number;
    bps: number;
    bias: number;
    status: "ARMED" | "WATCHING" | "BREACHED" | "STALE";
  }>;
  candles: Array<{ t: string; o: number; h: number; l: number; c: number }>;
  signals: Array<{
    id: string;
    type: string;
    line: string;
    ts: string;
    score: number;
    grade: string;
    dir: "up" | "down" | "neutral";
    status: "PENDING_CONFIRMATION" | "CONFIRMED";
    outcome: number | null;
    entry: number | null;
    stop: number | null;
    target: number | null;
    rr: number | null;
  }>;
  pivots: {
    high: PivotInfo | null;
    low: PivotInfo | null;
    slope: number;
    structureDay: string | null;
    signalDay: string | null;
  };
  decision: {
    verb: string;
    bias: "BULLISH" | "BEARISH" | "NEUTRAL";
    biasColor: string;
    score: number;
    grade: string;
    conviction: number;
    window: string;
    rationale: string;
    why: string;
    rr: number | null;
    winPct: number | null;
    edgePct: number | null;
  };
  options?: unknown | null;
}

interface PivotInfo {
  name: "HIGH_PIVOT" | "LOW_PIVOT";
  price: number;
  source: string;
  anchorTime: string | null;
  fallbackUsed: boolean;
  candleColor: string;
}

// ---------------------------------------------------------------------------
// Adapted shape consumed by the editorial UI
// ---------------------------------------------------------------------------

export interface AdaptedSnapshot {
  source: RawSnapshot["source"];
  asOf: string;
  decision: DecisionState;
  signal: TradeSignal;
  quality: SignalQuality;
  candles: Candle[];
  lines: DynamicLine[];
  pivots: Pivot[];
  currentPrice: number;
  bias: BiasState;
  guardrails: RiskGuardrailState;
  waitDiscipline: WaitDisciplineItem[];
  optionsIntel: OptionsIntel;
  strikes: SelectedStrikes;
  shellState: {
    spy: number;
    change: number;
    changePct: number;
    vix: number;
    isLive: boolean;
    sessionLabel: string;
    sessionCloses: string;
  };
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapVerdict(verb: string): Verdict {
  const v = verb.toUpperCase();
  if (v === "LONG" || v === "SHORT" || v === "WAIT") return v;
  if (v === "HOLD") return "WAIT";
  return "STAND DOWN";
}

function mapFinalDecision(verb: string): FinalDecision {
  const v = verb.toUpperCase();
  if (v === "LONG" || v === "SHORT") return "TRADE_ALLOWED";
  if (v === "WAIT" || v === "HOLD") return "WAIT_FOR_CONFIRMATION";
  if (v === "EXIT") return "STOP_TRADING";
  return "NO_TRADE";
}

function mapDecision(raw: RawSnapshot): DecisionState {
  const updated = new Date(raw.asOf);
  const hh = updated.getHours();
  const mm = String(updated.getMinutes()).padStart(2, "0");
  const ampm = hh < 12 ? "AM" : "PM";
  const hh12 = ((hh + 11) % 12) + 1;
  return {
    finalDecision: mapFinalDecision(raw.decision.verb),
    verdict: mapVerdict(raw.decision.verb),
    conviction: Math.max(0, Math.min(100, Math.abs(raw.decision.conviction || 0))),
    finalExplanation: raw.decision.rationale || raw.decision.why || "",
    windowET: raw.decision.window || "",
    updatedAt: `${hh12}:${mm} ${ampm} ET`,
  };
}

function mapTriggerToLine(t: RawSnapshot["triggers"][number], i: number): DynamicLine {
  return {
    name: t.line,
    kind: "UA",
    anchorPrice: t.level,
    anchorTime: "",
    slopePerHour: 0,
    direction: t.dist >= 0 ? "ASCENDING" : "DESCENDING",
    zoneType: t.status === "ARMED" ? "PRIMARY_TRIGGER" : "SECONDARY_TARGET",
    isPrimary: t.status === "ARMED",
    currentValue: t.level,
    distanceFromPrice: t.dist,
  };
}

function mapPivots(raw: RawSnapshot): Pivot[] {
  const out: Pivot[] = [];
  if (raw.pivots.high) {
    out.push({
      kind: "HIGH",
      price: raw.pivots.high.price,
      time: raw.pivots.high.anchorTime || raw.asOf,
      source: raw.pivots.high.source || "Live",
      candleColor:
        raw.pivots.high.candleColor === "green"
          ? "GREEN"
          : raw.pivots.high.candleColor === "red"
            ? "RED"
            : "DOJI",
      fallbackUsed: !!raw.pivots.high.fallbackUsed,
    });
  }
  if (raw.pivots.low) {
    out.push({
      kind: "LOW",
      price: raw.pivots.low.price,
      time: raw.pivots.low.anchorTime || raw.asOf,
      source: raw.pivots.low.source || "Live",
      candleColor:
        raw.pivots.low.candleColor === "green"
          ? "GREEN"
          : raw.pivots.low.candleColor === "red"
            ? "RED"
            : "DOJI",
      fallbackUsed: !!raw.pivots.low.fallbackUsed,
    });
  }
  return out;
}

function mapBias(raw: RawSnapshot): BiasState {
  // Pull placeholder ua/ud/la/ld values from triggers if available, else
  // mirror the pivot prices so the BiasMeter has something to render
  // without lying.
  const armed = raw.triggers.filter((t) => t.status === "ARMED");
  const high = raw.pivots.high?.price ?? raw.quote.high;
  const low = raw.pivots.low?.price ?? raw.quote.low;
  return {
    bias: raw.decision.bias,
    strengthScore: Math.max(0, Math.min(100, Math.abs(raw.bias.score))),
    ua: { value: armed[0]?.level ?? high, touched: armed[0]?.status === "ARMED" },
    ud: { value: armed[1]?.level ?? high * 1.001, touched: false },
    la: { value: armed[2]?.level ?? low, touched: false },
    ld: { value: armed[3]?.level ?? low * 0.999, touched: false },
    explanation: raw.bias.note || raw.decision.why || "",
  };
}

function mapLatestSignal(raw: RawSnapshot): TradeSignal {
  const s = raw.signals[0];
  if (!s) return mockSignal;
  const lastCandle = raw.candles[raw.candles.length - 1];
  return {
    id: s.id,
    type: s.dir === "down" ? "PUT" : "CALL",
    status: s.status,
    lineName: s.line,
    rejectionTime: s.ts,
    rejectionPrice: s.entry ?? raw.quote.last,
    ohlc: lastCandle
      ? { o: lastCandle.o, h: lastCandle.h, l: lastCandle.l, c: lastCandle.c }
      : { o: raw.quote.open, h: raw.quote.high, l: raw.quote.low, c: raw.quote.last },
    entryPrice: s.entry ?? raw.quote.last,
    stopPrice: s.stop ?? (s.entry ? s.entry * 0.998 : raw.quote.last * 0.998),
    targetPrice:
      s.target ?? (s.entry ? s.entry * 1.004 : raw.quote.last * 1.004),
    targetLineName: "TARGET",
    rr: s.rr ?? 2,
    explanation: `Signal at ${s.line} (${s.status.replace(/_/g, " ").toLowerCase()})`,
  };
}

function mapQuality(raw: RawSnapshot): SignalQuality {
  const s = raw.signals[0];
  if (!s) return mockQuality;
  // Main publishes a 0-10 score and a letter grade. Normalize to my 0-100
  // and reuse the breakdown placeholders from mock — main doesn't expose
  // close-distance / wick-ratio / body-position decomposition.
  const score100 = Math.max(0, Math.min(100, Math.round(s.score * 10)));
  return {
    ...mockQuality,
    grade: (s.grade as SignalQuality["grade"]) || mockQuality.grade,
    score: score100,
  };
}

function mapShell(raw: RawSnapshot): AdaptedSnapshot["shellState"] {
  return {
    spy: raw.quote.last,
    change: raw.quote.chg,
    changePct: raw.quote.chgPct,
    vix: raw.context.vix,
    isLive: raw.source === "live",
    sessionLabel:
      raw.source === "live"
        ? "RTH OPEN"
        : raw.source === "degraded"
          ? "DEGRADED"
          : "PRE-OPEN",
    sessionCloses: "",
  };
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

export function adaptSnapshot(raw: RawSnapshot): AdaptedSnapshot {
  return {
    source: raw.source,
    asOf: raw.asOf,
    decision: mapDecision(raw),
    signal: mapLatestSignal(raw),
    quality: mapQuality(raw),
    candles: raw.candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: 0 })),
    lines: raw.triggers.map(mapTriggerToLine),
    pivots: mapPivots(raw),
    currentPrice: raw.quote.last,
    bias: mapBias(raw),
    // The editorial UI's secondary panels expect rich shapes that
    // /api/snapshot doesn't supply yet. Fall back to mock until those
    // adapters land — gives the surface visual completeness without
    // claiming live data we don't have.
    guardrails: mockGuardrails,
    waitDiscipline: mockWaitDiscipline,
    optionsIntel: mockOptionsIntel,
    strikes: mockStrikes,
    shellState: mapShell(raw),
  };
}
