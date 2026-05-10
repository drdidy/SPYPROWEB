import Link from "next/link";
import { ArrowRight, BookOpen, ChartNoAxesCombined, Crosshair } from "lucide-react";

const steps = [
  {
    n: "01",
    title: "Read",
    href: "/spy",
    icon: BookOpen,
    body: "Premarket anchors and overnight sessions are reduced to the facts the engine can defend.",
    cta: "See SPY anchors",
  },
  {
    n: "02",
    title: "Project",
    href: "/es",
    icon: ChartNoAxesCombined,
    body: "Rails project forward from structure. The chart is not decoration; it is the decision surface.",
    cta: "See ES channel",
  },
  {
    n: "03",
    title: "Decide",
    href: "/dashboard",
    icon: Crosshair,
    body: "Entries, exits, stops, retests, chase guards, and daily limits stay visible before the click.",
    cta: "View Decision Slate",
  },
];

export function MethodologyTriad() {
  return (
    <section
      id="methodology"
      className="scroll-mt-[88px] border-b border-rule bg-[#FBF8EF]"
    >
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:py-20">
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-ink">
            A repeatable morning workflow
          </div>
          <h2 className="mt-4 font-serif text-display tracking-tight text-ink">
            Read. Project. Decide.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-12 gap-y-10 md:gap-y-0">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article
                key={step.n}
                className="col-span-12 md:col-span-4 md:px-9 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-rule-strong"
              >
                <div className="flex items-start gap-5">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-ink/55 bg-paper text-ink shadow-[0_1px_0_rgba(255,255,255,0.85)_inset]">
                    <Icon size={25} strokeWidth={1.35} />
                  </div>
                  <div className="pt-1">
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-ink">
                      {step.n}
                    </div>
                    <h3 className="font-serif text-[24px] leading-none tracking-tight text-ink">
                      {step.title}
                    </h3>
                  </div>
                </div>
                <p className="mt-5 max-w-[22rem] text-[14px] leading-relaxed text-ink-2">
                  {step.body}
                </p>
                <Link
                  href={step.href}
                  className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-gold-ink transition-colors hover:text-ink"
                >
                  {step.cta} <ArrowRight size={13} />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
