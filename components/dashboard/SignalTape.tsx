"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Grade } from "@/lib/types";

type Tick = {
  time: string;
  type: "CALL" | "PUT" | "NOTE";
  line?: string;
  grade?: Grade;
  body: string;
  spark?: number[];
};

const ticks: Tick[] = [
  {
    time: "9:38",
    type: "CALL",
    line: "UA-1",
    grade: "B",
    body: "Hourly close 0.04 above UA-1, wick reject 0.62. Pending confirmation.",
    spark: [581.2, 582.4, 582.9, 583.1, 583.42, 583.4, 583.55],
  },
  {
    time: "9:32",
    type: "NOTE",
    body: "VIX cross under 14.50 — risk-on regime confirmed.",
    spark: [15.6, 15.1, 14.8, 14.5, 14.4, 14.3, 14.27],
  },
  {
    time: "9:30",
    type: "NOTE",
    body: "RTH open at 581.95. Gap-and-go failed, intraday rotation in play.",
    spark: [580.5, 581.95, 582.2, 581.6, 581.9, 582.1, 582.4],
  },
  {
    time: "9:18",
    type: "CALL",
    line: "LA-1",
    grade: "C",
    body: "Pre-market touch of LA-1 at 581.20, wick rejection but body inside zone — NO_TRADE.",
  },
  {
    time: "9:02",
    type: "NOTE",
    body: "Anchor pivots refreshed: HIGH 585.42 (May 2), LOW 569.18 (Apr 28).",
  },
];

const typeStyle = {
  CALL: { label: "CALL", color: "text-bull-ink", bar: "bg-bull" },
  PUT: { label: "PUT", color: "text-bear-ink", bar: "bg-bear" },
  NOTE: { label: "NOTE", color: "text-ink-3", bar: "bg-ink-4" },
} as const;

export function SignalTape() {
  return (
    <Card>
      <CardHeader
        eyebrow="Signal Tape"
        title="Today's prints"
        meta={`${ticks.length} events · session 9:30 → now`}
      />
      <CardBody className="px-0 pb-0">
        <ol className="divide-y divide-rule border-t border-rule">
          {ticks.map((t, i) => {
            const ts = typeStyle[t.type];
            return (
              <li key={i} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-start group">
                <div className="col-span-1 flex items-center gap-2 pt-0.5">
                  <span className={`w-0.5 h-6 rounded-sm ${ts.bar}`} />
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">{t.time}</span>
                </div>
                <div className="col-span-1 pt-0.5">
                  <span
                    className={`text-[10px] font-mono font-semibold uppercase tracking-[0.12em] ${ts.color}`}
                  >
                    {ts.label}
                  </span>
                </div>
                {t.line ? (
                  <div className="col-span-1 pt-0.5">
                    <span className="font-mono text-[11px] text-ink">{t.line}</span>
                  </div>
                ) : (
                  <div className="col-span-1" />
                )}
                <p className="col-span-7 text-[13px] text-ink-2 leading-snug">{t.body}</p>
                <div className="col-span-1 flex justify-end">
                  {t.grade && <GradeBadge grade={t.grade} size="sm" />}
                </div>
                <div className="col-span-1 flex justify-end items-center text-gold">
                  {t.spark && <Sparkline data={t.spark} w={64} h={20} fill />}
                </div>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
