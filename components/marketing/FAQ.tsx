"use client";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "What does Prophet actually do?",
    a: "It reads the day through one fixed structure and asks the same questions of every move. So at any moment you know what's true and what would change it. You don't have to redo the work each morning.",
  },
  {
    q: "Is this a signal service or a workspace?",
    a: "A workspace. Signals are a small piece of it. The real value is the routine. Same read, same lines, same bar, every day. Run it long enough and reading the day stops feeling like work.",
  },
  {
    q: "Which symbols are covered?",
    a: "SPY and SPX, side by side. Each gets its own surface tuned to how it actually trades. We'll add other liquid index instruments when our read on them is as good.",
  },
  {
    q: "How does Prophet decide?",
    a: "One bar pulls several factors into one yes-or-no answer. The bar is high. Most setups don't clear it. The ones that do are rare and easy to read.",
  },
  {
    q: "Will this work in my time zone?",
    a: "The workspace shows your local time. Underneath, the read is anchored to the market's home zone. You don't have to think about it.",
  },
  {
    q: "What's in the closed beta?",
    a: "Today's decision, the levels in play, the wait discipline, the day's read, the signal log, and a daily brief. Replay, options cockpit, and analytics come over the next few weeks.",
  },
  {
    q: "Is it advice?",
    a: "No. It's a structured way to think about price. Trading carries real risk. Every order you place and every position you carry is on you.",
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
            The questions we get most. If yours isn't here, write us.
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
