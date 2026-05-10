"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Grade } from "@/lib/types";
import type { ReactNode } from "react";

type Tick = {
  time: string;
  type: "CALL" | "PUT" | "NOTE";
  line?: string;
  grade?: Grade;
  body: string;
  spark?: number[];
};

const typeStyle = {
  CALL: { label: "CALL", color: "text-bull-ink", bar: "bg-bull" },
  PUT: { label: "PUT", color: "text-bear-ink", bar: "bg-bear" },
  NOTE: { label: "NOTE", color: "text-ink-3", bar: "bg-ink-4" },
} as const;

export function SignalTape({
  ticks: liveTicks,
  healthAction,
}: {
  ticks?: Tick[];
  healthAction?: ReactNode;
} = {}) {
  const ticks = liveTicks ?? [];
  if (ticks.length === 0) {
    return (
      <Card>
        <CardHeader
          eyebrow="Signal Tape"
          title="Today's prints"
          meta="No events yet"
          action={healthAction}
        />
        <CardBody>
          <div className="py-10">
            <div className="font-serif text-headline text-ink-3 italic font-light">
              The tape is quiet.
            </div>
            <p className="mt-3 text-[13px] text-ink-3 leading-relaxed max-w-md">
              No qualified rejection has printed yet today. Each event posts
              here as it crosses the wire, with entry, line, grade, and
              reasoning attached.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        eyebrow="Signal Tape"
        title="Today's prints"
        meta={`${ticks.length} event${ticks.length === 1 ? "" : "s"} · session live`}
        action={healthAction}
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
