export function PullQuote() {
  return (
    <section className="border-y border-rule bg-paper">
      <div className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
        <div className="max-w-4xl">
          <div className="eyebrow text-ink-3 mb-6">The premise</div>
          <p className="font-serif text-[34px] md:text-[44px] lg:text-[52px] leading-[1.15] tracking-[-0.02em] text-ink">
            Most signals don&apos;t fail because they were{" "}
            <span className="italic text-ink-3">wrong</span>. They fail because
            they got taken{" "}
            <span className="italic text-ink-3">wrongly</span>. Too early. Too
            far from the line. Too little asked of them before the click.
            Prophet is what asks the questions, every time, before you do.
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
