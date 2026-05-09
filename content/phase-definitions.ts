// Phase rail copy — kept in /content/ so non-engineers can tweak the
// trigger / exit definitions without touching component code.
//
// Each entry powers the info popover on a phase rail cell. The rail
// component itself reads from this single map so SPY and SPX share
// definitions where they overlap and diverge only when the spec calls
// for it.

import type { EngineState } from "@/lib/states";

export interface PhaseDefinition {
  /** Short label shown on the rail itself. */
  label: string;
  /** One-sentence description in the popover. */
  summary: string;
  /** What rule or event entered this phase. */
  enterOn: string;
  /** What rule or event will end this phase. */
  exitOn: string;
}

export const PHASE_DEFINITIONS: Record<EngineState, PhaseDefinition> = {
  PRE_CONFIG: {
    label: "PRE-CONFIG",
    summary:
      "Engine has not observed its configuration window yet. No lines plotted, no envelope.",
    enterOn:
      "Default state at the start of every session, before the engine's overnight / premarket window opens.",
    exitOn:
      "When the configuration window starts (SPY: 03:00 CT, SPX: 17:00 CT previous day).",
  },
  STAND_DOWN: {
    label: "STAND DOWN",
    summary: "Engine has run, lines / envelope are plotted, but conditions don't favor a trade.",
    enterOn: "Configuration window completes and the framework places the price outside today's planned envelope, or risk filters block.",
    exitOn: "Price re-enters the envelope or a primary line begins approach.",
  },
  WATCH: {
    label: "WATCH",
    summary: "Price is approaching a primary trigger but no setup is qualified yet.",
    enterOn: "Price moves within the proximity threshold of a primary line.",
    exitOn: "A rejection candle prints (advances to WAIT) or price moves away (back to STAND DOWN).",
  },
  WAIT: {
    label: "WAIT",
    summary: "A rejection candle has printed; engine is waiting for the next bar to confirm.",
    enterOn: "First qualifying rejection candle on a primary line.",
    exitOn: "Confirmation candle (advances to ARMED) or invalidation (back to WATCH).",
  },
  ARMED: {
    label: "ARMED",
    summary: "Confirmation has printed; the trade setup is live and the entry trigger is armed.",
    enterOn: "Confirmation candle following a qualified rejection.",
    exitOn: "Trigger fires (advances to GO) or candle close past invalidation (back to WAIT).",
  },
  GO: {
    label: "GO",
    summary: "Entry trigger has fired. Engine considers the trade live for the rest of the session.",
    enterOn: "Price prints through the armed entry level.",
    exitOn: "Stop or target prints (advances to COOLDOWN) or session close.",
  },
  COOLDOWN: {
    label: "COOLDOWN",
    summary: "A trade has resolved this session. No new signals until next session reset.",
    enterOn: "Stop or target prints, or session ends with an open position.",
    exitOn: "Next session's configuration window opens.",
  },
};
