import { z } from "zod";

import {
  ChannelState,
  Delta,
  Engine,
  Iso8601,
  LineCode,
  LineType,
  Price,
  RuleVersion,
  SessionId,
  SignalTapeEvent,
} from "./channel";
import { CalibrationRecord, ProjectionId } from "./foresight";

export const ReplaySessionId = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(:[a-z]+)?$/, "Format: YYYY-MM-DD[:variant]");
export type ReplaySessionId = z.infer<typeof ReplaySessionId>;

export const BarSize = z.enum(["1m", "5m", "15m", "30m", "60m"]);
export type BarSize = z.infer<typeof BarSize>;

export const ReplayStatus = z.enum([
  "loading",
  "ready",
  "partial",
  "failed",
  "unavailable",
]);
export type ReplayStatus = z.infer<typeof ReplayStatus>;

export const ReplayEngineView = z.enum(["both", "spy", "es"]);
export type ReplayEngineView = z.infer<typeof ReplayEngineView>;

export const Bar = z
  .object({
    at: Iso8601,
    open: Price,
    high: Price,
    low: Price,
    close: Price,
    volume: z.number().int().nonnegative(),
  })
  .strict();
export type Bar = z.infer<typeof Bar>;

export const ChannelOverlay = z
  .object({
    engine: Engine,
    at: Iso8601,
    floor: Price,
    ceiling: Price,
    prevHigh: Price.nullable(),
    prevLow: Price.nullable(),
    asOf: Iso8601,
  })
  .strict();
export type ChannelOverlay = z.infer<typeof ChannelOverlay>;

export const AnchorOverlay = z
  .object({
    engine: z.literal("spy"),
    at: Iso8601,
    primary: Price.nullable(),
    secondary: Price.nullable(),
    upper: Price.nullable(),
    main: Price.nullable(),
    lower: Price.nullable(),
  })
  .strict();
export type AnchorOverlay = z.infer<typeof AnchorOverlay>;

export const DecisionTrailEntry = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("state_transition"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      from: ChannelState.nullable(),
      to: ChannelState,
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rule_hit"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      rule: z.string().min(1).max(80),
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rule_note"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("level_touch"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      lineCode: LineCode,
      value: Price,
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("level_break"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      lineCode: LineCode,
      value: Price,
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("bias_shift"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("risk_block"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      guardrail: z.string().min(1).max(80),
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("entry"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      price: Price,
      detail: z.string().max(320),
    })
    .strict(),
  z
    .object({
      kind: z.literal("exit"),
      id: z.string().min(1),
      engine: Engine,
      at: Iso8601,
      price: Price,
      pnlPts: Delta.nullable(),
      detail: z.string().max(320),
    })
    .strict(),
]);
export type DecisionTrailEntry = z.infer<typeof DecisionTrailEntry>;

export const LineTouchRecord = z
  .object({
    id: z.string().min(1),
    engine: Engine,
    lineCode: LineCode,
    value: Price,
    at: Iso8601,
    kind: z.enum(["touch", "break", "reject", "retest"]),
  })
  .strict();
export type LineTouchRecord = z.infer<typeof LineTouchRecord>;

export const ReplaySnapshot = z
  .object({
    sessionId: ReplaySessionId,
    engine: ReplayEngineView,
    barSize: BarSize,
    bars: z.array(Bar),
    channelOverlay: z.array(ChannelOverlay),
    anchorOverlay: z.array(AnchorOverlay),
    decisionTrail: z.array(DecisionTrailEntry),
    lineTouches: z.array(LineTouchRecord),
    builtAt: Iso8601,
    ruleVersion: RuleVersion,
    status: ReplayStatus,
  })
  .strict();
export type ReplaySnapshot = z.infer<typeof ReplaySnapshot>;

export const CalibrationWrite = z
  .object({
    sessionId: SessionId,
    projectionId: ProjectionId,
    ruleVersion: RuleVersion,
    records: z.array(CalibrationRecord),
    writtenAt: Iso8601,
  })
  .strict();
export type CalibrationWrite = z.infer<typeof CalibrationWrite>;

export type SignalTapeEventForReplay = z.infer<typeof SignalTapeEvent>;
