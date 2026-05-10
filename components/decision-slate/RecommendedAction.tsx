// State-aware command module for Decision Slate. This is the page's
// visual anchor: a compact trading-desk panel with the current action,
// structure rails, and countdowns in one glance.

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Rewind,
  Activity,
  Target,
  CalendarClock,
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

const COMMAND_COPY: Record<Recommendation["id"], { title: string; posture: string }> = {
  "live-spy": { title: "Track SPY Structure", posture: "LIVE ENGINE" },
  "live-spx": { title: "Track ES Structure", posture: "LIVE ENGINE" },
  "options-cockpit": { title: "Stage Execution", posture: "ORDER WINDOW" },
  "log-replay": { title: "Review The Tape", posture: "SESSION CLOSED" },
  "daily-brief": { title: "Stand Aside", posture: "AWAIT STRUCTURE" },
};

interface Props {
  spyState: EngineState;
  spxState: EngineState;
  spyNextEventISO?: string;
  spxNextEventISO?: string;
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
  const command = COMMAND_COPY[rec.id];
  const showContext = !!(spyNextEventISO || spxNextEventISO);

  return (
    <section
      aria-labelledby="recommended-action-heading"
      data-testid="recommended-action"
      className={cn(
        "relative overflow-hidden rounded-card border border-[#C9A227]/70 bg-[#071116] text-paper",
        "shadow-[0_18px_45px_-28px_rgba(20,22,26,0.75),inset_0_1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(201,162,39,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,39,0.10) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative grid lg:grid-cols-[1.05fr_1.2fr_220px]">
        <div className="px-6 py-6 md:px-7 md:py-7">
          <p
            id="recommended-action-heading"
            className="font-mono text-[10px] tracking-[0.20em] uppercase text-gold-soft font-semibold"
          >
            Recommended next step
          </p>
          <h2 className="mt-2 font-serif text-[42px] leading-none text-paper md:text-[48px]">
            {command.title}
          </h2>
          <p className="mt-2 font-mono text-[11px] tracking-[0.12em] uppercase text-paper/70">
            {rec.reason} <span className="text-gold">·</span>{" "}
            <span className="text-gold-soft">{command.posture}</span>
          </p>
          <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-paper/78">
            {rec.description}
          </p>
          <Link
            href={rec.href}
            data-recommendation-id={rec.id}
            className={cn(
              "mt-6 inline-flex h-10 items-center gap-2 rounded-pill px-4",
              "bg-paper text-ink transition-colors hover:bg-gold-soft",
              "font-mono text-[12px] tracking-[0.06em] font-semibold",
              "outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071116]",
            )}
          >
            <Icon size={14} aria-hidden />
            {rec.label}
            <ArrowRight size={12} className="opacity-70" aria-hidden />
          </Link>
        </div>

        <CommandRailDiagram />

        <aside className="border-t border-paper/10 px-6 py-5 lg:border-l lg:border-t-0 lg:px-5 lg:py-7">
          <div className="flex items-center gap-2 text-gold-soft">
            <CalendarClock size={15} aria-hidden />
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase font-semibold">
              Next event
            </span>
          </div>
          {showContext && (
            <div
              data-testid="recommended-action-context"
              className="mt-4 space-y-4 font-mono text-meta tabular-nums text-paper/78"
            >
              {spyNextEventISO && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-paper/45">
                    SPY {spyEventVerb}
                  </div>
                  <div className="mt-1 text-paper">
                    <Countdown to={spyNextEventISO} verb="in" />
                  </div>
                </div>
              )}
              {spxNextEventISO && (
                <div className="border-t border-paper/10 pt-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-paper/45">
                    ES {spxEventVerb}
                  </div>
                  <div className="mt-1 text-paper">
                    <Countdown to={spxNextEventISO} verb="in" />
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function CommandRailDiagram() {
  const candles = [34, 38, 31, 44, 40, 36, 48, 42, 46, 39, 50, 45, 52, 47];
  return (
    <div className="hidden min-h-[238px] border-t border-paper/10 px-4 py-7 lg:block lg:border-t-0">
      <div className="relative h-full min-h-[190px]">
        <div className="absolute inset-x-0 top-[22%] border-t border-dashed border-paper/25" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gold/70" />
        <div className="absolute inset-x-0 top-[78%] border-t border-dashed border-paper/25" />
        <div className="absolute left-0 top-[18%] font-mono text-[10px] text-paper/50">
          Upper rail
        </div>
        <div className="absolute left-0 top-[46%] font-mono text-[10px] text-gold-soft">
          Anchor
        </div>
        <div className="absolute left-0 top-[74%] font-mono text-[10px] text-paper/50">
          Lower rail
        </div>
        <div className="absolute left-[22%] right-[19%] top-[36%] flex h-[70px] items-end gap-2">
          {candles.map((height, i) => (
            <span
              key={i}
              className="relative flex w-2 items-center justify-center"
              style={{ height }}
            >
              <span className="absolute h-full w-px bg-paper/45" />
              <span
                className={cn(
                  "h-5 w-1.5 rounded-[1px] border",
                  i % 3 === 0
                    ? "border-bear bg-bear/85"
                    : "border-paper/60 bg-paper/80",
                )}
              />
            </span>
          ))}
        </div>
        <div className="absolute right-[5%] top-[24%] h-[50px] w-[28%] rotate-[-8deg] border-t-2 border-dashed border-bull" />
        <div className="absolute right-[5%] top-[61%] h-[50px] w-[28%] rotate-[8deg] border-t-2 border-dashed border-bear" />
      </div>
    </div>
  );
}
