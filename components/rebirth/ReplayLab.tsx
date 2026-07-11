"use client";

import {
  CalendarDays,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Bar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};
type ReplayPayload = {
  date: string;
  spy: Bar[];
  es: Bar[];
  error?: string;
  source?: { spy?: string; es?: string };
};

const SPEEDS = [1, 2, 4] as const;

export function ReplayLab({ initialDate }: { initialDate: string | null }) {
  const [date, setDate] = useState(initialDate ?? recentWeekday());
  const [instrument, setInstrument] = useState<"SPY" | "ES">("SPY");
  const [payload, setPayload] = useState<ReplayPayload | null>(null);
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setPlaying(false);
    setCursor(1);
    fetch(`/api/replay/intraday?date=${date}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: ReplayPayload) => {
        if (!active) return;
        setPayload(data);
        const count = Math.max(data.spy?.length ?? 0, data.es?.length ?? 0);
        const preferred = data.spy?.length ? data.spy : data.es;
        setCursor(initialCursor(preferred ?? []));
        setStatus(count ? "ready" : "empty");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [date]);

  const bars = useMemo(
    () => (instrument === "SPY" ? (payload?.spy ?? []) : (payload?.es ?? [])),
    [instrument, payload],
  );
  useEffect(() => {
    setCursor(Math.min(Math.max(1, cursor), Math.max(1, bars.length)));
  }, [bars.length, cursor]);
  useEffect(() => {
    if (!playing || bars.length < 2) return;
    timer.current = window.setInterval(
      () =>
        setCursor((value) => {
          if (value >= bars.length) {
            setPlaying(false);
            return value;
          }
          return value + 1;
        }),
      Math.round(650 / speed),
    );
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, bars.length, speed]);

  const visible = bars.slice(0, cursor);
  const current = visible.at(-1) ?? null;
  const change = current && bars[0] ? current.c - bars[0].o : null;
  const sessionHigh = visible.length
    ? Math.max(...visible.map((bar) => bar.h))
    : null;
  const sessionLow = visible.length
    ? Math.min(...visible.map((bar) => bar.l))
    : null;
  const previous = visible.length > 1 ? visible[visible.length - 2] : null;
  const barRange = current ? current.h - current.l : null;
  const barRead = current
    ? current.c >= current.o
      ? "Bullish close"
      : "Bearish close"
    : "Waiting";
  const closeRead = current && previous
    ? current.c > previous.c
      ? "Higher close"
      : current.c < previous.c
        ? "Lower close"
        : "Flat close"
    : "Waiting";
  const rangeLocation = current && sessionHigh !== null && sessionLow !== null && sessionHigh > sessionLow
    ? ((current.c - sessionLow) / (sessionHigh - sessionLow)) * 100
    : null;

  return (
    <div className="bg-carbon text-white">
      <header className="grid border-b border-white/20 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="p-5 py-10 md:p-10">
          <p className="microlabel text-lime">Session replay</p>
          <h1 className="mt-6 text-[13vw] font-black leading-[0.86] tracking-normal sm:text-[48px] md:text-[70px] xl:text-[90px]">
            Slow the market down.
          </h1>
          <p className="mt-6 max-w-[680px] text-[15px] leading-relaxed text-white/60">
            Move bar by bar through SPY or ES. Replay is review, never a live
            command.
          </p>
        </div>
        <div className="m-5 flex flex-wrap border border-white/30 lg:m-10">
          <label className="microlabel flex h-12 items-center gap-2 border-r border-white/30 px-4">
            <CalendarDays size={14} aria-hidden="true" />
            <input
              aria-label="Replay date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="num bg-transparent text-[12px] text-white outline-none [color-scheme:dark]"
            />
          </label>
          {(["SPY", "ES"] as const).map((symbol) => (
            <button
              key={symbol}
              type="button"
              onClick={() => setInstrument(symbol)}
              aria-pressed={instrument === symbol}
              className={cn(
                "h-12 min-w-[72px] border-r border-white/30 px-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors last:border-r-0",
                instrument === symbol
                  ? "bg-lime text-carbon"
                  : "text-white/70 hover:text-white",
              )}
            >
              {symbol}
            </button>
          ))}
        </div>
      </header>

      <section className="grid min-h-[620px] lg:grid-cols-[210px_1fr_270px]">
        <div className="border-b border-white/20 p-5 lg:border-b-0 lg:border-r lg:p-7">
          <ReadLabel label="Instrument" />
          <p className="mt-3 text-[32px] font-black">{instrument}</p>
          <ReadLabel label="Session date" className="mt-10" />
          <p className="num mt-3 text-[14px] font-black">{date}</p>
          <ReadLabel label="Bars loaded" className="mt-10" />
          <p className="num mt-3 text-[14px] font-black">{bars.length}</p>
          <ReadLabel label="Verified source" className="mt-10" />
          <p className="microlabel mt-3 text-mineral">
            {payload?.source?.[instrument.toLowerCase() as "spy" | "es"] ?? "Replay API"}
          </p>
          <ReadLabel label="Session range" className="mt-10" />
          <p className="num mt-3 text-[12px] font-bold leading-relaxed text-white/75">
            {sessionHigh !== null && sessionLow !== null ? (
              <>
                H {sessionHigh.toFixed(2)}
                <br />L {sessionLow.toFixed(2)}
              </>
            ) : (
              "--"
            )}
          </p>
          <ReadLabel label="Mode" className="mt-10" />
          <p className="microlabel mt-3 text-lime">Replay only</p>
        </div>

        <div className="hud-grid relative min-h-[430px] overflow-hidden border-b border-white/20 lg:border-b-0 lg:border-r">
          {status === "ready" && visible.length > 0 ? (
            <>
              <CandleChart bars={visible} instrument={instrument} />
              <span className="microlabel absolute left-4 top-4 border border-white/25 bg-carbon px-2.5 py-1.5 text-white/65">
                {instrument} / candles / bar by bar
              </span>
              {current && (
                <span className="num absolute bottom-4 right-4 bg-carbon px-2.5 py-1.5 text-[11px] text-white/65">
                  {time(bars[0].t)} → {time(current.t)}
                </span>
              )}
            </>
          ) : (
            <div className="hatch absolute inset-0 grid place-items-center p-8 text-center">
              <div>
                <span
                  className="mx-auto grid h-10 w-10 place-items-center border border-white/25"
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5",
                      status === "loading"
                        ? "animate-blink bg-lime"
                        : "bg-coral",
                    )}
                  />
                </span>
                <p className="mt-5 text-[26px] font-black">
                  {status === "loading"
                    ? "Loading session"
                    : status === "error"
                      ? "Replay source unavailable"
                      : "No bars for this date"}
                </p>
                <p className="mt-3 text-[12px] text-white/60">
                  {status === "empty"
                    ? "Choose another completed trading day."
                    : "No sample bars are substituted."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 lg:p-7">
          <ReadLabel label="Current bar" accent />
          <p className="num mt-4 text-[22px] font-black">
            {current ? time(current.t) : "--"}
          </p>
          <div className="mt-8 border-t border-white/25">
            <Read label="Open" value={current?.o} />
            <Read label="High" value={current?.h} />
            <Read label="Low" value={current?.l} />
            <Read label="Close" value={current?.c} />
          </div>
          <div className="mt-8 border-t border-white/25 pt-5">
            <ReadLabel label="Session move" />
            <p
              className={cn(
                "num mt-3 text-[32px] font-black",
                change !== null && change >= 0 ? "text-lime" : "text-coral",
              )}
            >
              {change === null
                ? "--"
                : `${change >= 0 ? "+" : ""}${change.toFixed(2)}`}
            </p>
            <p className="microlabel mt-2 text-white/60">
              From session open / points
            </p>
          </div>
          <div className="mt-8 border-t border-white/25 pt-5">
            <ReadLabel label="Bar read" accent />
            <p className="mt-3 text-[18px] font-black">{barRead}</p>
            <p className="mt-2 text-[12px] font-bold text-white/70">{closeRead}</p>
            <div className="mt-5 border-t border-white/15">
              <Read label="Bar range" value={barRange ?? undefined} />
              <Read label="Range location" value={rangeLocation ?? undefined} suffix="%" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid border-y border-white/20 bg-black p-4 md:grid-cols-[auto_auto_1fr_auto] md:items-center md:gap-5 md:px-8">
        <div className="flex" role="group" aria-label="Replay transport">
          <Control
            label="Reset"
            onClick={() => {
              setCursor(1);
              setPlaying(false);
            }}
            icon={RotateCcw}
          />
          <Control
            label="Back one bar"
            onClick={() => setCursor((value) => Math.max(1, value - 1))}
            icon={SkipBack}
          />
          <Control
            label={playing ? "Pause" : "Play"}
            onClick={() => setPlaying((value) => !value)}
            icon={playing ? Pause : Play}
            active
          />
          <Control
            label="Forward one bar"
            onClick={() =>
              setCursor((value) => Math.min(bars.length, value + 1))
            }
            icon={SkipForward}
          />
        </div>
        <div
          className="mt-3 flex md:mt-0"
          role="group"
          aria-label="Playback speed"
        >
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSpeed(value)}
              aria-pressed={speed === value}
              className={cn(
                "grid h-11 w-11 place-items-center border border-white/20 font-mono text-[11px] font-bold",
                speed === value
                  ? "border-lime bg-lime/15 text-lime"
                  : "text-white/65 hover:text-white",
              )}
            >
              {value}×
            </button>
          ))}
        </div>
        <input
          aria-label="Replay position"
          type="range"
          min={1}
          max={Math.max(1, bars.length)}
          value={Math.min(cursor, Math.max(1, bars.length))}
          onChange={(event) => {
            setPlaying(false);
            setCursor(Number(event.target.value));
          }}
          className="my-4 h-1.5 w-full cursor-pointer accent-lime md:my-0"
        />
        <p className="num text-right text-[11px] font-bold text-white/65">
          {cursor} / {bars.length || 0}
        </p>
      </section>
    </div>
  );
}

function CandleChart({ bars, instrument }: { bars: Bar[]; instrument: "SPY" | "ES" }) {
  const width = 1100;
  const height = 600;
  const pad = { left: 28, right: 96, top: 34, bottom: 54 };
  const windowBars = bars.slice(-110);
  const values = windowBars.flatMap((bar) => [bar.h, bar.l]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawSpan = Math.max(max - min, instrument === "SPY" ? 0.05 : 0.5);
  const floor = min - rawSpan * 0.08;
  const ceiling = max + rawSpan * 0.08;
  const span = ceiling - floor;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const step = plotWidth / Math.max(1, windowBars.length);
  const candleWidth = Math.max(2.5, Math.min(10, step * 0.58));
  const x = (index: number) => pad.left + step * index + step / 2;
  const y = (value: number) =>
    pad.top + ((ceiling - value) / span) * plotHeight;
  const last = windowBars[windowBars.length - 1];
  const open = windowBars[0];
  const yTicks = Array.from({ length: 6 }, (_, index) => ceiling - (span * index) / 5);
  const tickIndexes = Array.from(new Set([0, Math.floor((windowBars.length - 1) * 0.25), Math.floor((windowBars.length - 1) * 0.5), Math.floor((windowBars.length - 1) * 0.75), windowBars.length - 1]));
  const precision = instrument === "SPY" ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-label={`${instrument} candlestick replay chart from ${timeShort(open.t)} to ${timeShort(last.t)}`}
      role="img"
    >
      {yTicks.map((value) => (
        <g key={value}>
          <line x1={pad.left} y1={y(value)} x2={width - pad.right} y2={y(value)} stroke="rgba(255,255,255,0.12)" vectorEffect="non-scaling-stroke" />
          <text x={width - pad.right + 12} y={y(value) + 4} fill="rgba(255,255,255,0.68)" fontSize="12" fontFamily="ui-monospace, monospace">{value.toFixed(precision)}</text>
        </g>
      ))}
      <line x1={pad.left} y1={y(open.o)} x2={width - pad.right} y2={y(open.o)} stroke="rgba(216,200,148,0.52)" strokeDasharray="7 7" vectorEffect="non-scaling-stroke" />
      <text x={pad.left + 8} y={y(open.o) - 8} fill="#D8C894" fontSize="11" fontWeight="700" fontFamily="ui-monospace, monospace">SESSION OPEN</text>
      {windowBars.map((bar, index) => {
        const rising = bar.c >= bar.o;
        const color = rising ? "#8FD3C8" : "#E67560";
        const bodyTop = y(Math.max(bar.o, bar.c));
        const bodyHeight = Math.max(2, Math.abs(y(bar.o) - y(bar.c)));
        return (
          <g key={`${bar.t}-${index}`}>
            <line x1={x(index)} y1={y(bar.h)} x2={x(index)} y2={y(bar.l)} stroke={color} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
            <rect x={x(index) - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={rising ? "rgba(143,211,200,0.82)" : "rgba(230,117,96,0.86)"} stroke={color} strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
      {tickIndexes.map((index) => (
        <text key={index} x={x(index)} y={height - 18} textAnchor="middle" fill="rgba(255,255,255,0.62)" fontSize="11" fontFamily="ui-monospace, monospace">{timeShort(windowBars[index].t)}</text>
      ))}
      <line
        x1={pad.left}
        y1={y(last.c)}
        x2={width - pad.right}
        y2={y(last.c)}
        stroke="rgba(143,211,200,0.48)"
        strokeDasharray="4 5"
        vectorEffect="non-scaling-stroke"
      />
      <rect x={width - pad.right + 5} y={y(last.c) - 12} width="84" height="24" fill="#8FD3C8" />
      <text x={width - pad.right + 47} y={y(last.c) + 4} textAnchor="middle" fill="#07090A" fontSize="12" fontWeight="800" fontFamily="ui-monospace, monospace">{last.c.toFixed(precision)}</text>
    </svg>
  );
}

function ReadLabel({
  label,
  className,
  accent = false,
}: {
  label: string;
  className?: string;
  accent?: boolean;
}) {
  return (
    <p
      className={cn(
        "microlabel",
        accent ? "text-lime" : "text-white/60",
        className,
      )}
    >
      {label}
    </p>
  );
}

function Control({
  label,
  onClick,
  icon: Icon,
  active = false,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Play;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid h-11 w-12 place-items-center border border-white/20 text-white/60 transition-colors hover:text-white",
        active && "border-lime bg-lime text-carbon hover:text-carbon",
      )}
      title={label}
      aria-label={label}
    >
      <Icon size={16} />
    </button>
  );
}

function Read({ label, value, suffix = "" }: { label: string; value?: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/15 py-3">
      <span className="microlabel text-white/60">{label}</span>
      <span className="num text-[13px] font-black">
        {typeof value === "number" ? `${value.toFixed(2)}${suffix}` : "--"}
      </span>
    </div>
  );
}

function time(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
      }).format(date) + " CT"
    : value;
}

function timeShort(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : value;
}

function recentWeekday() {
  const date = new Date();
  do {
    date.setDate(date.getDate() - 1);
  } while ([0, 6].includes(date.getDay()));
  return date.toISOString().slice(0, 10);
}

function initialCursor(bars: Bar[]) {
  const firstRth = bars.findIndex((bar) => {
    const date = new Date(bar.t);
    if (!Number.isFinite(date.getTime())) return false;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return value("hour") * 60 + value("minute") >= 8 * 60 + 30;
  });
  return firstRth >= 0 ? firstRth + 1 : Math.min(Math.max(1, bars.length), 24);
}
