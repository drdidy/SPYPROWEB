"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { SPXLine, SPXLineKind } from "@/lib/types";

const lineMeta: Record<SPXLineKind, { dot: string; label: string; group: string }> = {
  PREV_RTH_HIGH_ASC: {
    dot: "bg-ink-4",
    label: "Prev RTH High - Asc",
    group: "Outer reference",
  },
  PREV_RTH_LOW_DESC: {
    dot: "bg-ink-4",
    label: "Prev RTH Low - Desc",
    group: "Outer reference",
  },
  SWING_HIGH_ASC: {
    dot: "bg-gold",
    label: "Swing High - Asc",
    group: "Overnight swing",
  },
  SWING_HIGH_DESC: {
    dot: "bg-bear",
    label: "Swing High - Desc",
    group: "Overnight swing",
  },
  SWING_LOW_ASC: {
    dot: "bg-bull",
    label: "Swing Low - Asc",
    group: "Overnight swing",
  },
  SWING_LOW_DESC: {
    dot: "bg-gold",
    label: "Swing Low - Desc",
    group: "Overnight swing",
  },
};

function lineState(kind: SPXLineKind, distance: number): "armed" | "watching" | "stale" | "reference" | "bias" {
  if (lineMeta[kind].group === "Outer reference") return "reference";
  const a = Math.abs(distance);
  if (a <= 3) return "armed";
  if (a <= 15) return "watching";
  return "stale";
}
export function SPXLineLadder({ lines, price }: { lines: SPXLine[]; price: number }) {
  return (
    <Card>
      <CardHeader
        eyebrow="Line Ladder"
        title="Levels in play"
        meta={`Last ${price.toFixed(2)} · sorted by proximity`}
      />
      <CardBody className="px-0 pb-0">
        <div className="grid grid-cols-12 px-5 pb-2 eyebrow text-ink-3">
          <div className="col-span-4">Line</div>
          <div className="col-span-3">Group</div>
          <div className="col-span-2 text-right">Value</div>
          <div className="col-span-2 text-right">Δ Price</div>
          <div className="col-span-1 text-right">State</div>
        </div>
        <ul className="divide-y divide-rule border-t border-rule spx-ladder">
          {[...lines]
            .sort(
              (a, b) =>
                Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
            )
            .map((l, idx) => {
              const state = lineState(l.kind, l.distanceFromPrice);
              const m = lineMeta[l.kind];
              const pct =
                price !== 0 && Number.isFinite(price)
                  ? (Math.abs(l.distanceFromPrice) / Math.abs(price)) * 100
                  : null;
              const pillVariant =
                state === "reference" ? "stale" : state === "bias" ? "waiting" : state;
              const stateLabel =
                state === "reference" ? "REFERENCE" : state === "bias" ? "BIAS" : state;
              return (
                <li
                  key={l.kind}
                  className="grid grid-cols-12 items-center px-5 py-3 hover:bg-paper-2/50 transition-colors spx-ladder-row"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <div className="col-span-4 flex items-center gap-2.5">
                    <span className={`w-1.5 h-4 rounded-sm ${m.dot}`} />
                    <span className="font-mono text-sm font-semibold text-ink">
                      {m.label}
                    </span>
                  </div>
                  <div className="col-span-3 text-xs text-ink-2">{m.group}</div>
                  <div
                    className="col-span-2 text-right font-mono text-sm tabular-nums text-ink"
                    data-num
                  >
                    {l.currentValue.toFixed(2)}
                  </div>
                  <div
                    className={`col-span-2 text-right font-mono text-sm tabular-nums ${
                      l.distanceFromPrice >= 0 ? "text-bull-ink" : "text-bear-ink"
                    }`}
                    data-num
                  >
                    {l.distanceFromPrice >= 0 ? "+" : ""}
                    {l.distanceFromPrice.toFixed(2)}
                    {pct !== null && (
                      <span className="ml-1 text-[10px] text-ink-4">
                        {pct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <StatusPill variant={pillVariant} pulse={state === "armed"}>
                      {stateLabel}
                    </StatusPill>
                  </div>
                </li>
              );
            })}
        </ul>
      </CardBody>
      <style jsx>{`
        @keyframes spx-row-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .spx-ladder .spx-ladder-row {
          opacity: 0;
          animation: spx-row-in 360ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .spx-ladder .spx-ladder-row {
            opacity: 1;
            transform: none;
            animation: none;
          }
        }
      `}</style>
    </Card>
  );
}
