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
        // v4 #6: branded gold tint surface so the hero anchors the
        // page above the cream-on-cream cards. 1.5px gold border in
        // the brand color reinforces the "this is the primary
        // action" reading.
        "rounded-card bg-paper-brand border border-rule-strong",
        "shadow-[inset_0_0_0_1px_rgba(184,130,31,0.15)]",
        "px-5 py-4 md:px-6 md:py-5",
        "flex items-center justify-between gap-4 flex-wrap",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* v4 #9: tracked-caps reserved for one-word eyebrows.
              Multi-word eyebrows render as plain small-caps text. */}
          <p
            id="recommended-action-heading"
            className="text-[11px] tracking-[0.02em] text-ink-2 font-semibold"
          >
            Recommended next step
          </p>
          <span aria-hidden className="h-3 w-px bg-rule-strong" />
          <span
            data-testid="recommended-action-state"
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-pill",
              "bg-paper/70 text-ink-2",
              "text-[11px] tracking-[0.02em] font-medium",
              "shadow-[inset_0_0_0_1px_rgba(184,130,31,0.20)]",
            )}
          >
            {rec.reason}
          </span>
        </div>
        <p className="text-body text-ink leading-snug max-w-2xl mt-2 font-medium">
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
