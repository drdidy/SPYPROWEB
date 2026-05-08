"use client";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { Sparkles, ArrowRight } from "lucide-react";

export function StubPage({
  number,
  eyebrow,
  title,
  lede,
  bullets,
}: {
  number: string;
  eyebrow: string;
  title: string;
  lede: string;
  bullets: string[];
}) {
  return (
    <div className="max-w-[1100px] mx-auto pb-16 space-y-8">
      <header className="pt-2">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
            {eyebrow}
          </span>
          <span className="h-px w-10 bg-rule-strong" />
          <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
            {number}
          </span>
        </div>
        <h1 className="text-headline font-serif text-ink tracking-tight">{title}</h1>
        <p className="mt-3 text-base text-ink-2 max-w-2xl leading-relaxed">{lede}</p>
      </header>

      <SectionLabel number="01">What this surface will show</SectionLabel>
      <Card className="p-7">
        <ul className="space-y-3.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-4 text-[15px] text-ink-2 leading-relaxed">
              <span className="font-mono text-[10px] text-ink-4 mt-2 tabular-nums shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1">{b}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card tone="gold" className="p-7 flex items-start gap-5">
        <div className="w-10 h-10 rounded-soft bg-paper grid place-items-center text-gold-ink shadow-rule shrink-0">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <div className="eyebrow text-gold-ink mb-1">In flight</div>
          <p className="text-[15px] text-ink leading-relaxed">
            This module is wired to the engine layer; visual surface ships in the next iteration.
            For now, the Decision Slate carries the signal you need.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => (window.location.href = "/dashboard")}
        >
          Decision Slate <ArrowRight size={13} />
        </Button>
      </Card>
    </div>
  );
}
