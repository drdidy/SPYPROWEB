"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, ArrowDown } from "lucide-react";
import { motion } from "framer-motion";
import type { DecisionState } from "@/lib/types";
import { useLiveSPY } from "@/lib/use-live-snapshot";

interface HeroProps {
  decision?: DecisionState;
  quote?: { spy: number; change: number; changePct: number; vix: number };
  initialLive?: boolean;
}

export function HeroSection({ decision: serverDecision, quote: serverQuote, initialLive }: HeroProps = {}) {
  // Seed with server-rendered values, then poll /api/snapshot every 30s
  // so the hero numbers stay fresh without a page reload.
  const live = useLiveSPY({
    decision: serverDecision,
    shell: serverQuote
      ? {
          spy: serverQuote.spy,
          change: serverQuote.change,
          changePct: serverQuote.changePct,
          vix: serverQuote.vix,
          vixDelta: 0,
          isLive: !!initialLive,
          sessionLabel: "",
          sessionCloses: "",
          feedHealth: { lastTickTs: new Date().toISOString(), source: "server" },
        }
      : undefined,
    source: initialLive ? "live" : undefined,
  });
  const decision = live.decision;
  const t = live.shell;
  const isLive = live.source === "live";
  return (
    <section className="relative max-w-[1240px] mx-auto px-7 pt-16 pb-20 lg:pt-24 lg:pb-28">
      {/* eyebrow */}
      <div className="flex items-center gap-3 mb-10">
        <span className="font-mono text-[10px] text-ink-3 tracking-[0.22em] uppercase">
          A trading workspace · invite only
        </span>
        {isLive && (
          <span className="font-mono text-[10px] text-bull-ink tracking-[0.22em] uppercase inline-flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-50 animate-breathe" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-bull" />
            </span>
            live
          </span>
        )}
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        // Fluid type: clamps between 48px (~360px viewport) and 112px
        // (≥1280px viewport) so the H1 reads cleanly at every spec
        // breakpoint without breakpoint-jumping.
        style={{ fontSize: "clamp(48px, 8.5vw, 112px)" }}
        className="font-serif leading-[0.94] tracking-[-0.035em] text-ink max-w-[14ch]"
      >
        Discipline,{" "}
        <span className="italic font-light text-ink-2">before</span>
        <br />
        conviction.
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
        className="mt-9 grid grid-cols-12 gap-10 items-end"
      >
        <p className="col-span-12 md:col-span-7 lg:col-span-6 text-[18px] md:text-[20px] text-ink-2 leading-[1.55] max-w-2xl">
          Prophet reads the day before the day reads you. Same setup every
          morning. Same questions asked of every move. A bar most signals
          don&apos;t clear. It&apos;s a workspace, not a feed.
        </p>

        <div className="col-span-12 md:col-span-5 lg:col-span-6 flex flex-col items-start md:items-end gap-3">
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button variant="primary" size="lg">
                Read today's slate <ArrowRight size={15} />
              </Button>
            </Link>
            <a href="#waitlist">
              <Button variant="outline" size="lg">
                Join the waitlist
              </Button>
            </a>
          </div>
          <p className="text-[12px] text-ink-3 mt-1 font-mono">
            Closed beta · invite-only
          </p>
        </div>
      </motion.div>

      {/* Live ribbon: preview of the slate */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className="mt-16 surface rounded-card overflow-hidden"
      >
        <div className="grid grid-cols-12">
          <div className="col-span-12 md:col-span-3 p-6 border-b md:border-b-0 md:border-r border-rule">
            <div className="eyebrow text-ink-3 mb-2">Live · today's verdict</div>
            <div className="flex items-baseline gap-2">
              <span className="text-headline font-serif text-gold-ink">
                {decision.verdict}
              </span>
              <span className="font-mono text-sm text-ink-3 tabular-nums">
                {decision.conviction}/100
              </span>
            </div>
            <div className="mt-3 h-1 bg-paper-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-ink rounded-full"
                style={{ width: `${decision.conviction}%` }}
              />
            </div>
            <div className="mt-3 text-[11px] text-ink-3 font-mono">
              {decision.windowET}
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 p-6 border-b md:border-b-0 md:border-r border-rule flex flex-col justify-center">
            <div className="eyebrow text-ink-3 mb-2">Rationale</div>
            <p className="text-[14px] text-ink-2 leading-relaxed">
              {decision.finalExplanation}
            </p>
          </div>

          <div className="col-span-12 md:col-span-3 p-6 grid grid-cols-3 md:grid-cols-1 gap-4">
            <Quote label="SPY" value={t.spy.toFixed(2)} />
            <Quote
              label="CHG"
              value={`${t.change >= 0 ? "+" : ""}${t.change.toFixed(2)}`}
              tone={t.change >= 0 ? "bull" : "bear"}
            />
            <Quote label="VIX" value={t.vix.toFixed(2)} />
          </div>
        </div>
      </motion.div>

      {/* scroll hint */}
      <div className="hidden lg:flex items-center gap-2 text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em] mt-12">
        <span>Read the methodology</span>
        <ArrowDown size={12} className="animate-breathe" />
      </div>
    </section>
  );
}

function Quote({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls = tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink";
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-1">{label}</div>
      <div className={`font-mono text-base font-semibold tabular-nums ${cls}`} data-num>
        {value}
      </div>
    </div>
  );
}
