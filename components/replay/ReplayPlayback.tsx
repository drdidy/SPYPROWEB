"use client";

// Synced SPY + SPX playback. Two SVG panels share a single playhead
// (0..1) controlled by the parent ReplayWorkspace. Each panel:
//   - draws its framework lines (SPY anchor bands / SPX channel rails)
//     extended across the trading session,
//   - draws the intraday price path forward up to the playhead position,
//   - pops a marker at every line "touch" event whose timestamp is
//     <= the current playhead time.

import { useMemo } from "react";

import type { AdaptedSnapshot, AnchorGroup } from "@/lib/snapshot-adapter";
import type { SPXSnapshot, SPXLine } from "@/lib/types";
import type { IntradayBar, IntradayResponse } from "./ReplayWorkspace";

interface Props {
  spy: AdaptedSnapshot | null;
  spx: SPXSnapshot | null;
  intraday: IntradayResponse;
  playhead: number;
}

interface LineProjection {
  name: string;
  color: string;
  emphasized: boolean;
  // Function returning the price at any time.t (ms epoch).
  valueAtMs: (ms: number) => number;
}

interface TouchEvent {
  lineName: string;
  timeMs: number;
  price: number;
}

// ---------------------------------------------------------------------------

const SPY_BAND_OFFSET = 3.4;
const SPY_SLOPE = 0.2;

export function ReplayPlayback({ spy, spx, intraday, playhead }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <SPYPlaybackPanel snap={spy} bars={intraday.spy} playhead={playhead} />
      <SPXPlaybackPanel
        snap={spx}
        bars={intraday.es}
        playhead={playhead}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SPY panel — three descending bands + intraday SPY tape
// ---------------------------------------------------------------------------

function SPYPlaybackPanel({
  snap,
  bars,
  playhead,
}: {
  snap: AdaptedSnapshot | null;
  bars: IntradayBar[];
  playhead: number;
}) {
  const anchor = snap?.anchor?.primary ?? null;

  const lines = useMemo<LineProjection[]>(() => {
    if (!anchor) return [];
    return spyAnchorProjections(anchor, snap?.anchor?.slopePerHour ?? SPY_SLOPE);
  }, [anchor, snap]);

  return (
    <PanelChart
      title="SPY · anchors vs tape"
      bars={bars}
      lines={lines}
      playhead={playhead}
      priceColor="#14161A"
      emptyMsg={
        anchor
          ? "No 5-minute SPY bars for this date"
          : "No primary anchor for this date"
      }
    />
  );
}

function spyAnchorProjections(anchor: AnchorGroup, slope: number): LineProjection[] {
  const t0Ms = new Date(anchor.anchorTime).getTime();
  const slopePerMs = slope / 36e5; // pts per ms
  const make = (band: "upper" | "main" | "lower"): LineProjection => {
    const base =
      band === "upper"
        ? anchor.anchorLow + SPY_BAND_OFFSET
        : band === "lower"
          ? anchor.anchorLow - SPY_BAND_OFFSET
          : anchor.anchorLow;
    const color =
      band === "upper" ? "#B5301E" : band === "lower" ? "#0E7C50" : "#B8821F";
    return {
      name: `SPY ${band}`,
      color,
      emphasized: band === "main",
      valueAtMs: (ms: number) => base - slopePerMs * (ms - t0Ms),
    };
  };
  return [make("upper"), make("main"), make("lower")];
}

// ---------------------------------------------------------------------------
// SPX panel — channel rails + intraday ES (offset to SPX)
// ---------------------------------------------------------------------------

function SPXPlaybackPanel({
  snap,
  bars,
  playhead,
}: {
  snap: SPXSnapshot | null;
  bars: IntradayBar[];
  playhead: number;
}) {
  const offset = snap?._meta?.appliedOffset ?? 0;

  // Convert ES bars → SPX equivalent by adding the live offset. This is a
  // v1 approximation (offset drifts day to day) — close enough for a
  // visual replay of the channel intersect points.
  const spxBars = useMemo<IntradayBar[]>(
    () =>
      bars.map((b) => ({
        t: b.t,
        o: b.o + offset,
        h: b.h + offset,
        l: b.l + offset,
        c: b.c + offset,
      })),
    [bars, offset],
  );

  const lines = useMemo<LineProjection[]>(() => {
    if (!snap) return [];
    return spxLineProjections(snap.lines);
  }, [snap]);

  return (
    <PanelChart
      title="SPX · channel vs tape"
      bars={spxBars}
      lines={lines}
      playhead={playhead}
      priceColor="#14161A"
      emptyMsg={
        snap
          ? "No 5-minute ES bars for this date"
          : "No SPX snapshot for this date"
      }
    />
  );
}

function spxLineProjections(lines: SPXLine[]): LineProjection[] {
  // Colors map to the four SPX engine line kinds:
  //   - CHANNEL_CEILING / CHANNEL_FLOOR   solid, rendered emphasized
  //   - PREV_RTH_HIGH_ASC                 ascending ref above the channel
  //   - PREV_RTH_LOW_DESC                 descending ref below the channel
  const palette: Record<string, string> = {
    CHANNEL_CEILING: "#B5301E",
    CHANNEL_FLOOR: "#0E7C50",
    PREV_RTH_HIGH_ASC: "#7E5BAE",
    PREV_RTH_LOW_DESC: "#7E5BAE",
  };
  return lines.map((l) => {
    const t0Ms = new Date(l.anchorTime).getTime();
    const slopePerMs = l.slopePerHour / 36e5;
    return {
      name: l.name,
      color: palette[l.kind] ?? "#9CA3AF",
      emphasized: l.kind === "CHANNEL_CEILING" || l.kind === "CHANNEL_FLOOR",
      valueAtMs: (ms: number) => l.anchorPrice + slopePerMs * (ms - t0Ms),
    };
  });
}

// ---------------------------------------------------------------------------
// Generic panel — given lines + bars + playhead, draws the chart.
// ---------------------------------------------------------------------------

function PanelChart({
  title,
  bars,
  lines,
  playhead,
  priceColor,
  emptyMsg,
}: {
  title: string;
  bars: IntradayBar[];
  lines: LineProjection[];
  playhead: number;
  priceColor: string;
  emptyMsg: string;
}) {
  const W = 540;
  const H = 280;
  const PAD_L = 44;
  const PAD_R = 14;
  const PAD_T = 18;
  const PAD_B = 26;

  const hasBars = bars.length > 0;

  // Time axis: from first bar to last bar.
  const t0Ms = hasBars ? new Date(bars[0].t).getTime() : 0;
  const tEndMs = hasBars ? new Date(bars[bars.length - 1].t).getTime() : 0;
  const tNowMs = hasBars ? t0Ms + (tEndMs - t0Ms) * playhead : 0;

  // Y range: include all bars + each line's value across the session.
  const yPoints: number[] = [];
  if (hasBars) {
    for (const b of bars) {
      yPoints.push(b.l, b.h);
    }
    for (const ln of lines) {
      yPoints.push(ln.valueAtMs(t0Ms), ln.valueAtMs(tEndMs));
    }
  }
  let yMin = yPoints.length ? Math.min(...yPoints) : 0;
  let yMax = yPoints.length ? Math.max(...yPoints) : 1;
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.12;
  yMin -= pad;
  yMax += pad;

  const xOf = (ms: number) =>
    PAD_L + ((ms - t0Ms) / (tEndMs - t0Ms || 1)) * (W - PAD_L - PAD_R);
  const yOf = (p: number) =>
    PAD_T + (1 - (p - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

  // Pre-compute touch events: every (bar, line) pair where the bar's
  // [low, high] crossed the line value. We project all of them, then
  // only render the ones whose time is <= the playhead.
  const touches = useMemo<TouchEvent[]>(() => {
    if (!hasBars) return [];
    const out: TouchEvent[] = [];
    for (const b of bars) {
      const ms = new Date(b.t).getTime();
      for (const ln of lines) {
        const v = ln.valueAtMs(ms);
        if (b.l <= v && b.h >= v) {
          out.push({ lineName: ln.name, timeMs: ms, price: v });
        }
      }
    }
    return out;
  }, [bars, lines, hasBars]);

  const visibleTouches = touches.filter((t) => t.timeMs <= tNowMs);

  // Build the price path up to the playhead.
  const visibleBars = bars.filter(
    (b) => new Date(b.t).getTime() <= tNowMs,
  );
  const pricePath = visibleBars
    .map((b, i) => {
      const x = xOf(new Date(b.t).getTime());
      const y = yOf(b.c);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastBar = visibleBars[visibleBars.length - 1] ?? null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="eyebrow text-ink-3">{title}</span>
        {lastBar && (
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {shortTime(lastBar.t)} CT ·{" "}
            <span className="text-ink font-semibold">{lastBar.c.toFixed(2)}</span>
          </span>
        )}
      </div>
      {!hasBars || lines.length === 0 ? (
        <div className="font-mono text-[12px] text-ink-3 italic py-12 text-center">
          {emptyMsg}
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <style>{playbackStyles}</style>

          {/* gridlines */}
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

          {/* y ticks */}
          {[0.15, 0.5, 0.85].map((f, i) => {
            const p = yMin + (yMax - yMin) * (1 - f);
            return (
              <text
                key={i}
                x={PAD_L - 4}
                y={PAD_T + f * (H - PAD_T - PAD_B) + 3}
                fontSize="9"
                fontFamily="var(--font-geist-mono)"
                fill="#9CA3AF"
                textAnchor="end"
              >
                {p.toFixed(1)}
              </text>
            );
          })}

          {/* time axis labels (open / mid / close) */}
          {hasBars &&
            [0, 0.5, 1].map((f, i) => {
              const ms = t0Ms + (tEndMs - t0Ms) * f;
              return (
                <text
                  key={i}
                  x={PAD_L + f * (W - PAD_L - PAD_R)}
                  y={H - 8}
                  fontSize="9"
                  fontFamily="var(--font-geist-mono)"
                  fill="#9CA3AF"
                  textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                >
                  {shortTime(new Date(ms).toISOString())}
                </text>
              );
            })}

          {/* framework lines (full session) */}
          {lines.map((ln) => {
            const x1 = xOf(t0Ms);
            const x2 = xOf(tEndMs);
            const y1 = yOf(ln.valueAtMs(t0Ms));
            const y2 = yOf(ln.valueAtMs(tEndMs));
            return (
              <line
                key={ln.name}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={ln.color}
                strokeWidth={ln.emphasized ? 1.6 : 1}
                opacity={ln.emphasized ? 0.95 : 0.6}
                strokeDasharray={ln.emphasized ? undefined : "3 3"}
              />
            );
          })}

          {/* price path */}
          {pricePath && (
            <path
              d={pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* playhead vertical guide */}
          {hasBars && (
            <line
              x1={xOf(tNowMs)}
              y1={PAD_T}
              x2={xOf(tNowMs)}
              y2={H - PAD_B}
              stroke="#B8821F"
              strokeWidth={0.8}
              opacity={0.4}
              strokeDasharray="2 3"
            />
          )}

          {/* current price marker */}
          {lastBar && (
            <g>
              <circle
                cx={xOf(new Date(lastBar.t).getTime())}
                cy={yOf(lastBar.c)}
                r={9}
                fill={priceColor}
                opacity={0.12}
              />
              <circle
                cx={xOf(new Date(lastBar.t).getTime())}
                cy={yOf(lastBar.c)}
                r={3.5}
                fill={priceColor}
              />
            </g>
          )}

          {/* touch markers — pop in as playhead passes their time */}
          {visibleTouches.map((t, i) => (
            <g key={`${t.lineName}-${t.timeMs}-${i}`} className="touch-marker">
              <circle
                cx={xOf(t.timeMs)}
                cy={yOf(t.price)}
                r={6}
                fill="#B8821F"
                opacity={0.25}
                className="touch-pulse"
              />
              <circle
                cx={xOf(t.timeMs)}
                cy={yOf(t.price)}
                r={3}
                fill="#B8821F"
                stroke="#fff"
                strokeWidth={1}
              />
            </g>
          ))}
        </svg>
      )}

      {/* touch event log */}
      {visibleTouches.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
          {visibleTouches
            .slice(-6)
            .reverse()
            .map((t, i) => (
              <div
                key={`log-${i}`}
                className="flex items-center justify-between font-mono text-[11px] text-ink-2 tabular-nums px-2 py-1 bg-gold-tint/30 rounded-soft"
              >
                <span>{shortTime(new Date(t.timeMs).toISOString())} CT</span>
                <span className="text-gold-ink font-semibold">
                  touched {t.lineName}
                </span>
                <span>@ {t.price.toFixed(2)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const playbackStyles = `
  @keyframes touch-pop {
    0%   { opacity: 0; transform: scale(0.4); }
    60%  { opacity: 1; transform: scale(1.15); }
    100% { transform: scale(1); }
  }
  @keyframes touch-pulse-out {
    0%   { opacity: 0.4; transform: scale(0.6); }
    100% { opacity: 0; transform: scale(2); }
  }
  .touch-marker {
    transform-origin: center;
    transform-box: fill-box;
    animation: touch-pop 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .touch-pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: touch-pulse-out 1400ms ease-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .touch-marker, .touch-pulse { animation: none !important; }
  }
`;

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}
