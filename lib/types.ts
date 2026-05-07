export type TriggerStatus = "ARMED" | "WATCHING" | "BREACHED" | "STALE";

export interface Trigger {
  line: string;
  level: number;
  dist: number;
  bps: number;
  bias: number;
  status: TriggerStatus;
}

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface ChartLine {
  label: string;
  value: number;
  color: string;
  dash: boolean;
  armed: boolean;
}

export interface Snapshot {
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
  triggers: Trigger[];
  candles: Candle[];
  chartLines: ChartLine[];
  options: OptionsSnapshot | null;
  signals: Signal[];
  pivots: PivotsSnapshot;
}

export interface PivotInfo {
  name: "HIGH_PIVOT" | "LOW_PIVOT";
  price: number;
  source: string;
  anchorTime: string | null;
  candleStarts?: string;
  candleCloses?: string;
  fallbackUsed: boolean;
  candleColor: string;
  structureDay: string | null;
  candle?: { o: number; h: number; l: number; c: number };
}

export interface PivotsSnapshot {
  high: PivotInfo | null;
  low: PivotInfo | null;
  slope: number;
  structureDay: string | null;
  signalDay: string | null;
}

export type SignalDir = "up" | "down" | "neutral";
export type SignalStatus = "PENDING_CONFIRMATION" | "CONFIRMED";

export interface Signal {
  id: string;
  type: "REJECTION";
  line: string;
  ts: string;
  score: number;
  grade: string;
  dir: SignalDir;
  status: SignalStatus;
  outcome: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  rr: number | null;
}

export interface OptionRow {
  strike: number;
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  gamma: number;
  oi: number;
  volume: number;
}

export interface OptionsSnapshot {
  expiration: string;
  atm: number;
  calls: OptionRow[];
  puts: OptionRow[];
  totals: {
    callOi: number;
    putOi: number;
    callVol: number;
    putVol: number;
    pcr: number | null;
  };
}
