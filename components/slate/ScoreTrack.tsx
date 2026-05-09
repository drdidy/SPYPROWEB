// Thin 0-100 horizontal track with a marker at the current value. The
// underlying bands (stand-down / watch / go) are tinted left-to-right so
// the marker's position is meaningful at a glance. Hover surfaces the
// raw thresholds in a title tooltip (full popover lives in phase 3 if
// needed).

import { cn } from "@/lib/utils";

type Band = readonly [number, number];

interface ScoreTrackProps {
  value: number; // 0..100
  bands?: { standDown: Band; watch: Band; go: Band };
  className?: string;
}

const DEFAULT_BANDS = {
  standDown: [0, 50] as const,
  watch: [50, 70] as const,
  go: [70, 100] as const,
};

export function ScoreTrack({
  value,
  bands = DEFAULT_BANDS,
  className,
}: ScoreTrackProps) {
  const v = Math.max(0, Math.min(100, value));
  const sdEnd = bands.standDown[1];
  const watchEnd = bands.watch[1];
  const tooltip =
    `${bands.standDown[0]}–${sdEnd} stand down · ` +
    `${bands.watch[0]}–${watchEnd} watch · ` +
    `${bands.go[0]}–${bands.go[1]} go`;

  return (
    <div
      title={tooltip}
      tabIndex={0}
      aria-label={`Score ${v.toFixed(0)} of 100. ${tooltip}`}
      className={cn(
        "group relative h-1.5 w-full rounded-full overflow-hidden",
        "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
        className,
      )}
    >
      {/* Band tints: left = stand-down (gray), middle = watch (gold),
          right = go (bull). Subtle so the marker reads cleanly. */}
      <div className="absolute inset-0 flex">
        <div
          style={{ width: `${sdEnd}%` }}
          className="h-full bg-state-neutral/15"
        />
        <div
          style={{ width: `${watchEnd - sdEnd}%` }}
          className="h-full bg-gold/15"
        />
        <div
          style={{ width: `${100 - watchEnd}%` }}
          className="h-full bg-bull/15"
        />
      </div>
      {/* Marker: 2px-wide line at current value. Clamp the visual
          position to 2-98% so the marker never disappears off either
          edge when the score sits at 0 or 100 — the numeric value
          rendered alongside still shows the true figure. */}
      <div
        style={{ left: `calc(${Math.min(98, Math.max(2, v))}% - 1px)` }}
        aria-hidden
        className="absolute top-[-2px] bottom-[-2px] w-[2px] rounded-full bg-ink"
      />
    </div>
  );
}
