import { ArrowRight, Download } from "lucide-react";
import Link from "next/link";

import { briefGlossary } from "@/content/brief/glossary";
import { learningResources } from "@/content/learning/resources";

export const dynamic = "force-static";

export default function Page() {
  return (
    <div>
      <header className="grid border-b border-carbon lg:grid-cols-[0.38fr_0.62fr]">
        <div className="flex flex-col justify-between bg-lime p-5 md:p-10">
          <p className="microlabel">Prophet field manual</p>
          <p className="mt-20 max-w-[320px] text-[14px] font-bold leading-relaxed">
            Learn slowly here so you can act clearly when the market moves
            quickly.
          </p>
        </div>
        <div className="p-5 py-10 md:p-10">
          <h1 className="max-w-[860px] text-[12vw] font-black leading-[0.86] tracking-[-0.01em] sm:text-[46px] md:text-[68px] xl:text-[90px]">
            Learn the language of the decision.
          </h1>
          <p className="mt-7 max-w-[650px] text-[15px] leading-relaxed text-carbon/60">
            Market structure, risk, options, and review discipline. Proprietary
            engine logic remains private.
          </p>
        </div>
      </header>

      <section className="border-b border-carbon">
        <div className="border-b border-carbon px-5 py-5 md:px-10">
          <p className="microlabel text-cobalt">Downloadable guides</p>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {learningResources.map((resource, index) => (
            <article
              key={resource.slug}
              className={`flex min-h-[380px] flex-col p-5 transition-colors hover:bg-white md:p-8 ${index > 0 ? "border-t border-carbon/15 md:border-l md:border-t-0" : ""}`}
            >
              <p className="num text-[11px] font-bold text-cobalt">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-10 text-[26px] font-black leading-[1.02] md:text-[30px]">
                {resource.title}
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-carbon/60">
                {resource.summary}
              </p>
              <ul className="mt-6 space-y-2.5">
                {resource.outcomes.slice(0, 3).map((outcome) => (
                  <li
                    key={outcome}
                    className="flex gap-2.5 text-[12px] leading-relaxed"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-cobalt"
                      aria-hidden="true"
                    />
                    {outcome}
                  </li>
                ))}
              </ul>
              <div className="flex-1" />
              <a
                href={`/api/learning/pdf/${resource.slug}`}
                download
                className="mt-7 inline-flex h-11 w-fit items-center gap-2 bg-carbon px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-cobalt"
              >
                <Download size={13} />
                Download PDF
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="grid lg:grid-cols-[0.45fr_0.55fr]">
        <div className="bg-coral p-5 py-12 md:p-10">
          <p className="microlabel">Five-day start</p>
          <ol className="mt-10 border-t border-carbon">
            {[
              "Sessions and symbols",
              "Candles and rejection",
              "Invalidation and sizing",
              "Calls, puts, delta, theta",
              "One complete replay",
            ].map((lesson, index) => (
              <li
                key={lesson}
                className="flex items-center gap-5 border-b border-carbon py-4"
              >
                <span className="num text-[11px] font-bold">
                  0{index + 1}
                </span>
                <span className="text-[13px] font-black">{lesson}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/replay"
            className="group mt-8 inline-flex h-11 items-center gap-2 bg-carbon px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-cobalt"
          >
            Practice in Replay
            <ArrowRight
              size={13}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <div className="p-5 py-12 md:p-10">
          <p className="microlabel text-cobalt">Plain-language glossary</p>
          <div className="mt-8 border-t border-carbon">
            {Object.values(briefGlossary).map((item, index) => (
              <details
                key={item.term}
                className="group border-b border-carbon/20 py-4"
                open={index < 2}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-black">
                  {item.term}
                  <span
                    className="num text-[13px] text-carbon/40 group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[700px] text-[13px] leading-relaxed text-carbon/60">
                  {item.definition}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
