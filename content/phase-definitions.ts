// Phase rail copy — kept in /content/ so non-engineers can tweak the
// trigger / exit definitions without touching component code.
//
// Each entry powers the info popover on a phase rail cell. The rail
// component itself reads from this single map so SPY and ES share
// definitions where they overlap and diverge only when the spec calls
// for it.

import type { EngineState } from "@/lib/states";

export interface PhaseDefinition {
  /** Full label (e.g. "Pre-config"). Shown on the rail at the
   *  widest breakpoint and inside tooltips at every breakpoint. */
  label: string;
  /** Short 3-5 letter abbreviation for the rail at intermediate
   *  widths (1280–1439) where the full label doesn't fit but a
   *  single-letter glyph would be ambiguous (Watch / Wait both
   *  start with W). */
  short: string;
  /** One-sentence description in the popover. */
  summary: string;
  /** What rule or event entered this phase. */
  enterOn: string;
  /** What rule or event will end this phase. */
  exitOn: string;
}

// Slate refinement (2026-05): labels are now sentence case — only
// ticker tokens (SPY, ES) and one tier of section eyebrows still
// shout. Tooltip body copy is plain-English, no jargon.
export const PHASE_DEFINITIONS: Record<EngineState, PhaseDefinition> = {
  PRE_CONFIG: {
    label: "Pre-config",
    short: "Pre",
    summary:
      "The engine hasn't observed its setup window yet. No lines or envelope are plotted.",
    enterOn:
      "Default state at the start of every session, before the engine's overnight or premarket window opens.",
    exitOn:
      "When the setup window starts (SPY: 03:00 CT, ES: 17:00 CT the previous day).",
  },
  STAND_DOWN: {
    label: "Stand down",
    short: "Stand",
    summary:
      "The engine has run and the setup is plotted, but conditions don't favor a trade.",
    enterOn:
      "Setup window completes and price sits outside today's planned envelope, or risk filters block.",
    exitOn: "Price re-enters the envelope or a primary line begins approach.",
  },
  WATCH: {
    label: "Watch",
    short: "Watch",
    summary:
      "Price is approaching a primary trigger, but no setup is qualified yet.",
    enterOn: "Price moves within the proximity threshold of a primary line.",
    exitOn:
      "A rejection candle prints (advances to Wait) or price moves away (back to Stand down).",
  },
  WAIT: {
    label: "Wait",
    short: "Wait",
    summary:
      "A rejection candle has printed. The engine is waiting for the next bar to confirm.",
    enterOn: "First qualifying rejection candle on a primary line.",
    exitOn: "Confirmation candle (advances to Armed) or invalidation (back to Watch).",
  },
  ARMED: {
    label: "Armed",
    short: "Armed",
    summary:
      "Confirmation has printed. The trade setup is live and the entry trigger is armed.",
    enterOn: "Confirmation candle following a qualified rejection.",
    exitOn:
      "Trigger fires (advances to Go) or a candle closes past invalidation (back to Wait).",
  },
  GO: {
    label: "Go",
    short: "Go",
    summary:
      "Entry trigger has fired. The engine considers the trade live for the rest of the session.",
    enterOn: "Price prints through the armed entry level.",
    exitOn: "Stop or target prints (advances to Cooldown) or the session closes.",
  },
  COOLDOWN: {
    label: "Cooldown",
    short: "Cool",
    summary:
      "A trade has resolved this session. No new signals until the next session reset.",
    enterOn: "Stop or target prints, or the session ends with an open position.",
    exitOn: "The next session's setup window opens.",
  },
};
