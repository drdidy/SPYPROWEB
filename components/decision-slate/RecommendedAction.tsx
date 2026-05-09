// State-aware "Recommended next step" rail. Replaces v1's hard-coded
// three-branch `PrimaryActionRail` with a small dispatcher driven by
// `lib/recommendations.ts`. The eyebrow now names the engine state
// driving the recommendation so the user can see *why* the slate is
// pointing at this surface.
//
// All other actions on the slate are secondary/ghost-button styled —
// this is the page's #1 action.

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

// Icon per recommendation id — kept in the component layer so the
// pure dispatcher in lib/ stays icon-free (tests don't need React).
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
      aria-label="Recommended next step"
      data-testid="recommended-action"
      className={cn(
        "rounded-card border border-rule bg-paper px-4 py-3 md:px-5 md:py-4",
        "flex items-center justify-between gap-4 flex-wrap",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
          Recommended next step
          <span className="text-ink-4 mx-1.5" aria-hidden>
            ·
          </span>
          <span className="text-ink-2 normal-case font-medium tracking-[0.02em]">
            {rec.reason}
          </span>
        </p>
        <p className="text-body text-ink-2 mt-1 leading-snug max-w-2xl">
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
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        <Icon size={14} aria-hidden />
        {rec.label}
        <ArrowRight size={12} className="opacity-70" aria-hidden />
      </Link>
    </section>
  );
}
