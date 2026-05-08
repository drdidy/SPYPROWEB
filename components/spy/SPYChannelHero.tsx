"use client";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type {
  AdaptedSnapshot,
} from "@/lib/snapshot-adapter";
import type { DynamicLine, Pivot } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

const verdictTone: Record<string, "confirmed" | "watching" | "breached" | "stale"> = {
  LONG: "confirmed",
  SHORT: "breached",
  WAIT: "watching",
  "STAND DOWN": "stale",
};

const headlineByVerdict: Record<string, string> = {
  LONG: "Lean long",
  SHORT: "Lean short",
  HOLD: "Holding",
  WAIT: "Waiting on confirmation",
  "STAND DOWN": "Standing down today",
};

export function SPYChannelHero({ snap }: { snap: AdaptedSnapshot }) {
  const verdict = snap.decision.verdict;
  const bias = snap.bias.bias;

  const directionTone =
    bias === "BULLISH"
      ? "text-bull-ink"
      : bias === "BEARISH"
        ? "text-bear-ink"
        : "text-ink-3";

  // Mirror SPX's "selective = gold" semantic — WAIT lights the hero gold.
  const heroBg = verdict === "WAIT" ? "bg-gold-tint/40" : "bg-paper";

  // For SPY's channel-style framing, treat the closest above-price primary
  // line as the "ceiling" and the closest below-price primary line as the
  // "floor". The same lines feed the diagram.
  const primary = snap.lines.filter((l) => l.isPrimary);
  const above = primary
    .filter((l) => l.currentValue >= snap.currentPrice)
    .sort((a, b) => a.currentValue - b.currentValue)[0];
  const below = primary
    .filter((l) => l.currentValue < snap.currentPrice)
    .sort((a, b) => b.currentValue - a.currentValue)[0];

  const channelWidth =
    above && below ? above.currentValue - below.currentValue : null;
  const distToAbove = above ? above.currentValue - snap.currentPrice : null;
  const distToBelow = below ? snap.currentPrice - below.currentValue : null;

  // Conviction maps to 0..100 for the rail bar; the engine surfaces it as 0..5.
  const convictionPct = Math.max(
    0,
    Math.min(100, snap.decision.conviction * 20),
  );

  const todayLabel = new Date().toISOString().slice(0, 10);

  return (
    <Card className={`relative overflow-hidden ${heroBg}`}>
      {/* SPY gold signature — mirrors the SPX violet edge stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold/55" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rule to-transparent" />

      <div className="grid grid-cols-12 gap-0">
        {/* LEFT — verdict + read */}
        <div className="col-span-12 lg:col-span-7 p-7 pr-6 pl-8 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="eyebrow text-ink-3">SPY · Decision Slate</span>
              <span className="text-[10px] text-ink-4 font-mono">
                Hourly bars · session {todayLabel}
              </span>
            </div>
            <StatusPill variant={verdictTone[verdict] ?? "stale"} pulse>
              {verdict}
            </StatusPill>
          </div>

          <div className="mt-6 flex items-end gap-4">
            <DirectionGlyph bias={bias} tone={directionTone} />
            <AnimatePresence mode="wait">
              <motion.h1
                key={verdict}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                className={`text-display font-serif tracking-tight ${directionTone} leading-[1.02]`}
              >
                {headlineByVerdict[verdict] ?? verdict}
              </motion.h1>
            </AnimatePresence>
          </div>

          <div className="mt-3 inline-flex items-center gap-2 px-2 py-0.5 rounded-pill bg-paper-2 shadow-rule">
            <span className="font-mono text-[10px] tracking-[0.14em] text-ink-2 font-semibold">
              {bias} · {snap.decision.windowET || "no window"}
            </span>
          </div>

          {/* Conviction bar — analogous to SPX's confluence bar */}
          <div className="mt-7 max-w-md">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="eyebrow text-ink-3">Conviction</span>
              <span className="font-mono text-sm text-ink tabular-nums">
                <span className="font-semibold">{snap.decision.conviction}</span>
                <span className="text-ink-4">/5</span>
              </span>
            </div>
            <div className="relative h-1 bg-paper-2 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${convictionPct}%` }}
                transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                className="absolute inset-y-0 left-0 bg-ink rounded-full"
              />
              {[40, 60].map((t) => (
                <span
                  key={t}
                  className="absolute top-0 h-full w-px bg-paper"
                  style={{ left: `${t}%` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] text-ink-4 tabular-nums">
              <span>1 LOW</span>
              <span>3 WATCH</span>
              <span>4 ACT</span>
              <span>5</span>
            </div>
          </div>

          <p className="mt-7 text-[15px] text-ink-2 leading-relaxed max-w-xl">
            {snap.decision.finalExplanation || snap.bias.explanation || "Engine is initializing today's read."}
          </p>
        </div>

        <div className="hidden lg:block absolute left-[58.333%] top-7 bottom-7 w-px bg-rule" />

        {/* RIGHT — diagram + stat strip */}
        <div className="col-span-12 lg:col-span-5 p-7 pl-7 bg-paper-2/40 relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="eyebrow text-ink-3">Bias</span>
              <div className="mt-1.5 text-title font-serif text-ink">
                {bias === "BULLISH"
                  ? "Bullish"
                  : bias === "BEARISH"
                    ? "Bearish"
                    : "Neutral"}
              </div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-ink-3 mb-0.5">Last</div>
              <div
                className="font-mono text-[18px] font-semibold tabular-nums text-ink"
                data-num
              >
                {snap.currentPrice.toFixed(2)}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-ink-3">
                {snap.lines.length} line{snap.lines.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <RailStat
              label="Width"
              value={channelWidth !== null ? channelWidth.toFixed(2) : "—"}
              suffix="pts"
            />
            <RailStat
              label="To Upper"
              value={distToAbove !== null ? distToAbove.toFixed(2) : "—"}
              tone={
                distToAbove !== null && distToAbove >= 0 ? "bear" : "bull"
              }
              suffix="pts"
            />
            <RailStat
              label="To Lower"
              value={distToBelow !== null ? distToBelow.toFixed(2) : "—"}
              tone={distToBelow !== null && distToBelow >= 0 ? "bull" : "bear"}
              suffix="pts"
            />
          </div>

          <ChannelDiagram
            lines={snap.lines}
            pivots={snap.pivots}
            currentPrice={snap.currentPrice}
            biasUp={bias === "BULLISH"}
          />

          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <AnchorCell
              label="Anchor High"
              pivot={snap.pivots.find((p) => p.kind === "HIGH")}
            />
            <AnchorCell
              label="Anchor Low"
              pivot={snap.pivots.find((p) => p.kind === "LOW")}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function DirectionGlyph({
  bias,
  tone,
}: {
  bias: string;
  tone: string;
}) {
  const Icon =
    bias === "BULLISH"
      ? ArrowUpRight
      : bias === "BEARISH"
        ? ArrowDownRight
        : Minus;
  return <Icon className={`${tone} -mb-2`} size={36} strokeWidth={1.25} />;
}

function RailStat({
  label,
  value,
  suffix,
  tone = "ink",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : "text-ink";
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${cls}`}
          data-num
        >
          {value}
        </span>
        {suffix && (
          <span className="font-mono text-[9px] text-ink-4">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function AnchorCell({
  label,
  pivot,
}: {
  label: string;
  pivot?: Pivot;
}) {
  if (!pivot) {
    return (
      <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
        <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-sm text-ink-3 italic">—</span>
        </div>
      </div>
    );
  }
  const t = new Date(pivot.time);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="flex items-baseline justify-between">
        <span
          className="font-mono text-sm font-semibold tabular-nums text-ink"
          data-num
        >
          {pivot.price.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {hh}:{mm} CT
        </span>
      </div>
    </div>
  );
}

// ---------- Diagram ----------

function ChannelDiagram({
  lines,
  pivots,
  currentPrice,
  biasUp,
}: {
  lines: DynamicLine[];
  pivots: Pivot[];
  currentPrice: number;
  biasUp: boolean;
}) {
  const W = 400;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 22;

  const primary = lines.filter((l) => l.isPrimary);
  const showLines = primary.length > 0 ? primary : lines.slice(0, 4);

  // Y bounds — current price + every line's current value + anchors.
  const yPoints: number[] = [currentPrice];
  for (const l of showLines) yPoints.push(l.currentValue);
  for (const p of pivots) yPoints.push(p.price);
  let yMin = Math.min(...yPoints);
  let yMax = Math.max(...yPoints);
  if (!isFinite(yMin) || !isFinite(yMax) || yMin === yMax) {
    yMin = currentPrice - 1;
    yMax = currentPrice + 1;
  }
  const pad = (yMax - yMin) * 0.18 || 4;
  yMin -= pad;
  yMax += pad;

  // Time bounds — earliest line anchor to "now + 1h". Falls back to a
  // synthetic 8-hour window when no anchor times exist.
  const now = Date.now();
  const anchorTimes = showLines
    .map((l) => l.anchorTime ? new Date(l.anchorTime).getTime() : NaN)
    .concat(pivots.map((p) => p.time ? new Date(p.time).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const t0 = anchorTimes.length ? Math.min(...anchorTimes) : now - 8 * 36e5;
  const tEnd = now + 60 * 60 * 1000;

  const xOf = (t: number) =>
    PAD_L + ((t - t0) / (tEnd - t0)) * (W - PAD_L - PAD_R);
  const yOf = (p: number) =>
    PAD_T + (1 - (p - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

  const projectAt = (line: DynamicLine, t: number): number => {
    if (!line.anchorTime) return line.currentValue;
    const dh = (t - new Date(line.anchorTime).getTime()) / 36e5;
    return line.anchorPrice + line.slopePerHour * dh;
  };

  const xNow = xOf(now);
  const yPrice = yOf(currentPrice);

  const lineColor = (l: DynamicLine): string => {
    if (l.kind === "UA" || l.kind === "LA" || l.kind === "ANC_ASC") return "#0E7C50";
    if (l.kind === "UD" || l.kind === "LD" || l.kind === "ANC_DESC") return "#B5301E";
    if (l.kind === "PDH" || l.kind === "PDL") return "#5B3FB1";
    if (l.kind === "DAY_OPEN") return "#B8821F";
    return biasUp ? "#0E7C50" : "#B5301E";
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full spy-diagram">
      <style>{spyDiagramStyles}</style>

      {/* horizontal price gridlines */}
      {[0.25, 0.5, 0.75].map((f) => {
        const y = PAD_T + f * (H - PAD_T - PAD_B);
        return (
          <line
            key={f}
            x1={PAD_L}
            y1={y}
            x2={W - PAD_R}
            y2={y}
            stroke="#E8E2D2"
            strokeWidth={0.6}
            strokeDasharray="2 4"
          />
        );
      })}

      {/* y-axis price ticks */}
      {[
        yMin + (yMax - yMin) * 0.12,
        (yMin + yMax) / 2,
        yMax - (yMax - yMin) * 0.12,
      ].map((p, i) => (
        <text
          key={i}
          x={PAD_L - 4}
          y={yOf(p) + 3}
          fontSize="8"
          fontFamily="var(--font-geist-mono)"
          fill="#9CA3AF"
          textAnchor="end"
        >
          {p.toFixed(0)}
        </text>
      ))}

      {/* primary lines */}
      {showLines.map((l, idx) => {
        const startX = l.anchorTime ? xOf(new Date(l.anchorTime).getTime()) : PAD_L;
        const startY = l.anchorTime ? yOf(l.anchorPrice) : yOf(l.currentValue);
        const endX = xOf(tEnd);
        const endY = yOf(projectAt(l, tEnd));
        const color = lineColor(l);
        const isReference = l.kind === "PDH" || l.kind === "PDL" || l.kind === "DAY_OPEN";
        return (
          <path
            key={l.name + idx}
            d={`M ${startX},${startY} L ${endX},${endY}`}
            stroke={color}
            strokeWidth={isReference ? 1.1 : 1.6}
            strokeDasharray={isReference ? "4 4" : undefined}
            fill="none"
            opacity={isReference ? 0.85 : 1}
            className="spy-rail"
            pathLength={1}
            style={{ animationDelay: `${200 + idx * 110}ms` }}
          />
        );
      })}

      {/* anchor pivots */}
      {pivots.map((p, i) => {
        const x = p.time ? xOf(new Date(p.time).getTime()) : PAD_L + 10;
        const y = yOf(p.price);
        return (
          <g
            key={p.kind + i}
            className="spy-anchor"
            style={{ animationDelay: `${1000 + i * 140}ms` }}
          >
            <circle cx={x} cy={y} r={9} fill="#B8821F" opacity={0} className="spy-anchor-pulse" />
            <circle cx={x} cy={y} r={3.2} fill="#fff" stroke="#B8821F" strokeWidth={1.5} />
            <circle cx={x} cy={y} r={1.4} fill="#B8821F" />
          </g>
        );
      })}

      {/* current price horizontal */}
      <line
        x1={PAD_L}
        y1={yPrice}
        x2={xNow}
        y2={yPrice}
        stroke="#14161A"
        strokeWidth={0.6}
        strokeDasharray="1.5 3"
        opacity={0.45}
        className="spy-price-line"
      />
      <g className="spy-price-marker">
        <circle cx={xNow} cy={yPrice} r={4.5} fill="#14161A" />
        <circle cx={xNow} cy={yPrice} r={8} fill="#14161A" opacity={0.12} className="spy-price-halo" />
      </g>
    </svg>
  );
}

const spyDiagramStyles = `
  @keyframes spy-rail-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes spy-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spy-pop-in {
    0%   { opacity: 0; transform: scale(0.6); }
    70%  { opacity: 1; transform: scale(1.1); }
    100% { transform: scale(1); }
  }
  @keyframes spy-pulse-out {
    0%   { opacity: 0; transform: scale(0.6); }
    50%  { opacity: 0.22; }
    100% { opacity: 0; transform: scale(2.4); }
  }
  @keyframes spy-breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.18; } }
  @keyframes spy-halo-pulse {
    0%   { opacity: 0.12; transform: scale(1); }
    50%  { opacity: 0.04; transform: scale(1.7); }
    100% { opacity: 0.12; transform: scale(1); }
  }
  .spy-diagram .spy-rail {
    stroke-dasharray: 1;
    animation: spy-rail-draw 950ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .spy-diagram .spy-anchor {
    transform-origin: center;
    transform-box: fill-box;
    opacity: 0;
    animation: spy-pop-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .spy-diagram .spy-anchor-pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: spy-pulse-out 2400ms ease-out 2000ms infinite;
  }
  .spy-diagram .spy-price-line { animation: spy-breathe 3200ms ease-in-out infinite; }
  .spy-diagram .spy-price-marker {
    opacity: 0;
    animation: spy-fade-in 360ms ease-out 1300ms forwards;
  }
  .spy-diagram .spy-price-halo {
    transform-origin: center;
    transform-box: fill-box;
    animation: spy-halo-pulse 2800ms ease-in-out 1700ms infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .spy-diagram .spy-rail,
    .spy-diagram .spy-anchor,
    .spy-diagram .spy-price-marker {
      opacity: 1 !important;
      animation: none !important;
      stroke-dashoffset: 0 !important;
      transform: none !important;
    }
    .spy-diagram .spy-anchor-pulse,
    .spy-diagram .spy-price-line,
    .spy-diagram .spy-price-halo {
      animation: none !important;
    }
  }
`;
