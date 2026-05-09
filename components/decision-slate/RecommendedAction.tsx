// State-aware "Recommended next step" rail. v4 restores it as the
// page hero (first element under the page header), with a branded
// tint surface so it visually anchors the eye above the engine
// pipelines.
//
// Anatomy:
//   eyebrow "Recommended next step"
//   state context chip ("Both engines · pre-config")
//   headline = the action sentence
//   primary button right-aligned (drops below the text on narrow
//                                  widths via flex-wrap)
//
// All state mapping lives in lib/recommendations.ts so this file
// stays presentational and testable.

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Rewind,
  Activity,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  recommendationFor,
  type Recommendation,
} from "@/lib/recommendations";
import type { EngineState } from "@/lib/states";

const ICONS: Record<Recommendation["id"], LucideIcon> = {
  "live-spy": Activity,
  "live-spx": Activity,
  "options-cockpit": Target,
  "log-replay": Rewind,
  "daily-brief": BookOpen,
};

interface Props {
  spyState: EngineState;
  spxState: EngineState;
  className?: string;
}

export function RecommendedAction({ spyState, spxState, className }: Props) {
  const rec = recommendationFor(spyState, spxState);
  const Icon = ICONS[rec.id];

  return (
    <section
      aria-labelledby="recommended-action-heading"
      data-testid="recommended-action"
      className={cn(
        // v5 #10: softer tint than v4. The previous bg-paper-brand
        // (#FAF1DC) read as "warning state" yellow on calibrated
        // monitors. paper-2 (the warm cream surface used elsewhere)
        // anchors the eye via a faint contrast against the canvas
        // without implying caution. A 1px ink-tinted top stripe via
        // shadow-inset replaces the gold border so the hero still
        // reads as "primary surface" rather than "another card".
        "rounded-card bg-paper-2 border border-rule",
        "shadow-[inset_0_2px_0_rgba(20,22,26,0.04),0_1px_0_rgba(20,22,26,0.02)]",
        "px-5 py-4 md:px-6 md:py-5",
        "flex items-center justify-between gap-4 flex-wrap",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          {/* v5 #7: settled rule — section eyebrows use tracked-caps
              consistently (WORKSPACE / ENGINES / RECOMMENDED NEXT
              STEP / LAST SESSION / PREVIEW). The state-context line
              moves down to plain text below. */}
          <p
            id="recommended-action-heading"
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-2 font-semibold"
          >
            Recommended next step
          </p>
          {/* v5 #9: state-context demoted from a chip-styled pill
              (which looked clickable but wasn't) to plain inline
              text with a leading middot. */}
          <span
            data-testid="recommended-action-state"
            className="text-[11px] tracking-[0.02em] text-ink-3 italic"
          >
            · {rec.reason}
          </span>
        </div>
        <p className="text-body text-ink leading-snug max-w-2xl mt-1 font-medium">
          {rec.description}
        </p>
      </div>
      <Link
        href={rec.href}
        data-recommendation-id={rec.id}
        className={cn(
          "inline-flex items-center gap-2 h-10 px-4 rounded-pill shrink-0",
          "bg-ink text-paper hover:bg-ink-2 transition-colors",
          "font-mono text-[12px] tracking-[0.06em] font-medium",
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        <Icon size={14} aria-hidden />
        {rec.label}
        <ArrowRight size={12} className="opacity-70" aria-hidden />
      </Link>
    </section>
  );
}
