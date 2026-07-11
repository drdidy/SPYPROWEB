import { type ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPage({ eyebrow, title, lastUpdated, children }: Props) {
  return (
    <article className="bg-[#F5F6F1] text-[#0A0B0C]">
      <header className="grid border-b border-black lg:grid-cols-[0.34fr_0.66fr]">
        <div className="bg-[#3157FF] p-5 text-white md:p-10">
          <p className="text-[9px] font-black uppercase">{eyebrow}</p>
          <p className="mt-20 text-[10px] font-bold uppercase text-white/70">
            Last updated {lastUpdated}
          </p>
        </div>
        <div className="p-5 md:p-10">
          <h1 className="max-w-[900px] text-[46px] font-black leading-[0.88] md:text-[72px] xl:text-[92px]">
            {title}
          </h1>
        </div>
      </header>
      <div className="prose prose-neutral mx-auto max-w-[920px] px-5 py-16 text-[14px] leading-relaxed prose-headings:font-black prose-headings:leading-tight prose-a:font-bold prose-a:text-[#3157FF] prose-a:underline-offset-4 md:px-10 md:py-24">
        {children}
      </div>
    </article>
  );
}
