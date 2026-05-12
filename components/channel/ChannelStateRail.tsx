import { Countdown } from "@/components/decision-slate/Countdown";
import { PHASE_DEFINITIONS } from "@/content/phase-definitions";
import { ENGINE_STATES, type EngineState } from "@/lib/states";
import { cn } from "@/lib/utils";

export function ChannelStateRail({
  engine,
  current,
  nextEventISO,
  nextEventLabel,
  condition,
  className,
}: {
  engine: "SPY" | "ES";
  current: EngineState;
  nextEventISO?: string;
  nextEventLabel?: string;
  condition?: string;
  className?: string;
}) {
  const currentIdx = ENGINE_STATES.indexOf(current);
  const stateLabel = PHASE_DEFINITIONS[current]?.label ?? current.replace(/_/g, " ");

  return (
    <section
      aria-label={`${engine} state progression`}
      className={cn(
        "rounded-card border border-rule bg-paper-tier2 p-4 shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            State rail
          </p>
          <h2 className="mt-1 font-serif text-h2 text-ink">
            {engine} discipline sequence
          </h2>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          <div>{stateLabel}</div>
          {nextEventISO && (
            <div className="mt-1 text-ink-2">
              {nextEventLabel ?? "Next state"}{" "}
              <Countdown to={nextEventISO} verb="in" />
            </div>
          )}
        </div>
      </div>

      <ol
        role="list"
        aria-label={`${engine} seven-step state progression`}
        className="grid grid-cols-7 gap-1.5"
      >
        {ENGINE_STATES.map((state, index) => {
          const phase = PHASE_DEFINITIONS[state];
          const isCurrent = state === current;
          const isComplete = index < currentIdx;
          return (
            <li
              key={state}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "relative min-w-0 rounded-soft border px-1.5 py-2 text-center transition-colors",
                isCurrent
                  ? "border-gold bg-gold text-paper shadow-glow motion-safe:animate-breathe"
                  : isComplete
                    ? "border-bull/30 bg-bull-tint text-bull-ink"
                    : "border-rule bg-paper text-ink-3",
              )}
            >
              <span className="sr-only">
                Step {index + 1} of {ENGINE_STATES.length}: {phase.label}
                {isCurrent ? ", current" : isComplete ? ", completed" : ", upcoming"}.
              </span>
              <span
                aria-hidden
                className={cn(
                  "mx-auto mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold",
                  isCurrent
                    ? "bg-paper text-gold-ink"
                    : isComplete
                      ? "bg-bull text-paper"
                      : "bg-paper-2 text-ink-3",
                )}
              >
                {isComplete ? "✓" : index + 1}
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.08em] sm:block">
                {phase.short}
              </span>
            </li>
          );
        })}
      </ol>

      {condition && (
        <div className="mt-3 rounded-soft border border-rule bg-paper px-3 py-2 text-[12px] leading-snug text-ink-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Transition condition
          </span>{" "}
          {condition}
        </div>
      )}
    </section>
  );
}
