"use client";

// Synced SPY + SPX playback. Two SVG panels share a single playhead
// (0..1) controlled by the parent ReplayWorkspace. Each panel:
//   - draws its framework lines (SPY anchor bands / SPX channel rails)
//     extended across the trading session,
//   - draws the intraday price path forward up to the playhead position,
//   - pops a marker at every line "touch" event whose timestamp is
//     <= the current playhead time.

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { AdaptedSnapshot, AnchorGroup } from "@/lib/snapshot-adapter";
import type { SPXSnapshot, SPXLine } from "@/lib/types";
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from "@/lib/replay/config";
import type { IntradayBar, IntradayResponse } from "./ReplayWorkspace";

interface Props {
  spy: AdaptedSnapshot | null;
  spx: SPXSnapshot | null;
  intraday: IntradayResponse;
  spyPlayback: ReplayChartPlayback;
  esPlayback: ReplayChartPlayback;
}

export interface ReplayChartPlayback {
  playhead: number;
  playing: boolean;
  speed: PlaybackSpeed;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onScrub: (value: number) => void;
  onSpeed: (value: PlaybackSpeed) => void;
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
const SPY_SLOPE = -0.2;

export function ReplayPlayback({ spy, spx, intraday, spyPlayback, esPlayback }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5">
      <SPYPlaybackPanel snap={spy} bars={intraday.spy} playback={spyPlayback} />
      <SPXPlaybackPanel
        snap={spx}
        bars={intraday.es}
        playback={esPlayback}
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
  playback,
}: {
  snap: AdaptedSnapshot | null;
  bars: IntradayBar[];
  playback: ReplayChartPlayback;
}) {
  const anchor = snap?.anchor?.primary ?? null;

  const lines = useMemo<LineProjection[]>(() => {
    if (!anchor) return [];
    return spyAnchorProjections(anchor, snap?.anchor?.slopePerHour ?? SPY_SLOPE);
  }, [anchor, snap]);

  return (
    <PanelChart
      title="SPY - 03:00 to 15:00 CT"
      bars={bars}
      lines={lines}
      playback={playback}
      priceColor="#F4E4C0"
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
  const slopePerMs = slope / 36e5; // signed pts per ms
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
      valueAtMs: (ms: number) => base + slopePerMs * (ms - t0Ms),
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
  playback,
}: {
  snap: SPXSnapshot | null;
  bars: IntradayBar[];
  playback: ReplayChartPlayback;
}) {
  const lines = useMemo<LineProjection[]>(() => {
    if (!snap) return [];
    return spxLineProjections(snap.lines);
  }, [snap]);

  return (
    <PanelChart
      title="ES - overnight plus RTH"
      bars={bars}
      lines={lines}
      playback={playback}
      priceColor="#F4E4C0"
      emptyMsg={
        snap
          ? "No 5-minute ES bars for this date"
          : "No ES snapshot for this date"
      }
    />
  );
}

function spxLineProjections(lines: SPXLine[]): LineProjection[] {
  // Colors map to the ES six-line framework.
  const palette: Record<string, string> = {
    PREV_RTH_HIGH_ASC: "#7E5BAE",
    PREV_RTH_LOW_DESC: "#7E5BAE",
    SWING_HIGH_ASC: "#B8860B",
    SWING_HIGH_DESC: "#B5301E",
    SWING_LOW_ASC: "#0E7C50",
    SWING_LOW_DESC: "#B8860B",
  };
  return lines.map((l) => {
    const t0Ms = new Date(l.anchorTime).getTime();
    const slopePerMs = l.slopePerHour / 36e5;
    return {
      name: shortEsLineName(l.kind),
      color: palette[l.kind] ?? "#9CA3AF",
      emphasized: l.kind === "SWING_HIGH_DESC" || l.kind === "SWING_LOW_ASC",
      valueAtMs: (ms: number) => l.anchorPrice + slopePerMs * (ms - t0Ms),
    };
  });
}

function shortEsLineName(kind: string): string {
  const labels: Record<string, string> = {
    PREV_RTH_HIGH_ASC: "PRH-A",
    PREV_RTH_LOW_DESC: "PRL-D",
    SWING_HIGH_ASC: "SH-A",
    SWING_HIGH_DESC: "SH-D",
    SWING_LOW_ASC: "SL-A",
    SWING_LOW_DESC: "SL-D",
  };
  return labels[kind] ?? "ES-L";
}

// ---------------------------------------------------------------------------
// Generic panel — given lines + bars + playhead, draws the chart.
// ---------------------------------------------------------------------------

function PanelChart({
  title,
  bars,
  lines,
  playback,
  priceColor,
  emptyMsg,
}: {
  title: string;
  bars: IntradayBar[];
  lines: LineProjection[];
  playback: ReplayChartPlayback;
  priceColor: string;
  emptyMsg: string;
}) {
  const W = 1040;
  const H = 440;
  const PAD_L = 62;
  const PAD_R = 172;
  const PAD_T = 34;
  const PAD_B = 44;

  const hasBars = bars.length > 0;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { playhead } = playback;

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
  const fullPricePath = bars
    .map((b, i) => {
      const x = xOf(new Date(b.t).getTime());
      const y = yOf(b.c);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastBar = visibleBars[visibleBars.length - 1] ?? null;
  const selectedIndex = activeIndex ?? (lastBar ? Math.max(0, visibleBars.length - 1) : 0);
  const selected = bars[Math.max(0, Math.min(bars.length - 1, selectedIndex))] ?? null;
  const selectedMs = selected ? new Date(selected.t).getTime() : tNowMs;
  const selectedX = selected ? xOf(selectedMs) : xOf(tNowMs);
  const selectedY = selected ? yOf(selected.c) : 0;
  const selectedLine = selected
    ? lines
        .slice()
        .sort(
          (a, b) =>
            Math.abs(a.valueAtMs(selectedMs) - selected.c) -
            Math.abs(b.valueAtMs(selectedMs) - selected.c),
        )[0] ?? null
    : null;
  const selectedLineValue = selectedLine ? selectedLine.valueAtMs(selectedMs) : null;
  const tooltipX = Math.min(W - PAD_R - 148, Math.max(PAD_L + 4, selectedX + 12));
  const tooltipY = Math.min(H - PAD_B - 66, Math.max(PAD_T + 4, selectedY - 38));

  return (
    <div className="rounded-[14px] border border-paper/10 bg-paper/[0.035] p-3 md:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold-soft">{title}</span>
        {lastBar && (
          <span className="font-mono text-[12px] text-paper/70 tabular-nums">
            {shortTime(lastBar.t)} CT -{" "}
            <span className="text-paper font-semibold">{lastBar.c.toFixed(2)}</span>
          </span>
        )}
      </div>
      {!hasBars || lines.length === 0 ? (
        <div className="font-mono text-[12px] text-ink-3 italic py-12 text-center">
          {emptyMsg}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[360px] w-full outline-none md:h-[430px]"
          tabIndex={0}
          role="img"
          aria-label={`${title} interactive replay chart`}
          onPointerMove={(event) =>
            setActiveIndex(nearestReplayBarIndex(event, bars, W, PAD_L, W - PAD_R, xOf))
          }
          onPointerLeave={() => setActiveIndex(null)}
          onFocus={() =>
            setActiveIndex((value) => value ?? Math.max(0, visibleBars.length - 1))
          }
          onKeyDown={(event) => {
            const next = stepReplayIndex(event, activeIndex ?? selectedIndex, bars.length);
            if (next !== activeIndex) setActiveIndex(next);
          }}
        >
          <title>{title}</title>
          <desc>
            Actual replay price path with projected structure lines and exact current values.
          </desc>
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
                fill="rgba(244,228,192,0.56)"
                textAnchor="end"
              >
                {p.toFixed(2)}
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
                  fontSize="11"
                  fontFamily="var(--font-geist-mono)"
                  fill="rgba(244,228,192,0.56)"
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
            const currentValue = ln.valueAtMs(tNowMs);
            const labelY = Math.max(PAD_T + 12, Math.min(H - PAD_B - 8, yOf(currentValue)));
            return (
              <g key={ln.name}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={ln.color}
                  strokeWidth={ln.emphasized ? 1.8 : 1.1}
                  opacity={ln.emphasized ? 0.95 : 0.68}
                  strokeDasharray={ln.emphasized ? undefined : "4 5"}
                />
                <circle
                  cx={xOf(tNowMs)}
                  cy={yOf(currentValue)}
                  r={ln.emphasized ? 3.2 : 2.4}
                  fill={ln.color}
                  opacity={0.9}
                />
                <text
                  x={W - PAD_R + 8}
                  y={labelY + 4}
                  fontSize="12"
                  fontFamily="var(--font-geist-mono)"
                  fill={ln.color}
                >
                  {ln.name} {currentValue.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* future context path */}
          {fullPricePath && (
            <path
              d={fullPricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={1.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.18}
            />
          )}

          {/* revealed price path */}
          {pricePath && (
            <path
              d={pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={2.1}
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
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yOf(lastBar.c)}
                y2={yOf(lastBar.c)}
                stroke={priceColor}
                strokeWidth={0.8}
                opacity={0.22}
                strokeDasharray="6 7"
              />
              <circle
                cx={xOf(new Date(lastBar.t).getTime())}
                cy={yOf(lastBar.c)}
                r={12}
                fill={priceColor}
                opacity={0.12}
              />
              <circle
                cx={xOf(new Date(lastBar.t).getTime())}
                cy={yOf(lastBar.c)}
                r={4.5}
                fill={priceColor}
              />
              <rect
                x={Math.min(W - PAD_R - 126, xOf(new Date(lastBar.t).getTime()) + 10)}
                y={Math.max(PAD_T + 3, yOf(lastBar.c) - 18)}
                width="118"
                height="32"
                rx="8"
                fill="#FFFDF7"
                stroke="#D6CCB7"
              />
              <text
                x={Math.min(W - PAD_R - 67, xOf(new Date(lastBar.t).getTime()) + 69)}
                y={Math.max(PAD_T + 23, yOf(lastBar.c) + 5)}
                fontSize="12"
                fontFamily="var(--font-geist-mono)"
                fill="#14161A"
                textAnchor="middle"
              >
                LAST {lastBar.c.toFixed(2)}
              </text>
            </g>
          )}

          {/* interactive inspection crosshair */}
          {selected && (
            <g>
              <line
                x1={selectedX}
                x2={selectedX}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="#F4E4C0"
                strokeWidth={0.8}
                opacity={0.38}
                strokeDasharray="3 5"
              />
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={selectedY}
                y2={selectedY}
                stroke="#F4E4C0"
                strokeWidth={0.7}
                opacity={0.22}
                strokeDasharray="2 6"
              />
              <circle
                cx={selectedX}
                cy={selectedY}
                r={5}
                fill="#F4E4C0"
                stroke="#B8821F"
                strokeWidth={1.4}
              />
              <g transform={`translate(${tooltipX},${tooltipY})`}>
                <rect
                  width="144"
                  height="62"
                  rx="8"
                  fill="#FFFDF7"
                  stroke="#D6CCB7"
                />
                <text
                  x="9"
                  y="13"
                  fontSize="8"
                  fontFamily="var(--font-geist-mono)"
                  fontWeight="800"
                  fill="#5A5A5A"
                  letterSpacing="0.06em"
                >
                  {shortTime(selected.t)} CT
                </text>
                <text
                  x="9"
                  y="32"
                  fontSize="14"
                  fontFamily="var(--font-geist-mono)"
                  fontWeight="900"
                  fill="#14161A"
                >
                  {selected.c.toFixed(2)}
                </text>
                {selectedLine && selectedLineValue !== null && (
                  <text
                    x="9"
                    y="50"
                    fontSize="9"
                    fontFamily="var(--font-geist-mono)"
                    fontWeight="700"
                    fill={selectedLine.color}
                  >
                    {selectedLine.name} {selectedLineValue.toFixed(2)}
                  </text>
                )}
              </g>
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

      <ChartTransport title={title} disabled={!hasBars || lines.length === 0} playback={playback} />

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

function ChartTransport({
  title,
  disabled,
  playback,
}: {
  title: string;
  disabled: boolean;
  playback: ReplayChartPlayback;
}) {
  return (
    <div className="mt-3 rounded-[12px] border border-paper/10 bg-paper/[0.04] px-3 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => playback.onStep(-1)}
            className="h-9 rounded-[8px] border border-paper/10 bg-paper/[0.06] px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-paper/70 transition hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-35"
          >
            Back
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={playback.onToggle}
            className="inline-flex h-9 items-center justify-center rounded-[8px] bg-paper px-4 font-mono text-[12px] uppercase tracking-[0.08em] text-ink transition hover:bg-gold-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={`${playback.playing ? "Pause" : "Play"} ${title}`}
          >
            {playback.playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => playback.onStep(1)}
            className="h-9 rounded-[8px] border border-paper/10 bg-paper/[0.06] px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-paper/70 transition hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-35"
          >
            Forward
          </button>
        </div>
        <input
          aria-label={`${title} replay timeline`}
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={playback.playhead}
          disabled={disabled}
          onChange={(event) => playback.onScrub(Number(event.target.value))}
          className="min-w-[180px] flex-1 accent-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        />
        <div className="flex items-center gap-1 rounded-pill border border-paper/10 p-1">
          {PLAYBACK_SPEEDS.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => playback.onSpeed(item)}
              className={`h-7 rounded-pill px-3 font-mono text-[12px] tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40 ${
                playback.speed === item ? "bg-paper text-ink" : "text-paper/64 hover:text-paper"
              }`}
            >
              {item}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function nearestReplayBarIndex(
  event: PointerEvent<SVGSVGElement>,
  bars: IntradayBar[],
  width: number,
  minX: number,
  maxX: number,
  xOf: (ms: number) => number,
): number | null {
  if (bars.length === 0) return null;
  const rect = event.currentTarget.getBoundingClientRect();
  const viewX = (event.clientX - rect.left) * (width / Math.max(1, rect.width));
  const x = Math.max(minX, Math.min(maxX, viewX));
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < bars.length; i += 1) {
    const ms = Date.parse(bars[i].t);
    if (!Number.isFinite(ms)) continue;
    const distance = Math.abs(xOf(ms) - x);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

function stepReplayIndex(
  event: KeyboardEvent<SVGSVGElement>,
  current: number,
  length: number,
): number {
  if (length <= 0) return 0;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
    return current;
  }
  event.preventDefault();
  if (event.key === "Home") return 0;
  if (event.key === "End") return length - 1;
  const delta = event.shiftKey ? 10 : 1;
  const next = event.key === "ArrowLeft" ? current - delta : current + delta;
  return Math.max(0, Math.min(length - 1, next));
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
