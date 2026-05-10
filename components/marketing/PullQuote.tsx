export function PullQuote() {
  return (
    <section className="bg-[#FBF8EF]">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:py-24">
        <div className="max-w-5xl">
          <div className="mb-7 h-px w-24 bg-gold/70" />
          <p className="font-serif text-[32px] leading-[1.16] tracking-[-0.02em] text-ink md:text-[44px] lg:text-[54px]">
            {"Most signals do not fail because they were "}
            <span className="italic font-light text-gold-ink">wrong</span>
            {". They fail because they got taken "}
            <span className="italic font-light text-gold-ink">wrongly</span>
            {". Too early. Too far from the line. Too little asked of them before the click."}
          </p>
          <p className="mt-7 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            SPY Prophet is what asks the questions every time: where is the
            structure, did price actually reject it, where is the exit, where
            is the invalidation, and is today still worth trading?
          </p>
        </div>
      </div>
    </section>
  );
}
