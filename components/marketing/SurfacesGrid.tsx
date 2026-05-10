"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Columns3,
  FileText,
  LineChart,
  Target,
} from "lucide-react";
import { track } from "@/lib/analytics";

const engineColumns = [
  {
    title: "SPY",
    kicker: "Premarket anchor engine",
    href: "/spy",
    copy: "Anchors from the morning tape build the rails. Triggers require a touch, rejection, close, and next-bar confirmation.",
    bullets: [
      "Anchor lines: upper, main, lower",
      "Entry: next bar open after confirmation",
      "Target: nearest structural line",
      "Stop: outside the rejection wick",
    ],
  },
  {
    title: "ES",
    kicker: "Overnight channel engine",
    href: "/es",
    copy: "Sydney and Tokyo build the overnight channel. Scenario, play, invalidation, and re-entry all come from that structure.",
    bullets: [
      "Channel from overnight structure",
      "Scenarios: above, inside, below, outside",
      "Plays define exit and invalidation",
      "Re-entry requires a real retest",
    ],
  },
];

const surfaces = [
  { title: "Decision Slate", href: "/dashboard", icon: LineChart },
  { title: "SPY Engine", href: "/spy", icon: Activity },
  { title: "ES Engine", href: "/es", icon: Columns3 },
  { title: "Foresight", href: "/foresight", icon: CalendarDays },
  { title: "Options Cockpit", href: "/options", icon: Target },
  { title: "Daily Brief", href: "/brief", icon: FileText },
];

export function SurfacesGrid() {
  return (
    <section id="surfaces" className="scroll-mt-[88px] bg-[#061017] text-paper">
      <div className="relative overflow-hidden border-y border-gold/45">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(244,228,192,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(244,228,192,0.12) 1px, transparent 1px)",
            backgroundSize: "70px 70px",
          }}
        />
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/15" />
        <div className="absolute left-1/2 top-1/2 h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/20" />

        <div className="relative mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-soft">
              Two independent engines. One workspace.
            </div>
            <h2 className="mt-4 font-serif text-display tracking-tight text-paper">
              SPY and ES stay separate until the slate asks for a decision.
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <EngineColumn {...engineColumns[0]} />
            <div className="lg:col-span-4">
              <CompassHub />
            </div>
            <EngineColumn {...engineColumns[1]} alignRight />
          </div>

          <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-paper/10 bg-paper/10 md:grid-cols-3 lg:grid-cols-6">
            {surfaces.map((surface) => {
              const Icon = surface.icon;
              return (
                <Link
                  key={surface.href}
                  href={surface.href}
                  onClick={() =>
                    track({ name: "surface_card_click", surface: surface.title })
                  }
                  className="group bg-[#07141C] p-5 transition-colors hover:bg-[#0B1C25]"
                >
                  <Icon
                    size={18}
                    className="mb-4 text-gold-soft transition-transform group-hover:-translate-y-0.5"
                  />
                  <div className="font-serif text-[18px] leading-tight text-paper">
                    {surface.title}
                  </div>
                  <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/42 group-hover:text-gold-soft">
                    Open <ArrowRight size={12} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function EngineColumn({
  title,
  kicker,
  copy,
  bullets,
  href,
  alignRight = false,
}: {
  title: string;
  kicker: string;
  copy: string;
  bullets: string[];
  href: string;
  alignRight?: boolean;
}) {
  return (
    <article className="lg:col-span-4">
      <div className={alignRight ? "lg:text-right" : undefined}>
        <div className="font-serif text-[36px] leading-none text-gold-soft">
          {title}
        </div>
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-gold-soft/70">
          {kicker}
        </div>
        <p className="mt-5 text-[14px] leading-relaxed text-paper/64">{copy}</p>
      </div>
      <ul className="mt-7 space-y-3">
        {bullets.map((bullet) => (
          <li
            key={bullet}
            className={`flex items-start gap-3 text-[13px] text-paper/78 ${
              alignRight ? "lg:flex-row-reverse lg:text-right" : ""
            }`}
          >
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-gold-soft/65 text-gold-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-soft" />
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-8 inline-flex items-center gap-2 rounded-[6px] border border-gold/70 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-gold-soft transition-colors hover:bg-gold hover:text-[#061017] ${
          alignRight ? "lg:float-right" : ""
        }`}
      >
        Explore {title} engine <ArrowRight size={13} />
      </Link>
    </article>
  );
}

function CompassHub() {
  return (
    <div className="relative mx-auto grid aspect-square max-w-[360px] place-items-center lg:col-span-4">
      <div className="absolute inset-0 rounded-full border border-gold/15" />
      <div className="absolute inset-[12%] rounded-full border border-gold/20" />
      <div className="absolute inset-[25%] rounded-full border border-dashed border-gold/25" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gold/20" />
      <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-gold/20" />
      <div className="relative grid h-28 w-28 place-items-center rounded-full border border-gold/35 bg-[#07141C] shadow-[0_0_80px_rgba(184,130,31,0.16)]">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden>
          <path
            d="M42 5 51 33 79 42 51 51 42 79 33 51 5 42 33 33 42 5Z"
            fill="none"
            stroke="#F4E4C0"
            strokeWidth="1.2"
          />
          <circle cx="42" cy="42" r="5" fill="#B8821F" />
        </svg>
      </div>
      <div className="absolute left-8 top-1/2 -translate-y-1/2 font-serif text-[32px] text-paper">
        SPY
      </div>
      <div className="absolute right-12 top-1/2 -translate-y-1/2 font-serif text-[32px] text-paper">
        ES
      </div>
    </div>
  );
}
