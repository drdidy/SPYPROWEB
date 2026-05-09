"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, ArrowDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { DecisionState } from "@/lib/types";
import { HeroVerdictCard } from "./HeroVerdictCard";
import { track } from "@/lib/analytics";

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
  // prefers-reduced-motion: zero out the y/opacity tweens so hero
  // content lands instantly for users who've requested reduced motion.
  const reduce = useReducedMotion();
  const fadeUp = (delay = 0) =>
    reduce
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] },
        };
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
        {...fadeUp(0)}
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
        {...fadeUp(0.15)}
        className="mt-9 grid grid-cols-12 gap-10 items-end"
      >
        <p className="col-span-12 md:col-span-7 lg:col-span-6 text-[18px] md:text-[20px] text-ink-2 leading-[1.55] max-w-2xl">
          Prophet reads the day before the day reads you. Same setup every
          morning. Same questions asked of every move. A bar most signals
          don&apos;t clear. It&apos;s a workspace, not a feed.
        </p>

        <div className="col-span-12 md:col-span-5 lg:col-span-6 flex flex-col items-start md:items-end gap-3">
          {/* Single primary CTA — waitlist. The slate preview lives
              behind a tertiary text link below. cta_click is wired
              to the analytics dispatch so we can see which path
              visitors take. */}
          <a
            href="#waitlist"
            onClick={() =>
              track({ name: "cta_click", location: "hero", label: "join_waitlist" })
            }
          >
            <Button variant="primary" size="lg">
              Join the waitlist <ArrowRight size={15} />
            </Button>
          </a>
          <Link
            href="/dashboard"
            onClick={() =>
              track({
                name: "cta_click",
                location: "hero",
                label: "read_todays_slate",
              })
            }
            className="text-[13px] text-ink-2 hover:text-ink underline underline-offset-4 decoration-rule hover:decoration-ink-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-soft"
          >
            Read today&apos;s slate →
          </Link>
        </div>
      </motion.div>

      {/* Live verdict card: explicit-state component handles all eight
          render paths (live/pre-open/closed/weekend/holiday/stale/
          error/loading) and reserves its own dimensions to avoid CLS. */}
      <motion.div
        {...fadeUp(0.3)}
        role="region"
        aria-label="Live verdict preview"
        className="mt-16"
      >
        <HeroVerdictCard
          decision={serverDecision}
          quote={serverQuote}
          initialLive={initialLive}
        />
      </motion.div>

      {/* Persistent compliance footnote sits directly beneath the
          live verdict card — required surface, not decorative.
          "Not investment advice" deep-links to /disclosures. */}
      <p className="mt-4 text-[11px] text-ink-3 font-sans leading-relaxed">
        Educational workspace.{" "}
        <Link
          href="/disclosures"
          className="underline underline-offset-2 decoration-rule hover:text-ink hover:decoration-ink-3 transition-colors"
        >
          Not investment advice
        </Link>
        . Markets involve risk.
      </p>

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
