// Combined-state map driving the "Recommended next step" rail on the
// Decision Slate. The slate's #1 action is always context-dependent;
// this module is the single source of truth for that decision.
//
// The dispatcher is intentionally small and pure: given two engine
// states it returns one Recommendation. No JSX, no hooks — easy to
// unit-test and easy to reuse in places like the command palette.
//
// Priority rule: the engine furthest along the action ladder wins
// (GO > ARMED > WAIT > WATCH > STAND_DOWN > COOLDOWN > PRE_CONFIG).
// "Furthest along" is what the user is most likely waiting on, so
// the recommended action points at that workflow.

import type { EngineState } from "@/lib/states";

export type Engine = "SPY" | "SPX";

export interface Recommendation {
  /** Stable id, useful for analytics + tests. */
  id:
    | "live-spy"
    | "live-spx"
    | "options-cockpit"
    | "log-replay"
    | "daily-brief";
  /** Where the CTA navigates. */
  href: string;
  /** Verb-led label rendered on the button. */
  label: string;
  /** Eyebrow-tail text — names the engine state driving the recommendation. */
  reason: string;
  /** One-line description rendered next to the button. */
  description: string;
}

/** Priority order: index 0 is most-actionable, last is least. */
const PRIORITY: EngineState[] = [
  "GO",
  "ARMED",
  "WAIT",
  "WATCH",
  "COOLDOWN",
  "STAND_DOWN",
  "PRE_CONFIG",
];

/**
 * Combined dispatcher: pick the engine furthest along the priority
 * ladder, then map its state to a Recommendation.
 */
export function recommendationFor(
  spyState: EngineState,
  spxState: EngineState,
): Recommendation {
  const driverEngine: Engine =
    PRIORITY.indexOf(spyState) <= PRIORITY.indexOf(spxState) ? "SPY" : "SPX";
  const driverState: EngineState =
    driverEngine === "SPY" ? spyState : spxState;
  return forState(driverState, driverEngine);
}

/**
 * Map (state, driver) → Recommendation. Exported so callers (and tests)
 * can probe one branch without round-tripping through priority logic.
 */
export function forState(
  state: EngineState,
  engine: Engine,
): Recommendation {
  const label = engine === "SPX" ? "ES" : engine;
  switch (state) {
    case "GO":
    case "ARMED":
      // Trigger fired or about to fire → user wants the execution
      // surface, not the channel page.
      return {
        id: "options-cockpit",
        href: "/options",
        label: "Open Options Cockpit",
        reason: `${label} ${state === "GO" ? "live" : "armed"}`,
        description:
          state === "GO"
            ? `${label} trigger fired — size the trade and place orders.`
            : `${label} is armed at the entry trigger. Stage the order in the cockpit.`,
      };

    case "WAIT":
    case "WATCH":
      // Setup forming. The Channel page shows live level proximity
      // and the rejection-confirmation cycle — that's what the user
      // needs while waiting for the next bar to print.
      return engine === "SPY"
        ? {
            id: "live-spy",
            href: "/spy",
            label: "Open SPY Channel",
            reason: `SPY ${state.toLowerCase()}`,
            description:
              state === "WAIT"
                ? "SPY structure is active. Watch for the next qualified confirmation."
                : "SPY is approaching active structure. Keep the channel open.",
          }
        : {
            id: "live-spx",
            href: "/es",
            label: "Open ES Channel",
            reason: `ES ${state.toLowerCase()}`,
            description:
              state === "WAIT"
                ? "ES structure is active. Watch for the next qualified confirmation."
                : "ES is approaching active structure. Keep the channel open.",
          };

    case "COOLDOWN":
      // Trade resolved. The honest next step is to journal it.
      return {
        id: "log-replay",
        href: "/replay",
        label: "Log this session in Replay",
        reason: `${label} cooldown`,
        description: `${label}'s trade has resolved. Replay the session and grade execution.`,
      };

    case "STAND_DOWN":
    case "PRE_CONFIG":
    default:
      // Idle. The brief is the highest-leverage thing to read.
      return {
        id: "daily-brief",
        href: "/brief",
        label: "Open daily brief",
        reason:
          state === "PRE_CONFIG"
            ? "both engines pre-config"
            : `${label} standing down`,
        description:
          "Today's brief lays out structural levels and what to watch at the open.",
      };
  }
}

