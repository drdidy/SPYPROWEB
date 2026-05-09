// Low-key empty-state teaching panel. Shown only while both engines
// are in PRE_CONFIG so a brand-new user can see what the slate will
// look like once the next setup window opens — without crowding the
// live state when it returns.
//
// The preview uses faint mock values, a "Preview" eyebrow, and a
// reduced-opacity wrapper so it reads as a sample rather than real
// data. No interaction — these cards are intentionally static.
//
// The preview is hidden once either engine leaves PRE_CONFIG.

import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConvictionTrack } from "@/components/slate/ConvictionTrack";

interface Props {
  className?: string;
}

export function PreviewState({ className }: Props) {
  return (
    <section
      aria-label="Preview of populated cards"
      data-testid="preview-state"
      className={cn("space-y-3", className)}
    >
      <div className="flex items-baseline gap-3">
        <h2 className="font-serif text-[18px] text-ink tracking-tight">
          Preview
        </h2>
        <span aria-hidden className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
          What you'll see at setup
        </span>
      </div>
      <p className="text-meta text-ink-3 max-w-2xl">
        These are sample values, not live data. Real bias, conviction, grade,
        and active levels populate when the next setup window opens.
      </p>
      <div
        // Reduced opacity + non-interactive cursor signal "this is a sketch".
        className="grid grid-cols-1 lg:grid-cols-2 gap-5 opacity-65 select-none"
        aria-hidden
      >
        <PreviewCard
          engine="SPY"
          headline="Leaning long"
          price="612.40"
          delta="+1.85"
          subtitle="Bias is the directional lean from the overnight and premarket sessions."
          conviction={3}
          convictionMax={5}
          convictionLabel="3/5"
          biasLabel="bullish"
          gradeLabel="B+"
          biasTone="text-bull-ink"
        />
        <PreviewCard
          engine="SPX"
          headline="Take the channel"
          price="6,124.50"
          delta="+12.40"
          subtitle="Channel is the overnight envelope. It forms on the first qualifying pivot."
          conviction={73}
          convictionMax={100}
          convictionLabel="73/100"
          biasLabel="ascending"
          gradeLabel="A"
          biasTone="text-bull-ink"
        />
      </div>
    </section>
  );
}

interface PreviewCardProps {
  engine: "SPY" | "SPX";
  headline: string;
  price: string;
  delta: string;
  subtitle: string;
  conviction: number;
  convictionMax: number;
  convictionLabel: string;
  biasLabel: string;
  gradeLabel: string;
  biasTone: string;
}

function PreviewCard({
  engine,
  headline,
  price,
  delta,
  subtitle,
  conviction,
  convictionMax,
  convictionLabel,
  biasLabel,
  gradeLabel,
  biasTone,
}: PreviewCardProps) {
  const tickerTone = engine === "SPX" ? "text-violet" : "text-ink-3";
  return (
    <Card>
      <CardHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "font-mono text-[10px] tracking-[0.18em] uppercase font-bold",
                tickerTone,
              )}
            >
              {engine}
            </span>
            <span className="text-ink-4" aria-hidden>
              ·
            </span>
            <span className="text-ink-3 font-medium tracking-[0.10em] text-[10px]">
              preview
            </span>
          </span>
        }
        title={
          <span className="flex items-baseline gap-3 flex-wrap">
            <span className="font-serif text-[26px] tracking-tight">
              {headline}
            </span>
            <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
              <span className="font-mono text-meta text-ink-3 tabular-nums">
                {price}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-bull-ink">
                {delta}
              </span>
            </span>
          </span>
        }
      />
      <CardBody className="space-y-4">
        <p className="text-meta text-ink-3 -mt-2">{subtitle}</p>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-rule">
          <PreviewMetric label="Conviction">
            <ConvictionTrack
              value={conviction}
              max={convictionMax}
              label={convictionLabel}
            />
          </PreviewMetric>
          <PreviewMetric label={engine === "SPY" ? "Bias" : "Channel"}>
            <span
              className={cn("font-mono text-meta font-semibold tabular-nums", biasTone)}
            >
              {biasLabel}
            </span>
          </PreviewMetric>
          <PreviewMetric label="Grade">
            <span className="font-mono text-meta font-semibold tabular-nums text-bull-ink">
              {gradeLabel}
            </span>
          </PreviewMetric>
        </div>
      </CardBody>
    </Card>
  );
}

function PreviewMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[11px] tracking-[0.10em] uppercase text-ink-2">
          {label}
        </span>
      </div>
      <div className="min-h-[28px] flex items-end">{children}</div>
    </div>
  );
}
