import { Bell, CircleDollarSign, MapPinned, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: MapPinned,
    title: "Find the line",
    detail: "Start with the Control Line and the nearest gate. Everything else is secondary.",
  },
  {
    icon: ShieldCheck,
    title: "Wait for the close",
    detail: "A touch is not enough. The completed candle decides whether the setup is real.",
  },
  {
    icon: CircleDollarSign,
    title: "Check the contract",
    detail: "Use the Options Lens for estimated debit at entry and projected value at target.",
  },
  {
    icon: Bell,
    title: "Let alerts work",
    detail: "Watch alerts keep you calm. Entry alerts tell you when the setup has earned attention.",
  },
];

export function SessionActionGuide({ className = "" }: { className?: string }) {
  return (
    <section className={className}>
      <div className="grid md:grid-cols-4 md:divide-x md:divide-rule">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="border-b border-rule px-3 py-4 last:border-b-0 md:border-b-0 md:px-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-[6px] border border-teal/25 bg-teal/10 text-teal">
                  <Icon size={15} aria-hidden />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                  Step {index + 1}
                </span>
              </div>
              <div className="mt-3 text-[15px] font-semibold leading-none text-ink">{step.title}</div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{step.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
