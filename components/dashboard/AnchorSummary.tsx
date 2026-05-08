"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import type { Pivot } from "@/lib/types";
import { ArrowDown, ArrowUp } from "lucide-react";

export function AnchorSummary({ pivots }: { pivots: Pivot[] }) {
  const high = pivots.find((p) => p.kind === "HIGH");
  const low = pivots.find((p) => p.kind === "LOW");
  return (
    <Card>
      <CardHeader eyebrow="Anchors" title="Pivot lattice" meta="primary fan basis" />
      <CardBody className="space-y-4">
        {high && <Pivot p={high} />}
        <div className="hr-rule" />
        {low && <Pivot p={low} />}
        <div className="text-[11px] text-ink-3 leading-snug pt-1">
          Slope <span className="font-mono text-ink">$0.20/hr</span> defines fan radians.
          Tradable lines built from these anchors stay valid until invalidation prints.
        </div>
      </CardBody>
    </Card>
  );
}

function Pivot({ p }: { p: Pivot }) {
  const isHigh = p.kind === "HIGH";
  const Icon = isHigh ? ArrowUp : ArrowDown;
  return (
    <div className="flex items-start gap-3">
      <div
        className={`shrink-0 w-9 h-9 rounded-soft grid place-items-center ${
          isHigh ? "bg-bear-tint text-bear-ink" : "bg-bull-tint text-bull-ink"
        }`}
      >
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow text-ink-3">{p.kind}</span>
          <span className="font-mono text-[10px] text-ink-4 tabular-nums">
            {new Date(p.time).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div
          className="font-mono text-2xl font-semibold text-ink mt-0.5 tabular-nums"
          data-num
        >
          {p.price.toFixed(2)}
        </div>
        <div className="text-[11px] text-ink-2 mt-0.5">
          {p.source} · {p.candleColor.toLowerCase()} candle
          {p.fallbackUsed && (
            <span className="ml-2 text-[10px] font-mono text-gold-ink uppercase tracking-[0.10em]">
              fallback
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
