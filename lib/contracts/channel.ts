import { z } from "zod";

export const Iso8601 = z.string().datetime({ offset: true });
export type Iso8601 = z.infer<typeof Iso8601>;

export const Engine = z.enum(["spy", "es"]);
export type Engine = z.infer<typeof Engine>;

export const RuleVersion = z.string().regex(/^v\d+\.\d+(\.\d+)?$/);
export type RuleVersion = z.infer<typeof RuleVersion>;

export const Price = z.number().finite();
export type Price = z.infer<typeof Price>;

export const Delta = z.number().finite();
export type Delta = z.infer<typeof Delta>;

export const Strength = z.number().int().min(0).max(100);
export type Strength = z.infer<typeof Strength>;

export const Confidence = z.number().int().min(0).max(100);
export type Confidence = z.infer<typeof Confidence>;

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

export const RMultiple = z.number().finite();
export type RMultiple = z.infer<typeof RMultiple>;

export const SessionId = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(:[a-z]+)?$/, "Format: YYYY-MM-DD[:variant]");
export type SessionId = z.infer<typeof SessionId>;

export const SessionPhase = z.enum([
  "pre_session",
  "live",
  "post_session",
  "closed",
]);
export type SessionPhase = z.infer<typeof SessionPhase>;

export const SessionWindow = z
  .object({
    sessionId: SessionId,
    engine: Engine,
    opensAt: Iso8601,
    closesAt: Iso8601,
    phase: SessionPhase,
    serverNow: Iso8601,
  })
  .strict();
export type SessionWindow = z.infer<typeof SessionWindow>;

export const BiasDirection = z.enum(["bullish", "bearish", "neutral"]);
export type BiasDirection = z.infer<typeof BiasDirection>;

export const TrendContext = z.enum(["trend_up", "trend_down", "range", "chop"]);
export type TrendContext = z.infer<typeof TrendContext>;

export const RiskBand = z.enum(["low", "medium", "high"]);
export type RiskBand = z.infer<typeof RiskBand>;

export const RewardSetup = z.enum(["favorable", "neutral", "unfavorable"]);
export type RewardSetup = z.infer<typeof RewardSetup>;

export const StructureFlag = z.enum([
  "contango",
  "backwardation",
  "upper_ascending_intact",
  "upper_ascending_broken",
  "upper_descending_intact",
  "upper_descending_broken",
  "lower_ascending_intact",
  "lower_ascending_broken",
  "lower_descending_intact",
  "lower_descending_broken",
  "dealer_gamma_flat",
  "dealer_gamma_positive",
  "dealer_gamma_negative",
  "vix_compressed",
  "vix_expanded",
]);
export type StructureFlag = z.infer<typeof StructureFlag>;

export const PreOpenBias = z
  .object({
    direction: BiasDirection,
    strength: Strength,
    actionability: z.enum(["weak", "moderate", "actionable"]),
    strengthHistory: z
      .array(z.object({ sessionId: SessionId, strength: Strength }).strict())
      .max(60),
    flags: z.array(StructureFlag),
    asOf: Iso8601,
    ruleVersion: RuleVersion,
  })
  .strict();
export type PreOpenBias = z.infer<typeof PreOpenBias>;

export const SlateState = z.enum([
  "pre_config",
  "stand",
  "watch",
  "wait",
  "armed",
  "go",
  "cool",
  "done",
]);
export type SlateState = z.infer<typeof SlateState>;

export const ChannelState = z.enum([
  "stand",
  "watch",
  "wait",
  "armed",
  "go",
  "cool",
  "done",
]);
export type ChannelState = z.infer<typeof ChannelState>;

export const CHANNEL_STATE_TRANSITIONS: Readonly<
  Record<ChannelState, readonly ChannelState[]>
> = Object.freeze({
  stand: ["watch", "cool", "done"],
  watch: ["wait", "stand", "cool"],
  wait: ["armed", "watch", "cool"],
  armed: ["go", "wait", "cool"],
  go: ["cool"],
  cool: ["done", "watch"],
  done: [],
} as const);

export function isValidChannelTransition(
  from: ChannelState,
  to: ChannelState,
): boolean {
  return (CHANNEL_STATE_TRANSITIONS[from] as readonly ChannelState[]).includes(to);
}

export const LineCode = z.enum(["UA", "UD", "LA", "LD", "PR", "A2", "UR", "LR", "MR"]);
export type LineCode = z.infer<typeof LineCode>;

export const LineType = z.enum([
  "ascending",
  "descending",
  "horizontal",
  "anchor",
  "rail",
]);
export type LineType = z.infer<typeof LineType>;

export const LineStatus = z.enum([
  "untouched",
  "touched",
  "rejected",
  "broken",
  "retesting",
  "armed",
  "expired",
]);
export type LineStatus = z.infer<typeof LineStatus>;

export const LineHistoryEvent = z
  .object({
    at: Iso8601,
    kind: z.enum(["touch", "reject", "break", "retest", "arm", "expire"]),
    price: Price,
    note: z.string().max(280).optional(),
  })
  .strict();
export type LineHistoryEvent = z.infer<typeof LineHistoryEvent>;

export const TriggerLine = z
  .object({
    id: Id,
    code: LineCode,
    type: LineType,
    label: z.string().min(1).max(64),
    value: Price,
    deltaFromLast: Delta,
    proximityRatio: z.number().min(0).max(1),
    status: LineStatus,
    isArmed: z.boolean(),
    history: z.array(LineHistoryEvent).max(64),
    tolerancePts: z.number().nonnegative(),
    asOf: Iso8601,
  })
  .strict();
export type TriggerLine = z.infer<typeof TriggerLine>;

export const TriggerMap = z
  .object({
    engine: Engine,
    sessionId: SessionId,
    lines: z.array(TriggerLine),
    sortedByProximity: z.array(Id),
    asOf: Iso8601,
    ruleVersion: RuleVersion,
  })
  .strict();
export type TriggerMap = z.infer<typeof TriggerMap>;

export const AnchorCondition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level_reject"), lineId: Id, lineCode: LineCode, value: Price }).strict(),
  z.object({ kind: z.literal("level_break_and_retest"), lineId: Id, lineCode: LineCode, value: Price }).strict(),
  z.object({ kind: z.literal("strength_above"), threshold: Strength, current: Strength }).strict(),
  z.object({ kind: z.literal("dealer_flip_cross"), flipLevel: Price, direction: z.enum(["above", "below"]) }).strict(),
  z.object({ kind: z.literal("session_window_opens"), opensAt: Iso8601 }).strict(),
  z.object({ kind: z.literal("custom"), label: z.string().min(1).max(120) }).strict(),
]);
export type AnchorCondition = z.infer<typeof AnchorCondition>;

export const AnchorSlateState = z
  .object({
    engine: Engine,
    sessionId: SessionId,
    state: ChannelState,
    headline: z.string().min(1).max(80),
    bias: BiasDirection,
    strength: Strength,
    confidence: Confidence,
    risk: RiskBand,
    reward: RewardSetup,
    trend: TrendContext,
    conditionPrimary: AnchorCondition,
    conditionAlternate: AnchorCondition.nullable(),
    narrative: z.string().max(560),
    nearestLine: z
      .object({ lineId: Id, lineCode: LineCode, deltaFromLast: Delta })
      .strict()
      .nullable(),
    last: Price,
    anchor: z
      .object({
        primary: Price.nullable(),
        secondary: Price.nullable(),
        upper: Price.nullable(),
        main: Price.nullable(),
        lower: Price.nullable(),
      })
      .strict()
      .nullable(),
    nextEventAt: Iso8601.nullable(),
    nextEventLabel: z.string().max(64).nullable(),
    asOf: Iso8601,
    ruleVersion: RuleVersion,
  })
  .strict();
export type AnchorSlateState = z.infer<typeof AnchorSlateState>;

export const TapeSeverity = z.enum(["info", "success", "warning", "danger"]);
export type TapeSeverity = z.infer<typeof TapeSeverity>;

export const SignalTapeEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("session_boundary"), id: Id, at: Iso8601, boundary: z.enum(["open", "close", "halt", "resume"]), severity: TapeSeverity.default("info") }).strict(),
  z.object({ kind: z.literal("level_touch"), id: Id, at: Iso8601, lineId: Id, lineCode: LineCode, price: Price, severity: TapeSeverity.default("warning") }).strict(),
  z.object({ kind: z.literal("level_reject"), id: Id, at: Iso8601, lineId: Id, lineCode: LineCode, price: Price, magnitudePts: Delta, severity: TapeSeverity.default("success") }).strict(),
  z.object({ kind: z.literal("level_break"), id: Id, at: Iso8601, lineId: Id, lineCode: LineCode, price: Price, magnitudePts: Delta, severity: TapeSeverity.default("danger") }).strict(),
  z.object({ kind: z.literal("level_retest"), id: Id, at: Iso8601, lineId: Id, lineCode: LineCode, price: Price, severity: TapeSeverity.default("info") }).strict(),
  z.object({ kind: z.literal("state_transition"), id: Id, at: Iso8601, from: ChannelState, to: ChannelState, severity: TapeSeverity.default("info") }).strict(),
  z.object({ kind: z.literal("bias_shift"), id: Id, at: Iso8601, from: BiasDirection, to: BiasDirection, strength: Strength, severity: TapeSeverity.default("info") }).strict(),
  z.object({ kind: z.literal("risk_block"), id: Id, at: Iso8601, guardrail: z.string().min(1).max(48), reason: z.string().max(280), severity: TapeSeverity.default("danger") }).strict(),
  z.object({ kind: z.literal("entry"), id: Id, at: Iso8601, side: z.enum(["long", "short"]), price: Price, sizeR: RMultiple, severity: TapeSeverity.default("info") }).strict(),
  z.object({ kind: z.literal("exit"), id: Id, at: Iso8601, side: z.enum(["long", "short"]), price: Price, pnlR: RMultiple, reason: z.enum(["target", "stop", "manual", "time", "guardrail"]), severity: TapeSeverity.default("info") }).strict(),
  z.object({ kind: z.literal("context_note"), id: Id, at: Iso8601, flags: z.array(StructureFlag).min(1), severity: TapeSeverity.default("info") }).strict(),
  z.object({
    kind: z.literal("quote_snapshot"),
    id: Id,
    at: Iso8601,
    quotes: z.array(z.object({ symbol: z.string().min(1).max(8), price: Price }).strict()).min(1).max(8),
    severity: TapeSeverity.default("info"),
  }).strict(),
]);
export type SignalTapeEvent = z.infer<typeof SignalTapeEvent>;
export type SignalTapeEventKind = SignalTapeEvent["kind"];

export const SignalTape = z
  .object({
    engine: Engine,
    sessionId: SessionId,
    events: z.array(SignalTapeEvent),
    olderCursor: z.string().nullable(),
    headAt: Iso8601.nullable(),
    asOf: Iso8601,
  })
  .strict();
export type SignalTape = z.infer<typeof SignalTape>;

export const GuardrailKind = z.enum([
  "chase_guard",
  "retest",
  "structure",
  "daily_risk",
  "session_window",
]);
export type GuardrailKind = z.infer<typeof GuardrailKind>;

export const GuardrailStatus = z.enum([
  "ok",
  "armed",
  "warning",
  "blocked",
  "intact",
  "exceeded",
]);
export type GuardrailStatus = z.infer<typeof GuardrailStatus>;

export const GuardrailInput = z
  .object({
    label: z.string().min(1).max(48),
    value: z.union([z.string(), z.number(), z.boolean()]),
    passes: z.boolean(),
  })
  .strict();
export type GuardrailInput = z.infer<typeof GuardrailInput>;

export const GuardrailState = z
  .object({
    kind: GuardrailKind,
    status: GuardrailStatus,
    summary: z.string().min(1).max(120),
    inputs: z.array(GuardrailInput),
    nextChange: z.string().max(280).nullable(),
    blocksGo: z.boolean(),
    asOf: Iso8601,
    ruleVersion: RuleVersion,
  })
  .strict();
export type GuardrailState = z.infer<typeof GuardrailState>;

export const RiskGuardrails = z
  .object({
    engine: Engine,
    sessionId: SessionId,
    guardrails: z.array(GuardrailState).min(1),
    anyBlocked: z.boolean(),
    asOf: Iso8601,
  })
  .strict();
export type RiskGuardrails = z.infer<typeof RiskGuardrails>;

export const OptionsLoadStatus = z.enum([
  "loading",
  "loaded",
  "partial",
  "stale",
  "failed",
  "unavailable",
]);
export type OptionsLoadStatus = z.infer<typeof OptionsLoadStatus>;

export const DealerGamma = z
  .object({
    sign: z.enum(["positive", "negative", "flat"]),
    flipLevel: Price.nullable(),
    spot: Price,
    distanceToFlip: Delta.nullable(),
  })
  .strict();
export type DealerGamma = z.infer<typeof DealerGamma>;

export const OptionsFlowSummary = z
  .object({
    callPremium: z.number().nonnegative(),
    putPremium: z.number().nonnegative(),
    skew: z.number().min(-1).max(1),
    sampleSize: z.number().int().nonnegative(),
  })
  .strict();
export type OptionsFlowSummary = z.infer<typeof OptionsFlowSummary>;

const PriorOptionsSession = z
  .object({
    sessionId: SessionId,
    gamma: DealerGamma,
    flow: OptionsFlowSummary.nullable(),
    capturedAt: Iso8601,
  })
  .strict();

const LiveOptionsIntel = z
  .object({
    gamma: DealerGamma,
    flow: OptionsFlowSummary.nullable(),
  })
  .strict();

export const OptionsIntelligence = z
  .object({
    engine: Engine,
    sessionId: SessionId,
    status: OptionsLoadStatus,
    priorSession: PriorOptionsSession.nullable(),
    live: LiveOptionsIntel.nullable(),
    diagnostics: z
      .object({
        lastAttemptAt: Iso8601.nullable(),
        nextAttemptAt: Iso8601.nullable(),
        attemptCount: z.number().int().nonnegative(),
        message: z.string().max(280).nullable(),
      })
      .strict(),
    asOf: Iso8601,
  })
  .strict();
export type OptionsIntelligence = z.infer<typeof OptionsIntelligence>;

export const ChannelSnapshot = z
  .object({
    engine: Engine,
    sessionWindow: SessionWindow,
    anchorSlate: AnchorSlateState,
    preOpenBias: PreOpenBias,
    triggerMap: TriggerMap,
    signalTape: SignalTape,
    riskGuardrails: RiskGuardrails,
    optionsIntelligence: OptionsIntelligence,
    schemaVersion: z.literal(1),
    assembledAt: Iso8601,
  })
  .strict();
export type ChannelSnapshot = z.infer<typeof ChannelSnapshot>;

export const FeedId = z.enum([
  "price_tick",
  "anchor_levels",
  "trigger_lines",
  "pre_open_bias",
  "options_chain",
  "signal_tape",
  "risk_guardrails",
  "session_clock",
]);
export type FeedId = z.infer<typeof FeedId>;

export const FeedStatus = z.enum(["live", "stale", "failed", "loading"]);
export type FeedStatus = z.infer<typeof FeedStatus>;

export const FeedHealth = z
  .object({
    feedId: FeedId,
    status: FeedStatus,
    lastUpdatedAt: Iso8601.nullable(),
    nextExpectedAt: Iso8601.nullable(),
    staleThresholdMs: z.number().int().positive(),
  })
  .strict();
export type FeedHealth = z.infer<typeof FeedHealth>;

export const ChannelLiveStatus = z.enum(["live", "delayed", "offline"]);
export type ChannelLiveStatus = z.infer<typeof ChannelLiveStatus>;

export const ChannelHealth = z
  .object({
    engine: Engine,
    status: ChannelLiveStatus,
    feeds: z.array(FeedHealth),
    laggingFeedIds: z.array(FeedId),
    asOf: Iso8601,
  })
  .strict();
export type ChannelHealth = z.infer<typeof ChannelHealth>;

export function deriveChannelLiveStatus(feeds: readonly FeedHealth[]): ChannelLiveStatus {
  const byId = new Map(feeds.map((feed) => [feed.feedId, feed.status]));
  const tick = byId.get("price_tick");
  const anchor = byId.get("anchor_levels");
  const tape = byId.get("signal_tape");

  if (tick === "failed") return "offline";
  if (tick !== "live") return "delayed";
  if (anchor === "live" || tape === "live") return "live";
  if (anchor === "failed" && tape === "failed") return "offline";
  return "delayed";
}
