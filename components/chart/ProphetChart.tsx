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

  const bounds: Bounds = useMemo(() => {
    const allTimes = candles.map((c) => new Date(c.t).getTime());
    const xMin = Math.min(...allTimes);
    const xMax = Math.max(...allTimes) + 4 * 60 * 60 * 1000; // pad 1 bar
    const allPrices = candles.flatMap((c) => [c.h, c.l]).concat(lines.map((l) => l.currentValue));
    const yPad = (Math.max(...allPrices) - Math.min(...allPrices)) * 0.08;
    return {
      xMin,
      xMax,
      yMin: Math.min(...allPrices) - yPad,
      yMax: Math.max(...allPrices) + yPad,
    };
  }, [candles, lines]);

  const xScale = (t: number) =>
    padL + ((t - bounds.xMin) / (bounds.xMax - bounds.xMin)) * innerW;
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

  const candleWidth = Math.max(2, (innerW / candles.length) * 0.55);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <defs>
        <linearGradient id="bullGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLOR.bull} stopOpacity="0.06" />
          <stop offset="100%" stopColor={COLOR.bull} stopOpacity="0" />
        </linearGradient>
        <pattern id="dotGrid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill={COLOR.ruleStrong} opacity="0.45" />
        </pattern>
      </defs>

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
      {candles.map((c) => {
        const cx = xScale(new Date(c.t).getTime());
        const isUp = c.c >= c.o;
        const color = isUp ? COLOR.bull : COLOR.bear;
        const yo = yScale(c.o);
        const yc = yScale(c.c);
        const yh = yScale(c.h);
        const yl = yScale(c.l);
        return (
          <g key={c.t}>
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

      {/* fan lines */}
      {lines.map((l) => {
        const t0 = new Date(l.anchorTime).getTime();
        const dt = (bounds.xMax - t0) / 36e5; // hours
        const startX = xScale(t0);
        const startY = yScale(l.anchorPrice);
        const endP = l.anchorPrice + l.slopePerHour * dt;
        const endX = xScale(bounds.xMax);
        const endY = yScale(endP);
        const color = LINE_COLOR[l.kind] || COLOR.ink2;
        const isPrim = l.isPrimary;
        return (
          <g key={l.name}>
            <line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={color}
              strokeWidth={isPrim ? 1.25 : 1}
              strokeDasharray={isPrim ? "" : "3 4"}
              opacity={isPrim ? 0.85 : 0.55}
            />
            {/* line label at right */}
            <g transform={`translate(${padL + innerW + 4}, ${endY})`}>
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
      {pivots.map((p) => {
        const x = xScale(new Date(p.time).getTime());
        const y = yScale(p.price);
        const isHigh = p.kind === "HIGH";
        return (
          <g key={p.kind + p.time}>
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
      />
      <g transform={`translate(${padL + innerW + 4}, ${yScale(currentPrice)})`}>
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
            const sx = xScale(new Date(signal.rejectionTime).getTime());
            const sy = yScale(signal.rejectionPrice);
            const tip = signal.type === "CALL" ? -1 : 1;
            return (
              <>
                <circle cx={sx} cy={sy} r={6} fill={COLOR.paper} stroke={COLOR.teal} strokeWidth={1.5} />
                <circle cx={sx} cy={sy} r={2.5} fill={COLOR.teal} />
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
              </>
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
