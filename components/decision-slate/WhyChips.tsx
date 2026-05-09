// Top three contributing reasons for the current state, rendered as
// chips above the "Why this state?" button. Pulled from the same
// decisionTrace payload the drawer renders so the surface is a
// preview, not a duplicate.
//
// Chips with weight: "key" render in the active-armed tone; otherwise
// neutral. Hidden entirely when no events.

import { cn } from "@/lib/utils";
import type { TraceEvent } from "@/components/slate/DecisionTraceDrawer";

interface Props {
  trace: TraceEvent[];
  /** Limit chips to N entries (default 3 per spec). */
  limit?: number;
  className?: string;
}

export function WhyChips({ trace, limit = 3, className }: Props) {
  if (!trace || trace.length === 0) return null;
  const top = trace.slice(0, limit);
  return (
    <ul
      role="list"
      aria-label="Top reasons"
      data-testid="why-chips"
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {top.map((e, i) => {
        const isKey = e.weight === "key";
        return (
          <li
            key={`${e.ts}-${i}`}
            className={cn(
              "px-2 py-0.5 rounded-pill border font-mono text-[10px] tracking-[0.04em] tabular-nums",
              isKey
                ? "border-state-armed/40 bg-paper text-state-armed"
                : "border-rule bg-paper-2/40 text-ink-2",
            )}
          >
            {e.event}
          </li>
        );
      })}
    </ul>
  );
}
