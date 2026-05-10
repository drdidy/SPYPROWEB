"use client";

// Low-key empty-state teaching panel. Shown only while both engines
// are in PRE_CONFIG so a brand-new user can see what the slate will
// look like once the next setup window opens — without crowding the
// live state when it returns.
//
// v4 polish:
//   - Wrapped in a subtly cooler surface tone (paper-cool) so the
//     section reads as instantly distinct from live cards.
//   - "Hide preview" toggle. Choice persists in localStorage, so a
//     returning user who has dismissed the panel doesn't see it
//     again. A small "Show preview" inline link replaces it.
//   - Strict 1fr 1fr inner grid (was already, but pinned via CSS
//     Grid template, not flex) so the SPX preview card can't end
//     up wider than its SPY counterpart on any width.

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayEngine } from "@/lib/engine-labels";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConvictionTrack } from "@/components/slate/ConvictionTrack";

const STORAGE_KEY = "slate.preview.hidden";

interface Props {
  className?: string;
}

export function PreviewState({ className }: Props) {
  const [hidden, setHidden] = useHiddenPref();

  if (hidden) {
    return (
      <div className={cn("text-right", className)}>
        {/* v5 #16: aria-expanded so AT announces collapse/expand
            state. The "Hide / Show preview" pair acts as a
            disclosure widget controlling the same content. */}
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-expanded={false}
          aria-controls="preview-state-content"
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-medium",
            "text-ink-3 hover:text-ink transition-colors",
            "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-soft px-1",
          )}
        >
          <Eye size={12} aria-hidden />
          Show preview<span className="sr-only"> section</span>
        </button>
      </div>
    );
  }

  return (
    <section
      id="preview-state-content"
      aria-label="Preview of populated cards"
      data-testid="preview-state"
      className={cn(
        // v4 #6 + #13: cooler surface tone differentiates the preview
        // from live cards above it. paper-cool is a teal-tinged cream.
        "rounded-card bg-paper-cool/50 border border-rule px-4 py-4 md:px-5 md:py-5",
        "space-y-4",
        className,
      )}
    >
      <header className="flex items-baseline gap-3">
        <h2 className="font-serif text-h3 text-ink tracking-tight">
          Preview
        </h2>
        <span aria-hidden className="h-px flex-1 bg-rule" />
        {/* v7 P1-11: settle the rule — every section eyebrow on the
            slate uses the tracked-caps `.eyebrow` utility. v4
            briefly demoted this to sentence-case, the v5 spec
            said to align with the rest of the page; v7 commits.
            Same treatment as WORKSPACE / ENGINES / RECOMMENDED
            NEXT STEP / LAST SESSION / PREVIEW. */}
        <span className="eyebrow text-ink-3">
          What you'll see at setup
        </span>
        {/* v5 #16: aria-expanded mirrors the disclosure relationship
            with the collapsed Show button. */}
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-expanded={true}
          aria-controls="preview-state-content"
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium",
            "text-ink-3 hover:text-ink transition-colors",
            "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-soft px-1",
          )}
        >
          <EyeOff size={12} aria-hidden />
          Hide<span className="sr-only"> preview section</span>
        </button>
      </header>
      <p className="text-meta text-ink-3 max-w-2xl">
        These are sample values, not live data. Real bias, conviction, grade,
        and active levels populate when the next setup window opens.
      </p>
      <div
        // v4 #14: strict 1fr 1fr grid. Both cards share the same
        // column width at every >= lg width, no flex slack.
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 opacity-65 select-none [grid-template-columns:1fr_1fr] lg:[grid-template-columns:1fr_1fr]"
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
          convictionLabel="3 / 5"
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
          convictionLabel="73 / 100"
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
              {/* v8 P1-2: SPX renders as "ES" everywhere on /dashboard. */}
              {displayEngine(engine)}
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
        <div className="grid grid-cols-3 gap-4 pt-3 border-t border-rule">
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

// localStorage-backed pref. SSR-safe: starts as `false` until the
// effect runs, so the preview is shown by default to first-time
// visitors. Returning users who have hidden the preview see the
// collapsed "Show preview" link until they open it again.
function useHiddenPref(): [boolean, (v: boolean) => void] {
  const [hidden, setHiddenState] = useState(false);
  useEffect(() => {
    try {
      setHiddenState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage may be unavailable (SSR fallback, private mode) —
      // default-shown is fine.
    }
  }, []);
  const setHidden = (v: boolean) => {
    setHiddenState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      // ignore — non-critical preference
    }
  };
  return [hidden, setHidden];
}
