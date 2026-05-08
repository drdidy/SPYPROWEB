import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  LineChart,
  Crosshair,
  Layers,
  Eye,
  Radio,
  Target,
  Rewind,
  FileText,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

const surfaces = [
  {
    n: "01",
    icon: LineChart,
    title: "Decision Slate",
    href: "/dashboard",
    body: "The hero surface. Verdict, conviction, signal anatomy, quality breakdown — read in twenty seconds.",
  },
  {
    n: "02",
    icon: Crosshair,
    title: "Trigger Map",
    href: "/trigger-map",
    body: "Every UA / UD / LA / LD line ranked by proximity, armed when within $0.50 of price.",
  },
  {
    n: "03",
    icon: Layers,
    title: "Structure Read",
    href: "/structure",
    body: "Pivot lattice analysis. Which anchors hold, which fan rays dominate, where supply meets demand.",
  },
  {
    n: "04",
    icon: Eye,
    title: "Foresight",
    href: "/foresight",
    body: "Hour-by-hour forward projection of every line, overlaid with the economic calendar.",
  },
  {
    n: "05",
    icon: Radio,
    title: "Signal Tape",
    href: "/signals",
    body: "Every CALL / PUT / NOTE event with grade, score, and explanation as it crosses the wire.",
  },
  {
    n: "06",
    icon: Target,
    title: "Options Cockpit",
    href: "/options",
    body: "Strike picker with max-pain, walls, and dealer-flow alignment scored against bias.",
  },
  {
    n: "07",
    icon: Rewind,
    title: "Replay Lab",
    href: "/replay",
    body: "Step through any historical session with today's rules. The engine re-grades every signal.",
  },
  {
    n: "08",
    icon: FileText,
    title: "Daily Brief",
    href: "/brief",
    body: "An editorial pre-open read. Yesterday's close, overnight, today's lattice — in plain English.",
  },
  {
    n: "09",
    icon: BarChart3,
    title: "Analytics",
    href: "/analytics",
    body: "Win rate by grade, expected R per signal, equity under discipline vs. actual.",
  },
];

export function SurfacesGrid() {
  return (
    <section id="surfaces" className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28">
      <SectionLabel number="03">Nine surfaces</SectionLabel>

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
