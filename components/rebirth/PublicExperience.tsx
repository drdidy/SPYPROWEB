"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AppFooter } from "@/components/layout/AppFooter";

const sequence = [
  {
    number: "01",
    label: "Field",
    title: "Market geometry before market opinion.",
    body: "SPY rails and ES control shelves define the corridor, the nearest decision, and the room available before an entry is considered.",
    diagram: "field" as const,
  },
  {
    number: "02",
    label: "Proof",
    title: "The setup must earn permission.",
    body: "Price structure, the 1-minute engine, higher-timeframe context, and target room must align. A level alone is never a trade.",
    diagram: "proof" as const,
  },
  {
    number: "03",
    label: "Risk",
    title: "Every decision arrives complete.",
    body: "Entry, invalidation, target, SPXW execution context, and the next phone alert are delivered as one defined-risk package.",
    diagram: "risk" as const,
  },
];

const qualification = [
  ["01", "Source", "Market data is verified"],
  ["02", "Structure", "SPY and ES context agree"],
  ["03", "Risk", "Entry, stop, and target exist"],
  ["04", "Execution", "The live contract is confirmed"],
];

const alerts = [
  {
    stage: "Watch",
    tone: "cobalt" as const,
    body: "Price is approaching a mapped decision. Nothing to do yet — attention only.",
  },
  {
    stage: "Get ready",
    tone: "optic" as const,
    body: "The structure is armed. The engine is waiting on the confirmation close.",
  },
  {
    stage: "Enter",
    tone: "lime" as const,
    body: "Confirmation complete. Entry, stop, target, and the live SPXW contract are attached.",
  },
  {
    stage: "Exit",
    tone: "coral" as const,
    body: "Target or invalidation reached. The trade loop closes and the review begins.",
  },
];

const principles = [
  "Context before entry",
  "Proof before action",
  "Defined risk before execution",
  "Waiting is a position",
  "Review every decision",
];

export function PublicExperience() {
  const heroRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.02, 1.18]);
  const imageX = useTransform(scrollYProgress, [0, 1], ["0%", "-2.5%"]);

  return (
    <div className="overflow-hidden bg-optic text-carbon">
      {/* ============================== HERO ============================== */}
      <section
        ref={heroRef}
        className="relative flex min-h-[94svh] flex-col overflow-hidden bg-carbon text-white"
      >
        <motion.div
          className="absolute -inset-[3%]"
          style={reducedMotion ? undefined : { scale: imageScale, x: imageX }}
        >
          <Image
            src="/images/prophet-observatory-v1.png"
            alt="A market observatory: an operator studying a wall-sized market structure display"
            fill
            priority
            className="object-cover object-[68%_center]"
            sizes="100vw"
          />
        </motion.div>
        <div className="absolute inset-0 bg-carbon/45" />
        <div className="absolute inset-y-0 left-0 w-full bg-carbon/70 md:w-[62%] xl:w-[52%]" />
        <HeroHud />

        <header className="relative z-20 flex h-[72px] shrink-0 items-center border-b border-white/20 px-5 md:px-9">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="SPY Prophet home"
          >
            <span className="grid h-10 w-10 place-items-center bg-lime text-[18px] font-black text-carbon">
              P
            </span>
            <span>
              <span className="block text-[14px] font-black uppercase tracking-[0.06em]">
                SPY Prophet
              </span>
              <span className="microlabel mt-1 block text-white/60">
                Decision system
              </span>
            </span>
          </Link>
          <nav
            className="ml-auto hidden items-center gap-7 md:flex"
            aria-label="Public navigation"
          >
            {[
              ["#system", "System"],
              ["#qualification", "Qualification"],
              ["#alerts", "Alerts"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="microlabel text-white/70 transition-colors hover:text-lime"
              >
                {label}
              </a>
            ))}
            <Link
              href="/replay"
              className="microlabel text-white/70 transition-colors hover:text-lime"
            >
              Replay
            </Link>
          </nav>
          <Link
            href="/dashboard"
            className="ml-6 inline-flex h-10 items-center gap-3 bg-white px-4 text-[11px] font-black uppercase tracking-[0.08em] text-carbon transition-colors hover:bg-lime"
          >
            Open console <ArrowUpRight size={14} />
          </Link>
        </header>

        <div className="relative z-10 flex flex-1 flex-col justify-between px-5 pb-8 pt-8 md:px-9 md:pb-10">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-2.5">
              <span
                className="h-2 w-2 animate-blink bg-lime"
                aria-hidden="true"
              />
              <span className="microlabel text-lime">Chicago desk time</span>
            </span>
            <HeroClock />
          </div>

          <div className="max-w-[980px] py-10">
            <motion.p
              initial={reducedMotion ? false : { y: 18 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="microlabel text-lime"
            >
              A decision instrument for SPY, ES, and SPXW
            </motion.p>
            <h1 className="mt-6 max-w-[900px] text-[13.5vw] font-black leading-[0.9] tracking-[-0.015em] sm:text-[50px] md:text-[76px] xl:text-[102px]">
              <HeadlineLine delay={0.16} reduced={reducedMotion}>
                See the field.
              </HeadlineLine>
              <HeadlineLine delay={0.28} reduced={reducedMotion}>
                Wait for proof.
              </HeadlineLine>
              <HeadlineLine delay={0.4} reduced={reducedMotion}>
                <span className="text-lime">Act with precision.</span>
              </HeadlineLine>
            </h1>
            <motion.p
              initial={reducedMotion ? false : { y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-7 max-w-[660px] text-[16px] leading-relaxed text-white/80 md:text-[19px]"
            >
              SPY Prophet maps the market, waits for confirmation, and delivers
              the entry, invalidation, target, and live execution context as one
              decision.
            </motion.p>
            <motion.div
              initial={reducedMotion ? false : { y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="mt-9 flex flex-wrap gap-3"
            >
              <Link
                href="/dashboard"
                className="group inline-flex h-[54px] items-center gap-4 bg-lime px-6 text-[11px] font-black uppercase tracking-[0.08em] text-carbon transition-colors hover:bg-white"
              >
                Enter today&apos;s console
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
              <Link
                href="/map"
                className="inline-flex h-[54px] items-center gap-4 border border-white/50 px-6 text-[11px] font-black uppercase tracking-[0.08em] text-white transition-colors hover:bg-white hover:text-carbon"
              >
                Inspect market geometry <ArrowUpRight size={15} />
              </Link>
            </motion.div>
          </div>

          <div className="grid border-y border-white/25 sm:grid-cols-2 md:grid-cols-4">
            <HeroMetric
              index="01"
              label="Operating model"
              value="Field / Proof / Risk"
            />
            <HeroMetric index="02" label="Lead market" value="ES context" />
            <HeroMetric index="03" label="Execution" value="SPXW 0DTE" />
            <HeroMetric
              index="04"
              label="Review"
              value="Bar-by-bar replay"
            />
          </div>
        </div>

        <a
          href="#system"
          aria-label="Scroll to the operating system"
          className="absolute bottom-0 right-0 z-20 hidden h-20 w-20 place-items-center border-l border-t border-white/25 bg-carbon/40 text-white transition-colors hover:bg-lime hover:text-carbon md:grid"
        >
          <ArrowDown size={18} />
        </a>
      </section>

      {/* ======================= PRINCIPLE MARQUEE ======================== */}
      <div
        className="flex overflow-hidden border-b border-carbon bg-carbon py-3"
        aria-label="Operating principles"
      >
        <div className="flex shrink-0 animate-ticker items-center">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="flex shrink-0 items-center"
              aria-hidden={copy === 1}
            >
              {principles.map((principle) => (
                <span
                  key={`${copy}-${principle}`}
                  className="flex items-center"
                >
                  <span className="microlabel whitespace-nowrap px-6 text-lime">
                    {principle}
                  </span>
                  <span className="h-1.5 w-1.5 bg-white/40" aria-hidden="true" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ===================== 01 / OPERATING THESIS ====================== */}
      <section id="system" className="border-b border-carbon">
        <div className="grid min-h-[760px] lg:grid-cols-[0.42fr_0.58fr]">
          <div className="flex flex-col justify-between border-b border-carbon p-5 py-12 md:p-10 lg:border-b-0 lg:border-r">
            <Reveal>
              <p className="microlabel text-cobalt">01 / Operating thesis</p>
              <h2 className="mt-8 max-w-[610px] text-[42px] font-black leading-[0.94] tracking-[-0.01em] md:text-[62px] xl:text-[78px]">
                The chart shows price.
                <br />
                <span className="text-cobalt">
                  The field shows consequence.
                </span>
              </h2>
              <p className="mt-8 max-w-[480px] text-[15px] leading-relaxed text-carbon/65">
                Every session begins with geometry: where the corridor sits,
                which shelf controls it, and how much room exists before the
                next decision. Opinion never draws the map.
              </p>
            </Reveal>
            <div className="mt-16 grid border-t border-carbon sm:grid-cols-3">
              <ModelRead label="SPY" value="Intraday rails" />
              <ModelRead label="ES" value="Control shelves" />
              <ModelRead label="SPXW" value="Execution context" />
            </div>
          </div>
          <StructureField reducedMotion={Boolean(reducedMotion)} />
        </div>
      </section>

      {/* ===================== 03 / QUALIFICATION ========================= */}
      <section
        id="qualification"
        className="grid border-y border-carbon lg:grid-cols-[0.52fr_0.48fr]"
      >
        <div className="bg-lime p-5 py-14 md:p-10 lg:p-14">
          <Reveal>
            <p className="microlabel">03 / Qualification engine</p>
            <h2 className="mt-8 max-w-[760px] text-[42px] font-black leading-[0.92] tracking-[-0.01em] md:text-[62px] xl:text-[78px]">
              The system is designed to say no.
            </h2>
            <p className="mt-7 max-w-[560px] text-[15px] leading-relaxed text-carbon/70">
              Most market moments are not trades. Prophet protects attention
              until every required fact exists — and it shows you exactly which
              fact is missing.
            </p>
          </Reveal>
        </div>
        <div className="bg-carbon p-5 py-14 text-white md:p-10 lg:p-14">
          <div className="flex items-center justify-between gap-4 border-b border-white/30 pb-5">
            <p className="microlabel text-lime">Qualification sequence</p>
            <span className="microlabel text-white/60">Illustrative logic</span>
          </div>
          <ol>
            {qualification.map(([number, label, detail], index) => (
              <motion.li
                key={number}
                initial={reducedMotion ? false : { x: 24 }}
                whileInView={{ x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: index * 0.1, duration: 0.55 }}
                className="grid grid-cols-[44px_112px_1fr] items-center border-b border-white/25 py-6"
              >
                <span className="font-mono text-[11px] font-bold text-lime">
                  {number}
                </span>
                <span className="microlabel text-white/65">{label}</span>
                <span className="text-[15px] font-bold">{detail}</span>
              </motion.li>
            ))}
          </ol>
          <div className="mt-10 flex items-center gap-4 border border-white/35 p-4">
            <span className="h-3 w-3 shrink-0 bg-coral" aria-hidden="true" />
            <p className="microlabel leading-[1.6] text-white/75">
              Missing proof changes the command to wait
            </p>
          </div>
        </div>
      </section>

      {/* ===================== 04 / ALERT SEQUENCE ======================== */}
      <section id="alerts" className="border-b border-carbon bg-carbon text-white">
        <div className="mx-auto grid max-w-[1500px] gap-10 px-5 py-20 md:px-9 md:py-28 lg:grid-cols-[0.46fr_0.54fr] lg:gap-16">
          <div className="flex flex-col justify-between">
            <Reveal>
              <p className="microlabel text-lime">04 / Alert sequence</p>
              <h2 className="mt-8 max-w-[560px] text-[42px] font-black leading-[0.92] tracking-[-0.01em] md:text-[62px] xl:text-[74px]">
                Every alert advances the decision.
              </h2>
              <p className="mt-7 max-w-[480px] text-[15px] leading-relaxed text-white/65">
                Four Telegram alerts, always in order. Each one tells you what
                is true and what to do about it — never a prediction, never a
                price without its risk.
              </p>
            </Reveal>
            <div className="mt-12 grid border-t border-white/25 sm:grid-cols-2">
              <div className="border-b border-white/15 py-5 sm:border-b-0 sm:border-r sm:pr-6">
                <p className="microlabel text-white/60">Delivery</p>
                <p className="mt-2 text-[14px] font-bold">
                  Telegram, in sequence
                </p>
              </div>
              <div className="py-5 sm:pl-6">
                <p className="microlabel text-white/60">Rule</p>
                <p className="mt-2 text-[14px] font-bold">
                  No alert without defined risk
                </p>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between border-b border-white/25 pb-4">
              <p className="microlabel text-white/65">Alert sequence</p>
              <p className="microlabel text-white/60">
                Illustrative / no market values
              </p>
            </div>
            <ol>
              {alerts.map((alert, index) => (
                <AlertCard
                  key={alert.stage}
                  alert={alert}
                  index={index}
                  reduced={Boolean(reducedMotion)}
                />
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ===================== 05 / REPLAY PROOF ========================== */}
      <section className="border-b border-carbon px-5 py-20 md:px-9 md:py-28">
        <div className="mx-auto max-w-[1500px]">
          <Reveal className="grid gap-8 lg:grid-cols-[0.56fr_0.44fr] lg:items-end">
            <div>
              <p className="microlabel text-cobalt">05 / Review discipline</p>
              <h2 className="mt-7 max-w-[820px] text-[40px] font-black leading-[0.94] tracking-[-0.01em] md:text-[58px] xl:text-[72px]">
                Every decision is preserved.
              </h2>
            </div>
            <p className="max-w-[440px] text-[15px] leading-relaxed text-carbon/65 lg:justify-self-end">
              Replay walks any completed session bar by bar — what the field
              showed, what the engine demanded, and what you did about it.
            </p>
          </Reveal>
          <div className="mt-14 grid border border-carbon sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Session", "The full day, bar by bar", "session"],
                ["Decision", "Where proof was demanded", "decision"],
                ["Outcome", "Entry, stop, or no trade", "outcome"],
                ["Lesson", "What the next day inherits", "lesson"],
              ] as const
            ).map(([label, caption, kind], index) => (
              <ReplayFrame
                key={label}
                index={index}
                label={label}
                caption={caption}
                kind={kind}
                reduced={Boolean(reducedMotion)}
              />
            ))}
          </div>
          <Reveal className="mt-10">
            <Link
              href="/replay"
              className="group inline-flex h-[52px] items-center gap-4 bg-carbon px-6 text-[11px] font-black uppercase tracking-[0.08em] text-white transition-colors hover:bg-cobalt"
            >
              Open the replay lab
              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ========================== FINAL CTA ============================= */}
      <section className="bg-cobalt px-5 py-20 text-white md:px-9 md:py-28">
        <div className="mx-auto max-w-[1500px]">
          <Reveal className="grid gap-10 lg:grid-cols-[0.62fr_0.38fr] lg:items-end">
            <div>
              <p className="microlabel text-white">
                06 / The operator&apos;s advantage
              </p>
              <h2 className="mt-7 max-w-[980px] text-[42px] font-black leading-[0.92] tracking-[-0.01em] md:text-[62px] xl:text-[84px]">
                You do not need another prediction. You need a condition you
                can verify.
              </h2>
            </div>
            <div className="border-t border-white/35 pt-6">
              <p className="text-[15px] leading-relaxed text-white">
                Map the consequence. Wait for permission. Define the risk.
                Preserve the decision in Replay.
              </p>
              <Link
                href="/dashboard"
                className="group mt-8 inline-flex h-14 items-center gap-4 bg-white px-6 text-[11px] font-black uppercase tracking-[0.08em] text-carbon transition-colors hover:bg-lime"
              >
                Open the instrument
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <AppFooter />
    </div>
  );
}

/* ------------------------------ HERO PARTS ------------------------------ */

function HeadlineLine({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay: number;
  reduced?: boolean | null;
}) {
  return (
    <span className="block overflow-hidden pb-[0.06em]">
      <span
        className="headline-rise block"
        style={{ animationDelay: `${delay}s` }}
      >
        {children}
      </span>
    </span>
  );
}

function HeroClock() {
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Chicago",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="num text-[11px] font-bold text-white/70">
      {clock ? `${clock} CT` : "— CT"}
    </span>
  );
}

function HeroHud() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] hidden md:block"
      aria-hidden="true"
    >
      {/* frame ticks */}
      <span className="absolute left-[38%] top-[72px] h-4 w-px bg-white/30" />
      <span className="absolute left-[62%] top-[72px] h-4 w-px bg-white/30" />
      <span className="absolute bottom-[132px] left-[38%] h-4 w-px bg-white/30" />
      <span className="absolute bottom-[132px] left-[62%] h-4 w-px bg-white/30" />
      {/* structure reticle */}
      <div className="absolute right-[24%] top-[27%] h-56 w-56 border border-white/25">
        <span className="absolute -left-9 top-1/2 h-px w-16 bg-lime/60" />
        <span className="absolute -top-9 left-1/2 h-16 w-px bg-lime/60" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 bg-lime" />
        <span className="microlabel absolute right-2.5 top-2.5 text-[10px] text-white/65">
          Structure field
        </span>
        <span className="microlabel absolute bottom-2.5 left-2.5 text-[10px] text-white/60">
          ES / SPX lead
        </span>
      </div>
      {/* right edge vertical label */}
      <p className="microlabel absolute right-6 top-1/2 hidden origin-right -translate-y-1/2 rotate-90 whitespace-nowrap text-white/60 xl:block">
        SPY / ES / SPXW — market decision instrument
      </p>
    </div>
  );
}

function HeroMetric({
  index,
  label,
  value,
}: {
  index: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-white/20 py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:px-5 sm:first:border-l-0 sm:first:pl-0 md:[&:nth-child(2)]:border-b-0">
      <div className="flex items-center justify-between">
        <p className="microlabel text-white/60">{label}</p>
        <span className="font-mono text-[10px] font-bold text-lime/70">
          {index}
        </span>
      </div>
      <p className="mt-2.5 text-[14px] font-bold">{value}</p>
    </div>
  );
}

/* --------------------------- STRUCTURE FIELD ---------------------------- */

function StructureField({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="hud-grid relative min-h-[620px] overflow-hidden bg-carbon text-white">
      {/* scan sweep */}
      {!reducedMotion && (
        <span
          className="absolute inset-y-0 left-0 w-[9%] animate-scanline bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
          aria-hidden="true"
        />
      )}

      {/* corridor shading between the two control shelves */}
      <div
        className="absolute -left-[14%] -right-[14%] top-[190px] h-[210px] origin-center bg-lime/[0.05]"
        style={{ transform: "rotate(3.5deg)" }}
        aria-hidden="true"
      />

      {/* diagonal shelves */}
      {[0, 1, 2, 3, 4].map((line) => (
        <motion.div
          key={line}
          className="absolute -left-[14%] -right-[14%] h-px origin-center"
          style={{
            top: 110 + line * 100,
            rotate: 3.5,
            background:
              line === 2 ? "#B8F23D" : "rgba(255,255,255,0.30)",
          }}
          animate={reducedMotion ? undefined : { x: [0, 16, 0] }}
          transition={{
            duration: 8 + line,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <span
            className={`microlabel absolute left-[24%] -top-[18px] bg-carbon px-2 py-1 ${
              line === 2 ? "text-lime" : "text-white/60"
            }`}
          >
            {line === 2 ? "Control shelf / primary" : `Shelf ${line + 1}`}
          </span>
        </motion.div>
      ))}

      {/* horizontal intraday rail */}
      <div
        className="absolute -left-[5%] -right-[5%] top-[64%] h-px bg-cobalt"
        aria-hidden="true"
      >
        <span className="microlabel absolute right-[12%] -top-[18px] bg-carbon px-2 py-1 text-white/60">
          Intraday rail
        </span>
      </div>

      {/* room-to-target bracket */}
      <div
        className="absolute left-[58%] top-[38%] flex h-[26%] flex-col items-center"
        aria-hidden="true"
      >
        <span className="h-px w-4 bg-white/60" />
        <span className="w-px flex-1 bg-white/60" />
        <span className="h-px w-4 bg-white/60" />
        <span className="microlabel absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-white/60">
          Room / measured before entry
        </span>
      </div>

      {/* price marker */}
      <motion.div
        className="absolute left-[58%] top-[64%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 bg-coral"
        animate={
          reducedMotion
            ? undefined
            : { scale: [1, 1.6, 1], opacity: [1, 0.7, 1] }
        }
        transition={{ duration: 2.1, repeat: Infinity }}
      />

      <div className="microlabel absolute left-5 top-5 border border-white/30 bg-carbon px-3 py-2 text-lime md:left-8 md:top-8">
        Illustrative structure model / no market values
      </div>

      <div className="absolute right-5 top-[24%] border-l-2 border-coral bg-carbon px-4 py-3 md:right-8">
        <p className="microlabel text-white/60">Current consequence</p>
        <p className="mt-2 text-[15px] font-black uppercase">
          No entry without proof
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 grid border-t border-white/25 sm:grid-cols-3">
        <FieldMetric number="01" label="Locate" value="Nearest decision" />
        <FieldMetric number="02" label="Measure" value="Room to target" />
        <FieldMetric number="03" label="Wait" value="Engine confirmation" />
      </div>
    </div>
  );
}

function FieldMetric({
  number,
  label,
  value,
}: {
  number: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-white/20 bg-carbon/90 p-4 last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0">
      <div className="microlabel flex items-center justify-between text-white/60">
        <span>{number}</span>
        <span>{label}</span>
      </div>
      <p className="mt-3 text-[13px] font-bold">{value}</p>
    </div>
  );
}

function ModelRead({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-carbon/20 py-5 last:border-b-0 sm:border-b-0 sm:border-l sm:px-5 sm:first:border-l-0 sm:first:pl-0">
      <p className="font-mono text-[11px] font-bold text-cobalt">{label}</p>
      <p className="mt-2 text-[13px] font-bold">{value}</p>
    </div>
  );
}

/* --------------------------- SEQUENCE PANELS ---------------------------- */

function SequencePanel({
  item,
  index,
}: {
  item: (typeof sequence)[number];
  index: number;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.article
      initial={reducedMotion ? false : { y: 36 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{
        duration: 0.65,
        delay: index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`flex min-h-[460px] flex-col py-10 lg:px-8 ${index > 0 ? "border-t border-carbon/20 lg:border-l lg:border-t-0" : ""}`}
    >
      <div className="microlabel flex items-center justify-between text-cobalt">
        <span>{item.number}</span>
        <span>{item.label}</span>
      </div>
      <div className="mt-8 flex-1">
        <SequenceDiagram kind={item.diagram} />
      </div>
      <div className="pt-10">
        <h3 className="max-w-[390px] text-[28px] font-black leading-[1.02]">
          {item.title}
        </h3>
        <p className="mt-5 max-w-[390px] text-[14px] leading-relaxed text-carbon/65">
          {item.body}
        </p>
      </div>
    </motion.article>
  );
}

function SequenceDiagram({ kind }: { kind: "field" | "proof" | "risk" }) {
  const stroke = "#0A0B0C";
  return (
    <svg
      viewBox="0 0 320 150"
      className="hud-grid-light h-[150px] w-full border border-carbon/20"
      role="img"
      aria-label={
        kind === "field"
          ? "Diagram: rails and a price marker"
          : kind === "proof"
            ? "Diagram: a confirmation close among one-minute bars"
            : "Diagram: entry, stop, and target bracket"
      }
    >
      {kind === "field" && (
        <>
          <line x1="-10" y1="38" x2="330" y2="52" stroke={stroke} strokeOpacity="0.3" />
          <line x1="-10" y1="72" x2="330" y2="86" stroke="#3157FF" strokeWidth="1.5" />
          <line x1="-10" y1="112" x2="330" y2="126" stroke={stroke} strokeOpacity="0.3" />
          <rect x="196" y="92" width="8" height="8" fill="#FF5B4D" />
          <text x="210" y="99" fontFamily="var(--font-geist-mono)" fontSize="9" fontWeight="700" fill={stroke} opacity="0.6">
            PRICE
          </text>
        </>
      )}
      {kind === "proof" && (
        <>
          {[28, 60, 92, 124, 156, 188, 252, 284].map((x, i) => (
            <g key={x}>
              <line
                x1={x}
                y1={40 + (i % 3) * 8}
                x2={x}
                y2={112 - (i % 4) * 6}
                stroke={stroke}
                strokeOpacity="0.35"
              />
              <rect
                x={x - 4}
                y={58 + (i % 3) * 6}
                width="8"
                height={26 + (i % 2) * 8}
                fill={stroke}
                fillOpacity="0.18"
              />
            </g>
          ))}
          <line x1="220" y1="34" x2="220" y2="118" stroke="#B8F23D" />
          <rect x="216" y="52" width="8" height="42" fill="#B8F23D" />
          <text x="206" y="26" fontFamily="var(--font-geist-mono)" fontSize="9" fontWeight="700" fill={stroke} opacity="0.6">
            CONFIRM
          </text>
        </>
      )}
      {kind === "risk" && (
        <>
          <line x1="40" y1="34" x2="280" y2="34" stroke={stroke} strokeOpacity="0.75" />
          <line x1="40" y1="78" x2="280" y2="78" stroke="#3157FF" strokeWidth="1.5" />
          <line x1="40" y1="122" x2="280" y2="122" stroke="#FF5B4D" strokeWidth="1.5" />
          <line x1="60" y1="34" x2="60" y2="122" stroke={stroke} strokeOpacity="0.3" />
          <text x="288" y="37" fontFamily="var(--font-geist-mono)" fontSize="9" fontWeight="700" fill={stroke} opacity="0.6">
            T
          </text>
          <text x="288" y="81" fontFamily="var(--font-geist-mono)" fontSize="9" fontWeight="700" fill="#3157FF">
            E
          </text>
          <text x="288" y="125" fontFamily="var(--font-geist-mono)" fontSize="9" fontWeight="700" fill="#FF5B4D">
            S
          </text>
        </>
      )}
    </svg>
  );
}

/* ------------------------------ ALERT CARDS ----------------------------- */

function AlertCard({
  alert,
  index,
  reduced,
}: {
  alert: (typeof alerts)[number];
  index: number;
  reduced: boolean;
}) {
  const toneClass =
    alert.tone === "lime"
      ? "bg-lime text-carbon"
      : alert.tone === "coral"
        ? "bg-coral text-carbon"
        : alert.tone === "cobalt"
          ? "bg-cobalt text-white"
          : "bg-white text-carbon";
  return (
    <motion.li
      initial={reduced ? false : { y: 26 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ delay: index * 0.09, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-white/20 py-5"
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] font-bold text-white/60">
          0{index + 1}
        </span>
        <span
          className={`microlabel inline-flex px-2.5 py-1.5 ${toneClass}`}
        >
          {alert.stage}
        </span>
        <span className="num ml-auto text-[11px] text-white/60">--:-- CT</span>
      </div>
      <p className="mt-4 max-w-[560px] pl-8 text-[14px] leading-relaxed text-white/75">
        {alert.body}
      </p>
    </motion.li>
  );
}

/* ------------------------------ REPLAY FRAMES --------------------------- */

function ReplayFrame({
  index,
  label,
  caption,
  kind,
  reduced,
}: {
  index: number;
  label: string;
  caption: string;
  kind: "session" | "decision" | "outcome" | "lesson";
  reduced: boolean;
}) {
  return (
    <motion.article
      initial={reduced ? false : { y: 28 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ delay: index * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-carbon p-5 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"
    >
      <div className="microlabel flex items-center justify-between text-carbon/60">
        <span>0{index + 1}</span>
        <span>{label}</span>
      </div>
      <svg
        viewBox="0 0 260 120"
        className="hud-grid-light mt-4 h-[120px] w-full border border-carbon/15 bg-white"
        aria-hidden="true"
      >
        {kind === "session" && (
          <polyline
            points="0,84 30,78 55,88 85,60 110,66 140,44 170,52 200,38 230,46 260,30"
            fill="none"
            stroke="#0A0B0C"
            strokeOpacity="0.7"
            strokeWidth="2"
          />
        )}
        {kind === "decision" && (
          <>
            <polyline
              points="0,80 40,74 80,82 120,58 160,64 200,48 260,52"
              fill="none"
              stroke="#0A0B0C"
              strokeOpacity="0.35"
              strokeWidth="2"
            />
            <line x1="160" y1="14" x2="160" y2="106" stroke="#3157FF" strokeWidth="1.5" />
            <rect x="156" y="60" width="8" height="8" fill="#3157FF" />
          </>
        )}
        {kind === "outcome" && (
          <>
            <line x1="20" y1="34" x2="240" y2="34" stroke="#0A0B0C" strokeOpacity="0.7" />
            <line x1="20" y1="90" x2="240" y2="90" stroke="#FF5B4D" strokeWidth="1.5" />
            <polyline
              points="20,74 70,68 110,76 150,52 200,44 240,36"
              fill="none"
              stroke="#B8F23D"
              strokeWidth="2.5"
            />
          </>
        )}
        {kind === "lesson" && (
          <>
            {[30, 70, 110, 150, 190, 230].map((x, i) => (
              <rect
                key={x}
                x={x - 5}
                y={92 - i * 12}
                width="10"
                height={i * 12 + 10}
                fill="#0A0B0C"
                fillOpacity={i === 5 ? 1 : 0.18}
              />
            ))}
          </>
        )}
      </svg>
      <p className="mt-4 text-[13px] font-bold leading-relaxed text-carbon/70">
        {caption}
      </p>
    </motion.article>
  );
}

/* --------------------------------- SHARED ------------------------------- */

function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { y: 34 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
