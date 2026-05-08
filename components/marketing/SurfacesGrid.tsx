import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  LineChart,
  Columns3,
  Layers,
  Eye,
  Target,
  FileText,
} from "lucide-react";
import Link from "next/link";

const surfaces = [
  {
    n: "01",
    icon: LineChart,
    title: "Decision Slate",
    href: "/dashboard",
    body: "The main read. Verdict, conviction, why it's that way. You can be up to speed in under a minute.",
  },
  {
    n: "02",
    icon: Columns3,
    title: "SPX Channel",
    href: "/spx",
    body: "Overnight pivots become the day's channel. Sydney and Tokyo set direction; the slope carries through.",
  },
  {
    n: "03",
    icon: Layers,
    title: "Structure Read",
    href: "/structure",
    body: "What's holding, what's not, where buyers and sellers are showing up.",
  },
  {
    n: "04",
    icon: Eye,
    title: "Foresight",
    href: "/foresight",
    body: "Where every line will sit hour by hour, with the economic calendar laid over the top.",
  },
  {
    n: "05",
    icon: Target,
    title: "Options Cockpit",
    href: "/options",
    body: "A strike picker that knows where the pain points are and whether dealer flow is leaning with you or against you.",
  },
  {
    n: "06",
    icon: FileText,
    title: "Daily Brief",
    href: "/brief",
    body: "A pre-open read in plain English. Yesterday's close, what happened overnight, what the day looks like.",
  },
];

export function SurfacesGrid() {
  return (
    <section id="surfaces" className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
      <SectionLabel number="03">Six surfaces</SectionLabel>

      <div className="mt-8 grid grid-cols-12 gap-10 mb-12">
        <div className="col-span-12 lg:col-span-7">
          <h2 className="font-serif text-display tracking-tight text-ink">
            One workspace.{" "}
            <span className="text-ink-3 italic font-light">
              Every angle of the day.
            </span>
          </h2>
        </div>
        <p className="col-span-12 lg:col-span-5 text-[16px] text-ink-2 leading-relaxed self-end">
          Each surface answers one question well. The surfaces share the same
          anchors, so they never disagree with each other; they only emphasize
          different parts of the same read.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {surfaces.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.n}
              href={s.href}
              className="col-span-12 md:col-span-6 lg:col-span-4 group"
            >
              <article className="surface rounded-card p-6 h-full transition-all duration-200 ease-swift group-hover:shadow-card-hover">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-9 h-9 rounded-soft bg-paper-2 grid place-items-center text-ink-2 shadow-rule">
                    <Icon size={15} />
                  </div>
                  <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
                    {s.n}
                  </span>
                </div>
                <h3 className="font-serif text-title text-ink mb-2">{s.title}</h3>
                <p className="text-[13.5px] text-ink-2 leading-relaxed">{s.body}</p>
                <div className="mt-5 hr-rule" />
                <div className="mt-3 flex items-center justify-between text-[11px] text-ink-3 font-mono">
                  <span>Open surface</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-gold">
                    →
                  </span>
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
