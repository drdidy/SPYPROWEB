// 5-pip horizontal meter for conviction (1..5 scale). Filled pips use
// the semantic armed token; unfilled use a low-contrast gray. The
// numeric value sits underneath as a small mono caption so screen
// readers and number-oriented users still see the raw figure.

import { cn } from "@/lib/utils";

interface ConvictionMeterProps {
  value: number;
  max?: number;
  className?: string;
}

export function ConvictionMeter({
  value,
  max = 5,
  className,
}: ConvictionMeterProps) {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <div className={cn("inline-flex flex-col items-start gap-1", className)}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={filled}
        aria-label={`Conviction ${filled} of ${max}`}
        className="flex items-center gap-1"
      >
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-4 rounded-full",
              i < filled ? "bg-state-armed" : "bg-ink-5/60",
            )}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] text-ink-3 tabular-nums">
        {filled}/{max}
      </span>
    </div>
  );
}
