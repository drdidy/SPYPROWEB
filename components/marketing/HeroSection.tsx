"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Crosshair,
  Gauge,
  Layers3,
  LineChart,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { DecisionState } from "@/lib/types";
import {
  StructurePathChart,
  type StructureChartData,
} from "@/components/decision-slate/StructurePathChart";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface HeroProps {
  decision?: DecisionState;
  quote?: { spy: number; change: number; changePct: number; vix: number };
  initialLive?: boolean;
  chart?: StructureChartData | null;
  spxChart?: StructureChartData | null;
  previewLabel?: string;
  chartDate?: string;
}

const workspaceNav: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Decision Slate", icon: Crosshair },
  { label: "SPY Engine", icon: LineChart },
  { label: "ES Engine", icon: Activity },
  { label: "Replays", icon: CalendarDays },
  { label: "Structure Maps", icon: Layers3 },
];

export function HeroSection({
  decision: serverDecision,
  quote: serverQuote,
  initialLive,
  chart,
  spxChart,
  previewLabel = "Latest structure",
  chartDate,
}: HeroProps = {}) {
  const reduce = useReducedMotion();
  const fadeUp = (delay = 0) =>
    reduce
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.72, delay, ease: [0.2, 0.8, 0.2, 1] },
        };

  const statusTone =
    serverDecision?.finalDecision === "TRADE_ALLOWED"
      ? "bull"
      : serverDecision?.finalDecision === "STOP_TRADING" ||
          serverDecision?.finalDecision === "NO_TRADE"
        ? "bear"
        : "gold";
  const decisionLabel = labelize(serverDecision?.finalDecision ?? "WAIT_FOR_CONFIRMATION");
  const verdict = serverDecision?.verdict ?? "WAIT";
  const explanation =
    serverDecision?.finalExplanation ||
    "The live slate loads from current market structure when the data source is available.";

  return (
    <section className="relative overflow-hidden border-b border-rule/80 bg-[#FBF8EF]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.42]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(20,22,26,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(20,22,26,0.04) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="absolute inset-y-0 right-0 w-[58%] bg-[radial-gradient(circle_at_55%_28%,rgba(184,130,31,0.18),transparent_32%),linear-gradient(135deg,rgba(6,16,22,0)_0%,rgba(6,16,22,0.08)_100%)]" />

      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-5 pb-14 pt-12 sm:px-7 lg:min-h-[760px] lg:grid-cols-12 lg:items-center lg:pb-16 lg:pt-16">
        <div className="lg:col-span-5 xl:col-span-4">
          <motion.div {...fadeUp(0)} className="mb-7 flex items-center gap-3">
            <CompassMark />
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-ink">
              Closed beta
            </div>
            {initialLive && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-bull-ink">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-bull opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bull" />
                </span>
                live
              </span>
            )}
          </motion.div>

          <motion.h1
            {...fadeUp(0.04)}
            className="max-w-[10.5ch] font-serif text-[clamp(56px,8vw,104px)] font-normal leading-[0.92] tracking-[-0.035em] text-ink"
          >
            Structure before{" "}
            <span className="italic font-light text-gold-ink">conviction.</span>
          </motion.h1>

          <motion.p
            {...fadeUp(0.12)}
            className="mt-7 max-w-[34rem] text-[17px] leading-[1.65] text-ink-2 md:text-[18px]"
          >
            A decision workspace for SPY and ES traders who wait for the setup,
            read the rails, and stop when the engine says stand down.
          </motion.p>

          <motion.div {...fadeUp(0.2)} className="mt-9 flex flex-wrap gap-3">
            <a
              href="#waitlist"
              onClick={() =>
                track({
                  name: "cta_click",
                  location: "hero",
                  label: "request_beta_access",
                })
              }
            >
              <Button variant="primary" size="lg">
                Request beta access <ArrowRight size={15} />
              </Button>
            </a>
            <Link
              href="/methodology"
              onClick={() =>
                track({
                  name: "cta_click",
                  location: "hero",
                  label: "view_methodology",
                })
              }
            >
              <Button variant="secondary" size="lg">
                View methodology <BookOpen size={15} />
              </Button>
            </Link>
          </motion.div>

          <motion.div
            {...fadeUp(0.28)}
            className="mt-12 grid max-w-xl grid-cols-3 divide-x divide-rule-strong border-y border-rule-strong py-5"
          >
            <ProofPoint icon={Gauge} label="Two engines" />
            <ProofPoint icon={Radio} label="Real structure" />
            <ProofPoint icon={ShieldCheck} label="Risk first" />
          </motion.div>
        </div>

        <motion.div
          {...fadeUp(0.16)}
          className="lg:col-span-7 xl:col-span-8"
          role="region"
          aria-label="Live product preview"
        >
          <div className="relative mx-auto max-w-[980px] lg:ml-auto lg:[perspective:1500px]">
            <div className="absolute -bottom-9 left-12 right-4 h-16 rounded-full bg-ink/30 blur-3xl lg:left-20" />
            <div
              className="relative rounded-[28px] border border-ink/80 bg-[#02070B] p-2 shadow-[0_36px_110px_-48px_rgba(6,16,23,0.95),0_18px_45px_-30px_rgba(20,22,26,0.9)] lg:origin-center"
              style={{
                transform: reduce
                  ? undefined
                  : "rotateY(-6deg) rotateX(2deg) rotateZ(0.6deg)",
              }}
            >
              <div className="absolute left-1/2 top-1 h-1 w-20 -translate-x-1/2 rounded-full bg-paper/12" />
              <div className="absolute right-3 top-1/2 h-16 w-1 -translate-y-1/2 rounded-full bg-paper/10" />
              <div className="relative overflow-hidden rounded-[22px] border border-paper/10 bg-[#061017] shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(184,130,31,0.16),transparent_24%),linear-gradient(115deg,rgba(255,255,255,0.04),transparent_36%)]" />
                <div className="relative flex h-7 items-center justify-between border-b border-paper/10 bg-[#030A0F] px-4 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/38">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-bear/70" />
                    <span className="h-1.5 w-1.5 rounded-full bg-gold/80" />
                    <span className="h-1.5 w-1.5 rounded-full bg-bull/75" />
                  </div>
                  <span>SPY Prophet OS</span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-4 rounded-full bg-paper/18" />
                    <span className="h-1.5 w-1.5 rounded-full bg-bull/70" />
                  </div>
                </div>
                <div className="relative flex items-center justify-between border-b border-paper/10 bg-[#081219]/92 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-[9px] border border-gold/35 bg-gold/10 text-gold-soft">
                      <Crosshair size={17} />
                    </div>
                    <div>
                      <div className="font-serif text-[17px] leading-none text-paper">
                        SPY Prophet
                      </div>
                      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-gold-soft/60">
                        Decision Slate
                      </div>
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 md:flex">
                    <div className="flex rounded-[7px] border border-paper/10 bg-paper/[0.035] p-1 font-mono text-[9px] uppercase tracking-[0.12em] text-paper/42">
                      {["Slate", "SPY", "ES"].map((tabName, index) => (
                        <span
                          key={tabName}
                          className={cn(
                            "rounded-[5px] px-3 py-1.5",
                            index === 0 && "bg-gold/14 text-gold-soft",
                          )}
                        >
                          {tabName}
                        </span>
                      ))}
                    </div>
                    <span
                      className={cn(
                        "rounded-[6px] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]",
                        initialLive
                          ? "border-bull/45 bg-bull/10 text-bull"
                          : "border-paper/15 bg-paper/[0.035] text-paper/55",
                      )}
                    >
                      {initialLive ? "Live" : "Replay"}
                    </span>
                    <button
                      type="button"
                      aria-label="Preview notifications"
                      className="grid h-8 w-8 place-items-center rounded-[7px] border border-paper/10 bg-paper/[0.035] text-paper/48"
                    >
                      <Bell size={14} />
                    </button>
                  </div>
                </div>

                <div className="relative grid grid-cols-1 md:grid-cols-[190px_1fr]">
                  <aside className="hidden border-r border-paper/10 bg-[#071017]/72 p-3 md:block">
                    <div className="rounded-[9px] border border-paper/10 bg-[#0B171E] p-1.5">
                      {workspaceNav.map(({ label, icon: Icon }, index) => (
                      <div
                        key={label}
                        className={cn(
                          "flex items-center gap-2 rounded-[7px] px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.1em]",
                          index === 0
                            ? "border border-gold/45 bg-gold/10 text-gold-soft shadow-[0_0_22px_-16px_rgba(184,130,31,0.9)]"
                            : "text-paper/45",
                        )}
                      >
                        <Icon size={13} />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                    <div className="mt-4 rounded-[9px] border border-paper/10 bg-paper/[0.035] p-3">
                      <div className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-paper/35">
                        <span>{previewLabel}</span>
                        <ChevronDown size={12} />
                      </div>
                    <PreviewMetric
                      label="SPY"
                      value={money(serverQuote?.spy)}
                      delta={delta(serverQuote?.change, serverQuote?.changePct)}
                      tone={(serverQuote?.change ?? 0) >= 0 ? "bull" : "bear"}
                    />
                    <PreviewMetric label="VIX" value={number(serverQuote?.vix, 2)} />
                  </div>
                </aside>

                  <div className="p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-paper/10 bg-paper/[0.035] px-3 py-2.5">
                      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                        <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-gold/12 text-gold-soft">
                          <Radio size={12} />
                        </span>
                        <span>{chartDate ?? chart?.date ?? "Latest"}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/45">
                        <span className="rounded-[5px] border border-paper/10 px-2 py-1">
                          SPY
                        </span>
                        <span className="rounded-[5px] border border-paper/10 px-2 py-1">
                          ES
                        </span>
                        <span className="rounded-[5px] border border-gold/30 bg-gold/10 px-2 py-1 text-gold-soft">
                          Structure
                        </span>
                      </div>
                    </div>
                    <WorkflowStrip
                      tone={statusTone}
                      date={chartDate ?? chart?.date ?? "Latest"}
                      decision={decisionLabel}
                      verdict={verdict}
                    />
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_260px]">
                    <div className="relative overflow-hidden rounded-[10px] border border-paper/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-4 shadow-[0_18px_40px_-34px_rgba(244,228,192,0.5)]">
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent" />
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
                            Recommended next step
                          </div>
                          <h2 className="mt-2 max-w-[19ch] font-serif text-[24px] leading-tight tracking-[-0.01em] text-paper sm:text-[27px]">
                            {decisionLabel}
                          </h2>
                        </div>
                        <StateChip tone={statusTone}>{decisionLabel}</StateChip>
                      </div>
                      <p className="line-clamp-3 min-h-[4.6rem] text-[13px] leading-relaxed text-paper/62">
                        {explanation}
                      </p>
                      <DecisionFlowPanel
                        tone={statusTone}
                        date={chartDate ?? chart?.date ?? "Latest"}
                        decision={decisionLabel}
                      />
                    </div>

                    <div className="relative overflow-hidden rounded-[10px] border border-paper/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-4 shadow-[0_18px_40px_-36px_rgba(244,228,192,0.35)]">
                      <div className="pointer-events-none absolute inset-y-4 left-0 w-px bg-gradient-to-b from-transparent via-gold/45 to-transparent" />
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
                        Today's game plan
                      </div>
                      <dl className="mt-4 space-y-3">
                        <PlanRow label="Verdict" value={verdict} />
                        <PlanRow label="Decision" value={decisionLabel} />
                        <PlanRow label="Conviction" value={percent(serverDecision?.conviction)} />
                        <PlanRow label="Replay date" value={chartDate ?? chart?.date ?? "Latest"} />
                      </dl>
                      <div className="mt-5 border-t border-paper/10 pt-4">
                        <Link
                          href="/dashboard"
                          onClick={() =>
                            track({
                              name: "cta_click",
                              location: "hero_preview",
                              label: "open_decision_slate",
                            })
                          }
                          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-gold-soft transition-colors hover:text-paper"
                        >
                          Open live slate <ArrowRight size={13} />
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:col-span-2 md:grid-cols-2">
                      <PreviewChartCard
                        title="SPY structure map"
                        value={money(serverQuote?.spy)}
                        delta={delta(serverQuote?.change, serverQuote?.changePct)}
                        tone={(serverQuote?.change ?? 0) >= 0 ? "bull" : "bear"}
                      >
                        <StructurePathChart
                          data={chart}
                          variant="dark"
                          accent="gold"
                          height={170}
                          title="Premarket anchors"
                        />
                      </PreviewChartCard>
                      <PreviewChartCard
                        title="ES structure map"
                        value={lastChartPrice(spxChart)}
                        delta={undefined}
                        tone="bull"
                      >
                        <StructurePathChart
                          data={spxChart}
                          variant="dark"
                          accent="bull"
                          height={170}
                          title="Overnight channel"
                        />
                      </PreviewChartCard>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-2 flex justify-center lg:col-span-12 lg:mt-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-ink/80">
            A repeatable morning workflow
          </div>
        </div>
      </div>
    </section>
  );
}

function CompassMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="hero-compass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D29A2C" />
          <stop offset="55%" stopColor="#B8821F" />
          <stop offset="100%" stopColor="#6E4C0E" />
        </linearGradient>
      </defs>
      <path
        d="M14 1.8 17.2 10.8 26.2 14 17.2 17.2 14 26.2 10.8 17.2 1.8 14 10.8 10.8 14 1.8Z"
        fill="none"
        stroke="url(#hero-compass)"
        strokeWidth="1.15"
      />
      <circle cx="14" cy="14" r="2.1" fill="url(#hero-compass)" />
    </svg>
  );
}

function ProofPoint({
  icon: Icon,
  label,
}: {
  icon: typeof Gauge;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-2 text-center">
      <Icon size={15} className="shrink-0 text-gold-ink" />
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
    </div>
  );
}

function StateChip({
  tone,
  children,
}: {
  tone: "bull" | "bear" | "gold";
  children: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[5px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
        tone === "bull" && "border-bull/45 bg-bull/10 text-bull",
        tone === "bear" && "border-bear/45 bg-bear/10 text-bear",
        tone === "gold" && "border-gold/45 bg-gold/10 text-gold-soft",
      )}
    >
      {children}
    </span>
  );
}

function PreviewMetric({
  label,
  value,
  delta: deltaText,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "bull" | "bear" | "neutral";
}) {
  return (
    <div className="mb-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-paper/35">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-[18px] text-paper">{value}</span>
        {deltaText && (
          <span
            className={cn(
              "font-mono text-[10px]",
              tone === "bull" && "text-bull",
              tone === "bear" && "text-bear",
              tone === "neutral" && "text-paper/45",
            )}
          >
            {deltaText}
          </span>
        )}
      </div>
    </div>
  );
}

function WorkflowStrip({
  tone,
  date,
  decision,
  verdict,
}: {
  tone: "bull" | "bear" | "gold";
  date: string;
  decision: string;
  verdict: string;
}) {
  const steps = [
    { label: "Session", value: date, icon: CalendarDays },
    { label: "Decision", value: decision, icon: Crosshair },
    { label: "Verdict", value: verdict, icon: ShieldCheck },
  ];

  return (
    <div className="mb-4 grid grid-cols-3 overflow-hidden rounded-[10px] border border-paper/10 bg-[#09151C] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]">
      {steps.map(({ label, value, icon: Icon }, index) => (
        <div
          key={label}
          className={cn(
            "relative min-w-0 border-r border-paper/10 px-3 py-3 last:border-r-0",
            index === 1 && "bg-paper/[0.035]",
          )}
        >
          {index === 1 && (
            <span
              className={cn(
                "absolute inset-x-3 top-0 h-px",
                tone === "bull" && "bg-bull/60",
                tone === "bear" && "bg-bear/60",
                tone === "gold" && "bg-gold/70",
              )}
            />
          )}
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/35">
            <Icon size={12} />
            <span>{label}</span>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-paper/70">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function DecisionFlowPanel({
  tone,
  date,
  decision,
}: {
  tone: "bull" | "bear" | "gold";
  date: string;
  decision: string;
}) {
  const stroke =
    tone === "bull" ? "#0E7C50" : tone === "bear" ? "#B5301E" : "#B8821F";
  return (
    <div className="mt-4 overflow-hidden rounded-[7px] border border-paper/10 bg-[#08161D]">
      <div className="grid grid-cols-3 border-b border-paper/10">
        <FlowStep n="01" label="Read" value={date} />
        <FlowStep n="02" label="Confirm" value={decision} />
        <FlowStep n="03" label="Manage" value="Risk first" />
      </div>
      <svg
        viewBox="0 0 620 160"
        className="h-[136px] w-full"
        role="img"
        aria-label="Decision flow from structure read to confirmation and management"
      >
        <defs>
          <linearGradient id="decision-flow-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.05" />
            <stop offset="50%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <rect width="620" height="160" fill="transparent" />
        {[90, 220, 350, 480].map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1="22"
            y2="138"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        ))}
        <path
          d="M46 112 C118 48 188 54 250 86 C318 122 370 38 444 56 C506 72 542 94 576 44"
          fill="none"
          stroke={stroke}
          strokeWidth="2.8"
          strokeLinecap="round"
          className="structure-price-path"
          pathLength={1}
        />
        <path
          d="M46 112 C118 48 188 54 250 86 C318 122 370 38 444 56 C506 72 542 94 576 44 L576 138 L46 138 Z"
          fill="url(#decision-flow-fill)"
        />
        {[
          { x: 116, y: 58, label: "structure" },
          { x: 292, y: 103, label: "confirmation" },
          { x: 444, y: 56, label: "managed" },
        ].map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="7" fill={stroke} opacity="0.18" />
            <circle cx={point.x} cy={point.y} r="3" fill={stroke} />
            <text
              x={point.x}
              y={point.y - 13}
              textAnchor="middle"
              fontFamily="var(--font-geist-mono)"
              fontSize="9"
              fill="rgba(244,228,192,0.62)"
            >
              {point.label}
            </text>
          </g>
        ))}
        <line
          x1="46"
          x2="576"
          y1="118"
          y2="118"
          stroke="rgba(244,228,192,0.32)"
          strokeDasharray="5 8"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

function FlowStep({
  n,
  label,
  value,
}: {
  n: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-r border-paper/10 px-3 py-3 last:border-r-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-paper/35">
        {n} {label}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-gold-soft">
        {value}
      </div>
    </div>
  );
}

function PreviewChartCard({
  title,
  value,
  delta: deltaText,
  tone,
  children,
}: {
  title: string;
  value: string;
  delta?: string;
  tone: "bull" | "bear" | "neutral";
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[10px] border border-paper/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.052),rgba(255,255,255,0.018))] p-4 shadow-[0_18px_42px_-38px_rgba(244,228,192,0.42)]">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px",
          tone === "bull" && "bg-bull/50",
          tone === "bear" && "bg-bear/50",
          tone === "neutral" && "bg-gold/45",
        )}
      />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border",
              tone === "bull" && "border-bull/25 bg-bull/10 text-bull",
              tone === "bear" && "border-bear/25 bg-bear/10 text-bear",
              tone === "neutral" && "border-gold/25 bg-gold/10 text-gold-soft",
            )}
          >
            <LineChart size={13} />
          </span>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
              {title}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-[18px] font-semibold text-paper">
                {value}
            </span>
              {deltaText && (
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    tone === "bull" && "text-bull",
                    tone === "bear" && "text-bear",
                    tone === "neutral" && "text-paper/45",
                  )}
                >
                  {deltaText}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="rounded-[4px] border border-gold/35 bg-gold/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-gold-soft">
          Actual
        </span>
      </div>
      {children}
    </div>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-paper/10 pb-2.5 last:border-b-0">
      <dt className="text-[12px] text-paper/45">{label}</dt>
      <dd className="text-right font-mono text-[12px] font-semibold uppercase tracking-[0.04em] text-paper/80">
        {value}
      </dd>
    </div>
  );
}

function lastChartPrice(chart?: StructureChartData | null): string {
  const last = chart?.bars.at(-1);
  if (!last || !Number.isFinite(last.c)) return "-";
  return last.c.toFixed(chart?.label === "ES" ? 0 : 2);
}

function labelize(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (part) => part.toUpperCase());
}

function money(value?: number): string {
  if (!Number.isFinite(value)) return "-";
  return `$${value!.toFixed(2)}`;
}

function number(value?: number, digits = 1): string {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return "-";
  return value!.toFixed(digits);
}

function percent(value?: number): string {
  if (!Number.isFinite(value)) return "Loading";
  return `${Math.round(value!)}%`;
}

function delta(change?: number, changePct?: number): string | undefined {
  if (!Number.isFinite(change) || !Number.isFinite(changePct)) return undefined;
  const sign = change! > 0 ? "+" : "";
  return `${sign}${change!.toFixed(2)} (${sign}${changePct!.toFixed(2)}%)`;
}
