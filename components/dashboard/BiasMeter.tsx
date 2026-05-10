"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import type { BiasState } from "@/lib/types";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

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
  const lines = [
    { kind: "UA", value: state.ua.value, touched: state.ua.touched, tone: "bull" as const },
    { kind: "UD", value: state.ud.value, touched: state.ud.touched, tone: "bear" as const },
    { kind: "LA", value: state.la.value, touched: state.la.touched, tone: "bull" as const },
    { kind: "LD", value: state.ld.value, touched: state.ld.touched, tone: "bear" as const },
  ];

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
            <div
              key={l.kind}
              className={`relative px-3 py-3 rounded-soft border border-rule ${
                l.touched ? (l.tone === "bull" ? "bg-bull-tint" : "bg-bear-tint") : "bg-paper"
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
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-2 leading-relaxed">{state.explanation}</p>
      </CardBody>
    </Card>
  );
}
