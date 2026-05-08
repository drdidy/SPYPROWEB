"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { SPXLine, SPXLineKind } from "@/lib/types";

const lineMeta: Record<SPXLineKind, { dot: string; label: string; group: string }> = {
  CHANNEL_CEILING: { dot: "bg-bear", label: "Channel Ceiling", group: "Active channel" },
  CHANNEL_FLOOR: { dot: "bg-bull", label: "Channel Floor", group: "Active channel" },
  PREV_RTH_HIGH_ASC: {
    dot: "bg-violet",
    label: "Prev RTH High · Asc",
    group: "Reference",
  },
  PREV_RTH_LOW_DESC: {
    dot: "bg-violet",
    label: "Prev RTH Low · Desc",
    group: "Reference",
  },
};

function lineState(distance: number): "armed" | "watching" | "stale" {
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
        meta={`Last ${price.toFixed(2)} · sorted by proximity · slope 1.05 pts/hr`}
      />
      <CardBody className="px-0 pb-0">
        <div className="grid grid-cols-12 px-5 pb-2 eyebrow text-ink-3">
          <div className="col-span-4">Line</div>
          <div className="col-span-3">Group</div>
          <div className="col-span-2 text-right">Value</div>
          <div className="col-span-2 text-right">Δ Price</div>
          <div className="col-span-1 text-right">State</div>
        </div>
        <ul className="divide-y divide-rule border-t border-rule">
          {[...lines]
            .sort(
              (a, b) =>
                Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
            )
            .map((l) => {
              const state = lineState(l.distanceFromPrice);
              const m = lineMeta[l.kind];
              return (
                <li
                  key={l.kind}
                  className="grid grid-cols-12 items-center px-5 py-3 hover:bg-paper-2/50 transition-colors"
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
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <StatusPill variant={state} pulse={state === "armed"}>
                      {state}
                    </StatusPill>
                  </div>
                </li>
              );
            })}
        </ul>
      </CardBody>
    </Card>
  );
}
