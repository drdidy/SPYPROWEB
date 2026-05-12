// Map main's /api/snapshot response (the seeded/yfinance-backed +
// Options Snapshot shape that the SPY pipeline already
// produces) onto the typed shapes the editorial UI components expect.
// The editorial UI was built mock-first against my own type system;
// this adapter is the bridge so the same components render against
// live data without rewriting them.
//
// Goal: every visible value on /dashboard is either live or
// computed from live values. Option-chain fields come through
// raw.options. Yahoo Finance feeds the underlying yfinance bars
// behind raw.candles + raw.quote + raw.context. Unusual Whales
// integration plugs in here when its endpoint lands.
import { getSessionInfo, formatConfigWindow } from "./sessions";
import { nearReferencePriceLabel } from "./market-data-quality";
import type {
  BiasState,
  Candle,
  DecisionState,
  DynamicLine,
  FinalDecision,
  Grade,
  GuardStatus,
  OptionsIntel,
  Pivot,
  RiskGuardrailState,
  SelectedStrikes,
  SignalQuality,
  TradeSignal,
  Verdict,
  WaitDisciplineItem,
} from "./types";
// No mock-data imports here. The adapter returns nullable shapes for
// signal/quality/options when the live pipeline doesn't supply them,
// and the consuming components render empty states.

// ---------------------------------------------------------------------------
// Raw shape returned by /api/snapshot (subset; see api/_lib/seed_snapshot.py
// and api/_lib/data_sources.py for the full producer).
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
  anchor?: AnchorPayload | null;
  premarketDiagnostic?: PremarketDiagnostic | null;
  replay?: ReplayBlock | null;
  triggers: Array<{
    line: string;
    kind?: string;
    level: number;
    dist: number;
    bps: number;
    bias: number;
    status: "ARMED" | "WATCHING" | "BREACHED" | "STALE";
  }>;
  candles: Array<{ t: string; o: number; h: number; l: number; c: number }>;
  hourlyCandles?: Array<{ t: string; o: number; h: number; l: number; c: number }>;
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
    score: number; // 0..100 (sometimes 0..1 — we tolerate both)
    grade: string;
    conviction: number;
    window: string;
    rationale: string;
    why: string;
    rr: number | null;
    winPct: number | null;
    edgePct: number | null;
  };
  options?: OptionsRaw | null;
  marketContext?: MarketContextRaw;
  flow?: FlowRaw | null;
  gex?: GexRaw | null;

  // Phase-1 hardening: decision-trace surface. All optional so older
  // payloads (cached responses, pre-rollout clients) stay valid.
  currentState?: import("./states").EngineState;
  flipCondition?: string;
  stateHistory?: Array<{ ts: string; state: import("./states").EngineState }>;
  decisionTrace?: Array<{ ts: string; event: string; weight?: "info" | "key" }>;
  invalidation?: { level: number; stopOffset: number } | null;
  vixDelta?: number;
  feedHealth?: { lastTickTs: string; source: string };
}

interface FlowRaw {
  ticker: string;
  bullishCount: number;
  bearishCount: number;
  premiumNet: number;
  lean: "BULLISH" | "BEARISH" | "BALANCED";
  topPrints: Array<{ strike: number | null; side: string; premium: number; ts: string | null }>;
}

interface GexRaw {
  ticker: string;
  totalGEX: number;
  regime: "POSITIVE" | "NEGATIVE" | "FLAT";
  flipPoint: number | null;
}

interface PivotInfo {
  name: "HIGH_PIVOT" | "LOW_PIVOT";
  price: number;
  source: string;
  anchorTime: string | null;
  fallbackUsed: boolean;
  candleColor: string;
}

export interface AnchorBand {
  anchorPrice: number | null;
  currentValue: number | null;
}
export interface AnchorGroup {
  role: string;
  anchorTime: string;
  anchorLow: number;
  bands: { upper: AnchorBand; main: AnchorBand; lower: AnchorBand };
}
export interface AnchorPayload {
  slopePerHour: number;
  primary: AnchorGroup | null;
  anchor2: AnchorGroup | null;
}

export interface PremarketDiagnosticBar {
  t: string;
  hour: number;
  o: number;
  h: number;
  l: number;
  c: number;
  color: "green" | "red" | "doji";
  qualified: boolean;
  selectedAs: "PRIMARY" | "ANCHOR_2" | null;
  reason: string;
}

export interface PremarketDiagnostic {
  windowStart: string | null;
  windowEnd: string | null;
  selectedPrimary: string | null;
  selectedAnchor2: string | null;
  bars: PremarketDiagnosticBar[];
}

export interface ReplaySession {
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  netPts: number;
  netPct: number;
}
export interface ReplayBlock {
  isReplay: boolean;
  date: string | null;
  session: ReplaySession | null;
  verdictOutcome: "WIN" | "LOSS" | "PUSH" | "N_A" | null;
  verdictPnl: number | null;
  error?: string | null;
}

export interface OptionsRaw {
  expiration: string;
  atm: number;
  calls: Array<{ strike: number; bid: number; ask: number; iv: number; delta: number; gamma: number; oi: number; volume: number }>;
  puts: Array<{ strike: number; bid: number; ask: number; iv: number; delta: number; gamma: number; oi: number; volume: number }>;
  totals: {
    callOi: number;
    putOi: number;
    callVol: number;
    putVol: number;
    pcr: number | null;
  };
}

interface MarketContextRaw {
  vix?: { value: number | null; label: string; tone: string; copy: string };
  vvix?: { value: number | null };
  dxy?: { value: number | null; chgPct: number | null; tone: string };
  tnx?: { value: number | null; chgBps: number | null; tone: string };
  spyPressure?: { label: string; tone: string; value: number | null };
  triggerGap?: { points: number | null; lineName: string; tone: string; label: string };
}

// ---------------------------------------------------------------------------
// Adapted shape consumed by the editorial UI
// ---------------------------------------------------------------------------

export type SignalTick = {
  time: string;
  type: "CALL" | "PUT" | "NOTE";
  line?: string;
  grade?: Grade;
  body: string;
  spark?: number[];
};

export interface AdaptedSnapshot {
  source: RawSnapshot["source"];
  asOf: string;
  decision: DecisionState;
  // Null when no live qualified signal exists yet today. The
  // DecisionSlate's signal-anatomy panel renders an empty state.
  signal: TradeSignal | null;
  quality: SignalQuality | null;
  candles: Candle[];
  hourlyCandles: Candle[];
  lines: DynamicLine[];
  pivots: Pivot[];
  anchor: AnchorPayload | null;
  premarketDiagnostic: PremarketDiagnostic | null;
  replay: ReplayBlock | null;
  currentPrice: number;
  bias: BiasState;
  guardrails: RiskGuardrailState;
  waitDiscipline: WaitDisciplineItem[];
  // Null when the option chain hasn't been fetched (weekend, auth
  // pending, upstream slow). OptionsIntelPanel renders empty state.
  optionsIntel: OptionsIntel | null;
  strikes: SelectedStrikes | null;
  signalTicks: SignalTick[];
  // Standalone Unusual Whales context (also null until the upstream
  // returns data). Distinct from the options panel.
  flow: FlowSummary | null;
  gex: GexSummary | null;
  marketContext: MarketContextRaw | null;
  // Full options chain so the Options page can show
  // a strike ladder beyond the OptionsIntel summary on the dashboard.
  optionsChain: OptionsRaw | null;
  shellState: {
    spy: number;
    change: number;
    changePct: number;
    vix: number;
    vixDelta: number;
    isLive: boolean;
    sessionLabel: string;
    sessionCloses: string;
    feedHealth: { lastTickTs: string; source: string };
  };
  // Phase-1 hardening: decision-trace surface (optional fields preserved
  // as nullable on the adapted shape so consumers can render placeholders
  // when the upstream payload predates the rollout).
  currentState: import("./states").EngineState;
  flipCondition: string;
  stateHistory: Array<{ ts: string; state: import("./states").EngineState }>;
  decisionTrace: Array<{ ts: string; event: string; weight?: "info" | "key" }>;
  invalidation: { level: number; stopOffset: number } | null;
}

export interface FlowSummary {
  ticker: string;
  bullishCount: number;
  bearishCount: number;
  premiumNet: number;
  lean: "BULLISH" | "BEARISH" | "BALANCED";
  topPrints: Array<{ strike: number | null; side: string; premium: number; ts: string | null }>;
}

export interface GexSummary {
  ticker: string;
  totalGEX: number;
  regime: "POSITIVE" | "NEGATIVE" | "FLAT";
  flipPoint: number | null;
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

function mapTriggerToLine(t: RawSnapshot["triggers"][number]): DynamicLine {
  // Engine-supplied kind (UA / UD / LA / LD / ANC_ASC / ANC_DESC /
  // PDH / PDL / DAY_OPEN). Older payloads omit the field; fall back
  // to UA so the row still renders something readable.
  const kind = (t.kind as DynamicLine["kind"]) || "UA";
  const ascending =
    kind === "UA" ||
    kind === "LA" ||
    kind === "ANC_ASC" ||
    kind === "PDL" ||
    kind === "DAY_OPEN";
  return {
    name: t.line,
    kind,
    anchorPrice: t.level,
    anchorTime: "",
    slopePerHour: 0,
    direction: ascending ? "ASCENDING" : "DESCENDING",
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
  // Pull four representative live trigger levels for the BiasMeter.
  // We split armed-above vs armed-below relative to current price so the
  // ua/ud/la/ld slots show real values from the active triggers.
  const last = raw.quote.last;
  const above = raw.triggers.filter((t) => t.level >= last);
  const below = raw.triggers.filter((t) => t.level < last);
  above.sort((a, b) => a.level - b.level); // closest above first
  below.sort((a, b) => b.level - a.level); // closest below first
  const ua = above[0];
  const ud = above[1] ?? above[0];
  const la = below[0];
  const ld = below[1] ?? below[0];
  return {
    bias: raw.decision.bias,
    strengthScore: Math.max(0, Math.min(100, Math.abs(raw.bias.score))),
    ua: { value: ua?.level ?? raw.pivots.high?.price ?? last, touched: ua?.status === "ARMED" },
    ud: { value: ud?.level ?? last * 1.001, touched: ud?.status === "ARMED" },
    la: { value: la?.level ?? raw.pivots.low?.price ?? last, touched: la?.status === "ARMED" },
    ld: { value: ld?.level ?? last * 0.999, touched: ld?.status === "ARMED" },
    explanation: raw.bias.note || raw.decision.why || "",
  };
}

function mapLatestSignal(raw: RawSnapshot): TradeSignal | null {
  const s = raw.signals[0];
  if (!s) return null;
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
    rr: s.rr ?? raw.decision.rr ?? 2,
    explanation: raw.decision.rationale || raw.decision.why || "",
  };
}

function gradeFrom(raw: RawSnapshot): Grade {
  const g = (raw.signals[0]?.grade ?? raw.decision.grade ?? "").trim();
  if (g === "A+" || g === "A" || g === "B" || g === "C" || g === "D") return g;
  return "NO_TRADE";
}

function normalizeScore(raw: RawSnapshot): number {
  const candidates: Array<number | undefined | null> = [
    raw.signals[0]?.score,
    raw.decision.score,
  ];
  for (const c of candidates) {
    if (typeof c !== "number") continue;
    // main publishes either 0..1 or 0..10 or 0..100 across paths; normalize.
    if (c <= 1) return Math.round(c * 100);
    if (c <= 10) return Math.round(c * 10);
    return Math.max(0, Math.min(100, Math.round(c)));
  }
  return 0;
}

function mapQuality(raw: RawSnapshot): SignalQuality | null {
  const s = raw.signals[0];
  if (!s) return null;

  const grade = gradeFrom(raw);
  const score = normalizeScore(raw);
  const lastCandle = raw.candles[raw.candles.length - 1];
  const closeDistance =
    s.entry && lastCandle ? Math.abs(lastCandle.c - s.entry) : 0;
  const wickRange = lastCandle ? lastCandle.h - lastCandle.l || 1 : 1;
  const wickRejectionRatio = lastCandle
    ? Math.min(1, Math.abs(lastCandle.c - lastCandle.o) / wickRange)
    : 0;
  const rr = s.rr ?? raw.decision.rr ?? 0;
  const riskRewardScore = Math.max(0, Math.min(1, rr / 3));
  const winPct = raw.decision.winPct ?? null;
  const edgePct = raw.decision.edgePct ?? null;

  const strengths: string[] = [];
  if (raw.bias.note) strengths.push(raw.bias.note);
  if (winPct !== null) strengths.push(`Win rate trending ${Math.round(winPct)}%`);
  if (edgePct !== null) strengths.push(`Edge ${edgePct.toFixed(2)}R`);
  const warnings: string[] = [];
  if (raw.source === "degraded")
    warnings.push("Live data degraded; check the feed before sizing.");
  if (s.status === "PENDING_CONFIRMATION")
    warnings.push("Waiting for next-bar confirmation.");

  return {
    grade,
    score,
    closeDistance,
    wickRejectionRatio,
    bodyPositionScore: lastCandle ? Math.min(1, Math.abs(lastCandle.c - lastCandle.l) / wickRange) : 0,
    riskRewardScore,
    targetQuality: 0.7,
    strengths,
    warnings,
    actionLabel: mapFinalDecision(raw.decision.verb),
  };
}

function mapShell(raw: RawSnapshot): AdaptedSnapshot["shellState"] {
  return {
    spy: raw.quote.last,
    change: raw.quote.chg,
    changePct: raw.quote.chgPct,
    vix: raw.context.vix,
    vixDelta: typeof raw.vixDelta === "number" ? raw.vixDelta : 0,
    isLive: raw.source === "live",
    sessionLabel:
      raw.source === "live"
        ? "RTH OPEN"
        : raw.source === "degraded"
          ? "DEGRADED"
          : "PRE-OPEN",
    sessionCloses: computeSessionCloses(raw.asOf, raw.source),
    feedHealth: raw.feedHealth ?? { lastTickTs: raw.asOf, source: "unknown" },
  };
}

// Best-effort RTH countdown — produces "closes in 2h 14m" while the
// session is open, or empty string otherwise. Server-side time is
// authoritative; consumers refresh client-side via <Countdown> as
// needed.
function computeSessionCloses(asOfIso: string, source: RawSnapshot["source"]): string {
  if (source !== "live") return "";
  try {
    const now = new Date(asOfIso);
    // RTH close is 15:00 CT = 21:00 UTC (or 20:00 during DST).
    // Use the date's local tz interpretation and target 15:00 in
    // America/Chicago via locale formatting math. Cheaper: rely on
    // the API setting asOf in CT-anchored ISO with offset, and parse
    // the tz from there. We compute by converting both to UTC ms.
    const closeUtcMs = rthCloseUtcMs(now);
    const remaining = closeUtcMs - now.getTime();
    if (remaining <= 0) return "";
    const totalMin = Math.floor(remaining / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `closes in ${h}h ${m}m` : `closes in ${m}m`;
  } catch {
    return "";
  }
}

function rthCloseUtcMs(asOf: Date): number {
  // 15:00 America/Chicago. Express as a wall-clock target by formatting
  // the current "today" through the Chicago locale.
  const ctDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asOf);
  // ctDateStr is YYYY-MM-DD already.
  // Determine the Chicago UTC offset right now (DST aware): build a
  // synthetic 15:00 in CT, parse in UTC, diff.
  const target = new Date(`${ctDateStr}T15:00:00`);
  // Convert that wall time to actual UTC by computing the offset Chicago
  // currently has. We compare what the same wall time looks like when
  // formatted back through Chicago.
  const offsetMin = chicagoOffsetMinutes(asOf);
  return target.getTime() - offsetMin * 60_000;
}

function chicagoOffsetMinutes(d: Date): number {
  // Quick DST detect: compare the formatted Chicago time to the same
  // moment formatted as UTC. Returns minutes Chicago is behind UTC
  // (positive number, e.g. 300 in CST or 300 — wait we want the offset
  // that, when subtracted from the wall time, yields UTC).
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const ctMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((ctMs - d.getTime()) / 60_000);
}

// ---- Options ---------------------------------------------------------------

function mapOptions(raw: RawSnapshot): { intel: OptionsIntel | null; strikes: SelectedStrikes | null } {
  const opt = raw.options;
  const last = raw.quote.last;
  if (!opt) {
    // Honest empty state. The OptionsIntelPanel renders its own
    // "chain not yet loaded" state instead of synthesized fake numbers.
    return { intel: null, strikes: null };
  }

  const allOI = [
    ...opt.calls.map((c) => ({ strike: c.strike, oi: c.oi || 0, type: "CALL" as const })),
    ...opt.puts.map((p) => ({ strike: p.strike, oi: p.oi || 0, type: "PUT" as const })),
  ];
  const highOI = allOI.filter((x) => x.oi > 0).sort((a, b) => b.oi - a.oi).slice(0, 4);

  const callWall = opt.calls.slice().sort((a, b) => (b.oi || 0) - (a.oi || 0))[0]?.strike ?? Math.round(last);
  const putWall = opt.puts.slice().sort((a, b) => (b.oi || 0) - (a.oi || 0))[0]?.strike ?? Math.round(last);

  // Max-pain proxy: strike where total OI (calls + puts) is highest.
  const oiByStrike = new Map<number, number>();
  for (const r of allOI) {
    oiByStrike.set(r.strike, (oiByStrike.get(r.strike) ?? 0) + r.oi);
  }
  let maxPain = Math.round(last);
  let bestOI = -1;
  for (const [k, v] of oiByStrike) {
    if (v > bestOI) {
      bestOI = v;
      maxPain = k;
    }
  }

  const pcr = opt.totals.pcr ?? (opt.totals.callOi ? opt.totals.putOi / opt.totals.callOi : 0);
  const alignment: OptionsIntel["alignment"] =
    pcr > 1.1 ? "OPPOSED" : pcr < 0.9 ? "ALIGNED" : "MIXED";
  const baseNote =
    alignment === "ALIGNED"
      ? `Call OI dominates put OI (PCR ${pcr.toFixed(2)}).`
      : alignment === "OPPOSED"
        ? `Put OI dominates call OI (PCR ${pcr.toFixed(2)}).`
        : `Put-call OI roughly balanced (PCR ${pcr.toFixed(2)}).`;
  // Enrich with Unusual Whales flow + GEX when available so the alignment
  // line names dealer regime and net-buying lean instead of OI alone.
  const uwBits: string[] = [];
  if (raw.flow) {
    uwBits.push(
      `Flow ${raw.flow.lean.toLowerCase()} (${raw.flow.bullishCount} bull / ${raw.flow.bearishCount} bear, net $${Math.round(raw.flow.premiumNet / 1000)}k)`,
    );
  }
  if (raw.gex) {
    const flipLabel = nearReferencePriceLabel(raw.gex.flipPoint, last);
    const flipSuffix = /^\d/.test(flipLabel) ? ` (flip ${flipLabel})` : "";
    uwBits.push(
      `Gamma ${raw.gex.regime.toLowerCase()}${flipSuffix}`,
    );
  }
  const alignmentNote = uwBits.length
    ? `${baseNote} ${uwBits.join("; ")}.`
    : baseNote;

  // Pick OTM strikes 2pts off ATM.
  const atm = opt.atm || Math.round(last);
  const callStrike = atm + 2;
  const putStrike = atm - 2;

  // Compute DTE label.
  let dteLabel = "0DTE";
  try {
    const exp = new Date(opt.expiration);
    const today = new Date();
    const dte = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    dteLabel = dte <= 0 ? "0DTE" : `${dte}DTE`;
  } catch {
    /* leave 0DTE */
  }

  return {
    intel: {
      putCallRatio: Number(pcr.toFixed(2)),
      maxPain,
      callWall,
      putWall,
      highOI: highOI.map((x) => ({ strike: x.strike, oi: x.oi, type: x.type })),
      alignment,
      alignmentNote,
    },
    strikes: {
      underlying: last,
      callStrike,
      putStrike,
      expiration: opt.expiration,
      dteLabel,
    },
  };
}

// ---- Wait discipline + risk guardrails (synthesized from live data) --------

function mapWaitDiscipline(raw: RawSnapshot): WaitDisciplineItem[] {
  const s = raw.signals[0];
  const last = raw.quote.last;
  const candleStatus: GuardStatus = s?.status === "PENDING_CONFIRMATION" ? "WAITING" : "OK";
  const chaseStatus: GuardStatus = s?.entry
    ? Math.abs(last - s.entry) <= 0.3
      ? "OK"
      : "MISSED_ENTRY"
    : "OK";
  const contractStatus: GuardStatus = raw.options ? "OK" : "WAITING";
  return [
    {
      key: "candle_gate",
      label: "Candle Gate",
      status: candleStatus,
      detail:
        s?.status === "PENDING_CONFIRMATION"
          ? `Awaiting next-bar confirm on ${s.line}.`
          : "No qualifying setup pending. Gate inactive.",
    },
    {
      key: "chase_guard",
      label: "Chase Guard",
      status: chaseStatus,
      detail: s?.entry
        ? `Entry ${s.entry.toFixed(2)}; price ${last.toFixed(2)} (${(last - s.entry).toFixed(2)} away).`
        : "No active entry. Chase budget standing by.",
    },
    {
      key: "contract_guard",
      label: "Contract Guard",
      status: contractStatus,
      detail: raw.options
        ? `Options chain loaded (PCR ${(raw.options.totals.pcr ?? 0).toFixed(2)}).`
        : "Options chain not yet fetched.",
    },
  ];
}

function mapGuardrails(raw: RawSnapshot): RiskGuardrailState {
  const s = raw.signals[0];
  const last = raw.quote.last;

  const chase: { status: GuardStatus; detail: string } = s?.entry
    ? Math.abs(last - s.entry) <= 0.3
      ? { status: "OK", detail: `Within budget of ${s.entry.toFixed(2)}.` }
      : {
          status: "MISSED_ENTRY",
          detail: `Price ${last.toFixed(2)} past entry ${s.entry.toFixed(2)}; setup expired.`,
        }
    : { status: "OK", detail: "No live entry to chase." };

  const retest: { status: GuardStatus; detail: string } = s
    ? s.status === "CONFIRMED"
      ? { status: "INTACT", detail: `${s.line} confirmed.` }
      : { status: "WAITING", detail: `Awaiting retest of ${s.line}.` }
    : { status: "OK", detail: "No retest required." };

  const armedCount = raw.triggers.filter((t) => t.status === "ARMED").length;
  const structure: { status: GuardStatus; detail: string } = armedCount
    ? { status: "INTACT", detail: `${armedCount} line${armedCount === 1 ? "" : "s"} armed; structure holding.` }
    : { status: "WAITING", detail: "No lines armed yet today." };

  const sigCount = raw.signals.length;
  const daily: { status: GuardStatus; detail: string } =
    sigCount >= 3
      ? { status: "BROKEN", detail: `${sigCount} signals today; daily cap.` }
      : { status: "OK", detail: `${sigCount} of 3 daily signal blocks used.` };

  return { chase, retest, structure, daily };
}

// ---- Signal tape ticks -----------------------------------------------------

function mapSignalTicks(raw: RawSnapshot): SignalTick[] {
  // Latest signals as CALL/PUT events; fold in a couple of NOTE ticks
  // synthesized from live context (VIX cross, bias note) when available.
  const ticks: SignalTick[] = raw.signals.slice(0, 6).map((s) => {
    const validGrades = ["A+", "A", "B", "C", "D"] as const;
    const grade = (validGrades as readonly string[]).includes(s.grade)
      ? (s.grade as Grade)
      : undefined;
    const type: "CALL" | "PUT" | "NOTE" =
      s.dir === "down" ? "PUT" : s.dir === "up" ? "CALL" : "NOTE";
    const body =
      s.entry !== null
        ? `${s.line} rejection at ${s.entry.toFixed(2)} (${s.status.replace(/_/g, " ").toLowerCase()}).`
        : `${s.line} signal printed (${s.status.replace(/_/g, " ").toLowerCase()}).`;
    return {
      time: s.ts,
      type,
      line: s.line,
      grade,
      body,
    };
  });

  if (raw.bias?.note) {
    ticks.push({
      time: shortTime(raw.asOf),
      type: "NOTE",
      body: raw.bias.note,
    });
  }
  if (raw.context?.vix) {
    ticks.push({
      time: shortTime(raw.asOf),
      type: "NOTE",
      body: `VIX ${raw.context.vix.toFixed(2)}, DXY ${raw.context.dxy.toFixed(2)}, VVIX ${raw.context.vvix.toFixed(2)}.`,
    });
  }
  return ticks;
}

function deriveCurrentState(verb: string): import("./states").EngineState {
  const v = (verb || "").toUpperCase();
  if (v === "STAND DOWN" || v === "STAND_DOWN") return "STAND_DOWN";
  if (v === "LONG" || v === "SHORT") return "GO";
  if (v === "HOLD") return "COOLDOWN";
  if (v === "WAIT") return "WAIT";
  return "WATCH";
}

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

/**
 * Apply the per-engine session calendar on top of whatever the API
 * said. When the session phase is one in which the engine cannot
 * honestly be in a post-config state (PRE_CONFIG / CLOSED_*), force
 * currentState to PRE_CONFIG and blank the structure / trace surfaces
 * so the slate never fabricates reasoning over stale or absent data.
 */
/**
 * Same gate, applied to an SPXSnapshot. Static import of `./sessions`
 * — the previous lazy `require()` failed silently in client bundles
 * on Vercel, leaving SPX un-gated on weekends and showing live-engine
 * reasoning when it should have read "Awaiting setup".
 */
export function applySpxSessionGate(
  base: import("./types").SPXSnapshot,
  now: Date = new Date(),
): import("./types").SPXSnapshot {
  const session = getSessionInfo("SPX", now);
  const muted =
    session.phase === "PRE_CONFIG" ||
    session.phase === "CLOSED_WEEKEND" ||
    session.phase === "CLOSED_HOLIDAY";
  if (!muted) return base;

  const window = formatConfigWindow(session);
  return {
    ...base,
    currentState: "PRE_CONFIG",
    flipCondition: `Engine activates after ${window} configuration window.`,
    decisionTrace: [
      {
        ts: base.asOf,
        event: "Awaiting configuration window — no envelope plotted yet",
        weight: "key",
      },
    ],
    stateHistory: [],
    invalidation: null,
    plannedEnvelope: null,
    lines: [],
  };
}

function applySpyPreConfigOverride(
  base: AdaptedSnapshot,
  now: Date = new Date(),
): AdaptedSnapshot {
  // Static import (top of file) — see SPX gate note above.
  const session = getSessionInfo("SPY", now);
  const muted =
    session.phase === "PRE_CONFIG" ||
    session.phase === "CLOSED_WEEKEND" ||
    session.phase === "CLOSED_HOLIDAY";
  if (!muted) return base;

  const window = formatConfigWindow(session);
  return {
    ...base,
    currentState: "PRE_CONFIG",
    flipCondition: `Engine activates after ${window} configuration window.`,
    decisionTrace: [
      {
        ts: base.asOf,
        event: "Awaiting configuration window — no lines plotted yet",
        weight: "key",
      },
    ],
    // No state transitions are meaningful before the engine has run
    // its config window. Blank stateHistory so the timeline strip
    // hides itself for this engine.
    stateHistory: [],
    invalidation: null,
    lines: [],
  };
}

export function adaptSnapshot(
  raw: RawSnapshot,
  now: Date = new Date(),
): AdaptedSnapshot {
  const { intel, strikes } = mapOptions(raw);
  const adapted: AdaptedSnapshot = {
    source: raw.source,
    asOf: raw.asOf,
    decision: mapDecision(raw),
    currentState: (raw.currentState ?? deriveCurrentState(raw.decision.verb)) as import(
      "./states"
    ).EngineState,
    flipCondition: raw.flipCondition ?? "",
    stateHistory: raw.stateHistory ?? [],
    decisionTrace: raw.decisionTrace ?? [],
    invalidation: raw.invalidation ?? null,
    signal: mapLatestSignal(raw),
    quality: mapQuality(raw),
    candles: raw.candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: 0 })),
    hourlyCandles: (raw.hourlyCandles ?? []).map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: 0 })),
    anchor: raw.anchor ?? null,
    premarketDiagnostic: raw.premarketDiagnostic ?? null,
    replay: raw.replay ?? null,
    lines: raw.triggers.map(mapTriggerToLine),
    pivots: mapPivots(raw),
    currentPrice: raw.quote.last,
    bias: mapBias(raw),
    guardrails: mapGuardrails(raw),
    waitDiscipline: mapWaitDiscipline(raw),
    optionsIntel: intel,
    strikes,
    signalTicks: mapSignalTicks(raw),
    flow: raw.flow ?? null,
    gex: raw.gex ?? null,
    marketContext: raw.marketContext ?? null,
    optionsChain: raw.options ?? null,
    shellState: mapShell(raw),
  };
  return applySpyPreConfigOverride(adapted, now);
}
