"use client";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { AdaptedSnapshot, AnchorGroup } from "@/lib/snapshot-adapter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownRight } from "lucide-react";

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

const SLOPE_PER_HOUR = 0.2;        // engine constant (descending only)
const BAND_OFFSET = 3.4;           // SPY pts above/below the anchor low

export function SPYChannelHero({ snap }: { snap: AdaptedSnapshot }) {
  const verdict = snap.decision.verdict;
  const bias = snap.bias.bias;

  const directionTone =
    bias === "BULLISH"
      ? "text-bull-ink"
      : bias === "BEARISH"
        ? "text-bear-ink"
        : "text-ink-3";

  const heroBg = verdict === "WAIT" ? "bg-gold-tint/40" : "bg-paper";

  const anchor = snap.anchor;
  const primary = anchor?.primary ?? null;

  // Distance to nearest line (the "first read" the trader looks for).
  // Uses live currentValue per band — already projected to "now" by the
  // engine — and picks the closest of upper / main / lower.
  const distances = primary
    ? [
        { label: "Upper", value: primary.bands.upper.currentValue },
        { label: "Main", value: primary.bands.main.currentValue },
        { label: "Lower", value: primary.bands.lower.currentValue },
      ].filter((b) => b.value !== null)
    : [];
  const nearest = distances.reduce<{ label: string; dist: number; value: number } | null>(
    (best, b) => {
      const d = b.value! - snap.currentPrice;
      if (best === null || Math.abs(d) < Math.abs(best.dist)) {
        return { label: b.label, dist: d, value: b.value! };
      }
      return best;
    },
    null,
  );

  const todayLabel = new Date().toISOString().slice(0, 10);

  return (
    <Card className={`relative overflow-hidden ${heroBg}`}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold/55" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rule to-transparent" />

      <div className="grid grid-cols-12 gap-0">
        {/* LEFT — verdict + read */}
        <div className="col-span-12 lg:col-span-7 p-7 pr-6 pl-8 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="eyebrow text-ink-3">SPY · Anchor Slate</span>
              <span className="text-[10px] text-ink-4 font-mono">
                Slope ‑{SLOPE_PER_HOUR.toFixed(2)} pts/hr · session {todayLabel}
              </span>
            </div>
            <StatusPill variant={verdictTone[verdict] ?? "stale"} pulse>
              {verdict}
            </StatusPill>
          </div>

          <div className="mt-6 flex items-end gap-4">
            <ArrowDownRight className={`${directionTone} -mb-2`} size={36} strokeWidth={1.25} />
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

          {/* First read: distance to nearest line */}
          <div className="mt-7 max-w-md">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="eyebrow text-ink-3">Nearest line</span>
              {nearest ? (
                <span className="font-mono text-sm text-ink tabular-nums">
                  <span className="font-semibold">{nearest.label}</span>
                  <span className="text-ink-4 ml-1.5">{nearest.value.toFixed(2)}</span>
                  <span
                    className={`ml-1.5 ${nearest.dist >= 0 ? "text-bear-ink" : "text-bull-ink"}`}
                  >
                    ({nearest.dist >= 0 ? "+" : ""}
                    {nearest.dist.toFixed(2)} pts)
                  </span>
                </span>
              ) : (
                <span className="font-mono text-sm text-ink-3 italic">
                  no anchor today
                </span>
              )}
            </div>
            {nearest && (
              <div className="relative h-1 bg-paper-2 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.max(2, Math.min(100, 100 - Math.abs(nearest.dist) * 20))}%`,
                  }}
                  transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  className="absolute inset-y-0 left-0 bg-ink rounded-full"
                />
              </div>
            )}
          </div>

          <p className="mt-7 text-[15px] text-ink-2 leading-relaxed max-w-xl">
            {snap.decision.finalExplanation || snap.bias.explanation || "Engine is initializing today's read."}
            {primary && (
              <span className="block mt-2 text-ink-3 text-[13.5px]">
                {primary.role === "ANCHOR_2" ? "Anchor 2" : "Primary anchor"} ·
                low <span className="font-mono">{primary.anchorLow.toFixed(2)}</span> ·
                set <span className="font-mono">{anchorTimeLabel(primary)}</span> CT.
                Bands at +{BAND_OFFSET}, 0, −{BAND_OFFSET}, all decaying at {SLOPE_PER_HOUR} pts/hr.
              </span>
            )}
          </p>
        </div>

        <div className="hidden lg:block absolute left-[58.333%] top-7 bottom-7 w-px bg-rule" />

        {/* RIGHT — diagram + stat strip */}
        <div className="col-span-12 lg:col-span-5 p-7 pl-7 bg-paper-2/40 relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="eyebrow text-ink-3">Anchor</span>
              <div className="mt-1.5 text-title font-serif text-ink">
                {primary ? primary.role.replace(/_/g, " ").toLowerCase() : "none today"}
              </div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-ink-3 mb-0.5">Last</div>
              <div className="font-mono text-[18px] font-semibold tabular-nums text-ink" data-num>
                {snap.currentPrice.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <BandStat
              label="Upper"
              value={primary?.bands.upper.currentValue ?? null}
              price={snap.currentPrice}
            />
            <BandStat
              label="Main"
              value={primary?.bands.main.currentValue ?? null}
              price={snap.currentPrice}
              emphasized
            />
            <BandStat
              label="Lower"
              value={primary?.bands.lower.currentValue ?? null}
              price={snap.currentPrice}
            />
          </div>

          <AnchorDiagram snap={snap} />

          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <AnchorCell
              label="Primary"
              group={primary}
            />
            <AnchorCell
              label="Anchor 2"
              group={anchor?.anchor2 ?? null}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function anchorTimeLabel(g: AnchorGroup): string {
  try {
    const d = new Date(g.anchorTime);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

function BandStat({
  label,
  value,
  price,
  emphasized = false,
}: {
  label: string;
  value: number | null;
  price: number;
  emphasized?: boolean;
}) {
  if (value === null) {
    return (
      <div className={`px-2.5 py-1.5 rounded-soft bg-paper shadow-rule ${emphasized ? "ring-1 ring-gold/40" : ""}`}>
        <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
        <span className="font-mono text-sm text-ink-3 italic">—</span>
      </div>
    );
  }
  const dist = value - price;
  const distTone =
    Math.abs(dist) < 0.6
      ? "text-gold-ink"
      : dist >= 0
        ? "text-bear-ink"
        : "text-bull-ink";
  return (
    <div className={`px-2.5 py-1.5 rounded-soft bg-paper shadow-rule ${emphasized ? "ring-1 ring-gold/40" : ""}`}>
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-ink" data-num>
        {value.toFixed(2)}
      </div>
      <div className={`font-mono text-[10px] tabular-nums ${distTone}`}>
        {dist >= 0 ? "+" : ""}
        {dist.toFixed(2)}
      </div>
    </div>
  );
}

function AnchorCell({
  label,
  group,
}: {
  label: string;
  group: AnchorGroup | null;
}) {
  if (!group) {
    return (
      <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
        <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
        <span className="font-mono text-sm text-ink-3 italic">none</span>
      </div>
    );
  }
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-semibold tabular-nums text-ink" data-num>
          {group.anchorLow.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {anchorTimeLabel(group)} CT
        </span>
      </div>
    </div>
  );
}

// ---------- Diagram ----------

function AnchorDiagram({ snap }: { snap: AdaptedSnapshot }) {
  const W = 400;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 22;

  const anchor = snap.anchor;
  const primary = anchor?.primary ?? null;
  const anchor2 = anchor?.anchor2 ?? null;
  const slope = anchor?.slopePerHour ?? SLOPE_PER_HOUR;
  const groups = [primary, anchor2].filter((g): g is AnchorGroup => g !== null);

  // Time axis: from earliest anchor to now + 1 hour.
  const now = Date.now();
  const anchorTimes = groups
    .map((g) => new Date(g.anchorTime).getTime())
    .filter((t) => Number.isFinite(t));
  const t0 = anchorTimes.length ? Math.min(...anchorTimes) : now - 8 * 36e5;
  const tEnd = now + 60 * 60 * 1000;

  // Y range: include current price plus every band's anchor & current value.
  const yPoints: number[] = [snap.currentPrice];
  for (const g of groups) {
    yPoints.push(g.anchorLow);
    yPoints.push(g.anchorLow + 3.4);
    yPoints.push(g.anchorLow - 3.4);
    if (g.bands.upper.currentValue !== null) yPoints.push(g.bands.upper.currentValue);
    if (g.bands.main.currentValue !== null) yPoints.push(g.bands.main.currentValue);
    if (g.bands.lower.currentValue !== null) yPoints.push(g.bands.lower.currentValue);
  }
  let yMin = Math.min(...yPoints);
  let yMax = Math.max(...yPoints);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
    yMin = snap.currentPrice - 4;
    yMax = snap.currentPrice + 4;
  }
  const pad = (yMax - yMin) * 0.2 || 2;
  yMin -= pad;
  yMax += pad;

  const xOf = (t: number) => PAD_L + ((t - t0) / (tEnd - t0)) * (W - PAD_L - PAD_R);
  const yOf = (p: number) => PAD_T + (1 - (p - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

  const xNow = xOf(now);
  const yPrice = yOf(snap.currentPrice);

  const renderGroup = (g: AnchorGroup, idx: number, isPrimary: boolean) => {
    const ts0 = new Date(g.anchorTime).getTime();
    const startX = xOf(ts0);
    const endX = xOf(tEnd);
    const dh = (tEnd - ts0) / 36e5;
    const upperEnd = g.anchorLow + 3.4 - slope * dh;
    const mainEnd = g.anchorLow - slope * dh;
    const lowerEnd = g.anchorLow - 3.4 - slope * dh;
    const opacity = isPrimary ? 1 : 0.55;
    const dash = isPrimary ? undefined : "4 4";
    return (
      <g key={g.role + idx}>
        {/* Translucent band fill between upper and lower */}
        <path
          d={`M ${startX},${yOf(g.anchorLow + 3.4)} L ${endX},${yOf(upperEnd)} L ${endX},${yOf(lowerEnd)} L ${startX},${yOf(g.anchorLow - 3.4)} Z`}
          fill="#B8821F"
          opacity={isPrimary ? 0.06 : 0.03}
          className="spy-band"
          style={{ animationDelay: `${800 + idx * 200}ms` }}
        />
        {/* Upper line */}
        <path
          d={`M ${startX},${yOf(g.anchorLow + 3.4)} L ${endX},${yOf(upperEnd)}`}
          stroke="#B5301E"
          strokeWidth={isPrimary ? 1.4 : 1}
          strokeDasharray={dash}
          opacity={opacity}
          fill="none"
          className="spy-rail"
          pathLength={1}
          style={{ animationDelay: `${200 + idx * 110}ms` }}
        />
        {/* Main line — emphasized */}
        <path
          d={`M ${startX},${yOf(g.anchorLow)} L ${endX},${yOf(mainEnd)}`}
          stroke="#B8821F"
          strokeWidth={isPrimary ? 1.8 : 1.2}
          strokeDasharray={dash}
          opacity={opacity}
          fill="none"
          className="spy-rail"
          pathLength={1}
          style={{ animationDelay: `${320 + idx * 110}ms` }}
        />
        {/* Lower line */}
        <path
          d={`M ${startX},${yOf(g.anchorLow - 3.4)} L ${endX},${yOf(lowerEnd)}`}
          stroke="#0E7C50"
          strokeWidth={isPrimary ? 1.4 : 1}
          strokeDasharray={dash}
          opacity={opacity}
          fill="none"
          className="spy-rail"
          pathLength={1}
          style={{ animationDelay: `${440 + idx * 110}ms` }}
        />
        {/* Anchor marker (the bearish candle low) */}
        <g
          className="spy-anchor"
          style={{ animationDelay: `${1000 + idx * 140}ms` }}
        >
          <circle cx={startX} cy={yOf(g.anchorLow)} r={9} fill="#B8821F" opacity={0} className="spy-anchor-pulse" />
          <circle cx={startX} cy={yOf(g.anchorLow)} r={4} fill="#fff" stroke="#B8821F" strokeWidth={1.5} />
          <circle cx={startX} cy={yOf(g.anchorLow)} r={1.6} fill="#B8821F" />
        </g>
      </g>
    );
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

      {primary && renderGroup(primary, 0, true)}
      {anchor2 && renderGroup(anchor2, 1, false)}

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

      {!primary && (
        <text
          x={W / 2}
          y={H / 2}
          fontSize="11"
          fontFamily="var(--font-geist-mono)"
          fill="#9CA3AF"
          textAnchor="middle"
        >
          No qualifying premarket anchor today
        </text>
      )}
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
  .spy-diagram .spy-band {
    opacity: 0;
    animation: spy-fade-in 600ms ease-out forwards;
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
    .spy-diagram .spy-band,
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
