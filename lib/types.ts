export type TriggerStatus = "ARMED" | "WATCHING" | "BREACHED" | "STALE";

export interface Trigger {
  line: string;
  level: number;
  dist: number;
  bps: number;
  bias: number;
  status: TriggerStatus;
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
}
