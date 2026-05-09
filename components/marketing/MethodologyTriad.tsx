import { SectionLabel } from "@/components/ui/SectionLabel";

const COL = {
  bull: "#0E7C50",
  bear: "#B5301E",
  gold: "#B8821F",
  rule: "#E8E2D2",
  ink2: "#3D424D",
  ink3: "#6B7280",
  paper2: "#F4EFE3",
};

// ---------------------------------------------------------------------------
// Marketing illustrations: shape only. No numeric labels, no line names,
// no thresholds (these used to expose the engine's parameters in plain text).
// ---------------------------------------------------------------------------

function ReadVis() {
  return (
    <svg viewBox="0 0 200 120" className="w-full">
      <defs>
        <pattern id="read-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill={COL.rule} />
        </pattern>
      </defs>
      <rect width="200" height="120" fill="url(#read-dots)" />
      {/* candle column, abstract, no labels */}
      <line x1="48" y1="22" x2="48" y2="92" stroke={COL.ink2} strokeWidth="0.6" />
      <rect x="44" y="32" width="8" height="28" fill={COL.bull} />
      <line x1="80" y1="36" x2="80" y2="104" stroke={COL.ink2} strokeWidth="0.6" />
      <rect x="76" y="46" width="8" height="32" fill={COL.bear} />
      <line x1="112" y1="14" x2="112" y2="84" stroke={COL.ink2} strokeWidth="0.6" />
      <rect x="108" y="20" width="8" height="22" fill={COL.bear} />
      <line x1="144" y1="42" x2="144" y2="98" stroke={COL.ink2} strokeWidth="0.6" />
      <rect x="140" y="62" width="8" height="22" fill={COL.bull} />
      {/* two emphasis points: the day's facts, unlabeled */}
      <circle cx="48" cy="22" r="4" fill="#fff" stroke={COL.gold} strokeWidth="1.5" />
      <circle cx="48" cy="22" r="1.5" fill={COL.gold} />
      <circle cx="80" cy="104" r="4" fill="#fff" stroke={COL.gold} strokeWidth="1.5" />
      <circle cx="80" cy="104" r="1.5" fill={COL.gold} />
    </svg>
  );
}

function ProjectVis() {
  return (
    <svg viewBox="0 0 200 120" className="w-full">
      <rect width="200" height="120" fill={COL.paper2} opacity={0.4} />
      <circle cx="36" cy="92" r="4" fill="#fff" stroke={COL.gold} strokeWidth="1.5" />
      <circle cx="36" cy="92" r="1.5" fill={COL.gold} />
      {/* fan rays, direction implied, no slope label */}
      <line x1="36" y1="92" x2="190" y2="20" stroke={COL.bull} strokeWidth="1.4" />
      <line x1="36" y1="92" x2="190" y2="40" stroke={COL.bull} strokeWidth="1" strokeDasharray="3 4" opacity={0.55} />
      <line x1="36" y1="92" x2="190" y2="60" stroke={COL.bull} strokeWidth="1" strokeDasharray="3 4" opacity={0.4} />
      <line x1="36" y1="92" x2="190" y2="80" stroke={COL.bull} strokeWidth="1" strokeDasharray="3 4" opacity={0.3} />
    </svg>
  );
}

function DecideVis() {
  // Abstract gradient bar: a "high bar" without naming the threshold ladder.
  const bars = [
    { h: 22, fill: COL.ink3 },
    { h: 38, fill: "#A04020" },
    { h: 56, fill: "#C76A1E" },
    { h: 74, fill: COL.gold },
    { h: 90, fill: COL.bull },
    { h: 100, fill: COL.bull },
  ];
  return (
    <svg viewBox="0 0 200 120" className="w-full">
      <line x1="14" y1="100" x2="190" y2="100" stroke={COL.rule} strokeWidth={1} />
      {bars.map((b, i) => {
        const x = 22 + i * 28;
        return (
          <rect
            key={i}
            x={x}
            y={100 - b.h}
            width="20"
            height={b.h}
            fill={b.fill}
            opacity={0.85}
            rx="2"
          />
        );
      })}
      {/* the bar: a horizontal line that says where "yes" begins */}
      <line
        x1={14}
        y1={36}
        x2={190}
        y2={36}
        stroke={COL.ink2}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
    </svg>
  );
}

const cards = [
  {
    n: "01",
    title: "Read",
    blurb:
      "Every morning starts from what the market just printed. Not a story. Just two facts. Those two facts set up the rest of the day, and you read them the same way every time.",
    keyTerms: ["Same read every morning", "No interpretation required", "Source attribution"],
    Vis: ReadVis,
  },
  {
    n: "02",
    title: "Project",
    blurb:
      "From those two facts, lines on the chart. Same lines every day. We ask price to respect them. A touch and reject is a setup. A clean push through is information for tomorrow.",
    keyTerms: ["Forward projection", "Lines, not patterns", "Touch · reject · close"],
    Vis: ProjectVis,
  },
  {
    n: "03",
    title: "Decide",
    blurb:
      "Setups go through one bar before they're trades. The bar is high. Most don't clear it. The ones that do are rare and easy to read. The ones that don't tell us something we save for later.",
    keyTerms: ["A high bar", "Same gates every day", "Take · selective · stand down"],
    Vis: DecideVis,
  },
];

export function MethodologyTriad() {
  return (
    <section id="methodology" className="max-w-[1240px] mx-auto px-7 py-20 lg:py-28 scroll-mt-[88px]">
      <SectionLabel number="01">The discipline</SectionLabel>
      <div className="mt-8 max-w-3xl">
        <h2 className="font-serif text-display tracking-tight text-ink">
          Three steps.{" "}
          <span className="text-ink-3 italic font-light">
            The same three, every day.
          </span>
        </h2>
        <p className="mt-4 text-[16px] text-ink-2 leading-relaxed max-w-2xl">
          Prophet doesn&apos;t promise new signals. It promises the same routine
          every morning. Same read, same lines, same bar. Run it long enough
          and reading the day stops feeling like work.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-12 gap-7">
        {cards.map((c) => (
          <div key={c.n} className="col-span-12 md:col-span-4">
            <article className="surface rounded-card h-full overflow-hidden">
              <div className="aspect-[5/3] bg-paper-2 border-b border-rule">
                <c.Vis />
              </div>
              <div className="p-6">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
                    {c.n}
                  </span>
                  <span className="eyebrow text-ink-3">Step</span>
                </div>
                <h3 className="font-serif text-headline tracking-tight text-ink mb-3">
                  {c.title}
                </h3>
                <p className="text-[14px] text-ink-2 leading-relaxed mb-5">
                  {c.blurb}
                </p>
                <div className="hr-rule mb-3" />
                <ul className="space-y-1.5">
                  {c.keyTerms.map((t) => (
                    <li
                      key={t}
                      className="flex items-baseline justify-between leader text-[12px]"
                    >
                      <span className="text-ink-3">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
