// Single-line recap of the previous session's last signal — visible
// only while the engine is between sessions (PRE_CONFIG / STAND_DOWN /
// COOLDOWN). When no recap is available it returns null so the card
// doesn't render an empty box.
//
// v2 polish:
//   - "R" gets an InfoTooltip ("Profit/loss in multiples of initial
//     risk") on its first occurrence per recap. The trigger is the
//     literal letter R appended to the multiple, so the helping
//     gloss sits exactly where the unfamiliar token does.
//   - When the recap is the engine's "Watched only" soft path (no
//     graded trade), the side label flips to a tooltip-anchored
//     "Watched only" pill.

import type { LastSignalSummary } from "@/types/decision-slate";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/utils";

interface Props {
  recap: LastSignalSummary | null;
  className?: string;
}

export function LastSignalRecap({ recap, className }: Props) {
  if (!recap) return null;
  const sideTone =
    recap.side === "LONG" ? "text-state-bullish" : "text-state-bearish";
  const isWatched = recap.oneLine.toLowerCase().startsWith("watched only");
  const rValue =
    recap.rMultiple == null
      ? "—"
      : `${recap.rMultiple > 0 ? "+" : ""}${recap.rMultiple.toFixed(2)}`;
  const rTone =
    recap.rMultiple == null
      ? "text-ink-3"
      : recap.rMultiple > 0
        ? "text-state-bullish"
        : recap.rMultiple < 0
          ? "text-state-bearish"
          : "text-state-neutral";

  return (
    <div className={className}>
      <div className="eyebrow text-ink-3 mb-1">Last session</div>
      <div className="flex items-baseline gap-2 flex-wrap text-[12px] font-mono tabular-nums">
        {isWatched ? (
          <InfoTooltip
            label="Watched only"
            content="Engine generated a setup but no graded execution was logged for this session."
          >
            <span className="text-ink-3 font-semibold lowercase tracking-[0.02em] cursor-help">
              Watched only
            </span>
          </InfoTooltip>
        ) : (
          <span className={cn("font-semibold", sideTone)}>{recap.side}</span>
        )}
        <span className="text-ink-2">{recap.oneLine}</span>
        <span className={cn("font-semibold inline-flex items-baseline", rTone)}>
          {rValue}
          <InfoTooltip
            label="R-multiple"
            content="Profit or loss expressed as multiples of the trade's initial risk. +1.5R means the move was 1.5× the original stop distance in the favorable direction."
          >
            <span className="cursor-help">R</span>
          </InfoTooltip>
        </span>
      </div>
    </div>
  );
}
