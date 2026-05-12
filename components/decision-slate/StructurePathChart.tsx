import { cn } from "@/lib/utils";

export interface StructureChartBar {
  t: string;
  h: number;
  l: number;
  c: number;
}

export interface StructureChartLine {
  label: string;
  anchorTime: string;
  anchorPrice: number;
  slopePerHour: number;
  tone: "upper" | "anchor" | "lower" | "reference";
}

export interface StructureChartData {
  label: string;
  date: string;
  bars: StructureChartBar[];
  lines: StructureChartLine[];
}

export function StructurePathChart({
  data,
  variant = "paper",
  accent = "neutral",
  className,
  height = 170,
  title = "Actual path vs rails",
  frameless = false,
}: {
  data?: StructureChartData | null;
  variant?: "paper" | "dark";
  accent?: "bull" | "bear" | "gold" | "violet" | "neutral";
  className?: string;
  height?: number;
  title?: string;
  frameless?: boolean;
}) {
  const W = 620;
  const largeCanvas = height >= 320;
  const H = largeCanvas ? 420 : 230;
  const PAD_L = 48;
  const PAD_R = largeCanvas ? 132 : 124;
  const PAD_T = largeCanvas ? 34 : 22;
  const PAD_B = largeCanvas ? 40 : 28;
  const bars = (data?.bars ?? []).filter(validBar);
  const lines = (data?.lines ?? []).filter(validLine);
  const hasData = bars.length >= 2 && lines.length > 0;
  const palette = paletteFor(variant);
  const accentStroke = accentColor(accent, variant);

  if (!hasData) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[8px] border px-3 text-center font-mono text-[11px]",
          frameless
            ? "border-transparent bg-transparent text-paper/45"
            : variant === "dark"
              ? "border-paper/10 bg-paper/[0.035] text-paper/45"
              : "border-rule-soft bg-paper text-ink-3",
          className,
        )}
        style={{ minHeight: height }}
      >
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:38px_38px]",
            variant === "dark" ? "opacity-40" : "opacity-20",
          )}
        />
        <div className="relative grid min-h-[inherit] place-items-center py-6">
          <div>
            <div
              className={cn(
                "text-[9px] uppercase tracking-[0.18em]",
                variant === "dark" ? "text-gold-soft/70" : "text-gold-ink",
              )}
            >
              Chart unavailable
            </div>
            <div
              className={cn(
                "mt-2 max-w-[260px] text-[11px] leading-relaxed",
                variant === "dark" ? "text-paper/48" : "text-ink-3",
              )}
            >
              Actual path and rails render only after both replay bars and
              measured structure lines are available. No illustrative chart is
              drawn in their place.
            </div>
            {data?.date && (
              <div
                className={cn(
                  "mt-3 text-[10px] tabular-nums",
                  variant === "dark" ? "text-paper/36" : "text-ink-4",
                )}
              >
                {data.label} - {data.date}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const t0 = new Date(bars[0].t).getTime();
  const t1 = new Date(bars[bars.length - 1].t).getTime();
  const lineValue = (line: StructureChartLine, ms: number) =>
    line.anchorPrice + line.slopePerHour * ((ms - new Date(line.anchorTime).getTime()) / 36e5);

  const yValues: number[] = [];
  for (const bar of bars) yValues.push(bar.h, bar.l, bar.c);
  for (const line of lines) yValues.push(lineValue(line, t0), lineValue(line, t1));
  let yMin = Math.min(...yValues);
  let yMax = Math.max(...yValues);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.14;
  yMin -= yPad;
  yMax += yPad;

  const xOf = (ms: number) => PAD_L + ((ms - t0) / Math.max(1, t1 - t0)) * (W - PAD_L - PAD_R);
  const yOf = (price: number) => PAD_T + (1 - (price - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);
  const pricePath = bars
    .map((bar, i) => `${i === 0 ? "M" : "L"} ${xOf(new Date(bar.t).getTime()).toFixed(1)},${yOf(bar.c).toFixed(1)}`)
    .join(" ");
  const last = bars[bars.length - 1];
  const touches = bars.flatMap((bar) => {
    const ms = new Date(bar.t).getTime();
    return lines
      .map((line) => {
        const price = lineValue(line, ms);
        return bar.l <= price && bar.h >= price
          ? { key: `${line.label}-${bar.t}`, ms, price, tone: line.tone }
          : null;
      })
      .filter(Boolean) as Array<{ key: string; ms: number; price: number; tone: StructureChartLine["tone"] }>;
  });

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[6px] border",
        frameless
          ? "border-transparent bg-transparent"
          : variant === "dark"
            ? "border-paper/10 bg-paper/[0.035]"
            : "border-rule-soft bg-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
        className,
      )}
      style={{ minHeight: height }}
    >
      <div
        className={cn(
          "relative z-10 flex items-start justify-between gap-3 border-b px-3 py-2",
          frameless
            ? "border-transparent bg-transparent"
            : variant === "dark"
              ? "border-paper/10 bg-[#071218]/88"
              : "border-rule-soft bg-paper/80",
        )}
      >
        <div>
        <div
          className={cn(
            "font-mono text-[9px] uppercase tracking-[0.16em]",
            variant === "dark" ? "text-paper/45" : "text-ink-3",
          )}
        >
          {title}
        </div>
        <div
          className={cn(
            "mt-0.5 font-mono text-[10px] tabular-nums",
            variant === "dark" ? "text-gold-soft/80" : "text-gold-ink",
          )}
        >
          {data?.label} - {data?.date}
        </div>
        </div>
        <div
          className={cn(
            "rounded-[4px] border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em]",
            variant === "dark"
              ? "border-paper/10 bg-paper/[0.035] text-paper/42"
              : "border-rule-soft bg-paper-2 text-ink-3",
          )}
        >
          Refs
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: Math.max(118, height - 38) }}
        role="img"
        aria-label={`${data?.label} actual price path against engine rails`}
      >
        <style>{chartStyles}</style>
        <rect x="0" y="0" width={W} height={H} fill="transparent" />
        {[0.25, 0.5, 0.75].map((f) => {
          const y = PAD_T + f * (H - PAD_T - PAD_B);
          return <line key={f} x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke={palette.grid} strokeWidth="0.8" strokeDasharray="3 6" />;
        })}
        {[0, 0.5, 1].map((f, i) => {
          const x = PAD_L + f * (W - PAD_L - PAD_R);
          return <line key={i} x1={x} x2={x} y1={PAD_T} y2={H - PAD_B} stroke={palette.grid} strokeWidth="0.6" opacity="0.55" />;
        })}
        {lines.map((line) => {
          const yStart = yOf(lineValue(line, t0));
          const yEnd = yOf(lineValue(line, t1));
          const stroke = lineColor(line.tone, variant);
          const projectedNow = lineValue(line, new Date(last.t).getTime());
          return (
            <g key={line.label}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yStart}
                y2={yEnd}
                stroke={stroke}
                strokeWidth={line.tone === "anchor" ? 1.8 : 1.2}
                strokeDasharray={line.tone === "anchor" ? undefined : "6 7"}
                opacity={line.tone === "anchor" ? 0.95 : 0.72}
              />
              <text
                x={W - PAD_R + 8}
                y={yEnd + 3}
                fontSize={largeCanvas ? "12" : "11"}
                fontFamily="var(--font-geist-mono)"
                fontWeight="700"
                fill={stroke}
              >
                {line.label} {projectedNow.toFixed(2)}
              </text>
            </g>
          );
        })}
        <path
          d={pricePath}
          fill="none"
          stroke={accentStroke}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="structure-price-path"
          pathLength={1}
        />
        <path
          d={pricePath}
          fill="none"
          stroke={accentStroke}
          strokeWidth="7"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.12"
          className="structure-price-glow"
          pathLength={1}
        />
        {touches.slice(-18).map((touch, i) => (
          <circle
            key={`${touch.key}-${i}`}
            cx={xOf(touch.ms)}
            cy={yOf(touch.price)}
            r="3.2"
            fill={lineColor(touch.tone, variant)}
            stroke={variant === "dark" ? "#071116" : "#FFFFFF"}
            strokeWidth="1"
            className="structure-touch"
          />
        ))}
        <g>
          <line
            x1={xOf(new Date(last.t).getTime())}
            x2={xOf(new Date(last.t).getTime())}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke={palette.marker}
            strokeWidth="0.9"
            strokeDasharray="3 5"
          />
          <circle
            cx={xOf(new Date(last.t).getTime())}
            cy={yOf(last.c)}
            r="9"
            fill={accentStroke}
            opacity="0.14"
          />
          <circle
            cx={xOf(new Date(last.t).getTime())}
            cy={yOf(last.c)}
            r="3.8"
            fill={accentStroke}
          />
        </g>
        <text x={PAD_L} y={H - 8} fontSize="10" fontFamily="var(--font-geist-mono)" fill={palette.axis}>
          {shortTime(bars[0].t)}
        </text>
        <text x={W - PAD_R} y={H - 8} fontSize="10" fontFamily="var(--font-geist-mono)" fill={palette.axis} textAnchor="end">
          {shortTime(last.t)}
        </text>
        <text x={W - 12} y={18} fontSize="11" fontFamily="var(--font-geist-mono)" fontWeight="700" fill={palette.axis} textAnchor="end">
          LAST {last.c.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}

function validBar(bar: StructureChartBar): boolean {
  return !!bar.t && Number.isFinite(bar.h) && Number.isFinite(bar.l) && Number.isFinite(bar.c);
}

function validLine(line: StructureChartLine): boolean {
  return !!line.anchorTime && Number.isFinite(line.anchorPrice) && Number.isFinite(line.slopePerHour);
}

function paletteFor(variant: "paper" | "dark") {
  return variant === "dark"
    ? {
        grid: "rgba(255,255,255,0.10)",
        axis: "rgba(255,255,255,0.46)",
        marker: "rgba(244,228,192,0.45)",
      }
    : {
        grid: "rgba(20,22,26,0.10)",
        axis: "#9CA3AF",
        marker: "rgba(184,130,31,0.45)",
      };
}

function accentColor(accent: "bull" | "bear" | "gold" | "violet" | "neutral", variant: "paper" | "dark"): string {
  if (accent === "bull") return "#0E7C50";
  if (accent === "bear") return "#B5301E";
  if (accent === "gold") return "#B8821F";
  if (accent === "violet") return "#7E5BAE";
  return variant === "dark" ? "#F4E4C0" : "#14161A";
}

function lineColor(tone: StructureChartLine["tone"], variant: "paper" | "dark"): string {
  if (tone === "upper") return "#0E7C50";
  if (tone === "lower") return "#B5301E";
  if (tone === "anchor") return variant === "dark" ? "#F4E4C0" : "#B8821F";
  return variant === "dark" ? "rgba(255,255,255,0.58)" : "#7E5BAE";
}

function shortTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "--:--";
  }
}

const chartStyles = `
  @keyframes structure-draw {
    from { stroke-dashoffset: 1; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes structure-touch-pop {
    0% { opacity: 0; transform: scale(0.4); }
    70% { opacity: 1; transform: scale(1.18); }
    100% { opacity: 1; transform: scale(1); }
  }
  .structure-price-path,
  .structure-price-glow {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: structure-draw 1600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .structure-price-glow { animation-delay: 120ms; }
  .structure-touch {
    transform-box: fill-box;
    transform-origin: center;
    animation: structure-touch-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @media (prefers-reduced-motion: reduce) {
    .structure-price-path,
    .structure-price-glow,
    .structure-touch {
      animation: none !important;
      stroke-dashoffset: 0;
    }
  }
`;
