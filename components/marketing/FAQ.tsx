"use client";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FAQS as faqs } from "@/content/faqs";
import { track } from "@/lib/analytics";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  // prefers-reduced-motion: collapse the height-tween into a snap so
  // vestibular-sensitive users don't get a sliding panel on every click.
  const prefersReducedMotion = useReducedMotion();
  const motionTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] };

  return (
    <section id="faq" className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28 scroll-mt-[88px]">
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
            {faqs.map((f, i) => {
              const isOpen = open === i;
              const buttonId = `faq-q-${i}`;
              const panelId = `faq-a-${i}`;
              return (
                <li key={f.q} className="border-b border-rule last:border-b-0">
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => {
                      const willOpen = !isOpen;
                      setOpen(willOpen ? i : null);
                      if (willOpen) track({ name: "faq_open", question: f.q });
                    }}
                    className="w-full flex items-start gap-5 py-5 text-left group outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-soft -mx-2 px-2"
                  >
                    <span className="font-mono text-[10px] text-ink-3 tabular-nums tracking-[0.18em] uppercase pt-1.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 font-serif text-title text-ink leading-snug group-hover:text-gold-ink transition-colors">
                      {f.q}
                    </span>
                    <span
                      aria-hidden="true"
                      className="pt-1 text-ink-3 group-hover:text-ink transition-colors"
                    >
                      {isOpen ? <Minus size={16} /> : <Plus size={16} />}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={panelId}
                        role="region"
                        aria-labelledby={buttonId}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={motionTransition}
                        className="overflow-hidden"
                      >
                        <div className="pb-6 pl-12 pr-12 text-[15px] text-ink-2 leading-relaxed max-w-3xl">
                          {f.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
