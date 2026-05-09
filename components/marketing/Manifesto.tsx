import { SectionLabel } from "@/components/ui/SectionLabel";

const tenets = [
  {
    n: "I",
    title: "We trade structure, not stories.",
    body: "Patterns are stories we tell ourselves. Structure is what the market just printed. The workspace shows the latter and shuts up about the former.",
  },
  {
    n: "II",
    title: "We hold a high bar.",
    body: "Most setups don't clear it. That's the point. A high bar means most of the day is spent waiting, and waiting, done right, is the trade.",
  },
  {
    n: "III",
    title: "We wait for confirmation.",
    body: "Mid-candle action lies. Closes don't. Waiting for the candle to finish is the cheapest discipline a trader will ever buy.",
  },
  {
    n: "IV",
    title: "We do not chase.",
    body: "If price already moved past the entry, the setup we read no longer exists. Take a different one later if it shows up, on its own merits, against its own bar.",
  },
  {
    n: "V",
    title: "We honor what the market shows us.",
    body: "When the market invalidates the read, we exit. We don't average into a thesis the tape's already telling us is wrong.",
  },
  {
    n: "VI",
    title: "We know when to stop.",
    body: "Past a few decisions a session, edge falls off and emotion compounds. Tomorrow always exists. The discipline is to leave quietly.",
  },
];

export function Manifesto() {
  return (
    <section
      id="manifesto"
      className="border-y border-rule bg-paper-2/40 scroll-mt-[88px]"
    >
      <div className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
        <SectionLabel number="04">Discipline</SectionLabel>

        <div className="mt-8 max-w-3xl">
          <h2 className="font-serif text-display tracking-tight text-ink">
            Six rules.{" "}
            <span className="text-ink-3 italic font-light">
              Not negotiable.
            </span>
          </h2>
          <p className="mt-4 text-[16px] text-ink-2 leading-relaxed">
            The engine makes signals. The discipline makes traders. Each of
            these six is built into the workspace as a gate you can see, not a
            rule you have to remember.
          </p>
        </div>

        <ol className="mt-14 grid grid-cols-12 gap-6">
          {tenets.map((t) => (
            <li
              key={t.n}
              className="col-span-12 md:col-span-6 lg:col-span-4 surface rounded-card p-7"
            >
              <div className="flex items-start gap-4">
                <span className="font-serif text-[40px] leading-none text-gold-ink/40 -mt-1">
                  {t.n}
                </span>
                <div className="flex-1">
                  <h3 className="font-serif text-[19px] tracking-tight text-ink leading-snug mb-2">
                    {t.title}
                  </h3>
                  <p className="text-[13.5px] text-ink-2 leading-relaxed">{t.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
