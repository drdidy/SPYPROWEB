import { z } from "zod";

import {
  Confidence,
  Delta,
  Engine,
  Id,
  Iso8601,
  LineCode,
  LineType,
  Price,
  RuleVersion,
  SessionId,
} from "./channel";

export const ProjectionId = z
  .string()
  .regex(/^proj_[a-z0-9_-]+$/, "Format: proj_<stable-id>");
export type ProjectionId = z.infer<typeof ProjectionId>;

export const ProjectionMethod = z.enum([
  "linear_slope",
  "held_flat",
  "regression_band",
  "engine_override",
]);
export type ProjectionMethod = z.infer<typeof ProjectionMethod>;

export const ProjectionConfidenceBand = z.enum(["high", "medium", "low"]);
export type ProjectionConfidenceBand = z.infer<typeof ProjectionConfidenceBand>;

export const ProjectionConfidence = z
  .object({
    band: ProjectionConfidenceBand,
    score: Confidence,
  })
  .strict();
export type ProjectionConfidence = z.infer<typeof ProjectionConfidence>;

export const HourBucket = z
  .object({
    at: Iso8601,
    label: z.string().min(1).max(16),
    isCurrent: z.boolean(),
    isObserved: z.boolean(),
  })
  .strict();
export type HourBucket = z.infer<typeof HourBucket>;

export const ProjectionLine = z
  .object({
    id: Id,
    code: LineCode,
    type: LineType,
    label: z.string().min(1).max(80),
    sourceName: z.string().min(1).max(96),
    slopePerHour: z.number().finite(),
    currentValue: Price,
  })
  .strict();
export type ProjectionLine = z.infer<typeof ProjectionLine>;

export const ProjectedLineValue = z
  .object({
    projectionId: ProjectionId,
    lineId: Id,
    lineCode: LineCode,
    hour: HourBucket,
    value: Price,
    deltaFromLast: Delta,
    confidence: ProjectionConfidence,
    method: ProjectionMethod,
    isExtrapolated: z.boolean(),
    isNearestForHour: z.boolean(),
  })
  .strict();
export type ProjectedLineValue = z.infer<typeof ProjectedLineValue>;

export const ProjectionMatrix = z
  .object({
    engine: Engine,
    sessionId: SessionId,
    last: Price,
    generatedFromLast: Price,
    hours: z.array(HourBucket).min(1).max(32),
    lines: z.array(ProjectionLine).max(32),
    cells: z.array(z.array(ProjectedLineValue)),
  })
  .strict();
export type ProjectionMatrix = z.infer<typeof ProjectionMatrix>;

export const ForesightStatus = z.enum([
  "resolving",
  "standby",
  "live",
  "stale",
  "failed",
]);
export type ForesightStatus = z.infer<typeof ForesightStatus>;

export const ProjectionSnapshot = z
  .object({
    status: ForesightStatus,
    engine: Engine,
    sessionId: SessionId,
    matrix: ProjectionMatrix,
    generatedAt: Iso8601,
    ruleVersion: RuleVersion,
    sourceLastTick: Iso8601.nullable(),
    nextRefreshAt: Iso8601,
    projectionId: ProjectionId,
    diagnostics: z
      .object({
        message: z.string().max(280).nullable(),
        waitingOn: z.array(z.string().min(1).max(80)).max(8),
      })
      .strict(),
  })
  .strict();
export type ProjectionSnapshot = z.infer<typeof ProjectionSnapshot>;

export const CalibrationRecord = z
  .object({
    projectionId: ProjectionId,
    sessionId: SessionId,
    hour: HourBucket,
    lineCode: LineCode,
    projectedValue: Price,
    actualValue: Price,
    errorPts: Delta,
    errorPct: z.number().finite(),
  })
  .strict();
export type CalibrationRecord = z.infer<typeof CalibrationRecord>;

export const ScenarioKind = z.enum([
  "gamma_flip",
  "vol_expansion",
  "vol_compression",
  "trend_continuation",
  "mean_reversion",
]);
export type ScenarioKind = z.infer<typeof ScenarioKind>;

export const ScenarioInput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("gamma_flip"),
      shiftPts: z.number().finite(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("vol_expansion"),
      multiplier: z.number().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("vol_compression"),
      multiplier: z.number().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("trend_continuation"),
      slopeBoost: z.number().finite(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("mean_reversion"),
      pullPct: z.number().min(0).max(1),
    })
    .strict(),
]);
export type ScenarioInput = z.infer<typeof ScenarioInput>;

export const SensitivityCell = z
  .object({
    lineId: Id,
    lineCode: LineCode,
    scenario: ScenarioKind,
    baseValue: Price,
    adjustedValue: Price,
    deltaPts: Delta,
  })
  .strict();
export type SensitivityCell = z.infer<typeof SensitivityCell>;
