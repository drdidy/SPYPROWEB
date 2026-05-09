// Shared shell for /terms /privacy /disclosures /risk and the
// company info pages. Centralizes the page chrome (title +
// last-updated stamp + max-width prose container) so the legal
// surfaces stay visually consistent and copy stays the only thing
// that varies.

import { type ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  /** ISO date — rendered as "Last updated · YYYY-MM-DD". */
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPage({ eyebrow, title, lastUpdated, children }: Props) {
  return (
    <article className="max-w-[820px] mx-auto px-7 py-20 lg:py-28">
      <header className="mb-12">
        <span className="font-mono text-[10px] text-ink-3 tracking-[0.22em] uppercase">
          {eyebrow}
        </span>
        <h1 className="mt-4 font-serif text-display tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-3 font-mono text-[11px] text-ink-3 tabular-nums">
          Last updated · {lastUpdated}
        </p>
      </header>
      <div className="prose prose-sm max-w-none text-ink-2 leading-relaxed [&_h2]:font-serif [&_h2]:text-headline [&_h2]:text-ink [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:font-mono [&_h3]:text-[12px] [&_h3]:tracking-[0.18em] [&_h3]:uppercase [&_h3]:text-ink-3 [&_h3]:mt-8 [&_h3]:mb-3 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1.5 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </article>
  );
}
