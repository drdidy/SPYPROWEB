import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusPill } from "@/components/ui/StatusPill";

const moments = [
  {
    time: "Pre-open",
    headline: "The brief publishes",
    body: "Last session's close, overnight action, today's read, today's lean — all in plain English. No charts required to understand it.",
  },
  {
    time: "Open",
    headline: "The day's bias settles",
    body: "The structural read resolves to a direction: lean bullish, lean bearish, or neutral, with a strength score that says how strongly to trust it.",
  },
  {
    time: "Mid-morning",
    headline: "The first signal forms",
    body: "Price tests one of the day's lines. The workspace decides whether the test cleared the bar or not, and shows the reasoning either way.",
  },
  {
    time: "Mid-day",
    headline: "Discipline holds",
    body: "Several gates check the setup before any order is placed. Most days, at least one gate waits — and so do we. Patience is structural, not sentimental.",
  },
  {
    time: "Afternoon",
    headline: "Decisions accumulate",
    body: "Each signal — taken or skipped — becomes part of the record. By close, the day has written itself.",
  },
  {
    time: "Close",
    headline: "Tomorrow drafts itself",
    body: "Every decision logged with its outcome and its reasoning. The next morning's brief begins from this — no blank page.",
  },
];

export function MorningSection() {
  return (
    <section className="border-t border-rule bg-paper">
      <div className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
        <SectionLabel number="02">A typical morning</SectionLabel>

        <div className="mt-8 grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-5">
            <h2 className="font-serif text-display tracking-tight text-ink">
              The day, narrated.
            </h2>
            <p className="mt-4 text-[16px] text-ink-2 leading-relaxed">
              Prophet doesn't replace your judgment — it gives your judgment a
              better stage. From pre-open through the closing bell, the
              workspace tells you what's true now and what would have to change
              for that to flip.
            </p>

            <div className="mt-10 surface rounded-card p-6 relative overflow-hidden">
              {/* Sample card — shape only. Numbers illustrative; mechanics not
                  disclosed publicly. */}
              <div className="flex items-center gap-3 mb-4">
                <span className="w-9 h-9 rounded-soft bg-paper-2 grid place-items-center font-serif text-[16px] text-ink-3 italic">
                  ·
                </span>
                <div>
                  <div className="eyebrow text-ink-3">A typical setup</div>
                  <div className="font-serif text-title text-ink">
                    Pending decision
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="Entry" value="—" />
                <Stat label="Stop" value="—" tone="bear" />
                <Stat label="Target" value="—" tone="bull" />
              </div>
              <div className="hr-rule mb-3" />
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink-3">R : R</span>
                <span className="font-mono text-ink-3 font-semibold">1 : favorable</span>
              </div>
              <div className="flex items-center justify-between text-[12px] mt-1.5">
                <span className="text-ink-3">Confidence</span>
                <span className="font-mono text-ink-3 font-semibold">high · structural</span>
              </div>
              <div className="hr-rule my-3" />
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-ink-3">Final decision</span>
                <StatusPill variant="watching" pulse>
                  WAIT FOR CONFIRMATION
                </StatusPill>
              </div>
              {/* soft veil so the public sees the shape, not the numbers */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-paper/0 via-paper/10 to-paper/30" />
            </div>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <ol className="relative">
              <span className="absolute left-[68px] top-2 bottom-2 w-px bg-rule" />
              {moments.map((m) => (
                <li key={m.time} className="grid grid-cols-12 gap-5 py-5 first:pt-0 last:pb-0">
                  <div className="col-span-2 pt-1.5">
                    <span className="font-mono text-[12px] text-ink font-semibold uppercase tracking-[0.10em]">
                      {m.time}
                    </span>
                  </div>
                  <div className="col-span-1 flex flex-col items-center pt-3.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-paper border-[1.5px] border-gold shadow-rule relative z-10" />
                  </div>
                  <div className="col-span-9">
                    <h3 className="font-serif text-title text-ink mb-1">
                      {m.headline}
                    </h3>
                    <p className="text-[14px] text-ink-2 leading-relaxed">
                      {m.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
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
    <div className="px-2 py-1.5 rounded-soft bg-paper-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className={`font-mono text-sm font-semibold tabular-nums mt-0.5 ${cls}`} data-num>
        {value}
      </div>
    </div>
  );
}
