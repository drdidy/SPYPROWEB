// Today's state-transition timeline. Single horizontal row of dots
// with the engine state label and a CT timestamp. When stateHistory
// is empty (pre-market, before any transition has been recorded) the
// component renders null — the spec calls for hiding entirely with
// no empty state.

import { cn } from "@/lib/utils";
import type { EngineState } from "@/lib/states";

interface Entry {
  ts: string;
  state: EngineState;
}

interface Props {
  engine: "SPY" | "SPX";
  history: Entry[];
  className?: string;
}

const STATE_TONE: Record<EngineState, string> = {
  PRE_CONFIG: "bg-ink-5",
  STAND_DOWN: "bg-state-neutral",
  WATCH: "bg-gold",
  WAIT: "bg-gold",
  ARMED: "bg-state-armed",
  GO: "bg-bull",
  COOLDOWN: "bg-state-neutral",
};

export function TimelineStrip({ engine, history, className }: Props) {
  if (!history || history.length === 0) return null;

  return (
    <section
      aria-label={`${engine} state timeline today`}
      className={cn(
        "rounded-card border border-rule bg-paper-2/30 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
          {engine} · today
        </span>
        <span className="h-px flex-1 bg-rule" aria-hidden />
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {history.length === 1 ? "1 entry" : `${history.length} transitions`}
        </span>
      </div>
      <ol
        role="list"
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        {history.map((e, i) => (
          <li key={`${e.ts}-${i}`} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-2 w-2 rounded-full", STATE_TONE[e.state] ?? "bg-ink-5")}
            />
            <span className="font-mono text-[10px] text-ink-3 tabular-nums">
              {formatHM(e.ts)}
            </span>
            <span className="font-mono text-[10px] tracking-[0.10em] uppercase text-ink-2">
              {e.state.replace(/_/g, " ")}
            </span>
            {i < history.length - 1 && (
              <span aria-hidden className="text-ink-4 ml-1">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatHM(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "";
  }
}
