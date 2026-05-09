// Horizontal range bar visualizing the planned envelope (low..high)
// with the last print marked. When the print sits outside the envelope,
// the marker still clamps to the bar but the label calls out the
// distance and direction.
//
// Used by the SPX card's right pane as a constructive empty state when
// the channel hasn't resolved (i.e. price is OUTSIDE_PLAY).

import { cn } from "@/lib/utils";

interface EnvelopeBarProps {
  low: number;
  high: number;
  last: number;
  /** Optional unit suffix shown after distances (e.g. "pts"). */
  unit?: string;
  className?: string;
}

export function EnvelopeBar({
  low,
  high,
  last,
  unit = "",
  className,
}: EnvelopeBarProps) {
  const span = Math.max(high - low, 1e-6);
  // Pad the visual track 20% on either side so the print marker has
  // room to read as "outside" rather than getting hidden behind the
  // envelope edges.
  const padding = span * 0.2;
  const trackLow = low - padding;
  const trackHigh = high + padding;
  const trackSpan = trackHigh - trackLow;

  const lowPct = ((low - trackLow) / trackSpan) * 100;
  const highPct = ((high - trackLow) / trackSpan) * 100;
  const lastPct = Math.max(
    0,
    Math.min(100, ((last - trackLow) / trackSpan) * 100),
  );

  const distance =
    last < low
      ? { pts: low - last, label: "below" }
      : last > high
        ? { pts: last - high, label: "above" }
        : { pts: 0, label: "inside" };

  const distLine =
    distance.label === "inside"
      ? `Last print ${last.toFixed(2)} — inside planned envelope (${low.toFixed(
          2,
        )}–${high.toFixed(2)})`
      : `Last print ${last.toFixed(2)} — ${distance.pts.toFixed(2)}${
          unit ? ` ${unit}` : ""
        } ${distance.label} planned envelope (${low.toFixed(2)}–${high.toFixed(2)})`;

  return (
    <div className={cn("space-y-2.5", className)}>
      <div
        role="img"
        aria-label={distLine}
        className="relative h-6 w-full"
      >
        {/* Backing track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-rule" />
        {/* Envelope */}
        <div
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-paper-2 border border-rule-strong"
        />
        {/* Envelope endcaps with prices */}
        <span
          style={{ left: `${lowPct}%` }}
          className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {low.toFixed(2)}
        </span>
        <span
          style={{ left: `${highPct}%` }}
          className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {high.toFixed(2)}
        </span>
        {/* Last-print marker */}
        <span
          style={{ left: `${lastPct}%` }}
          className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
        >
          <span
            className={cn(
              "h-3 w-[2px] rounded-full",
              distance.label === "inside" ? "bg-bull" : "bg-state-bearish",
            )}
            aria-hidden
          />
        </span>
      </div>
      <p className="text-[12px] text-ink-2 leading-snug">{distLine}</p>
    </div>
  );
}
