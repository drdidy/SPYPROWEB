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
type ReplayPayload = { date: string; spy: Bar[]; es: Bar[]; error?: string };

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

  return (
    <div className="bg-carbon text-white">
      <header className="grid border-b border-white/20 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="p-5 py-10 md:p-10">
          <p className="microlabel text-lime">Session replay</p>
          <h1 className="mt-6 text-[13vw] font-black leading-[0.86] tracking-[-0.015em] sm:text-[48px] md:text-[70px] xl:text-[90px]">
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
          {status === "ready" && visible.length > 1 ? (
            <>
              <PathChart bars={visible} />
              <span className="microlabel absolute left-4 top-4 border border-white/25 bg-carbon px-2.5 py-1.5 text-white/65">
                {instrument} / close path
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

function PathChart({ bars }: { bars: Bar[] }) {
  const width = 1000;
  const height = 560;
  const pad = 40;
  const values = bars.flatMap((bar) => [bar.h, bar.l]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.01);
  const x = (index: number) =>
    (index / Math.max(1, bars.length - 1)) * width;
  const y = (value: number) =>
    height - ((value - min) / span) * (height - pad * 2) - pad;

  const closePoints = bars
    .map((bar, index) => `${x(index)},${y(bar.c)}`)
    .join(" ");
  const bandPoints = [
    ...bars.map((bar, index) => `${x(index)},${y(bar.h)}`),
    ...[...bars].reverse().map((bar, index) => {
      const originalIndex = bars.length - 1 - index;
      return `${x(originalIndex)},${y(bar.l)}`;
    }),
  ].join(" ");
  const areaPoints = `0,${height} ${closePoints} ${x(bars.length - 1)},${height}`;
  const last = bars[bars.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-label="Replay price path"
      role="img"
    >
      <polygon points={bandPoints} fill="rgba(255,255,255,0.07)" />
      <polygon points={areaPoints} fill="rgba(184,242,61,0.07)" />
      <polyline
        points={closePoints}
        fill="none"
        stroke="#B8F23D"
        strokeWidth="3.5"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x(bars.length - 1)}
        y1="0"
        x2={x(bars.length - 1)}
        y2={height}
        stroke="rgba(255,255,255,0.25)"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(bars.length - 1)} cy={y(last.c)} r="8" fill="#FF5B4D" />
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

function Read({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-center justify-between border-b border-white/15 py-3">
      <span className="microlabel text-white/60">{label}</span>
      <span className="num text-[13px] font-black">
        {typeof value === "number" ? value.toFixed(2) : "--"}
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

function recentWeekday() {
  const date = new Date();
  do {
    date.setDate(date.getDate() - 1);
  } while ([0, 6].includes(date.getDay()));
  return date.toISOString().slice(0, 10);
}
