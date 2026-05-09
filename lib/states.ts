// Engine state ladder — single source of truth for both SPY and SPX.
// Order matters: it defines progression from passive (STAND_DOWN) through
// armed (WAIT, ARMED) into firing (GO) and exit (COOLDOWN). Components
// like <StateLadder> render this list left-to-right and treat states
// before `current` as passed, the matched index as live, and later
// indices as future.

export const ENGINE_STATES = [
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
