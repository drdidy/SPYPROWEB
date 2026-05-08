"use client";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProphetChart } from "./ProphetChart";
import { useState } from "react";
import { Maximize2, Settings } from "lucide-react";
import type { Candle, DynamicLine, Pivot, TradeSignal } from "@/lib/types";

const timeframes = ["15m", "1h", "4h", "D"] as const;

export function ChartCard({
  candles,
  lines,
  pivots,
  signal,
  currentPrice,
}: {
  candles: Candle[];
  lines: DynamicLine[];
  pivots: Pivot[];
  signal?: TradeSignal;
  currentPrice: number;
}) {
  const [tf, setTf] = useState<(typeof timeframes)[number]>("4h");

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="Prophet Chart"
        title={
          <span className="flex items-baseline gap-3">
            <span>SPY · {tf}</span>
            <span className="font-mono text-xs text-ink-3 font-normal">{candles.length} bars</span>
          </span>
        }
        meta="anchor lattice · primary fan · secondary targets"
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center bg-paper-2 rounded-soft p-0.5 shadow-rule">
              {timeframes.map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`h-6 px-2.5 rounded-[4px] text-[11px] font-mono font-semibold transition-all ${
                    tf === t
                      ? "bg-paper text-ink shadow-rule"
                      : "text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" aria-label="Settings">
              <Settings size={14} />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Expand">
              <Maximize2 size={14} />
            </Button>
          </div>
        }
      />
      <div className="px-3 pt-2 pb-3 bg-paper">
        <ProphetChart
          candles={candles}
          lines={lines}
          pivots={pivots}
          signal={signal}
          currentPrice={currentPrice}
        />
      </div>
      <div className="px-5 py-2.5 border-t border-rule flex items-center gap-5 text-[11px] text-ink-3">
        <Legend dot="bg-bull" label="UA / LA · Ascending primary" />
        <Legend dot="bg-bear" label="UD / LD · Descending primary" />
        <Legend dot="bg-bull/40" dashed label="S_ASC · Secondary target" />
        <Legend dot="bg-gold" ring label="Anchor pivot" />
        <Legend dot="bg-teal" ring label="Latest signal" />
        <span className="ml-auto font-mono text-ink-4">slope $0.20/hr</span>
      </div>
    </Card>
  );
}

function Legend({
  dot,
  label,
  dashed = false,
  ring = false,
}: {
  dot: string;
  label: string;
  dashed?: boolean;
  ring?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {ring ? (
        <span className={`w-2 h-2 rounded-full ${dot} ring-2 ring-paper shadow-rule`} />
      ) : dashed ? (
        <span className={`w-3 h-px ${dot}`} style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 7px)" }} />
      ) : (
        <span className={`w-3 h-0.5 ${dot} rounded-sm`} />
      )}
      {label}
    </span>
  );
}
