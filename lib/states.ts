// Engine state ladder — single source of truth for both SPY and SPX.
// Order matters: it defines progression from "engine has not yet run"
// (PRE_CONFIG) through passive observation (STAND_DOWN, WATCH) into
// armed (WAIT, ARMED), firing (GO), and exit (COOLDOWN). Components
// like <StateLadder> render this list left-to-right and treat states
// before `current` as passed, the matched index as live, and later
// indices as future.
//
// PRE_CONFIG is the first state because it precedes every other state
// chronologically each session. Before the engine has observed its
// configuration window for the upcoming RTH, there are no lines, no
// envelope, no triggers — so the engine cannot honestly be in any
// post-config state.

export const ENGINE_STATES = [
  "PRE_CONFIG",
  "STAND_DOWN",
  "WATCH",
  "WAIT",
  "ARMED",
  "GO",
  "COOLDOWN",
] as const;

export type EngineState = (typeof ENGINE_STATES)[number];

export function isEngineState(value: unknown): value is EngineState {
  return (
    typeof value === "string" &&
    (ENGINE_STATES as readonly string[]).includes(value)
  );
}

// Distance proximity thresholds used by the structure list to color
// "near" rows in state.armed. SPY is in dollars (a 50-cent move counts
// as in-range), SPX in points (5 points). Tune as the engines mature.
export const SPY_DISTANCE_PROXIMITY = 0.5;
export const SPX_DISTANCE_PROXIMITY = 5.0;
