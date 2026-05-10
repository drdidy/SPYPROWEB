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
import { displayEngine } from "@/lib/engine-labels";
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
  // v7 P1-7: SKIP renders as a hollow ring (1.5px stroke, no
  // fill) so a "no graded sessions" lookback reads as "engine
  // watched but didn't qualify a setup" rather than five
  // neutral results.
  SKIP: "bg-transparent ring-[1.5px] ring-ink-4/60",
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

  // v2 copy polish: parens on the W/L breakdown make clear the
  // percentage applies to graded sessions only. "5W 1L" still reads
  // separately so the user can see the underlying counts.
  // v4 #7: "graded sessions" is jargon — surfaced via tooltip on
  // the percentage (see the InfoTooltip wrapper below).
  const summary =
    pct == null
      ? SLATE_COPY.trackRecord.noGraded
      : `${pct}% hit (${record.wins}W ${record.losses}L${
          record.pushes ? ` ${record.pushes}P` : ""
        })`;
  const skipText = record.skips
    ? SLATE_COPY.trackRecord.skipLabel(record.skips)
    : null;
  // Promote the no-graded-but-N-skips case to a discoverable tooltip:
  // the user otherwise sees "No graded sessions yet" with no
  // explanation of why every recent session is faint.
  const summaryNeedsTooltip = pct == null && record.skips > 0;

  // v2 (#9): the skip count is an interactive link to a filtered
  // Replay view, not just an underlined hint. Falls back to a plain
  // span when there's no anchor date.
  const skipFilterHref = record.sessions[0]
    ? `/replay?date=${record.sessions[0].date}&filter=skip`
    : "/replay?filter=skip";

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
          {/* v8 P1-2: SPX renders as "ES" everywhere on /dashboard. */}
          {displayEngine(record.engine)}
          <span className="ml-1.5 text-ink-3 font-medium tracking-[0.06em] normal-case">
            {SLATE_COPY.trackRecord.rangeLabel(record.sessions.length).toLowerCase()}
          </span>
        </span>
        <span className="font-mono text-meta tabular-nums text-ink-2">
          {summaryNeedsTooltip ? (
            <InfoTooltip
              label="No graded sessions yet"
              content={`Engine watched the last ${record.sessions.length} session${
                record.sessions.length === 1 ? "" : "s"
              } but didn't qualify a setup. A graded session is one the engine took to a confirmed entry trigger and tracked through to its exit.`}
            >
              <span className="cursor-help">{summary}</span>
            </InfoTooltip>
          ) : pct != null ? (
            // v4 #7: tooltip on the hit-rate so "graded" is
            // discoverable without a glossary trip.
            <InfoTooltip
              label="Graded sessions"
              content="Sessions where the engine took a setup to a confirmed entry and tracked through to exit. Skipped sessions are excluded from the percentage."
            >
              <span className="cursor-help">{summary}</span>
            </InfoTooltip>
          ) : (
            summary
          )}
          {skipText && (
            <>
              {" · "}
              <InfoTooltip
                label="Skip"
                content={SLATE_COPY.trackRecord.skipTooltip}
              >
                <Link
                  href={skipFilterHref}
                  className={cn(
                    "rounded-soft hover:text-ink transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
                  )}
                >
                  {skipText}
                </Link>
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
            <Swatch className="bg-transparent ring-[1.5px] ring-ink-4/60 ml-2" /> skip
          </p>
        </>
      )}
      {/* Ghost-button form, same shape + sentence-case as the rest of
          the slate's secondary actions (v2 #9). v5 #11: button label
          names the engine so the two side-by-side buttons in the
          briefing aren't ambiguous duplicates. */}
      <Link
        href={`/replay${record.sessions[0] ? `?date=${record.sessions[0].date}` : ""}&engine=${record.engine}`}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2.5 rounded-pill",
          "bg-paper-2/60 text-ink-2 hover:text-ink hover:bg-paper-2",
          "border border-rule transition-colors",
          "text-[11px] tracking-[0.02em] font-medium",
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        Open {displayEngine(record.engine)} replay
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
