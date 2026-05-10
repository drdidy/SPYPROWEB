import type {
  ChannelState,
  Engine,
  FeedId,
  GuardrailKind,
  LineCode,
  LineStatus,
  StructureFlag,
} from "@/lib/contracts/channel";

export interface ChannelEngineConfig {
  engine: Engine;
  route: string;
  displayName: string;
  wordmark: string;
  dataFeedIds: readonly FeedId[];
  sections: {
    plays: string;
    lines: string;
    tape: string;
  };
  lineLabels: Record<LineCode, string>;
  stateLabels: Record<ChannelState, string>;
  lineStatusLabels: Record<LineStatus, string>;
  guardrailLabels: Record<GuardrailKind, string>;
  structureFlagLabels: Record<StructureFlag, string>;
}

const LINE_LABELS: Record<LineCode, string> = {
  UA: "Upper Ascending",
  UD: "Upper Descending",
  LA: "Lower Ascending",
  LD: "Lower Descending",
  PR: "Primary Anchor",
  A2: "Anchor 2",
  UR: "Upper Rail",
  LR: "Lower Rail",
  MR: "Main",
};

const STATE_LABELS: Record<ChannelState, string> = {
  stand: "Stand",
  watch: "Watch",
  wait: "Wait",
  armed: "Armed",
  go: "Go",
  cool: "Cool",
  done: "Done",
};

const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  untouched: "Untouched",
  touched: "Touched",
  rejected: "Rejected",
  broken: "Broken",
  retesting: "Retesting",
  armed: "Armed",
  expired: "Expired",
};

const GUARDRAIL_LABELS: Record<GuardrailKind, string> = {
  chase_guard: "Chase Guard",
  retest: "Retest",
  structure: "Structure",
  daily_risk: "Daily Risk",
  session_window: "Session Window",
};

const STRUCTURE_FLAG_LABELS: Record<StructureFlag, string> = {
  contango: "Contango",
  backwardation: "Backwardation",
  upper_ascending_intact: "Upper Ascending Intact",
  upper_ascending_broken: "Upper Ascending Broken",
  upper_descending_intact: "Upper Descending Intact",
  upper_descending_broken: "Upper Descending Broken",
  lower_ascending_intact: "Lower Ascending Intact",
  lower_ascending_broken: "Lower Ascending Broken",
  lower_descending_intact: "Lower Descending Intact",
  lower_descending_broken: "Lower Descending Broken",
  dealer_gamma_flat: "Dealer Gamma Flat",
  dealer_gamma_positive: "Dealer Gamma Positive",
  dealer_gamma_negative: "Dealer Gamma Negative",
  vix_compressed: "VIX Compressed",
  vix_expanded: "VIX Expanded",
};

export const CHANNEL_CONFIG = {
  spy: {
    engine: "spy",
    route: "/spy",
    displayName: "SPY",
    wordmark: "SPY Channel",
    dataFeedIds: [
      "price_tick",
      "anchor_levels",
      "trigger_lines",
      "pre_open_bias",
      "options_chain",
      "signal_tape",
      "risk_guardrails",
      "session_clock",
    ],
    sections: {
      plays: "Plays",
      lines: "Lines",
      tape: "Tape",
    },
    lineLabels: LINE_LABELS,
    stateLabels: STATE_LABELS,
    lineStatusLabels: LINE_STATUS_LABELS,
    guardrailLabels: GUARDRAIL_LABELS,
    structureFlagLabels: STRUCTURE_FLAG_LABELS,
  },
  es: {
    engine: "es",
    route: "/es",
    displayName: "ES",
    wordmark: "ES Channel",
    dataFeedIds: [
      "price_tick",
      "anchor_levels",
      "trigger_lines",
      "pre_open_bias",
      "options_chain",
      "signal_tape",
      "risk_guardrails",
      "session_clock",
    ],
    sections: {
      plays: "Plays",
      lines: "Lines",
      tape: "Tape",
    },
    lineLabels: LINE_LABELS,
    stateLabels: STATE_LABELS,
    lineStatusLabels: LINE_STATUS_LABELS,
    guardrailLabels: GUARDRAIL_LABELS,
    structureFlagLabels: STRUCTURE_FLAG_LABELS,
  },
} satisfies Record<Engine, ChannelEngineConfig>;

export function getChannelConfig(engine: Engine): ChannelEngineConfig {
  return CHANNEL_CONFIG[engine];
}
