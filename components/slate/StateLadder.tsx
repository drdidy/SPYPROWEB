"use client";

// Phase-1 hardening primitive.
//
// Renders the engine state ladder as a horizontal strip:
//   - states before `current` are muted + struck (passed)
//   - the matched state is bold and semantic-colored (live)
//   - states after `current` are dimmed (future)
//
// Phase 2 will mount this in the SPY/SPX cards. Phase 1 only ships
// the primitive so types/styles are reviewable in isolation.

import { ENGINE_STATES, type EngineState } from "@/lib/states";
import { cn } from "@/lib/utils";

interface StateLadderProps {
  engine: "SPY" | "SPX";
  current: EngineState;
  className?: string;
}

const STATE_LABEL: Record<EngineState, string> = {
  STAND_DOWN: "STAND DOWN",
  WATCH: "WATCH",
  WAIT: "WAIT",
  ARMED: "ARMED",
  GO: "GO",
  COOLDOWN: "COOLDOWN",
};

const CURRENT_TONE: Record<EngineState, string> = {
  STAND_DOWN: "text-state-neutral",
  WATCH: "text-gold-ink",
  WAIT: "text-gold-ink",
  ARMED: "text-state-armed",
  GO: "text-bull-ink",
  COOLDOWN: "text-state-neutral",
};

export function StateLadder({ engine, current, className }: StateLadderProps) {
  const currentIdx = ENGINE_STATES.indexOf(current);
  return (
    <ol
      role="list"
      aria-label={`${engine} engine state ladder`}
      className={cn(
        "flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] uppercase",
        className,
      )}
    >
      {ENGINE_STATES.map((state, i) => {
        const isCurrent = i === currentIdx;
        const isPassed = currentIdx >= 0 && i < currentIdx;
        const isFuture = currentIdx >= 0 && i > currentIdx;
        return (
          <li
            key={state}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "px-1.5 py-0.5 rounded-soft transition-colors",
              isCurrent && cn("font-bold", CURRENT_TONE[state]),
              isPassed && "text-state-invalidated line-through opacity-60",
              isFuture && "text-ink-4 opacity-50",
            )}
          >
            {STATE_LABEL[state]}
          </li>
        );
      })}
    </ol>
  );
}
