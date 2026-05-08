"use client";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProphetChart } from "./ProphetChart";
import { useMemo, useState } from "react";
import { Maximize2, Settings } from "lucide-react";
import type { Candle, DynamicLine, Pivot, TradeSignal } from "@/lib/types";

type Timeframe = "5m" | "15m" | "1h" | "4h" | "D";
const timeframes: readonly Timeframe[] = ["5m", "15m", "1h", "4h", "D"] as const;

// Native granularity per series:
//   candles       = 5-minute intraday bars (last trading day)
//   hourlyCandles = 1-hour RTH bars (last ~30 trading days)
// Other timeframes are resampled client-side by grouping the nearest
// native series. A timeframe is disabled when its source series is
// empty (e.g. before market open the 5m series may not exist yet).
export function ChartCard({
  candles,
  hourlyCandles,
  lines,
  pivots,
  signal,
  currentPrice,
}: {
  candles: Candle[];
  hourlyCandles: Candle[];
  lines: DynamicLine[];
  pivots: Pivot[];
  signal?: TradeSignal;
  currentPrice: number;
}) {
  const has5m = candles.length > 0;
  const has1h = hourlyCandles.length > 0;
  const initial: Timeframe = has1h ? "1h" : has5m ? "5m" : "1h";
  const [tf, setTf] = useState<Timeframe>(initial);

  const view = useMemo(() => {
    switch (tf) {
      case "5m":
        return candles;
      case "15m":
        return resampleByCount(candles, 3);
      case "1h":
        return hourlyCandles;
      case "4h":
        return resampleByCount(hourlyCandles, 4);
      case "D":
        return resampleToDaily(hourlyCandles);
      default:
        return hourlyCandles;
    }
  }, [tf, candles, hourlyCandles]);

  const isDisabled = (t: Timeframe): boolean => {
    if (t === "5m" || t === "15m") return !has5m;
    return !has1h;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="Prophet Chart"
        title={
          <span className="flex items-baseline gap-3">
            <span>SPY · {tf}</span>
            <span className="font-mono text-xs text-ink-3 font-normal">{view.length} bars</span>
          </span>
        }
        meta="anchor pivots · primary lines · secondary targets"
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center bg-paper-2 rounded-soft p-0.5 shadow-rule">
              {timeframes.map((t) => {
                const disabled = isDisabled(t);
                return (
                  <button
                    key={t}
                    onClick={() => !disabled && setTf(t)}
                    disabled={disabled}
                    title={disabled ? "Series not yet available" : undefined}
                    className={`h-6 px-2.5 rounded-[4px] text-[11px] font-mono font-semibold transition-all ${
                      tf === t
                        ? "bg-paper text-ink shadow-rule"
                        : disabled
                          ? "text-ink-4 cursor-not-allowed"
                          : "text-ink-3 hover:text-ink-2"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
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
          candles={view}
          lines={lines}
          pivots={pivots}
          signal={signal}
          currentPrice={currentPrice}
        />
      </div>
      <div className="px-5 py-2.5 border-t border-rule flex items-center gap-5 text-[11px] text-ink-3">
        <Legend dot="bg-bull" label="Ascending primary" />
        <Legend dot="bg-bear" label="Descending primary" />
        <Legend dot="bg-bull/40" dashed label="Secondary target" />
        <Legend dot="bg-gold" ring label="Anchor pivot" />
        <Legend dot="bg-teal" ring label="Latest signal" />
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

// ---- Resampling --------------------------------------------------------
// OHLC reductions on a sorted candle series. Open is the first
// candle's open in the group, close is the last close, high/low are
// the extremes, volume sums. We never invent candles where the
// underlying series has gaps; the last group is included even if
// shorter than `count` so the most recent partial bar still shows.

function resampleByCount(src: Candle[], count: number): Candle[] {
  if (count <= 1 || src.length === 0) return src;
  const out: Candle[] = [];
  for (let i = 0; i < src.length; i += count) {
    const slice = src.slice(i, i + count);
    out.push(rollup(slice));
  }
  return out;
}

function resampleToDaily(src: Candle[]): Candle[] {
  if (src.length === 0) return src;
  const groups = new Map<string, Candle[]>();
  for (const c of src) {
    const day = c.t.slice(0, 10); // YYYY-MM-DD
    const arr = groups.get(day);
    if (arr) arr.push(c);
    else groups.set(day, [c]);
  }
  const out: Candle[] = [];
  for (const arr of groups.values()) out.push(rollup(arr));
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

function rollup(slice: Candle[]): Candle {
  const first = slice[0];
  const last = slice[slice.length - 1];
  let h = -Infinity;
  let l = Infinity;
  let v = 0;
  for (const c of slice) {
    if (c.h > h) h = c.h;
    if (c.l < l) l = c.l;
    v += c.v ?? 0;
  }
  return { t: first.t, o: first.o, h, l, c: last.c, v };
}
