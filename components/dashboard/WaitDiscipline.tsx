"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { WaitDisciplineItem } from "@/lib/types";
import { useEffect, useState } from "react";

const guardToVariant = {
  OK: "ok",
  WAITING: "waiting",
  INTACT: "intact",
  BROKEN: "broken",
  MISSED_ENTRY: "breached",
} as const;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Countdown({ initial }: { initial: number }) {
  const [t, setT] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setT((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-sm tabular-nums text-ink" data-num>
      {fmt(t)}
    </span>
  );
}

export function WaitDiscipline({ items }: { items: WaitDisciplineItem[] }) {
  return (
    <Card>
      <CardHeader
        eyebrow="Wait Discipline"
        title="Three gates before entry"
        meta="reset on each new bar"
      />
      <CardBody className="px-0 pb-0">
        <ol className="divide-y divide-rule border-t border-rule">
          {items.map((it, i) => {
            const variant =
              guardToVariant[it.status as keyof typeof guardToVariant] ?? "stale";
            return (
              <li key={it.key} className="px-5 py-4 flex items-start gap-4">
                <div className="font-mono text-[11px] text-ink-4 tabular-nums w-6 pt-0.5">
                  0{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-sm font-semibold text-ink font-serif">
                      {it.label}
                    </span>
                    <StatusPill
                      variant={variant as Parameters<typeof StatusPill>[0]["variant"]}
                      pulse={variant === "waiting"}
                    >
                      {it.status}
                    </StatusPill>
                  </div>
                  <p className="text-[13px] text-ink-2 leading-snug">{it.detail}</p>
                </div>
                <div className="text-right shrink-0 min-w-[64px]">
                  {it.countdownSec ? (
                    <Countdown initial={it.countdownSec} />
                  ) : (
                    <span className="font-mono text-[11px] text-ink-4">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
