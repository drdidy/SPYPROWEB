import type {
  LineType,
} from "@/lib/contracts/channel";
import type {
  ProjectionMethod,
  ScenarioInput,
  ScenarioKind,
} from "@/lib/contracts/foresight";

export const FORESIGHT_RULE_VERSION = "v1.0.0";

export const FORESIGHT_HOUR_BUCKETS_CT = [
  "08:30",
  "09:30",
  "10:30",
  "11:30",
  "12:30",
  "13:30",
  "14:30",
  "15:00",
] as const;

export const FORESIGHT_CONFIDENCE_THRESHOLDS = {
  high: 75,
  medium: 50,
  nearestBandPts: 0.75,
  refreshMs: 60_000,
  staleMs: 120_000,
};

export const FORESIGHT_CALIBRATION_WINDOW_SESSIONS = 20;

export const PROJECTION_METHOD_BY_LINE_TYPE: Record<LineType, ProjectionMethod> = {
  ascending: "linear_slope",
  descending: "linear_slope",
  horizontal: "held_flat",
  anchor: "linear_slope",
  rail: "linear_slope",
};

export const SCENARIO_PRESETS: Record<
  ScenarioKind,
  { label: string; input: ScenarioInput }
> = {
  gamma_flip: {
    label: "Gamma flip moves",
    input: { kind: "gamma_flip", shiftPts: 0.25 },
  },
  vol_expansion: {
    label: "Vol expansion",
    input: { kind: "vol_expansion", multiplier: 1.2 },
  },
  vol_compression: {
    label: "Vol compression",
    input: { kind: "vol_compression", multiplier: 0.8 },
  },
  trend_continuation: {
    label: "Trend continuation",
    input: { kind: "trend_continuation", slopeBoost: 0.2 },
  },
  mean_reversion: {
    label: "Mean reversion",
    input: { kind: "mean_reversion", pullPct: 0.18 },
  },
};
