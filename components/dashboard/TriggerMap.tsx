"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { DynamicLine } from "@/lib/types";

function lineState(distance: number): "armed" | "watching" | "stale" {
  const a = Math.abs(distance);
  if (a <= 0.5) return "armed";
  if (a <= 2.5) return "watching";
  return "stale";
}

const lineStyle: Record<string, { dot: string; label: string }> = {
  UA: { dot: "bg-bull", label: "Upper Ascending" },
  UD: { dot: "bg-bear", label: "Upper Descending" },
  LA: { dot: "bg-bull", label: "Lower Ascending" },
  LD: { dot: "bg-bear", label: "Lower Descending" },
  S_ASC: { dot: "bg-bull/60", label: "Secondary Ascending" },
  S_DESC: { dot: "bg-bear/60", label: "Secondary Descending" },
  ANC_ASC: { dot: "bg-bull", label: "Anchor Ascending" },
  ANC_DESC: { dot: "bg-bear", label: "Anchor Descending" },
  PDH: { dot: "bg-violet", label: "Prev Day High" },
  PDL: { dot: "bg-violet", label: "Prev Day Low" },
  DAY_OPEN: { dot: "bg-gold", label: "Day Open" },
};

export function TriggerMap({ lines }: { lines: DynamicLine[] }) {
  return (
    <Card>
      <CardHeader
        eyebrow="Trigger Map"
        title="Levels in play"
        meta="sorted by proximity"
      />
      <CardBody className="px-0 pb-0">
        <div className="grid grid-cols-12 px-5 pb-2 eyebrow text-ink-3">
          <div className="col-span-3">Line</div>
          <div className="col-span-3">Type</div>
          <div className="col-span-2 text-right">Value</div>
          <div className="col-span-2 text-right">Δ Price</div>
          <div className="col-span-2 text-right">Status</div>
        </div>
        <ul className="divide-y divide-rule border-t border-rule">
          {lines
            .slice()
            .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))
            .map((l) => {
              const state = lineState(l.distanceFromPrice);
              const meta = lineStyle[l.kind] ?? { dot: "bg-ink-3", label: l.kind };
              return (
                <li
                  key={l.name}
                  className="grid grid-cols-12 items-center px-5 py-3 hover:bg-paper-2/50 transition-colors group"
                >
                  <div className="col-span-3 flex items-center gap-2.5">
                    <span className={`w-1.5 h-4 rounded-sm ${meta.dot}`} />
                    <span className="font-mono text-sm font-semibold text-ink">{l.name}</span>
                    {l.isPrimary && (
                      <span className="text-[9px] font-mono text-gold-ink uppercase tracking-[0.10em]">
                        primary
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 text-xs text-ink-2">{meta.label}</div>
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
                  <div className="col-span-2 flex justify-end">
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
