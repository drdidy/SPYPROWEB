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
        <div className="pointer-events-none absolute left-1/2 top-[45%] h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 opacity-[0.18]">
          <CompassBackdrop />
        </div>

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
    <div className="relative mx-auto grid aspect-square max-w-[380px] place-items-center lg:col-span-4">
      <div className="absolute inset-0 rounded-full border border-gold/18 bg-[radial-gradient(circle,rgba(184,130,31,0.12),transparent_58%)]" />
      <div className="absolute inset-[8%] rounded-full border border-gold/25" />
      <div className="absolute inset-[20%] rounded-full border border-dashed border-gold/30" />
      <div className="absolute inset-[32%] rounded-full border border-gold/18" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-gold/28 to-transparent" />
      <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-gradient-to-r from-transparent via-gold/28 to-transparent" />
      <div className="absolute inset-[14%] rotate-45 rounded-full border border-gold/10" />

      <div className="absolute left-4 top-1/2 -translate-y-1/2 rounded-[8px] border border-paper/10 bg-[#061017]/80 px-4 py-3 text-left shadow-[0_24px_50px_-36px_rgba(244,228,192,0.5)] backdrop-blur">
        <div className="font-serif text-[34px] leading-none text-paper">SPY</div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-gold-soft/60">
          Anchor
        </div>
      </div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded-[8px] border border-paper/10 bg-[#061017]/80 px-4 py-3 text-right shadow-[0_24px_50px_-36px_rgba(244,228,192,0.5)] backdrop-blur">
        <div className="font-serif text-[34px] leading-none text-paper">ES</div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-gold-soft/60">
          Channel
        </div>
      </div>

      <div className="relative grid h-32 w-32 place-items-center rounded-full border border-gold/40 bg-[#07141C] shadow-[0_0_90px_rgba(184,130,31,0.22),inset_0_1px_0_rgba(244,228,192,0.08)]">
        <CompassGlyph />
        <div className="absolute -bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-gold-soft/65">
          <span className="h-px w-7 bg-gold/35" />
          <span>Slate</span>
          <span className="h-px w-7 bg-gold/35" />
        </div>
      </div>
    </div>
  );
}

function CompassBackdrop() {
  return (
    <svg viewBox="0 0 760 760" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="surfaces-compass-glow" cx="50%" cy="50%" r="48%">
          <stop offset="0%" stopColor="#B8821F" stopOpacity="0.45" />
          <stop offset="58%" stopColor="#B8821F" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#B8821F" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="380" cy="380" r="350" fill="url(#surfaces-compass-glow)" />
      {[330, 260, 195, 124].map((r) => (
        <circle
          key={r}
          cx="380"
          cy="380"
          r={r}
          fill="none"
          stroke="#D7B764"
          strokeWidth={r === 260 ? 1.4 : 0.8}
          strokeDasharray={r === 195 ? "5 10" : undefined}
        />
      ))}
      {Array.from({ length: 48 }, (_, i) => {
        const a = (i * Math.PI) / 24 - Math.PI / 2;
        const major = i % 6 === 0;
        const inner = major ? 300 : 318;
        const outer = 338;
        return (
          <line
            key={i}
            x1={380 + Math.cos(a) * inner}
            y1={380 + Math.sin(a) * inner}
            x2={380 + Math.cos(a) * outer}
            y2={380 + Math.sin(a) * outer}
            stroke="#D7B764"
            strokeWidth={major ? 1.4 : 0.65}
          />
        );
      })}
      <path
        d="M380 92 428 332 668 380 428 428 380 668 332 428 92 380 332 332Z"
        fill="none"
        stroke="#D7B764"
        strokeWidth="1"
      />
      <line x1="380" x2="380" y1="32" y2="728" stroke="#D7B764" strokeWidth="0.7" />
      <line x1="32" x2="728" y1="380" y2="380" stroke="#D7B764" strokeWidth="0.7" />
    </svg>
  );
}

function CompassGlyph() {
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden>
      <defs>
        <linearGradient id="surfaces-compass-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4E4C0" />
          <stop offset="55%" stopColor="#B8821F" />
          <stop offset="100%" stopColor="#6E4C0E" />
        </linearGradient>
        <linearGradient id="surfaces-compass-green" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#0B4F3A" />
          <stop offset="100%" stopColor="#16A06A" />
        </linearGradient>
      </defs>
      <circle cx="46" cy="46" r="38" fill="none" stroke="#F4E4C0" strokeOpacity="0.34" />
      <circle cx="46" cy="46" r="24" fill="none" stroke="#F4E4C0" strokeDasharray="3 6" strokeOpacity="0.34" />
      <path
        d="M46 8 55 37 84 46 55 55 46 84 37 55 8 46 37 37Z"
        fill="none"
        stroke="url(#surfaces-compass-gold)"
        strokeWidth="1.35"
      />
      <path d="M24 59 44 44 70 24 52 52Z" fill="url(#surfaces-compass-green)" opacity="0.9" />
      <path d="M21 32 45 45 72 60 40 51Z" fill="url(#surfaces-compass-gold)" opacity="0.88" />
      <circle cx="46" cy="46" r="6" fill="#061017" stroke="#F4E4C0" strokeOpacity="0.6" />
      <circle cx="46" cy="46" r="3" fill="#B8821F" />
    </svg>
  );
}
