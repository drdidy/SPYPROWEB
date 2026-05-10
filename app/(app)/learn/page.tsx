import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-static";

const concepts = [
  {
    title: "Read",
    body: "Every morning starts from what the market just printed. Not a story, two facts. Those two facts set up the rest of the day, and you read them the same way every time.",
  },
  {
    title: "Project",
    body: "From those two facts, lines on the chart. Same lines every day. We ask price to respect them. A touch and reject is a setup. A clean push through is information for tomorrow.",
  },
  {
    title: "Decide",
    body: "Setups go through one bar before they're trades. The bar is high. Most don't clear it. The ones that do are rare and easy to read.",
  },
];

const tenets = [
  "We trade structure, not stories.",
  "We hold a high bar.",
  "We wait for confirmation.",
  "We do not chase.",
  "We honor what the market shows us.",
  "We know when to stop.",
];

export default function Page() {
  return (
    <div className="w-full max-w-[1280px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence - 11"
        title="Learning"
        lede="The methodology, in plain language. Concepts, discipline, and how we read the day."
      />

      <div className="rounded-card border border-[#243138] bg-[#071116] text-paper p-7 md:p-9 overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.14] bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="relative grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-8 items-end">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-soft">Field manual</div>
            <h2 className="mt-3 font-serif text-[44px] leading-none tracking-tight">Structure before conviction.</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-paper/68">
              This tab is the operating doctrine: the trader reads the same evidence, applies the same filters, and lets the tape earn the trade.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["Anchor", "Reject", "Confirm"].map((label, i) => (
              <div key={label} className="min-h-[118px] rounded-soft border border-paper/10 bg-paper/[0.045] p-3">
                <div className="font-serif text-[44px] leading-none text-gold-soft/45">{`0${i + 1}`}</div>
                <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/70">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionLabel number="01">Three concepts</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {concepts.map((c, i) => (
          <Card key={c.title} interactive>
            <CardHeader eyebrow={`0${i + 1}`} title={c.title} />
            <CardBody>
              <div className="h-28 mb-5 rounded-card bg-paper-2/70 border border-rule relative overflow-hidden">
                <div className="absolute inset-x-4 top-1/2 h-px bg-gold/60" />
                <div className="absolute left-8 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-gold" />
                <div className="absolute right-8 top-[38%] h-3 w-3 rounded-full border border-gold" />
              </div>
              <p className="text-[14px] text-ink-2 leading-relaxed">{c.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <SectionLabel number="02">Six rules</SectionLabel>
      <Card>
        <CardBody>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tenets.map((t, i) => (
              <li key={t} className="flex gap-4 rounded-card border border-rule bg-paper-2/50 p-4">
                <span className="font-serif text-[32px] leading-none text-gold-ink/45 w-10">
                  {romanize(i + 1)}
                </span>
                <span className="text-[14px] text-ink-2 leading-relaxed pt-1">{t}</span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

function romanize(n: number): string {
  return ["I", "II", "III", "IV", "V", "VI"][n - 1] ?? `${n}`;
}
