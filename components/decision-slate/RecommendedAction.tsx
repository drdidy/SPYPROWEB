// State-aware "Recommended next step" rail. Page hero — first
// element under the page header — with a tier-1 surface so it
// visually anchors the eye above the engine pipelines.
//
// Anatomy (v10):
//   eyebrow         "Recommended next step"
//   headline        the action sentence (rec.description)
//   context line    "SPY opens in 1d 6h · ES opens in 20h 50m"
//                   — replaces the v5 reason chip
//   primary button  right-aligned (drops below text on narrow
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
import { Countdown } from "@/components/decision-slate/Countdown";
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
  /** Next significant event ISOs for the inline context line.
   *  When omitted (e.g. older callers), the context line hides. */
  spyNextEventISO?: string;
  spxNextEventISO?: string;
  /** Short verb for each engine's countdown ("opens", "closes",
   *  "RTH closes"). Falls back to "opens" when not supplied. */
  spyEventVerb?: string;
  spxEventVerb?: string;
  className?: string;
}

export function RecommendedAction({
  spyState,
  spxState,
  spyNextEventISO,
  spxNextEventISO,
  spyEventVerb = "opens",
  spxEventVerb = "opens",
  className,
}: Props) {
  const rec = recommendationFor(spyState, spxState);
  const Icon = ICONS[rec.id];
  const showContext = !!(spyNextEventISO || spxNextEventISO);

  return (
    <section
      aria-labelledby="recommended-action-heading"
      data-testid="recommended-action"
      className={cn(
        // v10 P1-3 + P1-8: tier-1 surface (warm cream + ochre
        // border). Padding bumped by ~25% over v5 so the hero
        // reads as the page anchor rather than a banner.
        "rounded-card bg-paper-tier1 border border-rule-tier1",
        "shadow-[inset_0_2px_0_rgba(255,255,255,0.40),0_1px_0_rgba(20,22,26,0.03)]",
        "px-6 py-5 md:px-7 md:py-6",
        "flex items-center justify-between gap-4 flex-wrap",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {/* v5 #7: section eyebrow uses the tracked-caps utility
            consistently across the slate. */}
        <p
          id="recommended-action-heading"
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-2 font-semibold"
        >
          Recommended next step
        </p>
        <p className="text-body text-ink leading-snug max-w-2xl mt-1.5 font-medium">
          {rec.description}
        </p>
        {showContext && (
          // v10 P1-8: replaces the v5 "· both engines pre-config"
          // reason chip. Live countdowns to each engine's next
          // significant event in muted text. Pure text — no chip
          // styling, no clickable affordance.
          <p
            data-testid="recommended-action-context"
            className="text-meta text-ink-3 mt-1.5 font-mono tabular-nums"
          >
            {spyNextEventISO && (
              <>
                <span className="font-semibold text-ink-2">SPY</span>{" "}
                {spyEventVerb}{" "}
                <Countdown to={spyNextEventISO} verb="in" />
              </>
            )}
            {spyNextEventISO && spxNextEventISO && (
              <span className="mx-2 text-ink-4" aria-hidden>
                ·
              </span>
            )}
            {spxNextEventISO && (
              <>
                <span className="font-semibold text-violet">ES</span>{" "}
                {spxEventVerb}{" "}
                <Countdown to={spxNextEventISO} verb="in" />
              </>
            )}
          </p>
        )}
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
