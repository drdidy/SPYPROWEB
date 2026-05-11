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
        <ol className="divide-y divide-rule border-t border-rule" role="log" aria-live="polite">
          {ticks.map((t, i) => {
            const ts = typeStyle[t.type];
            const Icon = ts.icon;
            return (
              <li
                id={`spy-event-${i}`}
                key={i}
                className="grid grid-cols-[64px_88px_minmax(0,1fr)_auto] gap-3 px-5 py-3.5 items-start group"
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
                <div className="min-w-0">
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
                  className="mt-0.5 grid h-7 w-7 place-items-center rounded-full border border-rule bg-paper text-ink-3 transition-colors hover:border-rule-strong hover:text-ink"
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
