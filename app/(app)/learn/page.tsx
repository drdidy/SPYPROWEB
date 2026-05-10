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
    <div className="w-full max-w-[1120px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence · 11"
        title="Learning"
        lede="The methodology, in plain language. Concepts, discipline, and how we read the day."
      />

      <SectionLabel number="01">Three concepts</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {concepts.map((c, i) => (
          <Card key={c.title}>
            <CardHeader
              eyebrow={`0${i + 1}`}
              title={c.title}
            />
            <CardBody>
              <p className="text-[14px] text-ink-2 leading-relaxed">{c.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <SectionLabel number="02">Six rules</SectionLabel>
      <Card>
        <CardBody>
          <ol className="space-y-3">
            {tenets.map((t, i) => (
              <li key={t} className="flex gap-4">
                <span className="font-serif text-[28px] leading-none text-gold-ink/40 -mt-1 w-6">
                  {romanize(i + 1)}
                </span>
                <span className="text-[14px] text-ink-2 leading-relaxed pt-1">
                  {t}
                </span>
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
