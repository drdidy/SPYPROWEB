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
  WIN: "bg-bull ring-1 ring-bull-ink/20",
  LOSS: "bg-bear ring-1 ring-bear-ink/20",
  PUSH: "bg-state-neutral ring-1 ring-ink/15",
  SKIP: "bg-[#C9A227]/60 ring-1 ring-[#8E6F19]/40",
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
  const display = displayEngine(record.engine);
  const summary =
    pct == null
      ? SLATE_COPY.trackRecord.noGraded
      : `${pct}% hit (${record.wins}W ${record.losses}L${
          record.pushes ? ` ${record.pushes}P` : ""
        })`;
  const skipText = record.skips
    ? SLATE_COPY.trackRecord.skipLabel(record.skips)
    : null;
  const summaryNeedsTooltip = pct == null && record.skips > 0;
  const skipFilterHref = record.sessions[0]
    ? `/replay?date=${record.sessions[0].date}&filter=skip`
    : "/replay?filter=skip";
  const ringPct = pct ?? 0;

  return (
    <div
      className={cn(
        "rounded-soft border border-rule bg-paper px-4 py-4 shadow-card",
        "transition-colors hover:border-rule-strong",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            className={cn(
              "font-mono text-[10px] tracking-[0.16em] uppercase font-bold",
              labelTone,
            )}
          >
            {display}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            {SLATE_COPY.trackRecord.rangeLabel(record.sessions.length)}
          </div>
        </div>

        <InfoTooltip
          label={pct == null ? "No graded sessions yet" : "Graded sessions"}
          content={
            summaryNeedsTooltip
              ? `Engine watched the last ${record.sessions.length} session${
                  record.sessions.length === 1 ? "" : "s"
                } but did not qualify a setup. A graded session is one the engine took to a confirmed entry trigger or replay open-zone continuation and tracked through to its exit.`
              : "Sessions where the engine took a confirmed entry or replay open-zone continuation and tracked through exit. Skipped sessions are excluded from the percentage."
          }
        >
          <span className="cursor-help font-mono text-meta tabular-nums text-ink-2">
            {summary}
          </span>
        </InfoTooltip>
      </div>

      <div className="mt-4 grid grid-cols-[76px_1fr] items-center gap-4">
        <div
          className="relative h-[76px] w-[76px] rounded-full"
          style={{
            background:
              pct == null
                ? "conic-gradient(#D4CBB6 0deg, #EFEADC 0deg)"
                : `conic-gradient(#0E7C50 ${ringPct * 3.6}deg, #B5301E ${ringPct * 3.6}deg ${Math.min(
                    360,
                    (ringPct + record.losses * 10) * 3.6,
                  )}deg, #E8E2D2 0deg)`,
          }}
          aria-hidden
        >
          <div className="absolute inset-[7px] rounded-full bg-paper" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-serif text-[24px] leading-none text-ink">
              {pct == null ? "-" : pct}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
              hit
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-3 divide-x divide-rule rounded-[6px] border border-rule-soft bg-paper-tier3">
            <Metric label="Wins" value={record.wins} tone="text-bull-ink" />
            <Metric label="Losses" value={record.losses} tone="text-bear-ink" />
            <Metric label="Skips" value={record.skips} tone="text-gold-ink" />
          </div>
          <div className="mt-3">
            {record.sessions.length === 0 ? (
              <ol
                className="flex items-center gap-2"
                aria-label="No graded data yet"
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <li
                    key={i}
                    aria-hidden
                    className="h-3.5 w-3.5 rounded-full bg-transparent ring-[1.5px] ring-ink-4/60"
                  />
                ))}
              </ol>
            ) : (
              <ol className="flex items-center gap-2">
                {record.sessions
                  .slice()
                  .reverse()
                  .map((s) => (
                    <li
                      key={s.date}
                      title={`${s.date} - ${OUTCOME_LABEL[s.outcome]}${
                        s.pnlPts == null
                          ? ""
                          : ` - ${s.pnlPts >= 0 ? "+" : ""}${s.pnlPts.toFixed(2)} pts`
                      }`}
                      className={cn(
                        "h-3.5 w-3.5 rounded-full cursor-help",
                        DOT_TONE[s.outcome],
                      )}
                      aria-label={`${s.date}: ${OUTCOME_LABEL[s.outcome]}`}
                    />
                  ))}
              </ol>
            )}
            <p
              className="mt-2 text-[10.5px] tracking-[0.02em] text-ink-3"
              aria-label={SLATE_COPY.trackRecord.legendTooltip}
            >
              <Swatch className="bg-bull ring-1 ring-bull-ink/20" /> win
              <Swatch className="bg-bear ring-1 ring-bear-ink/20 ml-2" /> loss
              <Swatch className="bg-[#C9A227]/60 ring-1 ring-[#8E6F19]/40 ml-2" /> skip
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule-soft pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
          Replay audit
        </span>
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
          Open {display} replay
          <ArrowRight size={11} className="text-ink-4" aria-hidden />
        </Link>
      </div>

      {skipText && (
        <div className="mt-2 font-mono text-[10.5px] text-ink-3">
          <InfoTooltip label="Skip" content={SLATE_COPY.trackRecord.skipTooltip}>
            <Link
              href={skipFilterHref}
              className="rounded-soft hover:text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              {skipText} excluded from hit rate
            </Link>
          </InfoTooltip>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="px-2.5 py-2">
      <div className={cn("font-serif text-[20px] leading-none", tone)}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
        {label}
      </div>
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
