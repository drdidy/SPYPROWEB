import type { ContractProjection as Projection } from "@/lib/contract-projection";
import { cn } from "@/lib/utils";

export interface ReplayLearningSummary {
  reviewed: number;
  qualified: number;
  averageTargetGainPct: number | null;
  averageDrawdownPct: number | null;
  preferredStrikeDistance: number | null;
  bestEntryBand: { low: number; high: number } | null;
  confirmationRate: number | null;
  confidence?: "high" | "medium" | "learning";
  averageEntryErrorPct?: number | null;
  agentRead?: string;
}

export function ContractProjectionCard({
  projection,
  replayLearning,
  compact = false,
  className,
}: {
  projection: Projection | null;
  replayLearning?: ReplayLearningSummary | null;
  compact?: boolean;
  className?: string;
}) {
  if (!projection) {
    return (
      <div className={cn("rounded-soft border border-rule bg-paper-2/50 px-3 py-3", className)}>
        <div className="eyebrow text-ink-3">Contract entry projection</div>
        <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
          Waiting for a qualifying contract inside the entry band before
          estimating the debit.
        </p>
      </div>
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
          last mark {money(projection.currentMark)}
          {projection.currentBid !== null && projection.currentAsk !== null && (
            <span className="block tabular-nums">
              {money(projection.currentBid)} / {money(projection.currentAsk)}
            </span>
          )}
        </div>
      </div>

      <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-2" : "grid-cols-3")}>
        <ProjectionCell
          label="Projected entry"
          estimate={projection.projectedEntry}
          tone={projection.side === "CALL" ? "bull" : "bear"}
        />
        {projection.projectedStop && (
          <ProjectionCell label="At stop" estimate={projection.projectedStop} />
        )}
        {projection.projectedTarget && (
          <ProjectionCell
            label="Projected target"
            estimate={projection.projectedTarget}
            tone="gold"
          />
        )}
      </div>

      <ProjectionTimingNote projection={projection} compact={compact} />

      {compact && <CompactProjectionProof projection={projection} />}

      {replayLearning && (
        <ReplayLearningGuide projection={projection} learning={replayLearning} compact={compact} />
      )}

      {!compact && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-rule pt-3 sm:grid-cols-4">
            <GreekCell label={`${projection.symbol} entry`} value={projection.entryUnderlying.toFixed(2)} />
            <GreekCell label={`${projection.symbol} target`} value={projection.targetUnderlying?.toFixed(2) ?? "--"} />
            <GreekCell label="Delta" value={projection.delta.toFixed(3)} />
            <GreekCell label="Gamma" value={projection.gamma.toFixed(3)} />
            <GreekCell
              label="Move"
              value={`${projection.underlyingMove >= 0 ? "+" : ""}${projection.underlyingMove.toFixed(2)}`}
            />
          </div>
          {projection.translation && <ProjectionTranslation projection={projection} />}
          <WhyThisContract projection={projection} />
          <p className="mt-3 text-[11px] leading-snug text-ink-3">
            {projection.modelNote}
          </p>
        </>
      )}
    </div>
  );
}

function ProjectionTimingNote({ projection, compact }: { projection: Projection; compact: boolean }) {
  const entryTime = projection.projectedEntryAt ? formatDateTime(projection.projectedEntryAt) : null;
  const targetTime = projection.projectedTargetAt ? formatDateTime(projection.projectedTargetAt) : null;
  const label = entryTime
    ? targetTime
      ? `Entry estimate is priced for ${entryTime}; target estimate uses ${targetTime}.`
      : `Entry estimate is priced for ${entryTime}.`
    : "Entry estimate is priced for the projected gate, not the current chain mark.";
  return (
    <div className={cn("mt-2 rounded-[9px] border border-rule bg-paper px-2.5 py-2 text-[11px] leading-snug text-ink-3", compact && "text-[10px]")}>
      {label}
    </div>
  );
}

function CompactProjectionProof({ projection }: { projection: Projection }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      <GuideCell
        label="SPX entry"
        value={formatLevel(projection.translation?.spxEntry ?? projection.entryUnderlying)}
      />
      <GuideCell
        label="SPX target"
        value={formatLevel(projection.translation?.spxTarget ?? projection.targetUnderlying)}
      />
      <GuideCell label="OTM gap" value={`${Math.abs(projection.strikeDistanceFromEntry).toFixed(1)} pts`} />
    </div>
  );
}

function ProjectionTranslation({ projection }: { projection: Projection }) {
  const translation = projection.translation;
  return (
    <div className="mt-3 grid gap-2 rounded-soft border border-rule bg-paper px-3 py-3 sm:grid-cols-4">
      <GreekCell label="ES entry" value={formatLevel(translation?.esEntry)} />
      <GreekCell label="SPX entry" value={formatLevel(translation?.spxEntry ?? projection.entryUnderlying)} />
      <GreekCell label="ES target" value={formatLevel(translation?.esTarget)} />
      <GreekCell label="SPX target" value={formatLevel(translation?.spxTarget ?? projection.targetUnderlying)} />
      <div className="sm:col-span-4 flex flex-wrap items-center gap-2 border-t border-rule pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        <span>Basis {translation?.basis == null ? "--" : signed(translation.basis)}</span>
        <span>Model {projection.pricingModel === "greeks" ? "Greeks" : "IV"}</span>
        <span>Confidence {projection.confidence}</span>
        {projection.projectedEntryAt && <span>Gate estimate {formatTime(projection.projectedEntryAt)}</span>}
      </div>
    </div>
  );
}

function ReplayLearningGuide({
  projection,
  learning,
  compact,
}: {
  projection: Projection;
  learning: ReplayLearningSummary;
  compact: boolean;
}) {
  const guide = buildReplayPriceGuide(projection, learning);
  if (!guide) return null;

  return (
    <div
      className={cn(
        "mt-3 rounded-soft border border-gold/25 bg-gold-tint px-3 py-3",
        compact && "px-2.5 py-2",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="eyebrow text-gold-ink">Self-learning price guide</div>
        <span className="rounded-[7px] border border-gold/30 bg-paper px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-gold-ink">
          {learning.confidence ? learning.confidence : `${learning.qualified}/${learning.reviewed}`}
        </span>
      </div>
      <div className={cn("mt-2 grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-4")}>
        <GuideCell label="Suggested entry" value={money(guide.entry)} />
        <GuideCell label="Entry band" value={moneyRange(guide.entryLow, guide.entryHigh)} />
        <GuideCell label="Suggested exit" value={money(guide.exit)} />
        {!compact && (
          <GuideCell label="Heat to expect" value={formatPct(learning.averageDrawdownPct)} />
        )}
      </div>
      {!compact && (
        <p className="mt-2 text-[11px] leading-snug text-gold-ink/85">
          {learning.agentRead ??
            "This blends the live contract model with recent replay behavior for similar SPX tickets. Use it as a planning range, then let the momentum gate confirm."}
        </p>
      )}
    </div>
  );
}

function GuideCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-gold/20 bg-paper px-2.5 py-2">
      <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-gold-ink/70">{label}</div>
      <div className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function WhyThisContract({ projection }: { projection: Projection }) {
  return (
    <div className="mt-3 rounded-soft border border-rule bg-paper px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="eyebrow text-ink-3">Why this contract</div>
        <span className="rounded-[7px] border border-gold/30 bg-gold-tint px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-gold-ink">
          {projection.confidence} confidence
        </span>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {projection.selectionReasons.slice(0, 4).map((reason) => (
          <div key={reason} className="rounded-[8px] bg-paper-2/60 px-2.5 py-2 text-[11px] leading-snug text-ink-2">
            {reason}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <GreekCell label="Strike gap" value={projection.strikeDistanceFromEntry.toFixed(1)} />
        <GreekCell label="Budget" value={projection.maxEntryDebit == null ? "--" : money(projection.maxEntryDebit)} />
        <GreekCell label="Theta used" value={signed(projection.thetaApplied)} />
        <GreekCell label="Chain" value={projection.chainAsOf ? formatTime(projection.chainAsOf) : "Pending"} />
      </div>
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

function moneyRange(low: number, high: number): string {
  return Math.abs(low - high) < 0.01 ? money(low) : `${money(low)}-${money(high)}`;
}

function formatPct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(1)}%`;
}

function formatLevel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "--";
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "Current";
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return "the projected entry window";
  }
}

function buildReplayPriceGuide(
  projection: Projection,
  learning: ReplayLearningSummary,
): {
  entry: number;
  entryLow: number;
  entryHigh: number;
  exit: number;
} | null {
  if (!learning.bestEntryBand && learning.averageTargetGainPct === null) return null;
  const errorBias = clamp(learning.averageEntryErrorPct ?? 0, -25, 25) / 100;
  const modelEntry = roundMoney(projection.projectedEntry.mark * (1 + errorBias));
  const band = learning.bestEntryBand;
  const bandMid = band ? (band.low + band.high) / 2 : modelEntry;
  const preferred = learning.preferredStrikeDistance;
  const distanceFit =
    typeof preferred === "number" && Number.isFinite(preferred)
      ? Math.max(0.18, Math.min(0.72, 1 - Math.abs(Math.abs(projection.strikeDistanceFromEntry) - preferred) / 45))
      : 0.35;
  const historyWeight = band ? Math.min(0.62, 0.28 + distanceFit * 0.42) : 0.18;
  const entry = roundMoney(modelEntry * (1 - historyWeight) + bandMid * historyWeight);
  const entryLow = roundMoney(Math.min(projection.projectedEntry.low, band?.low ?? projection.projectedEntry.low));
  const entryHigh = roundMoney(Math.max(projection.projectedEntry.high, band?.high ?? projection.projectedEntry.high));
  const replayExit =
    learning.averageTargetGainPct !== null
      ? entry * (1 + Math.max(-80, learning.averageTargetGainPct) / 100)
      : null;
  const modelExit = projection.projectedTarget?.mark ?? null;
  const exit = roundMoney(
    replayExit !== null && modelExit !== null
      ? replayExit * 0.45 + modelExit * 0.55
      : replayExit ?? modelExit ?? entry,
  );
  return { entry, entryLow, entryHigh, exit };
}

function roundMoney(value: number): number {
  return Math.round(Math.max(0.01, value) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
