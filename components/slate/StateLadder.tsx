"use client";

// Phase rail (formerly "state ladder"). Renders the engine's phase
// progression as a horizontal stepper:
//   - states before `current` are muted + struck (passed)
//   - the matched state is bold and semantic-colored (live)
//   - states after `current` are dimmed (future)
//
// Each cell carries a hover/focus tooltip explaining what triggers
// entry into the phase and what exits it — copy lives in
// /content/phase-definitions.ts so non-engineers can tweak.

import { ENGINE_STATES, type EngineState } from "@/lib/states";
import { cn } from "@/lib/utils";
import { PHASE_DEFINITIONS } from "@/content/phase-definitions";

interface StateLadderProps {
  engine: "SPY" | "SPX";
  current: EngineState;
  className?: string;
}

const CURRENT_TONE: Record<EngineState, string> = {
  PRE_CONFIG: "text-state-armed",
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
      aria-label={`${engine} engine phase rail`}
      className={cn(
        "flex items-center gap-1 text-[11px] tracking-[0.01em]",
        className,
      )}
    >
      {ENGINE_STATES.map((state, i) => {
        const def = PHASE_DEFINITIONS[state];
        const isCurrent = i === currentIdx;
        const isPassed = currentIdx >= 0 && i < currentIdx;
        const isFuture = currentIdx >= 0 && i > currentIdx;
        // Tooltip is full enter/exit copy — visible label stays compact.
        const tooltip = `${def.summary}\n\nEnter: ${def.enterOn}\nExit: ${def.exitOn}`;
        return (
          <li
            key={state}
            tabIndex={0}
            title={tooltip}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={`${def.label} — ${def.summary}`}
            className={cn(
              "px-1.5 py-0.5 rounded-soft transition-colors cursor-help",
              "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
              isCurrent && cn("font-bold animate-breathe", CURRENT_TONE[state]),
              isPassed && "text-state-invalidated line-through opacity-60",
              isFuture && "text-ink-4 opacity-50",
            )}
          >
            {def.label}
          </li>
        );
      })}
    </ol>
  );
}
