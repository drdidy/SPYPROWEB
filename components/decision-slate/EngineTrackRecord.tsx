// Compact "is the engine actually working?" panel. Renders a row of
// last-N-session outcome dots + a hit rate fraction. Hover any dot
// to see the date + the day's net move.
//
// The dot palette mirrors the structure-list StatusGlyph palette:
//   WIN  : bull
//   LOSS : bear
//   PUSH : neutral
//   SKIP : faint (engine watched, no trade)

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EngineTrackRecord, SessionOutcome } from "@/lib/track-record";

interface Props {
  record: EngineTrackRecord;
  className?: string;
}

const DOT_TONE: Record<SessionOutcome["outcome"], string> = {
  WIN: "bg-bull",
  LOSS: "bg-bear",
  PUSH: "bg-state-neutral",
  SKIP: "bg-ink-5/60",
};

export function EngineTrackRecord({ record, className }: Props) {
  const pct =
    record.hitRate == null ? null : Math.round(record.hitRate * 100);
  const labelTone = record.engine === "SPX" ? "text-violet" : "text-ink-3";
  return (
    <div className={cn("rounded-soft border border-rule bg-paper px-3 py-3 space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.16em] uppercase",
            labelTone,
          )}
        >
          {record.engine} · last {record.sessions.length}
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {pct == null ? "no graded sessions" : `${pct}% hit · ${record.wins}W ${record.losses}L`}
          {record.pushes ? ` ${record.pushes}P` : ""}
          {record.skips ? ` ${record.skips} skip` : ""}
        </span>
      </div>
      {record.sessions.length === 0 ? (
        <p className="text-[11px] text-ink-3">No replay data yet.</p>
      ) : (
        <ol className="flex items-center gap-1.5">
          {record.sessions
            .slice()
            .reverse() // oldest → newest reads left → right
            .map((s) => (
              <li
                key={s.date}
                title={`${s.date} · ${s.outcome}${s.pnlPts == null ? "" : ` · ${s.pnlPts >= 0 ? "+" : ""}${s.pnlPts.toFixed(2)} pts`}`}
                className={cn(
                  "h-3 w-3 rounded-full cursor-help",
                  DOT_TONE[s.outcome],
                )}
                aria-label={`${s.date}: ${s.outcome}`}
              />
            ))}
        </ol>
      )}
      <Link
        href={`/replay${record.sessions[0] ? `?date=${record.sessions[0].date}` : ""}`}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-3 hover:text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-soft"
      >
        Verify in Replay
        <ArrowRight size={11} className="text-ink-4" />
      </Link>
    </div>
  );
}
