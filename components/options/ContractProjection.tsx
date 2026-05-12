import type { ContractProjection as Projection } from "@/lib/contract-projection";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export function ContractProjectionCard({
  projection,
  compact = false,
  className,
}: {
  projection: Projection | null;
  compact?: boolean;
  className?: string;
}) {
  if (!projection) {
    return (
      <EmptyState
        className={cn("px-3 py-3", className)}
        title="Contract model waiting."
        reason="The chain is loaded only when bid, ask, delta, and gamma are all usable for the active strike."
        detail="No debit is fabricated. Retry follows the options-chain heartbeat, and the panel will populate as soon as the live chain returns usable Greeks."
        kind="waiting"
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-soft border border-rule bg-paper-2/55 shadow-rule",
        compact ? "px-3 py-3" : "px-4 py-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow text-ink-3">Contract entry projection</div>
          <div
            className={cn(
              "mt-1 font-serif leading-none",
              compact ? "text-[22px]" : "text-title",
              projection.side === "CALL" ? "text-bull-ink" : "text-bear-ink",
            )}
          >
            {projection.contractLabel}
          </div>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          mark {money(projection.currentMark)}
          {projection.currentBid !== null && projection.currentAsk !== null && (
            <span className="block tabular-nums">
              {money(projection.currentBid)} / {money(projection.currentAsk)}
            </span>
          )}
        </div>
      </div>

      <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-2" : "grid-cols-3")}>
        <ProjectionCell
          label="At entry"
          estimate={projection.projectedEntry}
          tone={projection.side === "CALL" ? "bull" : "bear"}
        />
        {projection.projectedStop && (
          <ProjectionCell label="At stop" estimate={projection.projectedStop} />
        )}
        {projection.projectedTarget && (
          <ProjectionCell
            label="At target"
            estimate={projection.projectedTarget}
            tone="gold"
          />
        )}
      </div>

      {!compact && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-rule pt-3">
            <GreekCell label="Delta" value={projection.delta.toFixed(3)} />
            <GreekCell label="Gamma" value={projection.gamma.toFixed(3)} />
            <GreekCell
              label="Move"
              value={`${projection.underlyingMove >= 0 ? "+" : ""}${projection.underlyingMove.toFixed(2)}`}
            />
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink-3">
            {projection.modelNote}
          </p>
        </>
      )}
    </div>
  );
}

function ProjectionCell({
  label,
  estimate,
  tone = "ink",
}: {
  label: string;
  estimate: Projection["projectedEntry"];
  tone?: "ink" | "bull" | "bear" | "gold";
}) {
  const cls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : tone === "gold"
          ? "text-gold-ink"
          : "text-ink";
  return (
    <div className="rounded-soft bg-paper px-2.5 py-2 shadow-rule">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold tabular-nums", cls)}>
        {money(estimate.mark)}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-ink-3 tabular-nums">
        {money(estimate.low)}-{money(estimate.high)}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-ink-4 tabular-nums">
        ${estimate.debitPerContract}/contract
      </div>
    </div>
  );
}

function GreekCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
