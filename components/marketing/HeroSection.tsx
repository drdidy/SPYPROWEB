"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BookOpen, Gauge, Radio, ShieldCheck } from "lucide-react";
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

const workspaceNav = [
  "Decision Slate",
  "SPY Engine",
  "ES Engine",
  "Replays",
  "Structure Maps",
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
          <div className="relative mx-auto max-w-[920px] lg:ml-auto">
            <div className="absolute -bottom-5 left-8 right-8 h-10 rounded-full bg-ink/25 blur-2xl" />
            <div className="relative overflow-hidden rounded-[18px] border border-paper/10 bg-[#061017] shadow-[0_28px_90px_-40px_rgba(6,16,23,0.9),0_1px_0_rgba(255,255,255,0.08)_inset]">
              <div className="flex items-center justify-between border-b border-paper/10 px-4 py-3 sm:px-5">
                <div>
                  <div className="font-serif text-[17px] leading-none text-paper">
                    SPY Prophet
                  </div>
                  <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-gold-soft/60">
                    Decision Slate
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                  <span>{previewLabel}</span>
                  <span
                    className={cn(
                      "rounded-[4px] border px-2 py-1",
                      initialLive
                        ? "border-bull/45 text-bull"
                        : "border-paper/15 text-paper/55",
                    )}
                  >
                    {initialLive ? "Live" : "Replay"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[170px_1fr]">
                <aside className="hidden border-r border-paper/10 p-4 md:block">
                  <div className="space-y-1.5">
                    {workspaceNav.map((item, index) => (
                      <div
                        key={item}
                        className={cn(
                          "rounded-[6px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em]",
                          index === 0
                            ? "border border-gold/45 bg-gold/10 text-gold-soft"
                            : "text-paper/45",
                        )}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="mt-14 border-t border-paper/10 pt-4">
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
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_260px]">
                    <div className="rounded-[8px] border border-paper/10 bg-paper/[0.035] p-4">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
                            Recommended next step
                          </div>
                          <h2 className="mt-2 max-w-[15ch] font-serif text-[24px] leading-tight tracking-[-0.01em] text-paper sm:text-[28px]">
                            {verdict}: {decisionLabel}
                          </h2>
                        </div>
                        <StateChip tone={statusTone}>{decisionLabel}</StateChip>
                      </div>
                      <p className="line-clamp-3 min-h-[4.6rem] text-[13px] leading-relaxed text-paper/62">
                        {explanation}
                      </p>
                      <div className="mt-4">
                        <StructurePathChart
                          data={chart}
                          variant="dark"
                          accent={statusTone === "bear" ? "bear" : statusTone === "bull" ? "bull" : "gold"}
                          height={220}
                          title="Actual SPY path vs rails"
                        />
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-paper/10 bg-paper/[0.035] p-4">
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
    <div className="rounded-[8px] border border-paper/10 bg-paper/[0.035] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
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
