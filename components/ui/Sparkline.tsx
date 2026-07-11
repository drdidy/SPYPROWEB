"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

export function Sparkline({
  data,
  color = "currentColor",
  fill = false,
  w = 80,
  h = 24,
  strokeWidth = 1.5,
}: {
  data: number[];
  color?: string;
  fill?: boolean;
  w?: number;
  h?: number;
  strokeWidth?: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / range) * (h - 2) - 1;
    return [x, y] as const;
  });
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${pts[0][0]},${h} ${line} ${pts[pts.length - 1][0]},${h}`;
  const selectedIndex = activeIndex ?? data.length - 1;
  const selected = pts[Math.max(0, Math.min(pts.length - 1, selectedIndex))];
  const selectedValue = data[Math.max(0, Math.min(data.length - 1, selectedIndex))];
  const labelX = selected[0] > w - 26 ? selected[0] - 24 : selected[0] + 5;
  return (
    <svg
      width={w}
      height={h}
      className="inline-block overflow-visible outline-none"
      role="img"
      tabIndex={0}
      aria-label={`Sparkline, latest value ${selectedValue.toFixed(2)}`}
      onPointerMove={(event) => setActiveIndex(nearestPoint(event, w, data.length))}
      onPointerLeave={() => setActiveIndex(null)}
      onFocus={() => setActiveIndex((value) => value ?? data.length - 1)}
      onKeyDown={(event) => setActiveIndex((value) => stepPoint(event, value ?? data.length - 1, data.length))}
    >
      {fill && <polygon points={area} fill={color} fillOpacity={0.1} />}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={selected[0]}
        x2={selected[0]}
        y1={1}
        y2={h - 1}
        stroke={color}
        strokeWidth={0.7}
        strokeDasharray="2 3"
        opacity={0.42}
      />
      <circle cx={selected[0]} cy={selected[1]} r={2.4} fill={color} stroke="white" strokeWidth={1} />
      <text
        x={labelX}
        y={Math.max(7, selected[1] - 3)}
        fontSize="7"
        fontFamily="var(--font-geist-mono)"
        fontWeight={700}
        fill={color}
      >
        {selectedValue.toFixed(2)}
      </text>
    </svg>
  );
}

function nearestPoint(event: PointerEvent<SVGSVGElement>, width: number, count: number): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
  return Math.max(0, Math.min(count - 1, Math.round((x / Math.max(1, width)) * (count - 1))));
}

function stepPoint(event: KeyboardEvent<SVGSVGElement>, current: number, count: number): number {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return current;
  event.preventDefault();
  if (event.key === "Home") return 0;
  if (event.key === "End") return Math.max(0, count - 1);
  return Math.max(0, Math.min(count - 1, current + (event.key === "ArrowLeft" ? -1 : 1)));
}
