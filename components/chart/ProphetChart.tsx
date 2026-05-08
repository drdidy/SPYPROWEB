"use client";
import { useMemo } from "react";
import type { Candle, DynamicLine, Pivot, TradeSignal } from "@/lib/types";

type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };

const COLOR = {
  bull: "#0E7C50",
  bear: "#B5301E",
  ink: "#14161A",
  ink2: "#3D424D",
  ink3: "#6B7280",
  ink4: "#9CA3AF",
  rule: "#E8E2D2",
  ruleStrong: "#D4CBB6",
  gold: "#B8821F",
  goldSoft: "#F4E4C0",
  teal: "#0A7589",
  paper: "#FFFFFF",
};

const LINE_COLOR: Record<string, string> = {
  UA: COLOR.bull,
  UD: COLOR.bear,
  LA: COLOR.bull,
  LD: COLOR.bear,
  S_ASC: "#16A06A",
  S_DESC: "#D34F38",
};

export function ProphetChart({
  candles,
  lines,
  pivots,
  signal,
  currentPrice,
  height = 440,
}: {
  candles: Candle[];
  lines: DynamicLine[];
  pivots: Pivot[];
  signal?: TradeSignal;
  currentPrice: number;
  height?: number;
}) {
  const w = 1100;
  const h = height;
  const padL = 8;
  const padR = 88;
  const padT = 28;
  const padB = 32;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  // Index-based x-positioning. Financial charts that space candles
  // by raw timestamp cluster the bars during dense sessions and leave
  // huge empty stretches over weekend / overnight gaps. We slot each
  // candle into a uniform column and project line / pivot times back
  // onto the column grid (linear-interpolating between the two
  // surrounding candle indices, or extrapolating in candle-hour units
  // when the time falls outside the rendered range).
  const bounds = useMemo(() => {
    const allPrices = candles
      .flatMap((c) => [c.h, c.l])
      .concat(lines.map((l) => l.currentValue));
    if (allPrices.length === 0) {
      return { yMin: 0, yMax: 1, slotW: innerW };
    }
    const yPad = (Math.max(...allPrices) - Math.min(...allPrices)) * 0.08 || 1;
    // Reserve one extra slot on the right so projected lines can extend
    // past the last candle without crashing into the price axis.
    const slotCount = Math.max(candles.length + 1, 2);
    return {
      yMin: Math.min(...allPrices) - yPad,
      yMax: Math.max(...allPrices) + yPad,
      slotW: innerW / slotCount,
    };
  }, [candles, lines, innerW]);

  // Average ms-per-bar lets us extrapolate lines whose anchor or end
  // sits outside the rendered range. Hourly bars vs 5m bars differ,
  // so we derive it from the actual data.
  const msPerBar = useMemo(() => {
    if (candles.length < 2) return 60 * 60 * 1000;
    const first = new Date(candles[0].t).getTime();
    const last = new Date(candles[candles.length - 1].t).getTime();
    return (last - first) / (candles.length - 1) || 60 * 60 * 1000;
  }, [candles]);

  const candleTimes = useMemo(
    () => candles.map((c) => new Date(c.t).getTime()),
    [candles],
  );

  // Map any timestamp to a fractional slot index. Times before the
  // first candle return negative slot indices (which still render to
  // the left of the chart, OK for line extrapolation); times after
  // the last candle extrapolate by msPerBar.
  const slotForTime = (t: number): number => {
    if (candleTimes.length === 0) return 0;
    if (t <= candleTimes[0]) {
      return -((candleTimes[0] - t) / msPerBar);
    }
    if (t >= candleTimes[candleTimes.length - 1]) {
      return (
        candleTimes.length - 1 + (t - candleTimes[candleTimes.length - 1]) / msPerBar
      );
    }
    // Binary search for the surrounding indices and interpolate.
    let lo = 0;
    let hi = candleTimes.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (candleTimes[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = candleTimes[hi] - candleTimes[lo];
    return span > 0 ? lo + (t - candleTimes[lo]) / span : lo;
  };

  const xScale = (slotIndex: number) =>
    padL + (slotIndex + 0.5) * bounds.slotW;
  const yScale = (p: number) =>
    padT + (1 - (p - bounds.yMin) / (bounds.yMax - bounds.yMin)) * innerH;

  // Y gridlines (price)
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = niceStep((bounds.yMax - bounds.yMin) / 6);
    const start = Math.ceil(bounds.yMin / step) * step;
    for (let v = start; v <= bounds.yMax; v += step) ticks.push(+v.toFixed(2));
    return ticks;
  }, [bounds]);

  const candleWidth = Math.max(2, bounds.slotW * 0.6);

  // Last slot used for projecting lines forward to the right edge of
  // the rendered area (one slot beyond the last candle).
  const lastSlot = candles.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto prophet-chart">
      <defs>
        <linearGradient id="bullGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLOR.bull} stopOpacity="0.06" />
          <stop offset="100%" stopColor={COLOR.bull} stopOpacity="0" />
        </linearGradient>
        <pattern id="dotGrid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill={COLOR.ruleStrong} opacity="0.45" />
        </pattern>
      </defs>
      <style>{chartStyles}</style>

      {/* canvas */}
      <rect x="0" y="0" width={w} height={h} fill={COLOR.paper} />
      <rect x={padL} y={padT} width={innerW} height={innerH} fill="url(#dotGrid)" opacity="0.5" />

      {/* y gridlines + labels */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={padL}
            x2={padL + innerW}
            y1={yScale(v)}
            y2={yScale(v)}
            stroke={COLOR.rule}
            strokeWidth={0.5}
          />
          <text
            x={padL + innerW + 6}
            y={yScale(v) + 3}
            fontSize="10"
            fontFamily="var(--font-geist-mono)"
            fill={COLOR.ink3}
          >
            {v.toFixed(2)}
          </text>
        </g>
      ))}

      {/* candles */}
      {candles.map((c, i) => {
        const cx = xScale(i);
        const isUp = c.c >= c.o;
        const color = isUp ? COLOR.bull : COLOR.bear;
        const yo = yScale(c.o);
        const yc = yScale(c.c);
        const yh = yScale(c.h);
        const yl = yScale(c.l);
        // Stagger fade-in across the candle series. Capped so longer
        // series still finish in well under a second.
        const delay = Math.min(i * 12, 720);
        return (
          <g key={c.t} className="candle" style={{ animationDelay: `${delay}ms` }}>
            <line x1={cx} x2={cx} y1={yh} y2={yl} stroke={color} strokeWidth={0.8} />
            <rect
              x={cx - candleWidth / 2}
              y={Math.min(yo, yc)}
              width={candleWidth}
              height={Math.max(1, Math.abs(yc - yo))}
              fill={isUp ? COLOR.bull : COLOR.bear}
              opacity={isUp ? 0.85 : 0.92}
              rx={0.5}
            />
          </g>
        );
      })}

      {/* primary + secondary lines (draw-in animation) */}
      {lines.map((l, i) => {
        const t0 = new Date(l.anchorTime).getTime();
        const startSlot = slotForTime(t0);
        // Project the line to the right edge using the last candle's
        // timestamp (or the anchor time + one bar when there are no
        // candles). Slope is per real hour, so we use real time delta.
        const lastT =
          candleTimes.length > 0
            ? candleTimes[candleTimes.length - 1]
            : t0 + msPerBar;
        const dt = (lastT - t0) / 36e5; // hours
        const startX = xScale(startSlot);
        const startY = yScale(l.anchorPrice);
        const endP = l.anchorPrice + l.slopePerHour * dt;
        const endX = xScale(lastSlot);
        const endY = yScale(endP);
        const color = LINE_COLOR[l.kind] || COLOR.ink2;
        const isPrim = l.isPrimary;
        const length = Math.hypot(endX - startX, endY - startY);
        // Primary lines lead, secondary follow. Each line plays its own
        // dasharray-based draw-on; the inline pathLength keeps the
        // animation duration consistent across long and short lines.
        const drawDelay = (isPrim ? 200 : 380) + i * 60;
        return (
          <g key={l.name}>
            <line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={color}
              strokeWidth={isPrim ? 1.25 : 1}
              opacity={isPrim ? 0.85 : 0.55}
              className={`chart-line ${isPrim ? "is-primary" : "is-secondary"}`}
              style={{
                strokeDasharray: length,
                strokeDashoffset: length,
                animationDelay: `${drawDelay}ms`,
              }}
            />
            {/* line label at right */}
            <g
              transform={`translate(${padL + innerW + 4}, ${endY})`}
              className="chart-label"
              style={{ animationDelay: `${drawDelay + 600}ms` }}
            >
              <rect
                x={0}
                y={-7.5}
                width={36}
                height={15}
                rx={3}
                fill={color}
                opacity={0.10}
              />
              <text
                x={5}
                y={3.5}
                fontSize="9"
                fontFamily="var(--font-geist-mono)"
                fill={color}
                fontWeight={600}
              >
                {l.name}
              </text>
            </g>
          </g>
        );
      })}

      {/* anchor pivots */}
      {pivots.map((p, i) => {
        const x = xScale(slotForTime(new Date(p.time).getTime()));
        const y = yScale(p.price);
        const isHigh = p.kind === "HIGH";
        return (
          <g
            key={p.kind + p.time}
            className="chart-pivot"
            style={{
              transformOrigin: `${x}px ${y}px`,
              animationDelay: `${800 + i * 120}ms`,
            }}
          >
            <circle cx={x} cy={y} r={9} fill={COLOR.gold} opacity={0.0} className="chart-pivot-pulse" />
            <circle cx={x} cy={y} r={4.5} fill={COLOR.paper} stroke={COLOR.gold} strokeWidth={1.5} />
            <circle cx={x} cy={y} r={1.8} fill={COLOR.gold} />
            <line
              x1={x}
              x2={x}
              y1={padT}
              y2={padT + innerH}
              stroke={COLOR.gold}
              strokeWidth={0.5}
              strokeDasharray="2 4"
              opacity={0.4}
            />
            <g transform={`translate(${x + 8}, ${y - (isHigh ? 8 : -16)})`}>
              <rect x={0} y={-9} width={62} height={14} rx={3} fill={COLOR.goldSoft} />
              <text x={5} y={1.5} fontSize="9" fontFamily="var(--font-geist-mono)" fill="#5C3F0B" fontWeight={600}>
                {p.kind === "HIGH" ? "▲ HIGH" : "▼ LOW"} {p.price.toFixed(2)}
              </text>
            </g>
          </g>
        );
      })}

      {/* current price line */}
      <line
        x1={padL}
        x2={padL + innerW}
        y1={yScale(currentPrice)}
        y2={yScale(currentPrice)}
        stroke={COLOR.ink}
        strokeWidth={0.8}
        strokeDasharray="1 3"
        className="chart-current-price-line"
      />
      <g
        transform={`translate(${padL + innerW + 4}, ${yScale(currentPrice)})`}
        className="chart-current-price-tag"
      >
        <rect x={0} y={-9} width={62} height={18} rx={3} fill={COLOR.ink} />
        <text
          x={31}
          y={3.5}
          textAnchor="middle"
          fontSize="11"
          fontFamily="var(--font-geist-mono)"
          fill={COLOR.paper}
          fontWeight={600}
        >
          {currentPrice.toFixed(2)}
        </text>
      </g>

      {/* latest signal marker */}
      {signal && (
        <g>
          {(() => {
            const sx = xScale(slotForTime(new Date(signal.rejectionTime).getTime()));
            const sy = yScale(signal.rejectionPrice);
            const tip = signal.type === "CALL" ? -1 : 1;
            return (
              <g
                className="chart-signal"
                style={{ transformOrigin: `${sx}px ${sy}px` }}
              >
                <circle cx={sx} cy={sy} r={6} fill={COLOR.paper} stroke={COLOR.teal} strokeWidth={1.5} />
                <circle cx={sx} cy={sy} r={2.5} fill={COLOR.teal} />
                <circle cx={sx} cy={sy} r={6} fill="none" stroke={COLOR.teal} strokeWidth={1.2} className="chart-signal-ping" />
                <line
                  x1={sx}
                  x2={sx + 22}
                  y1={sy + tip * 8}
                  y2={sy + tip * 22}
                  stroke={COLOR.teal}
                  strokeWidth={0.8}
                />
                <g transform={`translate(${sx + 22}, ${sy + tip * 22 - (tip < 0 ? 22 : 0)})`}>
                  <rect width={86} height={22} rx={3} fill={COLOR.paper} stroke={COLOR.teal} strokeWidth={0.8} />
                  <text
                    x={8}
                    y={10}
                    fontSize="9"
                    fontFamily="var(--font-geist-mono)"
                    fill={COLOR.teal}
                    fontWeight={700}
                  >
                    {signal.type} · {signal.lineName}
                  </text>
                  <text
                    x={8}
                    y={19}
                    fontSize="8.5"
                    fontFamily="var(--font-geist-mono)"
                    fill={COLOR.ink2}
                  >
                    R:R {signal.rr.toFixed(2)} · {signal.entryPrice.toFixed(2)}
                  </text>
                </g>
              </g>
            );
          })()}
        </g>
      )}

      {/* x-axis (subtle session bands omitted for clarity) */}
      <line
        x1={padL}
        x2={padL + innerW}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke={COLOR.ruleStrong}
        strokeWidth={0.5}
      />
    </svg>
  );
}

// CSS animations applied to SVG nodes via inline <style>. Keeps the
// chart self-contained — no global stylesheet additions, no
// dependencies. Each keyframe is short and eased so the chart settles
// into its read state quickly without feeling fidgety.
const chartStyles = `
  @keyframes prophet-line-draw {
    to { stroke-dashoffset: 0; }
  }
  @keyframes prophet-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes prophet-pop-in {
    0%   { opacity: 0; transform: scale(0.6); }
    70%  { opacity: 1; transform: scale(1.08); }
    100% { transform: scale(1); }
  }
  @keyframes prophet-pulse {
    0%   { opacity: 0.0; transform: scale(0.6); }
    50%  { opacity: 0.18; }
    100% { opacity: 0; transform: scale(2.4); }
  }
  @keyframes prophet-breathe {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }
  .prophet-chart .candle {
    opacity: 0;
    animation: prophet-fade-in 320ms ease-out forwards;
  }
  .prophet-chart .chart-line {
    animation: prophet-line-draw 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .prophet-chart .chart-line.is-secondary {
    animation-duration: 1100ms;
  }
  .prophet-chart .chart-label {
    opacity: 0;
    animation: prophet-fade-in 220ms ease-out forwards;
  }
  .prophet-chart .chart-pivot {
    opacity: 0;
    animation: prophet-pop-in 520ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .prophet-chart .chart-pivot-pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: prophet-pulse 2400ms ease-out infinite;
    animation-delay: 1400ms;
  }
  .prophet-chart .chart-current-price-line {
    animation: prophet-breathe 3200ms ease-in-out infinite;
  }
  .prophet-chart .chart-current-price-tag {
    opacity: 0;
    animation: prophet-fade-in 320ms ease-out 600ms forwards;
  }
  .prophet-chart .chart-signal {
    opacity: 0;
    animation: prophet-pop-in 460ms cubic-bezier(0.34, 1.56, 0.64, 1) 1100ms forwards;
  }
  .prophet-chart .chart-signal-ping {
    transform-origin: center;
    transform-box: fill-box;
    animation: prophet-pulse 2000ms ease-out 1300ms infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .prophet-chart .candle,
    .prophet-chart .chart-line,
    .prophet-chart .chart-label,
    .prophet-chart .chart-pivot,
    .prophet-chart .chart-current-price-tag,
    .prophet-chart .chart-signal {
      opacity: 1 !important;
      animation: none !important;
      stroke-dashoffset: 0 !important;
      transform: none !important;
    }
    .prophet-chart .chart-pivot-pulse,
    .prophet-chart .chart-current-price-line,
    .prophet-chart .chart-signal-ping {
      animation: none !important;
    }
  }
`;

function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / Math.pow(10, exp);
  let nice = 1;
  if (f < 1.5) nice = 1;
  else if (f < 3) nice = 2;
  else if (f < 7) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}
