"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUpRight, BellRing, Eye, ScanLine, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AppFooter } from "@/components/layout/AppFooter";

const decisions = [
  { index: "01", label: "Watch", title: "Attention, not action.", body: "A meaningful decision is approaching. Observe it without anticipating it.", icon: Eye },
  { index: "02", label: "Ready", title: "The condition is forming.", body: "Prepare the execution. The system is still waiting for proof.", icon: ScanLine },
  { index: "03", label: "Enter", title: "The decision is complete.", body: "Direction, risk, objective, and execution context arrive together.", icon: ArrowUpRight },
  { index: "04", label: "Exit", title: "Close the loop.", body: "Target or invalidation ends the decision. Review begins immediately.", icon: ShieldCheck },
];

const surfaces = [
  ["Today", "One command for the live session."],
  ["Replay", "The market slowed down to decision speed."],
  ["Review AI", "Evidence carried into the next session."],
];

export function PublicExperience() {
  const heroRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "9%"]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.02, 1.1]);

  return (
    <div className="overflow-hidden bg-carbon text-optic">
      <section ref={heroRef} className="relative flex min-h-[92svh] flex-col overflow-hidden border-b border-white/15">
        <motion.div className="absolute -inset-[2%]" style={reduced ? undefined : { y: imageY, scale: imageScale }}>
          <Image
            src="/images/prophet-observatory-cinematic-v3.png"
            alt="A private market decision observatory overlooking Chicago at sunrise"
            fill
            priority
            className="object-cover object-[68%_center] brightness-[1.14] saturate-[0.92]"
            sizes="100vw"
          />
        </motion.div>
        <div className="absolute inset-0 bg-carbon/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-carbon/85 via-carbon/55 to-transparent md:w-[76%] xl:w-[66%]" />
        <Atmosphere />

        <header className="relative z-20 flex h-[74px] items-center border-b border-white/15 px-5 md:px-9">
          <Link href="/" className="flex items-center gap-3" aria-label="SPY Prophet home">
            <span className="grid h-10 w-10 place-items-center border border-lime/70 bg-carbon/70 text-[17px] font-black text-lime backdrop-blur">P</span>
            <span>
              <span className="block text-[13px] font-black uppercase tracking-[0.08em]">SPY Prophet</span>
              <span className="microlabel mt-1 block text-white/55">Private decision intelligence</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-8 md:flex" aria-label="Public navigation">
            <a href="#experience" className="microlabel text-white/65 transition-colors hover:text-lime">Experience</a>
            <a href="#sequence" className="microlabel text-white/65 transition-colors hover:text-lime">Sequence</a>
            <a href="#review" className="microlabel text-white/65 transition-colors hover:text-lime">Review</a>
          </nav>
          <Link href="/dashboard" className="ml-6 inline-flex h-10 items-center gap-3 border border-white/35 bg-carbon/55 px-4 text-[11px] font-black uppercase tracking-[0.08em] text-white backdrop-blur transition-colors hover:border-lime hover:text-lime">
            Open console <ArrowUpRight size={14} />
          </Link>
        </header>

        <div className="relative z-10 flex flex-1 flex-col justify-between px-5 pb-8 pt-10 md:px-9 md:pb-10">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 animate-blink bg-lime" />
            <span className="microlabel text-lime">Chicago decision desk</span>
            <HeroClock />
          </div>

          <div className="max-w-[940px] py-16 md:py-20">
            <motion.p initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="microlabel text-mineral">
              SPY / ES / SPXW
            </motion.p>
            <h1 className="mt-6 text-[64px] font-black uppercase leading-[0.84] tracking-normal sm:text-[82px] md:text-[112px] xl:text-[146px]">
              <RevealLine reduced={Boolean(reduced)} delay={0.08}>SPY</RevealLine>
              <RevealLine reduced={Boolean(reduced)} delay={0.18}><span className="text-lime">Prophet.</span></RevealLine>
            </h1>
            <motion.div initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.75 }} className="mt-8 max-w-[680px] border-l border-lime/70 pl-5">
              <p className="text-[22px] font-bold leading-tight text-white md:text-[30px]">Know what must happen next.</p>
              <p className="mt-4 max-w-[600px] text-[14px] leading-relaxed text-white/[0.68] md:text-[16px]">
                A private operating system for clearer market decisions. It compresses live context into one disciplined sequence without exposing the machinery behind it.
              </p>
            </motion.div>
            <motion.div initial={reduced ? false : { y: 18 }} animate={{ y: 0 }} transition={{ delay: 0.44, duration: 0.75 }} className="mt-9 flex flex-wrap gap-3">
              <Link href="/dashboard" className="group inline-flex h-[54px] items-center gap-5 bg-lime px-6 text-[11px] font-black uppercase tracking-[0.08em] text-carbon transition-colors hover:bg-white">
                Enter today <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/replay" className="inline-flex h-[54px] items-center gap-4 border border-white/35 bg-carbon/45 px-6 text-[11px] font-black uppercase tracking-[0.08em] text-white backdrop-blur transition-colors hover:border-mineral hover:text-mineral">
                See replay <ArrowUpRight size={15} />
              </Link>
            </motion.div>
          </div>

          <div className="grid border-y border-white/15 bg-carbon/45 backdrop-blur-md sm:grid-cols-3">
            <HeroFact label="Command" value="One state at a time" />
            <HeroFact label="Risk" value="Defined before action" />
            <HeroFact label="Memory" value="Every decision preserved" />
          </div>
        </div>
        <a href="#experience" aria-label="Continue" className="absolute bottom-0 right-0 z-20 hidden h-20 w-20 place-items-center border-l border-t border-white/15 bg-carbon/55 text-white transition-colors hover:bg-lime hover:text-carbon md:grid"><ArrowDown size={18} /></a>
      </section>

      <section id="experience" className="relative border-b border-white/15 px-5 py-24 md:px-9 md:py-36">
        <div className="mx-auto max-w-[1500px]">
          <Reveal>
            <p className="microlabel text-mineral">The experience</p>
            <h2 className="mt-7 max-w-[1220px] text-[46px] font-black leading-[0.92] tracking-normal md:text-[76px] xl:text-[104px]">
              Markets are loud.<br />Your command should not be.
            </h2>
          </Reveal>
          <div className="mt-20 grid border-t border-white/20 lg:grid-cols-[0.42fr_0.58fr]">
            <div className="border-b border-white/15 py-10 pr-8 lg:border-b-0 lg:border-r">
              <p className="microlabel text-white/65">Designed for the moment</p>
              <p className="mt-6 max-w-[430px] text-[16px] leading-relaxed text-white/[0.68]">
                When the market accelerates, the interface removes explanation and elevates the next decision. No decorative dashboard. No competing signals. No public blueprint of the method.
              </p>
            </div>
            <div className="relative min-h-[360px] overflow-hidden py-10 lg:pl-12">
              <div className="absolute inset-y-10 left-0 w-px bg-mineral/40 lg:left-12" />
              <div className="space-y-8 pl-7 lg:pl-12">
                {[
                  ["Before", "Prepare the field without predicting the outcome."],
                  ["During", "Receive one state, one action, and one defined risk."],
                  ["After", "Turn the completed decision into tomorrow's discipline."],
                ].map(([label, text], index) => (
                  <motion.div key={label} initial={reduced ? false : { opacity: 0, x: 22 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.6 }} transition={{ delay: index * 0.1, duration: 0.65 }} className="relative grid gap-3 border-b border-white/15 pb-8 md:grid-cols-[110px_1fr]">
                    <span className="absolute -left-[31px] top-1 h-2 w-2 bg-lime lg:-left-[51px]" />
                    <span className="microlabel text-lime">{label}</span>
                    <span className="text-[20px] font-bold leading-tight md:text-[26px]">{text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="sequence" className="border-b border-white/15 bg-ink">
        <div className="px-5 py-20 md:px-9 md:py-28">
          <div className="mx-auto max-w-[1500px]">
            <Reveal className="grid gap-8 lg:grid-cols-[0.48fr_0.52fr] lg:items-end">
              <div>
                <p className="microlabel text-lime">The command sequence</p>
                <h2 className="mt-7 text-[46px] font-black leading-[0.92] tracking-normal md:text-[72px]">Four states.<br />No ambiguity.</h2>
              </div>
              <p className="max-w-[500px] text-[15px] leading-relaxed text-white/60 lg:justify-self-end">
                The experience explains what to do, not how the proprietary model arrives there. Methodology stays private. Decision discipline stays visible.
              </p>
            </Reveal>
          </div>
        </div>
        <ol className="border-t border-white/15">
          {decisions.map((decision, index) => {
            const Icon = decision.icon;
            return (
              <motion.li key={decision.label} initial={reduced ? false : { x: -12 }} whileInView={{ x: 0 }} viewport={{ once: true, amount: 0.45 }} transition={{ duration: 0.7, delay: index * 0.06 }} className="group grid border-b border-white/15 px-5 py-8 transition-colors hover:bg-white/[0.03] md:grid-cols-[72px_150px_1fr_48px] md:items-center md:px-9 lg:py-10">
                <span className="num text-[11px] font-bold text-white/65">{decision.index}</span>
                <span className="microlabel mt-3 text-mineral md:mt-0">{decision.label}</span>
                <div className="mt-4 md:mt-0">
                  <h3 className="text-[24px] font-black md:text-[32px]">{decision.title}</h3>
                  <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-white/55">{decision.body}</p>
                </div>
                <Icon className="mt-5 text-lime md:mt-0" size={22} strokeWidth={1.5} />
              </motion.li>
            );
          })}
        </ol>
      </section>

      <section className="relative min-h-[680px] overflow-hidden border-b border-white/15">
        <Image src="/images/market-duality-hall-v1.png" alt="A bronze bull and bear facing each other in an institutional market hall" fill className="object-cover object-center" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-carbon/90 via-carbon/50 to-carbon/20" />
        <div className="relative z-10 mx-auto flex min-h-[680px] max-w-[1500px] items-end px-5 py-20 md:px-9 md:py-28">
          <Reveal>
            <p className="microlabel text-mineral">Market posture</p>
            <h2 className="mt-7 max-w-[960px] text-[48px] font-black leading-[0.9] tracking-normal md:text-[76px] xl:text-[96px]">Direction is earned.<br />Never assumed.</h2>
            <p className="mt-7 max-w-[620px] text-[15px] leading-relaxed text-white/[0.72]">Bullish and bearish possibilities remain context until price, structure, and risk resolve into one qualified decision. The operator sees the decision. The proprietary machinery stays inside the system.</p>
          </Reveal>
        </div>
      </section>

      <section id="review" className="border-b border-white/15 bg-optic text-carbon">
        <div className="mx-auto max-w-[1500px] px-5 py-24 md:px-9 md:py-32">
          <Reveal>
            <p className="microlabel text-context-ink">The operating loop</p>
            <h2 className="mt-7 max-w-[1000px] text-[46px] font-black leading-[0.92] tracking-normal md:text-[76px]">Live clarity.<br />Permanent memory.</h2>
          </Reveal>
          <div className="mt-16 grid border-y border-carbon lg:grid-cols-3">
            {surfaces.map(([label, body], index) => (
              <motion.div key={label} initial={reduced ? false : { y: 18 }} whileInView={{ y: 0 }} viewport={{ once: true, amount: 0.55 }} transition={{ delay: index * 0.1, duration: 0.65 }} className="border-b border-carbon p-6 last:border-b-0 lg:min-h-[300px] lg:border-b-0 lg:border-r lg:last:border-r-0 lg:p-9">
                <span className="num text-[11px] font-bold text-context-ink">0{index + 1}</span>
                <h3 className="mt-12 text-[34px] font-black">{label}</h3>
                <p className="mt-4 max-w-[320px] text-[14px] leading-relaxed text-carbon/[0.62]">{body}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/dashboard" className="group inline-flex h-14 items-center gap-5 bg-carbon px-6 text-[11px] font-black uppercase tracking-[0.08em] text-white transition-colors hover:bg-context"><span>Open the system</span><ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></Link>
            <Link href="/agents" className="inline-flex h-14 items-center gap-4 border border-carbon px-6 text-[11px] font-black uppercase tracking-[0.08em] transition-colors hover:bg-carbon hover:text-white"><BellRing size={15} /> Review the last session</Link>
          </div>
        </div>
      </section>

      <section className="bg-lime px-5 py-20 text-carbon md:px-9 md:py-28">
        <div className="mx-auto grid max-w-[1500px] gap-10 lg:grid-cols-[1fr_360px] lg:items-end">
          <Reveal>
            <p className="microlabel">Private intelligence. Decisive delivery.</p>
            <h2 className="mt-7 max-w-[1050px] text-[48px] font-black leading-[0.9] tracking-normal md:text-[78px] xl:text-[98px]">See less.<br />Know more.</h2>
          </Reveal>
          <Link href="/dashboard" className="group inline-flex h-16 items-center justify-between bg-carbon px-6 text-[11px] font-black uppercase tracking-[0.08em] text-white transition-colors hover:bg-white hover:text-carbon">Enter today&apos;s console <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Link>
        </div>
      </section>

      <AppFooter />
    </div>
  );
}

function RevealLine({ children, reduced, delay }: { children: React.ReactNode; reduced: boolean; delay: number }) {
  return <span className="block overflow-hidden"><motion.span className="block" initial={reduced ? false : { y: "110%" }} animate={{ y: 0 }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.span></span>;
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.div initial={reduced ? false : { y: 24 }} whileInView={{ y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }} className={className}>{children}</motion.div>;
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-white/15 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="microlabel text-white/65">{label}</p><p className="mt-2 text-[12px] font-bold text-white/82">{value}</p></div>;
}

function HeroClock() {
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="num text-[11px] font-bold text-white/55">{clock} CT</span>;
}

function Atmosphere() {
  return <div className="pointer-events-none absolute inset-0" aria-hidden="true"><div className="absolute inset-x-0 top-[18%] h-px bg-white/10" /><div className="absolute inset-x-0 top-[62%] h-px bg-white/10" /><div className="absolute bottom-0 left-[18%] top-0 w-px bg-white/[0.08]" /><motion.div className="absolute bottom-0 top-0 w-px bg-lime/25" animate={{ left: ["22%", "78%", "22%"] }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} /></div>;
}
