"use client";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "What does Prophet actually do?",
    a: "Prophet reads the day through a fixed structure and asks the same questions of every move. The result is a workspace where the trader knows, at any moment, what is true now and what would have to change for that to flip — without re-deriving the read each morning.",
  },
  {
    q: "Is this a signal service or a workspace?",
    a: "A workspace. Signals are a small part of it. The deeper value is the routine: the same read, the same projection, the same bar — held every day until reading the day stops feeling like work.",
  },
  {
    q: "Which symbols are covered?",
    a: "SPY and SPX, treated as peers. Each gets its own surface tuned to how it actually trades. The lattice extends to other liquid index instruments cleanly; we'll add them as the workspace's voice on each one becomes unimpeachable.",
  },
  {
    q: "How does Prophet decide?",
    a: "Through a single bar that integrates several factors into one yes-or-no answer. The bar is high — most setups don't clear it. What clears it is rare and well-understood; what doesn't is information saved for later.",
  },
  {
    q: "Will this work in my time zone?",
    a: "The workspace renders in your local time. The structural read itself is anchored to the cash market's home zone; you don't have to think about the conversion.",
  },
  {
    q: "What's in the closed beta?",
    a: "The decision-of-the-day surface, the levels in play, the wait discipline, the day's read, signal log, and a daily brief. Replay, options cockpit, and analytics arrive over the following weeks.",
  },
  {
    q: "Is it advice?",
    a: "No. It is a structured way to think about price. Trading is risky; you are responsible for every order you place and every position you carry.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
      <SectionLabel number="05">Frequently asked</SectionLabel>

      <div className="mt-8 grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-4">
          <h2 className="font-serif text-display tracking-tight text-ink leading-tight">
            Honest answers.
          </h2>
          <p className="mt-4 text-[15px] text-ink-2 leading-relaxed max-w-sm">
            We've collected the questions we get most often.
            If something here doesn't satisfy, write to us.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <ul className="border-y border-rule">
            {faqs.map((f, i) => (
              <li key={f.q} className="border-b border-rule last:border-b-0">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-start gap-5 py-5 text-left group"
                >
                  <span className="font-mono text-[10px] text-ink-3 tabular-nums tracking-[0.18em] uppercase pt-1.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-serif text-title text-ink leading-snug group-hover:text-gold-ink transition-colors">
                    {f.q}
                  </span>
                  <span className="pt-1 text-ink-3 group-hover:text-ink transition-colors">
                    {open === i ? <Minus size={16} /> : <Plus size={16} />}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="pb-6 pl-12 pr-12 text-[15px] text-ink-2 leading-relaxed max-w-3xl">
                        {f.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
