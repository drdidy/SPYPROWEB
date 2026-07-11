"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import type { BiasState } from "@/lib/types";
import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

const biasTone = {
  BULLISH: "text-bull-ink",
  BEARISH: "text-bear-ink",
  NEUTRAL: "text-ink-2",
} as const;

export function BiasMeter({
  state,
  healthAction,
}: {
  state: BiasState;
  healthAction?: ReactNode;
}) {
  const [selected, setSelected] = useState("UA");
  const lines = [
    { kind: "UA", value: state.ua.value, touched: state.ua.touched, tone: "bull" as const, read: "North-side pressure reference." },
    { kind: "UD", value: state.ud.value, touched: state.ud.touched, tone: "bear" as const, read: "North-side rejection reference." },
    { kind: "LA", value: state.la.value, touched: state.la.touched, tone: "bull" as const, read: "South-side recovery reference." },
    { kind: "LD", value: state.ld.value, touched: state.ld.touched, tone: "bear" as const, read: "South-side pressure reference." },
  ];
  const selectedLine = lines.find((line) => line.kind === selected) ?? lines[0];

  return (
    <Card>
      <CardHeader
        eyebrow="Pre-open bias"
        title={
          <span className={biasTone[state.bias]}>
            {state.bias.charAt(0) + state.bias.slice(1).toLowerCase()}
          </span>
        }
        meta={`Strength ${state.strengthScore}/100`}
        action={
          <div className="flex items-start gap-2">
            {healthAction}
            <div className="flex flex-col items-end gap-1">
              <div className="font-mono text-[10px] text-ink-3 tabular-nums">
                {state.strengthScore.toFixed(0)}
              </div>
              <div className="w-24 h-1 bg-paper-2 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${state.strengthScore}%` }}
                  transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                  className={`h-full rounded-full ${
                    state.bias === "BULLISH"
                      ? "bg-bull"
                      : state.bias === "BEARISH"
                        ? "bg-bear"
                        : "bg-ink"
                  }`}
                />
              </div>
            </div>
          </div>
        }
      />
      <CardBody>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {lines.map((l) => (
            <button
              type="button"
              key={l.kind}
              onClick={() => setSelected(l.kind)}
              aria-pressed={selected === l.kind}
              className={`relative px-3 py-3 rounded-soft border text-left outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-gold/40 ${
                selected === l.kind
                  ? "border-gold bg-gold-tint shadow-[0_14px_28px_-22px_rgba(184,130,31,0.72)]"
                  : l.touched
                    ? l.tone === "bull"
                      ? "border-bull/25 bg-bull-tint"
                      : "border-bear/25 bg-bear-tint"
                    : "border-rule bg-paper"
              }`}
            >
              <div className="eyebrow text-ink-3">{l.kind}</div>
              <div
                className={`font-mono text-base font-semibold mt-1 tabular-nums ${
                  l.tone === "bull" ? "text-bull-ink" : "text-bear-ink"
                }`}
                data-num
              >
                {l.value.toFixed(2)}
              </div>
              {l.touched && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-current animate-breathe" />
              )}
              <div className="text-[9.5px] text-ink-3 mt-0.5 font-mono uppercase tracking-[0.06em]">
                {l.touched ? "touched" : "untouched"}
              </div>
            </button>
          ))}
        </div>
        <div className="mb-4 overflow-hidden rounded-soft border border-rule bg-paper-2/60">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div>
              <div className="eyebrow text-ink-3">Selected reference</div>
              <div className="mt-1 font-serif text-[22px] leading-none text-ink">{selectedLine.kind}</div>
            </div>
            <div className="font-mono text-[13px] font-semibold tabular-nums text-gold-ink">
              {selectedLine.value.toFixed(2)}
            </div>
          </div>
          <div className="h-1 bg-paper">
            <motion.div
              key={selectedLine.kind}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(12, Math.min(100, Math.abs(selectedLine.value) % 100))}%` }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              className={selectedLine.tone === "bull" ? "h-full bg-bull" : "h-full bg-bear"}
            />
          </div>
          <p className="px-3 py-2 text-[12px] leading-relaxed text-ink-3">
            {selectedLine.read} {selectedLine.touched ? "Price has interacted with this area." : "Price has not interacted with this area yet."}
          </p>
        </div>
        <p className="text-sm text-ink-2 leading-relaxed">{state.explanation}</p>
      </CardBody>
    </Card>
  );
}
