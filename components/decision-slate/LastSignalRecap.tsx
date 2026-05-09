// Single-line recap of the previous session's last signal — visible
// only while the engine is between sessions (PRE_CONFIG / STAND_DOWN /
// COOLDOWN). When no recap is available it returns null so the card
// doesn't render an empty box.

import type { LastSignalSummary } from "@/types/decision-slate";

interface Props {
  recap: LastSignalSummary | null;
  className?: string;
}

export function LastSignalRecap({ recap, className }: Props) {
  if (!recap) return null;
  const sideTone =
    recap.side === "LONG" ? "text-state-bullish" : "text-state-bearish";
  const r =
    recap.rMultiple == null
      ? "—"
      : `${recap.rMultiple > 0 ? "+" : ""}${recap.rMultiple.toFixed(2)}R`;
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
        <span className={`font-semibold ${sideTone}`}>{recap.side}</span>
        <span className="text-ink-2">{recap.oneLine}</span>
        <span className={`font-semibold ${rTone}`}>{r}</span>
      </div>
    </div>
  );
}
