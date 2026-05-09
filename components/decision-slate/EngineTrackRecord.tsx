// Compact "is the engine actually working?" panel. A row of last-N
// session outcome dots + hit-rate fraction. Hover any dot to see the
// date and that day's net move.
//
// The dot palette mirrors the structure-list semantic colors:
//   Win  : bull
//   Loss : bear
//   Push : neutral
//   Skip : faint (engine watched, no trade)
//
// Slate refinement (2026-05): copy is plain English, with an inline
// legend underneath the dot row so readers don't have to guess what
// the colors mean.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SLATE_COPY } from "@/content/copy";
import type {
  EngineTrackRecord as EngineTrackRecordData,
  SessionOutcome,
} from "@/lib/track-record";

interface Props {
  record: EngineTrackRecordData;
  className?: string;
}

const DOT_TONE: Record<SessionOutcome["outcome"], string> = {
  // Brighter rings on each dot vs. the prior solid swatches —
  // 4.5:1+ contrast against the paper-2/30 sub-card background.
  WIN: "bg-bull ring-1 ring-bull-ink/20",
  LOSS: "bg-bear ring-1 ring-bear-ink/20",
  PUSH: "bg-state-neutral ring-1 ring-ink/15",
  SKIP: "bg-ink-5 ring-1 ring-ink-3/30",
};

const OUTCOME_LABEL: Record<SessionOutcome["outcome"], string> = {
  WIN: "Win",
  LOSS: "Loss",
  PUSH: "Push",
  SKIP: "Skip",
};

export function EngineTrackRecord({ record, className }: Props) {
  const pct =
    record.hitRate == null ? null : Math.round(record.hitRate * 100);
  const labelTone = record.engine === "SPX" ? "text-violet" : "text-ink-2";

  const summary =
    pct == null
      ? SLATE_COPY.trackRecord.noGraded
      : `${pct}% hit · ${record.wins}W ${record.losses}L${
          record.pushes ? ` ${record.pushes}P` : ""
        }`;
  const skipText = record.skips
    ? SLATE_COPY.trackRecord.skipLabel(record.skips)
    : null;

  return (
    <div
      className={cn(
        "rounded-soft border border-rule bg-paper px-3 py-3 space-y-2",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.16em] uppercase font-bold",
            labelTone,
          )}
        >
          {record.engine}
          <span className="ml-1.5 text-ink-3 font-medium tracking-[0.06em] normal-case">
            {SLATE_COPY.trackRecord.rangeLabel(record.sessions.length).toLowerCase()}
          </span>
        </span>
        <span className="font-mono text-meta tabular-nums text-ink-2">
          {summary}
          {skipText && (
            <>
              {" · "}
              <InfoTooltip
                label="Skip"
                content={SLATE_COPY.trackRecord.skipTooltip}
              >
                <span className="underline decoration-dotted decoration-ink-4 underline-offset-2 cursor-help">
                  {skipText}
                </span>
              </InfoTooltip>
            </>
          )}
        </span>
      </div>
      {record.sessions.length === 0 ? (
        <p className="text-meta text-ink-3">No replay data yet.</p>
      ) : (
        <>
          <ol className="flex items-center gap-1.5">
            {record.sessions
              .slice()
              .reverse() // oldest → newest reads left → right
              .map((s) => (
                <li
                  key={s.date}
                  title={`${s.date} · ${OUTCOME_LABEL[s.outcome]}${
                    s.pnlPts == null
                      ? ""
                      : ` · ${s.pnlPts >= 0 ? "+" : ""}${s.pnlPts.toFixed(2)} pts`
                  }`}
                  className={cn(
                    "h-3 w-3 rounded-full cursor-help",
                    DOT_TONE[s.outcome],
                  )}
                  aria-label={`${s.date}: ${OUTCOME_LABEL[s.outcome]}`}
                />
              ))}
          </ol>
          <p
            className="text-[10.5px] tracking-[0.02em] text-ink-3"
            aria-label={SLATE_COPY.trackRecord.legendTooltip}
          >
            <Swatch className="bg-bull ring-1 ring-bull-ink/20" /> win
            <Swatch className="bg-bear ring-1 ring-bear-ink/20 ml-2" /> loss
            <Swatch className="bg-ink-5 ring-1 ring-ink-3/30 ml-2" /> skip
          </p>
        </>
      )}
      <Link
        href={`/replay${record.sessions[0] ? `?date=${record.sessions[0].date}` : ""}`}
        className={cn(
          "inline-flex items-center gap-1",
          "font-mono text-[10px] uppercase tracking-[0.10em]",
          "text-ink-3 hover:text-ink transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-soft",
        )}
      >
        {SLATE_COPY.trackRecord.verifyCta}
        <ArrowRight size={11} className="text-ink-4" aria-hidden />
      </Link>
    </div>
  );
}

function Swatch({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 rounded-full align-middle mr-1",
        className,
      )}
    />
  );
}
