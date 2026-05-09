"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, ArrowDown } from "lucide-react";
import { motion } from "framer-motion";
import type { DecisionState } from "@/lib/types";
import { HeroVerdictCard } from "./HeroVerdictCard";

interface HeroProps {
  decision?: DecisionState;
  quote?: { spy: number; change: number; changePct: number; vix: number };
  initialLive?: boolean;
}

export function HeroSection({
  decision: serverDecision,
  quote: serverQuote,
  initialLive,
}: HeroProps = {}) {
  const isLive = !!initialLive;
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

      {/* Live verdict card: explicit-state component handles all eight
          render paths (live/pre-open/closed/weekend/holiday/stale/
          error/loading) and reserves its own dimensions to avoid CLS. */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className="mt-16"
      >
        <HeroVerdictCard
          decision={serverDecision}
          quote={serverQuote}
          initialLive={initialLive}
        />
      </motion.div>

      {/* scroll hint */}
      <div className="hidden lg:flex items-center gap-2 text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em] mt-12">
        <span>Read the methodology</span>
        <ArrowDown size={12} className="animate-breathe" />
      </div>
    </section>
  );
}

// The legacy <Quote> helper moved into HeroVerdictCard alongside its
// only consumer.
