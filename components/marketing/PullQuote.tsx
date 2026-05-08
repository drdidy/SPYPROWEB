export function PullQuote() {
  return (
    <section className="border-y border-rule bg-paper">
      <div className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
        <div className="max-w-4xl">
          <div className="eyebrow text-ink-3 mb-6">The premise</div>
          <p className="font-serif text-[34px] md:text-[44px] lg:text-[52px] leading-[1.15] tracking-[-0.02em] text-ink">
            Most signals fail not because they were{" "}
            <span className="italic text-ink-3">wrong</span>, but because they
            were taken{" "}
            <span className="italic text-ink-3">wrongly</span> — too early, too
            far from the line, with too little asked of them. Prophet is the
            workspace that asks the questions for you.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <span className="h-px w-10 bg-rule-strong" />
            <span className="font-mono text-[10px] text-ink-3 tracking-[0.22em] uppercase">
              The Prophet methodology
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
