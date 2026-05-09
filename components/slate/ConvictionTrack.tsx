// Canonical conviction widget — shared across SPY (1-5 scale) and SPX
// (0-100 scale). Replaces the per-engine pip meter / score track split
// so the dual-engine symmetry is honest at all times: identical height,
// identical marker style, identical typography. Only the scale differs.
//
// SPY usage: <ConvictionTrack value={2} max={5}  label="2/5" />
// SPX usage: <ConvictionTrack value={73} max={100} label="73/100" />
//
// The optional `bands` prop carries threshold tints for the SPX score
// case (stand-down / watch / go bands at 0-50-70-100). When omitted
// the track renders without band tinting — that's the SPY default
// since its 1-5 scale doesn't share those thresholds.

import { cn } from "@/lib/utils";

type Band = readonly [number, number];

interface ConvictionTrackProps {
  value: number;
  max: number;
  label: string;
  /** Optional band thresholds (SPX score case). Values in 0-`max` units. */
  bands?: { standDown: Band; watch: Band; go: Band };
  className?: string;
}

export function ConvictionTrack({
  value,
  max,
  label,
  bands,
  className,
}: ConvictionTrackProps) {
  const clampedValue = Math.max(0, Math.min(max, value));
  const pct = (clampedValue / max) * 100;
  const markerLeftPct = Math.max(2, Math.min(98, pct));

  const tooltip = bands
    ? `${bands.standDown[0]}–${bands.standDown[1]} stand down · ` +
      `${bands.watch[0]}–${bands.watch[1]} watch · ` +
      `${bands.go[0]}–${bands.go[1]} go`
    : `Conviction ${label}`;

  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      <div
        title={tooltip}
        tabIndex={0}
        aria-label={`Conviction ${label}. ${tooltip}`}
        className={cn(
          "group relative h-1.5 w-full rounded-full overflow-hidden",
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
        )}
      >
        {/* Band tints (when present) reveal the position's meaning. */}
        {bands && (
          <div className="absolute inset-0 flex">
            <div
              style={{
                width: `${(bands.standDown[1] / max) * 100}%`,
              }}
              className="h-full bg-state-neutral/15"
            />
            <div
              style={{
                width: `${((bands.watch[1] - bands.standDown[1]) / max) * 100}%`,
              }}
              className="h-full bg-gold/15"
            />
            <div
              style={{
                width: `${((bands.go[1] - bands.watch[1]) / max) * 100}%`,
              }}
              className="h-full bg-bull/15"
            />
          </div>
        )}
        {!bands && (
          <div className="absolute inset-0 bg-state-neutral/15" aria-hidden />
        )}
        {/* Marker — clamped 2..98% so it stays visible at the floor or
            ceiling. The numeric `label` underneath still shows the true
            value. */}
        <div
          style={{ left: `calc(${markerLeftPct}% - 1px)` }}
          aria-hidden
          className="absolute top-[-2px] bottom-[-2px] w-[2px] rounded-full bg-ink"
        />
      </div>
      <span className="font-mono text-[10px] text-ink-3 tabular-nums">
        {label}
      </span>
    </div>
  );
}
