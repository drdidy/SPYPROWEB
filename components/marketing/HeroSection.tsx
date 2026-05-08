"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, ArrowDown } from "lucide-react";
import { decision, shellState } from "@/lib/mock-data";
import { motion } from "framer-motion";

export function HeroSection() {
  return (
    <section className="relative max-w-[1240px] mx-auto px-7 pt-16 pb-20 lg:pt-24 lg:pb-28">
      {/* eyebrow */}
      <div className="flex items-center gap-3 mb-10">
        <span className="font-mono text-[10px] text-ink-3 tracking-[0.22em] uppercase">
          A trading workspace · invite only
        </span>
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        className="font-serif text-[64px] md:text-[88px] lg:text-[112px] leading-[0.94] tracking-[-0.035em] text-ink max-w-[14ch]"
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
          Prophet reads the day before the day reads you. The same fixed
          structure every morning, the same questions asked of every move,
          the same bar held against every decision. A workspace, not a feed.
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

      {/* Live ribbon — preview of the slate */}
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
            <Quote label="SPY" value={shellState.spy.toFixed(2)} />
            <Quote
              label="CHG"
              value={`${shellState.change >= 0 ? "+" : ""}${shellState.change.toFixed(2)}`}
              tone={shellState.change >= 0 ? "bull" : "bear"}
            />
            <Quote label="VIX" value={shellState.vix.toFixed(2)} />
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
