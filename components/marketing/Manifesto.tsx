const tenets = [
  ["I", "Trade structure, not stories."],
  ["II", "Hold a high bar."],
  ["III", "Wait for confirmation."],
  ["IV", "Do not chase."],
  ["V", "Honor invalidation."],
  ["VI", "Know when to stop."],
];

export function Manifesto() {
  return (
    <section
      id="manifesto"
      className="scroll-mt-[88px] border-b border-rule bg-[#FBF8EF]"
    >
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:py-20">
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-ink">
            Risk discipline built in
          </div>
          <h2 className="mt-4 font-serif text-display tracking-tight text-ink">
            Rules that protect the process.
          </h2>
        </div>

        <ol className="mt-12 grid grid-cols-1 divide-y divide-rule-strong border-y border-rule-strong md:grid-cols-3 md:divide-x md:divide-y-0 lg:grid-cols-6">
          {tenets.map(([n, title]) => (
            <li key={n} className="p-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-gold/50 font-serif text-[20px] text-gold-ink">
                {n}
              </div>
              <h3 className="mx-auto mt-4 max-w-[10rem] font-serif text-[18px] leading-tight text-ink">
                {title}
              </h3>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
