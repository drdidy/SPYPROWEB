import { type ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPage({ eyebrow, title, lastUpdated, children }: Props) {
  return (
    <article className="workspace-surface">
      <header className="workspace-intro grid lg:grid-cols-[220px_1fr]">
        <div className="relative z-10 flex flex-col justify-between border-b border-white/10 bg-white/[0.025] p-5 text-white md:p-8 lg:border-b-0 lg:border-r">
          <p className="microlabel text-mineral">{eyebrow}</p>
          <p className="microlabel mt-16 text-white/45">
            Updated {lastUpdated}
          </p>
        </div>
        <div className="relative z-10 p-5 py-10 md:p-10 md:py-12">
          <h1 className="workspace-title">
            {title}
          </h1>
        </div>
      </header>
      <div className="prose prose-neutral mx-auto max-w-[900px] px-5 py-14 text-[15px] leading-relaxed prose-headings:font-black prose-headings:leading-tight prose-a:font-bold prose-a:text-context-ink prose-a:underline-offset-4 md:px-10 md:py-20">
        {children}
      </div>
    </article>
  );
}
