import { CheckCircle2, CircleDashed, DoorClosed, Shield } from "lucide-react";

const moments = [
  {
    time: "Pre-open",
    headline: "The brief publishes",
    body: "The engine reads the overnight and premarket structure before the session becomes emotional.",
  },
  {
    time: "Open",
    headline: "Rails become live",
    body: "Projected levels are evaluated against live bars. If price is not at the rail, the slate waits.",
  },
  {
    time: "Signal",
    headline: "Confirmation comes first",
    body: "A touch is not enough. The candle has to close correctly before the next entry can exist.",
  },
  {
    time: "Manage",
    headline: "Stops and exits stay visible",
    body: "The workspace keeps the rejected line, stop, target, retest, and chase warning in the same decision frame.",
  },
  {
    time: "Close",
    headline: "The day becomes replay data",
    body: "Replay logic records what actually happened so the next review starts from evidence, not memory.",
  },
];

const guardrails = [
  { icon: CircleDashed, title: "No chase", body: "If the move is already gone, the slate says so." },
  { icon: CheckCircle2, title: "Confirmation", body: "Entries wait for the next-bar pattern." },
  { icon: DoorClosed, title: "Invalidation", body: "Every trade has a structural line that can fail." },
  { icon: Shield, title: "Daily stop", body: "The session can stand down before the trader does." },
];

export function MorningSection() {
  return (
    <section id="workflow" className="scroll-mt-[88px] border-y border-rule bg-paper">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-12 px-5 py-20 sm:px-7 lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-ink">
            The morning operating system
          </div>
          <h2 className="mt-4 font-serif text-display tracking-tight text-ink">
            Built around the moments where traders usually improvise.
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-2">
            The app is not trying to make the market louder. It narrows the
            day into a few questions that can be answered from actual bars.
          </p>
        </div>

        <div className="lg:col-span-8">
          <ol className="relative">
            <span className="absolute left-[5.4rem] top-3 hidden h-[calc(100%-24px)] w-px bg-rule-strong sm:block" />
            {moments.map((moment, index) => (
              <li
                key={moment.time}
                className="grid grid-cols-12 gap-5 border-b border-rule py-6 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="col-span-12 sm:col-span-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold-ink">
                    {moment.time}
                  </span>
                </div>
                <div className="hidden sm:col-span-1 sm:flex sm:justify-center">
                  <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-gold/55 bg-paper font-mono text-[10px] text-gold-ink">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="col-span-12 sm:col-span-9">
                  <h3 className="font-serif text-[25px] leading-tight tracking-tight text-ink">
                    {moment.headline}
                  </h3>
                  <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
                    {moment.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="lg:col-span-12">
          <div className="grid grid-cols-1 divide-y divide-rule-strong border-y border-rule-strong md:grid-cols-4 md:divide-x md:divide-y-0">
            {guardrails.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-4 px-5 py-6">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/45 text-gold-ink">
                    <Icon size={19} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-serif text-[18px] leading-tight text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                      {item.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
