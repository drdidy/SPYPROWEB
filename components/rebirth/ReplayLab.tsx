"use client";

import {
  Activity,
  CalendarDays,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

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
  source?: { spy?: string; es?: string; spx?: string; vix?: string; events?: string };
  controls?: { spy?: WeeklyControl | null; es?: WeeklyControl | null };
  context?: { spx?: Bar[]; vix?: Bar[] };
  events?: ReplayEvent[];
};

type ReplayEvent = {
  id: string;
  at: string;
  symbol: "SPY" | "SPX" | "ES";
  kind: string;
  direction: "long" | "short";
  price: number;
  status: "accepted";
};

type WeeklyControl = {
  sourceDate: string;
  sourceWindow: string;
  anchorAt: string;
  anchorPrice: number;
  slopePerHour: number;
  spacing: number;
  zoneWidth: number | null;
  valueAtFirstBar: number;
  slopePerBar: number;
  gateIndices: number[];
  method: string;
};

type GateReaction = {
  at: string;
  localIndex: number;
  index: number;
  value: number;
  kind: "hold" | "reject" | "break";
  label: string;
};

const SPEEDS = [1, 2, 4] as const;

export function ReplayLab({ initialDate }: { initialDate: string | null }) {
  const [date, setDate] = useState(initialDate ?? recentWeekday());
  const [instrument, setInstrument] = useState<"SPY" | "ES">("SPY");
  const [payload, setPayload] = useState<ReplayPayload | null>(null);
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [showWeekly, setShowWeekly] = useState(true);
  const [showReactions, setShowReactions] = useState(true);
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
  const control = instrument === "SPY" ? payload?.controls?.spy ?? null : payload?.controls?.es ?? null;
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
  const weeklyContext = current && control
    ? nearestWeeklyLevels(control, current.c, visible.length - 1)
    : null;
  const weeklyRead = weeklyContext && current && control
    ? weeklyDecisionRead(current, weeklyContext.support.value, weeklyContext.resistance.value, control)
    : "Weekly map unavailable";
  const quality = replayQuality(bars);
  const reactionTolerance = control
    ? control.zoneWidth ? control.zoneWidth / 2 : Math.max(0.5, control.spacing * 0.025)
    : 0;
  const weeklyEvents = control && showWeekly
    ? gateReactions(visible, 0, control, reactionTolerance).slice(-4).reverse()
    : [];
  const historicalSpx = current ? latestAtOrBefore(payload?.context?.spx ?? [], current.t) : null;
  const historicalVix = current ? latestAtOrBefore(payload?.context?.vix ?? [], current.t) : null;
  const archivedEvents = (payload?.events ?? []).filter((event) => {
    const symbolMatch = instrument === "SPY" ? event.symbol === "SPY" : event.symbol === "ES" || event.symbol === "SPX";
    return symbolMatch && (!current || Date.parse(event.at) <= Date.parse(current.t));
  });
  const vixRegime = historicalVix ? historicalVix.c < 15 ? "Calm" : historicalVix.c < 20 ? "Normal" : historicalVix.c < 25 ? "Elevated" : "High" : "Unavailable";

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

      <ReplayTransport
        bars={bars}
        cursor={cursor}
        playing={playing}
        speed={speed}
        setCursor={setCursor}
        setPlaying={setPlaying}
        setSpeed={setSpeed}
      />

      <section className="grid min-h-[620px] lg:grid-cols-[210px_1fr_270px]">
        <div className="order-2 border-b border-white/20 p-5 lg:order-none lg:border-b-0 lg:border-r lg:p-7">
          <ReadLabel label="Instrument" />
          <p className="mt-3 text-[32px] font-black">{instrument}</p>
          <ReadLabel label="Session date" className="mt-10" />
          <p className="num mt-3 text-[14px] font-black">{date}</p>
          <ReadLabel label="Bars loaded" className="mt-10" />
          <p className="num mt-3 text-[14px] font-black">{bars.length}</p>
          <ReadLabel label="Data integrity" className="mt-10" />
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className={cn("microlabel", quality.tone)}>{quality.label}</p>
            <p className="num text-[11px] text-white/65">{quality.continuity.toFixed(1)}%</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/45">
            {quality.gaps === 0
              ? "No missing 5-minute intervals in the loaded window."
              : `${quality.gaps} interval gap${quality.gaps === 1 ? "" : "s"}; largest ${quality.largestGap} minutes.`}
          </p>
          <ReadLabel label="Data source" className="mt-10" />
          <p className="microlabel mt-3 text-mineral">
            {payload?.source?.[instrument.toLowerCase() as "spy" | "es"] ?? "Replay API"}
          </p>
          <ReadLabel label="Replay layers" className="mt-10" />
          <div className="mt-3 grid gap-2">
            <LayerToggle
              label="Weekly gates"
              icon={Layers3}
              active={showWeekly}
              onClick={() => setShowWeekly((value) => !value)}
            />
            <LayerToggle
              label="Gate reactions"
              icon={Activity}
              active={showReactions}
              onClick={() => setShowReactions((value) => !value)}
              disabled={!showWeekly}
            />
          </div>
          {control && (
            <p className="mt-4 text-[11px] leading-relaxed text-white/50">
              {control.method}. Source {control.sourceDate}, {control.sourceWindow}.
            </p>
          )}
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

        <div className="hud-grid order-1 relative min-h-[430px] overflow-hidden border-b border-white/20 lg:order-none lg:border-b-0 lg:border-r">
          {status === "ready" && visible.length > 0 ? (
            <>
              <CandleChart
                bars={visible}
                instrument={instrument}
                control={showWeekly ? control : null}
                showReactions={showReactions}
                events={archivedEvents}
              />
              <span className="microlabel absolute left-4 top-4 border border-white/25 bg-carbon px-2.5 py-1.5 text-white/65">
                {instrument} / candles / bar by bar
              </span>
              {current && (
                <span className="num absolute bottom-4 right-4 bg-carbon px-2.5 py-1.5 text-[11px] text-white/65">
                  {time(bars[0].t)} to {time(current.t)}
                </span>
              )}
              {showWeekly && control && (
                <div className="absolute bottom-4 left-4 flex flex-wrap gap-x-4 gap-y-2 border border-white/20 bg-carbon/95 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white/60">
                  <LegendDot color="#8FD3C8" label="Support response" />
                  <LegendDot color="#E67560" label="Resistance response" />
                  <LegendDot color="#D8C894" label="Gate close-through" />
                </div>
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

        <div className="order-3 p-5 lg:order-none lg:p-7">
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
          <div className="mt-8 border-t border-white/25 pt-5">
            <ReadLabel label="Weekly map" accent />
            <p className="mt-3 text-[18px] font-black leading-tight">{weeklyRead}</p>
            <div className="mt-5 border-t border-white/15">
              <Read label="Resistance" value={weeklyContext?.resistance.value} />
              <Read label="Support" value={weeklyContext?.support.value} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/50">
              Roles update at the replay cursor. A close through a gate can turn prior resistance into support, or support into resistance.
            </p>
          </div>
          <div className="mt-8 border-t border-white/25 pt-5">
            <ReadLabel label="Historical context" accent />
            <div className="mt-3 border-y border-white/15">
              <Read label="SPX cash" value={historicalSpx?.c} />
              <Read label="VIX" value={historicalVix?.c} />
              {instrument === "ES" && current && historicalSpx && <Read label="ES - SPX basis" value={current.c - historicalSpx.c} />}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/50">VIX regime: <span className="font-bold text-mineral">{vixRegime}</span>. Context appears only when a historical cash-session bar exists at or before the replay cursor.</p>
          </div>
          <div className="mt-8 border-t border-white/25 pt-5">
            <ReadLabel label="Engine archive" accent />
            {archivedEvents.length ? (
              <div className="mt-3 divide-y divide-white/15 border-y border-white/15">
                {archivedEvents.slice(-5).reverse().map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 py-3">
                    <span className={cn("microlabel", eventTone(event))}>{eventLabel(event)}</span>
                    <span className="num text-[10px] text-white/55">{timeShort(event.at)} / {event.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] leading-relaxed text-white/45">No accepted TradingView Engine event is archived for this instrument by the replay cursor. Replay does not infer or invent one.</p>
            )}
          </div>
          <div className="mt-8 border-t border-white/25 pt-5">
            <ReadLabel label="Gate tape" />
            {weeklyEvents.length ? (
              <div className="mt-3 divide-y divide-white/15 border-y border-white/15">
                {weeklyEvents.map((event) => (
                  <div key={`${event.at}-${event.index}-${event.kind}`} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn(
                        "microlabel",
                        event.kind === "hold" ? "text-mineral" : event.kind === "reject" ? "text-coral" : "text-lime",
                      )}>
                        {event.kind === "break" ? "Close-through" : event.kind}
                      </span>
                      <span className="num text-[10px] text-white/55">{timeShort(event.at)}</span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">{event.label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] leading-relaxed text-white/45">
                No confirmed gate interaction has printed by this replay bar.
              </p>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}

function ReplayTransport({
  bars,
  cursor,
  playing,
  speed,
  setCursor,
  setPlaying,
  setSpeed,
}: {
  bars: Bar[];
  cursor: number;
  playing: boolean;
  speed: (typeof SPEEDS)[number];
  setCursor: Dispatch<SetStateAction<number>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  setSpeed: Dispatch<SetStateAction<(typeof SPEEDS)[number]>>;
}) {
  return (
    <section className="grid border-b border-white/20 bg-black p-4 md:grid-cols-[auto_auto_1fr_auto] md:items-center md:gap-5 md:px-8">
      <div className="flex" role="group" aria-label="Replay transport">
        <Control label="Reset" onClick={() => { setCursor(1); setPlaying(false); }} icon={RotateCcw} />
        <Control label="Back one bar" onClick={() => setCursor((value) => Math.max(1, value - 1))} icon={SkipBack} />
        <Control label={playing ? "Pause" : "Play"} onClick={() => setPlaying((value) => !value)} icon={playing ? Pause : Play} active />
        <Control label="Forward one bar" onClick={() => setCursor((value) => Math.min(bars.length, value + 1))} icon={SkipForward} />
      </div>
      <div className="mt-3 flex md:mt-0" role="group" aria-label="Playback speed">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            aria-pressed={speed === value}
            className={cn(
              "grid h-11 w-11 place-items-center border border-white/20 font-mono text-[11px] font-bold",
              speed === value ? "border-lime bg-lime/15 text-lime" : "text-white/65 hover:text-white",
            )}
          >
            {value}x
          </button>
        ))}
      </div>
      <input
        aria-label="Replay position"
        type="range"
        min={1}
        max={Math.max(1, bars.length)}
        value={Math.min(cursor, Math.max(1, bars.length))}
        onChange={(event) => { setPlaying(false); setCursor(Number(event.target.value)); }}
        className="my-4 h-1.5 w-full cursor-pointer accent-lime md:my-0"
      />
      <p className="num text-right text-[11px] font-bold text-white/65">{cursor} / {bars.length || 0}</p>
    </section>
  );
}

function CandleChart({
  bars,
  instrument,
  control,
  showReactions,
  events,
}: {
  bars: Bar[];
  instrument: "SPY" | "ES";
  control: WeeklyControl | null;
  showReactions: boolean;
  events: ReplayEvent[];
}) {
  const width = 1100;
  const height = 600;
  const pad = { left: 28, right: 96, top: 34, bottom: 54 };
  const windowBars = bars.slice(-110);
  const absoluteStart = bars.length - windowBars.length;
  const weekly = control && windowBars.length
    ? nearestWeeklyLevels(control, windowBars.at(-1)!.c, bars.length - 1)
    : null;
  const weeklyValues = weekly
    ? [
        gateValue(control!, weekly.support.index, absoluteStart),
        gateValue(control!, weekly.support.index, bars.length - 1),
        gateValue(control!, weekly.resistance.index, absoluteStart),
        gateValue(control!, weekly.resistance.index, bars.length - 1),
      ]
    : [];
  const values = [...windowBars.flatMap((bar) => [bar.h, bar.l]), ...weeklyValues];
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
      {control && weekly && (
        <WeeklyGateLayer
          bars={windowBars}
          absoluteStart={absoluteStart}
          control={control}
          supportIndex={weekly.support.index}
          resistanceIndex={weekly.resistance.index}
          x={x}
          y={y}
          showReactions={showReactions}
        />
      )}
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
      {events.filter((event) => Date.parse(event.at) >= Date.parse(windowBars[0].t) && Date.parse(event.at) <= Date.parse(last.t)).map((event) => {
        const localIndex = nearestBarIndex(windowBars, event.at);
        const color = eventToneColor(event);
        const eventY = y(event.price);
        return (
          <g key={event.id} aria-label={`${eventLabel(event)} at ${event.price.toFixed(2)}`}>
            <circle cx={x(localIndex)} cy={eventY} r="6" fill={color} stroke="#07090A" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text x={x(localIndex)} y={eventY - 12} textAnchor="middle" fill={color} fontSize="9" fontWeight="800" fontFamily="ui-monospace, monospace">{eventLabel(event)}</text>
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

function WeeklyGateLayer({
  bars,
  absoluteStart,
  control,
  supportIndex,
  resistanceIndex,
  x,
  y,
  showReactions,
}: {
  bars: Bar[];
  absoluteStart: number;
  control: WeeklyControl;
  supportIndex: number;
  resistanceIndex: number;
  x: (index: number) => number;
  y: (value: number) => number;
  showReactions: boolean;
}) {
  const lines = [
    { index: resistanceIndex, label: "WEEKLY RESISTANCE", color: "#E67560" },
    { index: supportIndex, label: "WEEKLY SUPPORT", color: "#8FD3C8" },
  ];
  const tolerance = control.zoneWidth ? control.zoneWidth / 2 : Math.max(0.5, control.spacing * 0.025);

  return (
    <g aria-label="Historically reconstructed weekly control gates">
      {lines.map((line) => {
        const points = bars.map((_, index) => `${x(index)},${y(gateValue(control, line.index, absoluteStart + index))}`).join(" ");
        const firstValue = gateValue(control, line.index, absoluteStart);
        const lastValue = gateValue(control, line.index, absoluteStart + bars.length - 1);
        const bandPoints = control.zoneWidth
          ? `${x(0)},${y(firstValue + tolerance)} ${x(bars.length - 1)},${y(lastValue + tolerance)} ${x(bars.length - 1)},${y(lastValue - tolerance)} ${x(0)},${y(firstValue - tolerance)}`
          : null;
        return (
          <g key={`${line.label}-${line.index}`}>
            {bandPoints && <polygon points={bandPoints} fill={line.color} opacity="0.08" />}
            <polyline points={points} fill="none" stroke={line.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text x={x(bars.length - 1) - 8} y={y(lastValue) - 8} textAnchor="end" fill={line.color} fontSize="10" fontWeight="800" fontFamily="ui-monospace, monospace">
              {line.label}
            </text>
          </g>
        );
      })}
      {showReactions && gateReactions(bars, absoluteStart, control, tolerance).map((reaction) => (
        <g key={`${reaction.at}-${reaction.index}-${reaction.kind}`}>
          <circle cx={x(reaction.localIndex)} cy={y(reaction.value)} r="4.5" fill={reaction.kind === "hold" ? "#8FD3C8" : reaction.kind === "reject" ? "#E67560" : "#D8C894"} stroke="#07090A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <title>{reaction.label}</title>
        </g>
      ))}
    </g>
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function LayerToggle({
  label,
  icon: Icon,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: typeof Play;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex min-h-10 items-center gap-2 border px-3 text-left font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors",
        active
          ? "border-lime/60 bg-lime/10 text-lime"
          : "border-white/20 text-white/55 hover:border-white/40 hover:text-white",
        disabled && "cursor-not-allowed opacity-35",
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
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

function gateValue(control: WeeklyControl, index: number, barIndex: number) {
  return control.valueAtFirstBar + index * control.spacing - control.slopePerBar * barIndex;
}

function nearestWeeklyLevels(control: WeeklyControl, price: number, barIndex: number) {
  const levels = control.gateIndices
    .map((index) => ({ index, value: gateValue(control, index, barIndex) }))
    .sort((a, b) => a.value - b.value);
  const support = levels.filter((level) => level.value <= price).at(-1) ?? levels[0];
  const resistance = levels.find((level) => level.value > price) ?? levels.at(-1)!;
  return { support, resistance };
}

function weeklyDecisionRead(
  bar: Bar,
  support: number,
  resistance: number,
  control: WeeklyControl,
) {
  const tolerance = control.zoneWidth ? control.zoneWidth / 2 : Math.max(0.5, control.spacing * 0.025);
  if (Math.abs(bar.c - resistance) <= tolerance || (bar.h >= resistance - tolerance && bar.c < resistance)) {
    return "Testing weekly resistance";
  }
  if (Math.abs(bar.c - support) <= tolerance || (bar.l <= support + tolerance && bar.c > support)) {
    return "Testing weekly support";
  }
  return "Between weekly gates";
}

function gateReactions(
  bars: Bar[],
  absoluteStart: number,
  control: WeeklyControl,
  tolerance: number,
) {
  const reactions: GateReaction[] = [];
  for (let localIndex = 1; localIndex < bars.length; localIndex += 1) {
    const bar = bars[localIndex];
    const previous = bars[localIndex - 1];
    const candidates = control.gateIndices.flatMap((index) => {
      const absoluteIndex = absoluteStart + localIndex;
      const value = gateValue(control, index, absoluteIndex);
      const previousValue = gateValue(control, index, absoluteIndex - 1);
      const crossedUp = previous.c < previousValue && bar.c > value;
      const crossedDown = previous.c > previousValue && bar.c < value;
      const held = previous.c >= previousValue && bar.l <= value + tolerance && bar.c > value;
      const rejected = previous.c <= previousValue && bar.h >= value - tolerance && bar.c < value;
      if (!crossedUp && !crossedDown && !held && !rejected) return [];
      const kind = crossedUp || crossedDown ? "break" as const : held ? "hold" as const : "reject" as const;
      const label = crossedUp
        ? "Closed above weekly gate; watch resistance become support"
        : crossedDown
          ? "Closed below weekly gate; watch support become resistance"
          : held
            ? "Weekly support held on the close"
            : "Weekly resistance rejected on the close";
      return [{ at: bar.t, localIndex, index, value, kind, label, distance: Math.abs(bar.c - value) }];
    });
    if (candidates.length) {
      const closest = candidates.sort((a, b) => a.distance - b.distance)[0];
      const prior = reactions.at(-1);
      const repeatsCluster = prior && prior.index === closest.index && prior.kind === closest.kind && localIndex - prior.localIndex < 3;
      if (!repeatsCluster) reactions.push(closest);
    }
  }
  return reactions.slice(-18);
}

function replayQuality(bars: Bar[]) {
  if (bars.length < 2) {
    return { label: "Insufficient", tone: "text-coral", continuity: 0, gaps: 0, largestGap: 0 };
  }
  const intervals = bars.slice(1).map((bar, index) => Math.round((Date.parse(bar.t) - Date.parse(bars[index].t)) / 60_000));
  const missing = intervals.filter((minutes) => minutes > 7);
  const continuity = ((intervals.length - missing.length) / intervals.length) * 100;
  const label = continuity >= 99 ? "Clean" : continuity >= 95 ? "Usable" : "Caution";
  const tone = continuity >= 99 ? "text-mineral" : continuity >= 95 ? "text-lime" : "text-coral";
  return {
    label,
    tone,
    continuity,
    gaps: missing.length,
    largestGap: missing.length ? Math.max(...missing) : 0,
  };
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

function latestAtOrBefore(bars: Bar[], at: string) {
  const stamp = Date.parse(at);
  let found: Bar | null = null;
  for (const bar of bars) {
    if (Date.parse(bar.t) > stamp) break;
    found = bar;
  }
  return found;
}

function nearestBarIndex(bars: Bar[], at: string) {
  const stamp = Date.parse(at);
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  bars.forEach((bar, index) => {
    const next = Math.abs(Date.parse(bar.t) - stamp);
    if (next < distance) {
      distance = next;
      best = index;
    }
  });
  return best;
}

function eventLabel(event: ReplayEvent) {
  if (event.kind === "price_cross_50") return "WATCH";
  if (event.kind.includes("entry") || event.kind === "fib50_rejection") return "ENTRY";
  if (event.kind === "exit_target") return "TARGET";
  if (event.kind === "invalidated") return "INVALID";
  if (event.kind === "exit_timeout") return "FLAT";
  if (event.kind.includes("zone") || event.kind === "fib50_armed") return "READY";
  return "CROSS";
}

function eventTone(event: ReplayEvent) {
  const label = eventLabel(event);
  if (label === "TARGET" || label === "ENTRY") return "text-lime";
  if (label === "INVALID") return "text-coral";
  return "text-mineral";
}

function eventToneColor(event: ReplayEvent) {
  const label = eventLabel(event);
  if (label === "TARGET" || label === "ENTRY") return "#8FD3C8";
  if (label === "INVALID") return "#E67560";
  return "#D8C894";
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
