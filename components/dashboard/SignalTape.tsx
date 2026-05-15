"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Grade } from "@/lib/types";
import { ArrowRight, CircleDot, FileText, Target } from "lucide-react";
import Link from "next/link";
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
  CALL: { label: "TOUCH", color: "text-bull-ink", bar: "bg-bull", icon: Target },
  PUT: { label: "BLOCK", color: "text-bear-ink", bar: "bg-bear", icon: CircleDot },
  NOTE: { label: "NOTE", color: "text-ink-3", bar: "bg-ink-4", icon: FileText },
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
              Session still warming up.
            </div>
            <p className="mt-3 text-[13px] text-ink-3 leading-relaxed max-w-md">
              No qualified touch, rejection, break, or risk event has printed
              yet. New events post here as the engine observes them.
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
        <div className="px-5 pb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow text-ink-3">Session event rail</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              replay-linked
            </span>
          </div>
          <div className="relative h-7 rounded-soft border border-rule bg-paper-2 px-2">
            <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 bg-rule-strong" />
            {ticks.map((t, i) => {
              const ts = typeStyle[t.type];
              const left = ticks.length === 1 ? 50 : (i / (ticks.length - 1)) * 100;
              return (
                <span
                  key={`${t.time}-${i}`}
                  className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper ${ts.bar}`}
                  style={{ left: `calc(8px + (${left}% * 0.96))` }}
                  title={`${t.time} ${ts.label}: ${t.body}`}
                />
              );
            })}
          </div>
        </div>
        <ol className="divide-y divide-rule border-t border-rule" role="log" aria-live="polite">
          {ticks.map((t, i) => {
            const ts = typeStyle[t.type];
            const Icon = ts.icon;
            return (
              <li
                id={`spy-event-${i}`}
                key={i}
                className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 px-5 py-3.5 items-start group sm:grid-cols-[64px_88px_minmax(0,1fr)_auto]"
              >
                <div className="flex items-center gap-2 pt-0.5">
                  <span className={`w-0.5 h-6 rounded-sm ${ts.bar}`} />
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">{t.time}</span>
                </div>
                <div className="pt-0.5">
                  <span
                    className={`inline-flex h-6 items-center gap-1.5 rounded-pill border border-rule bg-paper-2 px-2 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] ${ts.color}`}
                  >
                    <Icon size={12} strokeWidth={1.6} aria-hidden />
                    {ts.label}
                  </span>
                </div>
                <div className="col-span-2 col-start-2 min-w-0 sm:col-auto sm:col-span-1">
                  {t.line && (
                    <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                      {t.line}
                    </span>
                  )}
                  <p className="text-[13px] text-ink-2 leading-snug">
                    {t.body}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {t.grade && <GradeBadge grade={t.grade} size="sm" />}
                    {t.spark && <Sparkline data={t.spark} w={64} h={20} fill />}
                  </div>
                </div>
                <Link
                  href={`/replay?t=${encodeURIComponent(t.time)}&engine=spy`}
                  className="col-start-3 row-start-1 mt-0.5 grid h-7 w-7 place-items-center rounded-full border border-rule bg-paper text-ink-3 transition-colors hover:border-rule-strong hover:text-ink sm:col-auto sm:row-auto"
                  aria-label={`Open ${t.time} in Replay`}
                >
                  <ArrowRight size={13} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
