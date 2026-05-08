"use client";
// Backtest outcome card. Renders only when the snapshot is in replay
// mode. Shows the chosen day's RTH OHLC and an auto-scored verdict
// outcome (WIN / LOSS / N/A) with the signed PnL in SPY pts.

import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { ReplayBlock } from "@/lib/snapshot-adapter";

interface Props {
  replay: ReplayBlock;
  verdict: string;
}

const outcomeTone: Record<string, "confirmed" | "watching" | "breached" | "stale"> = {
  WIN: "confirmed",
  LOSS: "breached",
  PUSH: "watching",
  N_A: "stale",
};

const outcomeLabel: Record<string, string> = {
  WIN: "Profitable call",
  LOSS: "Underwater",
  PUSH: "Flat",
  N_A: "No directional call",
};

export function ReplayOutcome({ replay, verdict }: Props) {
  const session = replay.session;
  const outcome = replay.verdictOutcome ?? "N_A";
  const pnl = replay.verdictPnl;

  return (
    <Card className="bg-paper">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        <div className="lg:col-span-5 p-6 border-b lg:border-b-0 lg:border-r border-rule">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-ink-3">How it played</span>
            <StatusPill variant={outcomeTone[outcome] ?? "stale"}>
              {outcome === "N_A" ? "N/A" : outcome}
            </StatusPill>
          </div>
          <h2 className="mt-3 text-title font-serif text-ink leading-tight">
            {outcomeLabel[outcome] ?? "Unscored"}
          </h2>
          <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
            Engine called <span className="font-mono font-semibold">{verdict}</span> for{" "}
            <span className="font-mono">{replay.date ?? "—"}</span>.
            {pnl !== null && pnl !== undefined && (
              <>
                {" "}
                Verdict PnL was{" "}
                <span
                  className={`font-mono font-semibold ${
                    pnl > 0 ? "text-bull-ink" : pnl < 0 ? "text-bear-ink" : "text-ink-3"
                  }`}
                >
                  {pnl >= 0 ? "+" : ""}
                  {pnl.toFixed(2)} pts
                </span>{" "}
                from RTH open to close.
              </>
            )}
          </p>
        </div>

        <div className="lg:col-span-7 p-6">
          <span className="eyebrow text-ink-3">Session OHLC</span>
          {session ? (
            <div className="mt-3 grid grid-cols-4 gap-3">
              <Stat label="Open" value={session.open} />
              <Stat label="High" value={session.high} tone="bull" />
              <Stat label="Low" value={session.low} tone="bear" />
              <Stat
                label="Close"
                value={session.close}
                tone={session.netPts > 0 ? "bull" : session.netPts < 0 ? "bear" : undefined}
              />
              <SubStat label="Range" value={`${session.range.toFixed(2)} pts`} />
              <SubStat
                label="Net"
                value={`${session.netPts >= 0 ? "+" : ""}${session.netPts.toFixed(2)}`}
                tone={session.netPts > 0 ? "bull" : session.netPts < 0 ? "bear" : undefined}
              />
              <SubStat
                label="Net %"
                value={`${session.netPct >= 0 ? "+" : ""}${session.netPct.toFixed(2)}%`}
                tone={session.netPct > 0 ? "bull" : session.netPct < 0 ? "bear" : undefined}
              />
              <SubStat label="Bars" value="RTH" />
            </div>
          ) : (
            <p className="mt-3 font-mono text-[12px] text-ink-3 italic">
              No RTH data for this date.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bull" | "bear";
}) {
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper-2 shadow-rule">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[15px] font-semibold tabular-nums ${
          tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink"
        }`}
        data-num
      >
        {value.toFixed(2)}
      </div>
    </div>
  );
}

function SubStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper-2/60">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div
        className={`font-mono text-[12px] font-semibold tabular-nums ${
          tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink-2"
        }`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}
