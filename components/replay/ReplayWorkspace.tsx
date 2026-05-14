"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock,
  Gauge,
  History,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Target,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { replayCopy } from "@/content/replay/copy";
import {
  PLAYBACK_SPEEDS,
  RECENT_REPLAY_STORAGE_KEY,
  REPLAY_PRESET_EVENTS,
  type PlaybackSpeed,
} from "@/lib/replay/config";
import {
  buildReplayPriceLens,
  lineTouchesSafeBar,
} from "@/lib/replay/bar-quality";
import {
  adaptSnapshot,
  type AdaptedSnapshot,
  type AnchorGroup,
  type PremarketDiagnostic,
  type PremarketDiagnosticBar,
  type RawSnapshot,
} from "@/lib/snapshot-adapter";
import type { SPXLine, SPXSnapshot } from "@/lib/types";
import { ReplayPlayback, type ReplayChartPlayback } from "./ReplayPlayback";

export interface IntradayBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface IntradayResponse {
  date: string;
  spy: IntradayBar[];
  es: IntradayBar[];
  error?: string;
}

interface Props {
  initialDate: string | null;
}

type ReplayState = "empty" | "loading" | "success" | "partial" | "error";

interface TouchEvent {
  engine: "SPY" | "ES";
  line: string;
  at: string;
  price: number;
  side: "touch" | "break" | "reject" | "retest";
}

interface VerdictEvent {
  engine: "SPY" | "ES";
  at: string;
  label: string;
  detail: string;
  kind: "state" | "rule" | "note" | "touch" | "risk" | "trade";
}

interface ProjectedLine {
  label: string;
  tone: "ceiling" | "floor" | "reference" | "anchor";
  valueAt: (ms: number) => number;
}

const SPY_BAND_OFFSET = 3.4;
const DEFAULT_SPY_SLOPE = 0.2;

export function ReplayWorkspace({ initialDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const initialTimeRef = useRef(searchParams?.get("t") ?? null);

  const [draft, setDraft] = useState(initialDate ?? "");
  const [date, setDate] = useState<string | null>(initialDate);
  const [recentDates, setRecentDates] = useState<string[]>([]);
  const [compareLive, setCompareLive] = useState(false);

  const [spy, setSpy] = useState<AdaptedSnapshot | null>(null);
  const [spx, setSpx] = useState<SPXSnapshot | null>(null);
  const [intraday, setIntraday] = useState<IntradayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [spyPlayhead, setSpyPlayhead] = useState(0);
  const [esPlayhead, setEsPlayhead] = useState(0);
  const [spyPlaying, setSpyPlaying] = useState(false);
  const [esPlaying, setEsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(() =>
    parseSpeed(searchParams?.get("speed")),
  );
  const [jumpDraft, setJumpDraft] = useState("");

  useEffect(() => {
    setDraft(initialDate ?? "");
    setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(RECENT_REPLAY_STORAGE_KEY) ?? "[]",
      );
      if (Array.isArray(parsed)) {
        setRecentDates(parsed.filter(isISODate).slice(0, 5));
      }
    } catch {
      setRecentDates([]);
    }
  }, []);

  const applyDate = (next: string | null) => {
    const normalized = next && isISODate(next) ? next : null;
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    if (normalized) sp.set("date", normalized);
    else sp.delete("date");
    sp.delete("t");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setDraft(normalized ?? "");
    setDate(normalized);
  };

  useEffect(() => {
    if (!date) {
      setSpy(null);
      setSpx(null);
      setIntraday(null);
      setError(null);
      setLoading(false);
      setSpyPlaying(false);
      setEsPlaying(false);
      setSpyPlayhead(0);
      setEsPlayhead(0);
      return;
    }

    let abort = false;
    setLoading(true);
    setError(null);
    setSpyPlaying(false);
    setEsPlaying(false);

    Promise.all([
      fetch(`/api/snapshot?date=${date}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => (json ? adaptSnapshot(json as RawSnapshot) : null))
        .catch(() => null),
      fetch(`/api/spx/snapshot?date=${date}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/replay/intraday?date=${date}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([spySnap, spxSnap, intradaySnap]) => {
      if (abort) return;
      const nextSpy = spySnap;
      const nextSpx = spxSnap as SPXSnapshot | null;
      const nextIntraday = intradaySnap as IntradayResponse | null;
      const errs: string[] = [];

      if (nextSpy?.replay?.error) errs.push(`SPY: ${nextSpy.replay.error}`);
      if (nextIntraday?.error) errs.push(`Bars: ${nextIntraday.error}`);
      if (!nextSpy && !nextSpx && !nextIntraday) {
        errs.push("Replay data unavailable for this date.");
      }

      setSpy(nextSpy);
      setSpx(nextSpx);
      setIntraday(nextIntraday);
      setError(errs.length ? errs.join(" ") : null);
      setLoading(false);
      const initialTime = initialTimeRef.current;
      initialTimeRef.current = null;
      const initialSpyPlayhead =
        initialTime && nextIntraday?.spy?.length
          ? playheadForTime(nextIntraday.spy, initialTime)
          : null;
      const initialEsPlayhead =
        initialTime && nextIntraday?.es?.length
          ? playheadForTime(nextIntraday.es, initialTime)
          : null;
      setSpyPlayhead(initialSpyPlayhead ?? 0);
      setEsPlayhead(initialEsPlayhead ?? 0);
      rememberDate(date);
    });

    return () => {
      abort = true;
    };
  }, [date]);

  const rememberDate = (loadedDate: string) => {
    setRecentDates((existing) => {
      const next = [loadedDate, ...existing.filter((item) => item !== loadedDate)].slice(0, 5);
      window.localStorage.setItem(RECENT_REPLAY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  useReplayClock(spyPlaying, speed, setSpyPlayhead, setSpyPlaying);
  useReplayClock(esPlaying, speed, setEsPlayhead, setEsPlaying);

  const barsCount = (intraday?.spy.length ?? 0) + (intraday?.es.length ?? 0);
  const hasBars = barsCount > 0;
  const hasSnapshot = !!spy || !!spx;
  const state: ReplayState = !date
    ? "empty"
    : loading
      ? "loading"
      : error && !hasSnapshot
        ? "error"
        : !hasBars && hasSnapshot
          ? "partial"
          : "success";

  const eventLog = useMemo(() => buildVerdictEvents(spy, spx, date), [spy, spx, date]);
  const touchEvents = useMemo(
    () => buildTouchEvents(spy, spx, intraday).slice(0, 32),
    [spy, spx, intraday],
  );
  const activeBars = useMemo(
    () => (intraday?.es.length ? intraday.es : intraday?.spy ?? []),
    [intraday],
  );
  const cursorIndex = useMemo(
    () => barIndexAtPlayhead(activeBars, esPlayhead),
    [activeBars, esPlayhead],
  );
  const cursorAt = activeBars[cursorIndex]?.t ?? null;
  const playheadTime = useMemo(
    () => (cursorAt ? shortTime(cursorAt) : null),
    [cursorAt],
  );
  const seekToIso = useCallback(
    (iso: string) => {
      const next = playheadForIso(activeBars, iso);
      if (next != null) {
        setSpyPlaying(false);
        setEsPlaying(false);
        setSpyPlayhead(next);
        setEsPlayhead(next);
      }
    },
    [activeBars],
  );

  useEffect(() => {
    if (playheadTime) setJumpDraft(playheadTime);
  }, [playheadTime]);

  useEffect(() => {
    if (!date || !cursorAt || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    sp.set("date", date);
    sp.set("t", shortTime(cursorAt));
    sp.set("speed", `${speed}x`);
    window.history.replaceState(null, "", `${pathname}?${sp.toString()}`);
  }, [cursorAt, date, pathname, speed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;
      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (!hasBars) return;
      if (event.code === "Space" || key === "k") {
        event.preventDefault();
        setSpyPlaying((current) => !current);
        setEsPlaying((current) => !current);
        return;
      }
      if (key === "arrowleft" || key === "j") {
        event.preventDefault();
        setSpyPlaying(false);
        setEsPlaying(false);
        setSpyPlayhead((current) =>
          stepPlayhead(intraday?.spy ?? [], current, event.shiftKey || key === "j" ? -10 : -1),
        );
        setEsPlayhead((current) =>
          stepPlayhead(intraday?.es ?? [], current, event.shiftKey || key === "j" ? -10 : -1),
        );
        return;
      }
      if (key === "arrowright" || key === "l") {
        event.preventDefault();
        setSpyPlaying(key === "l");
        setEsPlaying(key === "l");
        setSpyPlayhead((current) =>
          stepPlayhead(intraday?.spy ?? [], current, event.shiftKey || key === "l" ? 10 : 1),
        );
        setEsPlayhead((current) =>
          stepPlayhead(intraday?.es ?? [], current, event.shiftKey || key === "l" ? 10 : 1),
        );
        return;
      }
      if (key === "home") {
        event.preventDefault();
        setSpyPlaying(false);
        setEsPlaying(false);
        setSpyPlayhead(0);
        setEsPlayhead(0);
        return;
      }
      if (key === "end") {
        event.preventDefault();
        setSpyPlaying(false);
        setEsPlaying(false);
        setSpyPlayhead(1);
        setEsPlayhead(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasBars, intraday]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const presets = useMemo(() => buildPresets(new Date()), []);
  const marketOpen = useMemo(() => isMarketOpenNow(new Date()), []);

  return (
    <div className="space-y-4">
      <ReplayHeader
        draft={draft}
        maxDate={todayISO}
        inputRef={inputRef}
        onDraft={setDraft}
        onLoad={() => applyDate(draft || null)}
        onPreset={(value) => {
          if (value === "custom") {
            inputRef.current?.focus();
            return;
          }
          applyDate(value);
        }}
        presets={presets}
        recentDates={recentDates}
        onRecent={applyDate}
        compareLive={compareLive}
        onCompareLive={setCompareLive}
        marketOpen={marketOpen}
      />

      <ReplayStatusRow
        state={state}
        date={date}
        barsCount={barsCount}
        channelBuilt={!!spx && spx.lines.length > 0}
        anchorsBuilt={!!spy?.anchor?.primary}
        error={error}
      />

      <section
        aria-label="Replay workstation"
        className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]"
      >
        <DarkPanel className="min-h-[520px]">
          <PanelHeader
            eyebrow="Replay chart"
            title={replayCopy.chart.title}
            meta={
              date
                ? `${date} · bar ${Math.min(cursorIndex + 1, activeBars.length || 1)} of ${Math.max(activeBars.length, 1)} · ${playheadTime ?? "session close"}`
                : "No date loaded"
            }
          />
          <div className="px-4 pb-4 md:px-5 md:pb-5">
            {state === "loading" ? (
              <ChartSkeleton />
            ) : (
              <DualReplayChart
                spy={spy}
                spx={spx}
                intraday={intraday}
                spyPlayback={{
                  playhead: spyPlayhead,
                  playing: spyPlaying,
                  speed,
                  onToggle: () => {
                    if (!(intraday?.spy?.length)) return;
                    if (spyPlayhead >= 1) setSpyPlayhead(0);
                    setSpyPlaying((current) => !current);
                  },
                  onStep: (delta) => {
                    setSpyPlaying(false);
                    setSpyPlayhead((current) => stepPlayhead(intraday?.spy ?? [], current, delta));
                  },
                  onScrub: (value) => {
                    setSpyPlaying(false);
                    setSpyPlayhead(value);
                  },
                  onSpeed: setSpeed,
                }}
                esPlayback={{
                  playhead: esPlayhead,
                  playing: esPlaying,
                  speed,
                  onToggle: () => {
                    if (!(intraday?.es?.length)) return;
                    if (esPlayhead >= 1) setEsPlayhead(0);
                    setEsPlaying((current) => !current);
                  },
                  onStep: (delta) => {
                    setEsPlaying(false);
                    setEsPlayhead((current) => stepPlayhead(intraday?.es ?? [], current, delta));
                  },
                  onScrub: (value) => {
                    setEsPlaying(false);
                    setEsPlayhead(value);
                  },
                  onSpeed: setSpeed,
                }}
                state={state}
              />
            )}
            <JumpToTimeControl
              disabled={!hasBars || state === "loading" || state === "error"}
              jumpValue={playheadTime}
              jumpDraft={jumpDraft}
              onJumpDraft={setJumpDraft}
              onJump={() => {
                const nextSpy = playheadForTime(intraday?.spy ?? [], jumpDraft);
                const nextEs = playheadForTime(intraday?.es ?? [], jumpDraft);
                if (nextSpy != null) {
                  setSpyPlaying(false);
                  setSpyPlayhead(nextSpy);
                }
                if (nextEs != null) {
                  setEsPlaying(false);
                  setEsPlayhead(nextEs);
                }
              }}
            />
            <EngineTapeStrip
              bars={activeBars}
              events={eventLog}
              touches={touchEvents}
              cursorAt={cursorAt}
              onSeek={seekToIso}
            />
          </div>
        </DarkPanel>

        <div className="flex gap-4 overflow-x-auto pb-1 lg:block lg:space-y-4 lg:overflow-visible lg:pb-0 [&>*]:min-w-[320px] lg:[&>*]:min-w-0">
          <AnchorPanel state={state} spy={spy} />
          <VerdictLogPanel
            state={state}
            events={eventLog}
            cursorAt={cursorAt}
            onSeek={seekToIso}
          />
          <LineTouchPanel
            state={state}
            events={touchEvents}
            cursorAt={cursorAt}
            onSeek={seekToIso}
          />
        </div>
      </section>

      <style jsx global>{`
        @keyframes replay-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes replay-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .replay-skeleton::after {
          animation: replay-shimmer 1300ms ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .replay-skeleton::after {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function useReplayClock(
  playing: boolean,
  speed: PlaybackSpeed,
  setPlayhead: Dispatch<SetStateAction<number>>,
  setPlaying: Dispatch<SetStateAction<boolean>>,
) {
  const secondsPerFullSessionAt1x = 90;
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((current) => {
        const next = current + dt / (secondsPerFullSessionAt1x / speed);
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, setPlayhead, setPlaying, speed]);
}

function ReplayHeader({
  draft,
  maxDate,
  inputRef,
  presets,
  recentDates,
  compareLive,
  marketOpen,
  onDraft,
  onLoad,
  onPreset,
  onRecent,
  onCompareLive,
}: {
  draft: string;
  maxDate: string;
  inputRef: RefObject<HTMLInputElement>;
  presets: Array<{ label: string; value: string | "custom"; title: string }>;
  recentDates: string[];
  compareLive: boolean;
  marketOpen: boolean;
  onDraft: (value: string) => void;
  onLoad: () => void;
  onPreset: (value: string | "custom") => void;
  onRecent: (value: string) => void;
  onCompareLive: (value: boolean) => void;
}) {
  return (
    <header className="rounded-[18px] border border-[#C9A227]/50 bg-[#071116] px-4 py-4 text-paper shadow-[0_22px_58px_-42px_rgba(7,17,22,0.95)] md:px-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div>
          <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-soft">
            Replay · Backtest · 5-min
          </div>
          <h1 className="mt-1 font-serif text-[34px] leading-none tracking-tight text-paper md:text-[40px]">
            Replay a session
          </h1>
        </div>

        <div className="w-full xl:w-[720px]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <label className="min-w-0 flex-1">
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-paper/70">
                Replay date
              </span>
              <input
                ref={inputRef}
                type="date"
                max={maxDate}
                value={draft}
                onChange={(event) => onDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onLoad();
                }}
                className="mt-1 h-10 w-full rounded-[8px] border border-paper/15 bg-paper/10 px-3 font-mono text-[13px] tabular-nums text-paper outline-none transition focus-visible:ring-2 focus-visible:ring-gold"
              />
              <span className="mt-1 block text-[12px] leading-snug text-paper/58">
                Pick a session date. Recent choices save on this device.
              </span>
            </label>
            <button
              type="button"
              onClick={onLoad}
              className="h-10 rounded-[8px] bg-paper px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink transition hover:bg-gold-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#071116]"
            >
              Load Replay
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                title={preset.title}
                onClick={() => onPreset(preset.value)}
                className="h-8 rounded-pill border border-paper/15 bg-paper/[0.06] px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-paper/78 transition hover:border-gold/60 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {preset.label}
              </button>
            ))}
            {marketOpen && (
              <button
                type="button"
                aria-pressed={compareLive}
                onClick={() => onCompareLive(!compareLive)}
                className={cn(
                  "h-8 rounded-pill border px-3 font-mono text-[12px] uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                  compareLive
                    ? "border-bull/50 bg-bull/20 text-paper"
                    : "border-paper/15 bg-paper/[0.06] text-paper/70 hover:text-paper",
                )}
              >
                Compare to live
              </button>
            )}
          </div>

          {recentDates.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-paper/45">
                Recent
              </span>
              {recentDates.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onRecent(item)}
                  className="h-7 rounded-pill border border-paper/10 bg-paper/[0.04] px-2.5 font-mono text-[12px] text-paper/68 transition hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ReplayStatusRow({
  state,
  date,
  barsCount,
  channelBuilt,
  anchorsBuilt,
  error,
}: {
  state: ReplayState;
  date: string | null;
  barsCount: number;
  channelBuilt: boolean;
  anchorsBuilt: boolean;
  error: string | null;
}) {
  const stateLabel =
    state === "empty"
      ? "No date loaded"
      : state === "loading"
        ? "Loading replay"
        : state === "partial"
          ? "Partial data"
          : state === "error"
            ? "Replay error"
            : "Replay ready";

  return (
    <div
      className={cn(
        "rounded-[12px] border px-4 py-3",
        state === "error"
          ? "border-bear/35 bg-bear-tint/35 text-bear-ink"
          : state === "partial"
            ? "border-gold/40 bg-gold-tint/50 text-gold-ink"
            : "border-rule bg-paper text-ink",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusToken label="State" value={stateLabel} />
        <StatusToken label="Date loaded" value={date ?? "None"} />
        <StatusToken label="Bars" value={state === "loading" ? "Loading" : String(barsCount)} />
        <BuildToken label="Fan built" built={channelBuilt} loading={state === "loading"} />
        <BuildToken label="Anchors built" built={anchorsBuilt} loading={state === "loading"} />
        {error && <span className="text-[13px] leading-snug">{error}</span>}
      </div>
    </div>
  );
}

function DarkPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[16px] border border-[#C9A227]/45 bg-[#071116] text-paper shadow-[0_20px_54px_-42px_rgba(7,17,22,0.95)]",
        "motion-safe:animate-[replay-fade_200ms_ease-out]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-paper/10 px-4 py-4 md:px-5">
      <div>
        <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-soft">
          {eyebrow}
        </div>
        <h2 className="mt-1 font-serif text-[24px] leading-tight text-paper">
          {title}
        </h2>
      </div>
      {meta && (
        <div className="font-mono text-[12px] tabular-nums text-paper/52">
          {meta}
        </div>
      )}
    </div>
  );
}

function DualReplayChart({
  spy,
  spx,
  intraday,
  spyPlayback,
  esPlayback,
  state,
}: {
  spy: AdaptedSnapshot | null;
  spx: SPXSnapshot | null;
  intraday: IntradayResponse | null;
  spyPlayback: ReplayChartPlayback;
  esPlayback: ReplayChartPlayback;
  state: ReplayState;
}) {
  if (state === "empty") {
    return <QuietChartState title="No date picked" body={replayCopy.chart.empty} />;
  }
  if (state === "error") {
    return <QuietChartState title="Replay failed" body="The replay endpoints did not return a usable session." tone="error" />;
  }
  if (!intraday || ((intraday.spy?.length ?? 0) === 0 && (intraday.es?.length ?? 0) === 0)) {
    return (
      <QuietChartState
        title="Intraday bars unavailable"
        body="Showing snapshot-only panels. The dual replay charts populate when SPY 03:00-15:00 CT bars or ES overnight-through-RTH bars exist for this date."
        tone="partial"
      />
    );
  }

  return (
    <ReplayPlayback
      spy={spy}
      spx={spx}
      intraday={intraday}
      spyPlayback={spyPlayback}
      esPlayback={esPlayback}
    />
  );
}

function ChannelChart({
  spx,
  intraday,
  playhead,
  cursorAt,
  state,
  events,
  touches,
  onSeek,
}: {
  spx: SPXSnapshot | null;
  intraday: IntradayResponse | null;
  playhead: number;
  cursorAt: string | null;
  state: ReplayState;
  events: VerdictEvent[];
  touches: TouchEvent[];
  onSeek: (iso: string) => void;
}) {
  const bars = intraday?.es ?? [];
  const lines = useMemo(() => buildEsLines(spx), [spx]);

  if (state === "empty") {
    return <QuietChartState title="No date picked" body={replayCopy.chart.empty} />;
  }
  if (state === "error") {
    return <QuietChartState title="Replay failed" body="The replay endpoints did not return a usable session." tone="error" />;
  }
  if (bars.length === 0) {
    return (
      <QuietChartState
        title="Intraday bars unavailable"
        body="Showing snapshot-only panels. The chart will populate when 5-minute bars exist for this date."
        tone="partial"
      />
    );
  }

  return (
    <ReplaySvg
      bars={bars}
      lines={lines}
      playhead={playhead}
      cursorAt={cursorAt}
      events={events}
      touches={touches.filter((touch) => touch.engine === "ES")}
      onSeek={onSeek}
    />
  );
}

function ReplaySvg({
  bars,
  lines,
  playhead,
  cursorAt,
  events,
  touches,
  onSeek,
}: {
  bars: IntradayBar[];
  lines: ProjectedLine[];
  playhead: number;
  cursorAt: string | null;
  events: VerdictEvent[];
  touches: TouchEvent[];
  onSeek: (iso: string) => void;
}) {
  const width = 980;
  const height = 500;
  const pad = { l: 58, r: 98, t: 34, b: 42 };
  const t0 = new Date(bars[0].t).getTime();
  const t1 = new Date(bars[bars.length - 1].t).getTime();
  const tNow = t0 + (t1 - t0) * playhead;
  const visibleBars = bars.filter((bar) => new Date(bar.t).getTime() <= tNow);

  const yPoints: number[] = [];
  for (const bar of bars) yPoints.push(bar.h, bar.l, bar.c);
  for (const line of lines) yPoints.push(line.valueAt(t0), line.valueAt(t1));
  let yMin = Math.min(...yPoints);
  let yMax = Math.max(...yPoints);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad;
  yMax += yPad;

  const xOf = (ms: number) =>
    pad.l + ((ms - t0) / Math.max(1, t1 - t0)) * (width - pad.l - pad.r);
  const yOf = (price: number) =>
    pad.t + (1 - (price - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  const path = visibleBars
    .map((bar, index) => {
      const ms = new Date(bar.t).getTime();
      return `${index === 0 ? "M" : "L"} ${xOf(ms).toFixed(1)},${yOf(bar.c).toFixed(1)}`;
    })
    .join(" ");
  const lastVisible = visibleBars.at(-1) ?? bars[0];
  const playheadX = xOf(new Date(lastVisible.t).getTime());
  const volumeTop = height - pad.b + 8;
  const volumeHeight = 36;
  const volumeMax = Math.max(...bars.map((bar) => Math.max(0, bar.v ?? 0)), 1);
  const barWidth = Math.max(
    2,
    ((width - pad.l - pad.r) / Math.max(1, bars.length)) * 0.56,
  );
  const ceiling = lines.find((line) => line.tone === "ceiling");
  const floor = lines.find((line) => line.tone === "floor");

  return (
    <div className="rounded-[12px] border border-paper/10 bg-paper/[0.035]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[470px] w-full"
        role="img"
        aria-labelledby="replay-chart-title replay-chart-desc"
      >
        <title id="replay-chart-title">ES Pivot Fan replay chart</title>
        <desc id="replay-chart-desc">
          ES intraday price path plotted against the projected Pivot Fan references.
        </desc>
        <rect width={width} height={height} fill="transparent" />
        {[0.2, 0.4, 0.6, 0.8].map((fraction) => (
          <line
            key={fraction}
            x1={pad.l}
            x2={width - pad.r}
            y1={pad.t + fraction * (height - pad.t - pad.b)}
            y2={pad.t + fraction * (height - pad.t - pad.b)}
            stroke="rgba(244,228,192,0.11)"
            strokeDasharray="4 8"
          />
        ))}
        {ceiling && floor && (
          <path
            d={[
              `M ${pad.l.toFixed(1)},${yOf(ceiling.valueAt(t0)).toFixed(1)}`,
              `L ${(width - pad.r).toFixed(1)},${yOf(ceiling.valueAt(t1)).toFixed(1)}`,
              `L ${(width - pad.r).toFixed(1)},${yOf(floor.valueAt(t1)).toFixed(1)}`,
              `L ${pad.l.toFixed(1)},${yOf(floor.valueAt(t0)).toFixed(1)}`,
              "Z",
            ].join(" ")}
            fill="rgba(184,130,31,0.08)"
          />
        )}
        {lines.map((line) => {
          const yStart = yOf(line.valueAt(t0));
          const yEnd = yOf(line.valueAt(t1));
          const color = lineColor(line.tone);
          return (
            <g key={line.label}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={yStart}
                y2={yEnd}
                stroke={color}
                strokeWidth={line.tone === "ceiling" || line.tone === "floor" ? 2 : 1.2}
                strokeDasharray={line.tone === "reference" ? "7 8" : undefined}
                opacity={0.88}
              />
              <text
                x={width - pad.r + 12}
                y={yEnd + 4}
                fill={color}
                fontSize="12"
                fontFamily="var(--font-geist-mono)"
              >
                {line.label}
              </text>
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          stroke="rgba(244,228,192,0.22)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {bars.map((bar) => {
          const ms = new Date(bar.t).getTime();
          const x = xOf(ms);
          const isFuture = ms > tNow;
          const up = bar.c >= bar.o;
          const bodyY = Math.min(yOf(bar.o), yOf(bar.c));
          const bodyH = Math.max(2, Math.abs(yOf(bar.o) - yOf(bar.c)));
          const wickColor = up ? "#0E7C50" : "#B5301E";
          const volumeH = (Math.max(0, bar.v ?? 0) / volumeMax) * volumeHeight;
          return (
            <g key={bar.t} opacity={isFuture ? 0.22 : 0.94}>
              <line
                x1={x}
                x2={x}
                y1={yOf(bar.h)}
                y2={yOf(bar.l)}
                stroke={wickColor}
                strokeWidth="1"
              />
              <rect
                x={x - barWidth / 2}
                y={bodyY}
                width={barWidth}
                height={bodyH}
                rx="1.5"
                fill={up ? "#D9EFE3" : "#F4D9D3"}
                stroke={wickColor}
                strokeWidth="0.8"
              />
              <rect
                x={x - barWidth / 2}
                y={volumeTop + volumeHeight - volumeH}
                width={barWidth}
                height={Math.max(1, volumeH)}
                fill={up ? "rgba(14,124,80,0.34)" : "rgba(181,48,30,0.34)"}
              />
            </g>
          );
        })}
        {touches.map((touch) => {
          const ms = new Date(touch.at).getTime();
          if (ms < t0 || ms > t1) return null;
          return (
            <circle
              key={`${touch.engine}-${touch.line}-${touch.at}`}
              role="button"
              tabIndex={0}
              aria-label={`${touch.engine} ${touch.side} ${touch.line} at ${shortTime(touch.at)}`}
              onClick={() => onSeek(touch.at)}
              cx={xOf(ms)}
              cy={yOf(touch.price)}
              r={touch.side === "break" ? 5 : 4}
              fill={touch.side === "break" ? "#B5301E" : "#B8821F"}
              stroke="#F4E4C0"
              strokeWidth="1.2"
              className="cursor-pointer outline-none"
            />
          );
        })}
        {events.map((event, index) => {
          const ms = new Date(event.at).getTime();
          if (ms < t0 || ms > t1) return null;
          const x = xOf(ms);
          const y = height - 24 - (index % 3) * 9;
          return (
            <path
              key={`${event.engine}-${event.at}-${index}`}
              role="button"
              tabIndex={0}
              aria-label={`${event.engine} ${event.label} at ${shortTime(event.at)}`}
              onClick={() => onSeek(event.at)}
              d={`M ${x} ${y - 4} l 4 4 l -4 4 l -4 -4 Z`}
              fill={event.engine === "SPY" ? "#0A7589" : "#7E5BAE"}
              stroke="#F4E4C0"
              strokeWidth="0.8"
              className="cursor-pointer outline-none"
            />
          );
        })}
        <line
          x1={playheadX}
          x2={playheadX}
          y1={pad.t}
          y2={height - pad.b}
          stroke="#C9A227"
          strokeWidth="1.2"
          strokeDasharray="4 5"
        />
        <circle
          cx={playheadX}
          cy={yOf(lastVisible.c)}
          r="5"
          fill="#F4E4C0"
          stroke="#C9A227"
          strokeWidth="2"
        />
        <text x={pad.l} y={height - 14} fill="rgba(244,228,192,0.56)" fontSize="12" fontFamily="var(--font-geist-mono)">
          {shortTime(bars[0].t)}
        </text>
        <text x={width - pad.r} y={height - 14} fill="rgba(244,228,192,0.56)" fontSize="12" fontFamily="var(--font-geist-mono)" textAnchor="end">
          {shortTime(bars[bars.length - 1].t)}
        </text>
        <text x={width - 18} y={22} fill="rgba(244,228,192,0.72)" fontSize="12" fontFamily="var(--font-geist-mono)" textAnchor="end">
          {lastVisible.c.toFixed(0)}
        </text>
        {cursorAt && (
          <g>
            <rect
              x={Math.min(width - pad.r - 96, playheadX + 8)}
              y={pad.t + 8}
              width="90"
              height="28"
              rx="7"
              fill="rgba(7,17,22,0.92)"
              stroke="rgba(201,162,39,0.65)"
            />
            <text
              x={Math.min(width - pad.r - 51, playheadX + 53)}
              y={pad.t + 26}
              fill="#F4E4C0"
              fontSize="12"
              fontFamily="var(--font-geist-mono)"
              textAnchor="middle"
            >
              {shortTime(cursorAt)} · {lastVisible.c.toFixed(0)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function JumpToTimeControl({
  disabled,
  jumpValue,
  jumpDraft,
  onJump,
  onJumpDraft,
}: {
  disabled: boolean;
  jumpValue: string | null;
  jumpDraft: string;
  onJump: () => void;
  onJumpDraft: (value: string) => void;
}) {
  return (
    <div className="mt-4 rounded-[12px] border border-paper/10 bg-paper/[0.04] px-3 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.10em] text-gold-soft">
            Jump both charts
          </div>
          <div className="mt-1 text-[12px] text-paper/62">
            SPY and ES have separate play buttons; this jumps both clocks to the same wall time.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-right font-mono text-[12px] tabular-nums text-paper/62">
            {jumpValue ?? "--:--"}
          </span>
          <label className="sr-only" htmlFor="replay-jump-time">
            Jump to time
          </label>
          <input
            id="replay-jump-time"
            type="time"
            value={jumpDraft}
            disabled={disabled}
            onChange={(event) => onJumpDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onJump();
            }}
            className="h-9 rounded-[8px] border border-paper/10 bg-paper/[0.06] px-2 font-mono text-[12px] tabular-nums text-paper outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-35"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={onJump}
            className="h-9 rounded-[8px] border border-paper/10 bg-paper/[0.06] px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-paper/70 transition hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-35"
          >
            Jump
          </button>
        </div>
      </div>
    </div>
  );
}

function Transport({
  disabled,
  playing,
  playhead,
  speed,
  jumpValue,
  jumpDraft,
  onToggle,
  onStep,
  onScrub,
  onSpeed,
  onJump,
  onJumpDraft,
}: {
  disabled: boolean;
  playing: boolean;
  playhead: number;
  speed: PlaybackSpeed;
  jumpValue: string | null;
  jumpDraft: string;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onScrub: (value: number) => void;
  onSpeed: (value: PlaybackSpeed) => void;
  onJump: () => void;
  onJumpDraft: (value: string) => void;
}) {
  return (
    <div className="mt-4 rounded-[12px] border border-paper/10 bg-paper/[0.04] px-3 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex items-center gap-2">
          <TransportButton disabled={disabled} label="Step back one bar" onClick={() => onStep(-1)}>
            <SkipBack size={14} />
          </TransportButton>
          <TransportButton disabled={disabled} label={playing ? "Pause" : "Play"} primary onClick={onToggle}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            <span>{playing ? "Pause" : "Play"}</span>
          </TransportButton>
          <TransportButton disabled={disabled} label="Step forward one bar" onClick={() => onStep(1)}>
            <SkipForward size={14} />
          </TransportButton>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            aria-label="Replay timeline"
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={playhead}
            disabled={disabled}
            onChange={(event) => onScrub(Number(event.target.value))}
            className="min-w-[180px] flex-1 accent-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          <span className="w-16 text-right font-mono text-[12px] tabular-nums text-paper/62">
            {jumpValue ?? "--:--"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="replay-jump-time">
            Jump to time
          </label>
          <input
            id="replay-jump-time"
            type="time"
            value={jumpDraft}
            disabled={disabled}
            onChange={(event) => onJumpDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onJump();
            }}
            className="h-9 rounded-[8px] border border-paper/10 bg-paper/[0.06] px-2 font-mono text-[12px] tabular-nums text-paper outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-35"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={onJump}
            className="h-9 rounded-[8px] border border-paper/10 bg-paper/[0.06] px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-paper/70 transition hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-35"
          >
            Jump
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-pill border border-paper/10 p-1">
          {PLAYBACK_SPEEDS.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => onSpeed(item)}
              className={cn(
                "h-7 rounded-pill px-3 font-mono text-[12px] tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40",
                speed === item ? "bg-paper text-ink" : "text-paper/64 hover:text-paper",
              )}
            >
              {item}x
            </button>
          ))}
          <Gauge size={13} className="mx-1 text-paper/35" />
        </div>
      </div>
    </div>
  );
}

function EngineTapeStrip({
  bars,
  events,
  touches,
  cursorAt,
  onSeek,
}: {
  bars: IntradayBar[];
  events: VerdictEvent[];
  touches: TouchEvent[];
  cursorAt: string | null;
  onSeek: (iso: string) => void;
}) {
  if (bars.length < 2) {
    return (
      <div className="mt-4 rounded-[12px] border border-paper/10 bg-paper/[0.04] p-4">
        <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-soft">
          {replayCopy.tapeStrip.title}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-paper/62">
          {replayCopy.tapeStrip.empty}
        </p>
      </div>
    );
  }

  const t0 = Date.parse(bars[0].t);
  const t1 = Date.parse(bars[bars.length - 1].t);
  const cursorMs = cursorAt ? Date.parse(cursorAt) : t1;
  const markers = [
    ...events.map((event) => ({
      id: `${event.engine}-${event.at}-${event.label}`,
      at: event.at,
      label: `${event.engine} ${event.label}`,
      tone: event.engine === "SPY" ? "spy" : "es",
      kind: event.kind,
    })),
    ...touches.map((touch) => ({
      id: `${touch.engine}-${touch.line}-${touch.at}`,
      at: touch.at,
      label: `${touch.engine} ${touch.side} ${touch.line}`,
      tone: touch.side === "break" ? "break" : "touch",
      kind: touch.side,
    })),
  ].filter((marker) => {
    const ms = Date.parse(marker.at);
    return Number.isFinite(ms) && ms >= t0 && ms <= t1;
  });

  return (
    <div className="mt-4 rounded-[12px] border border-paper/10 bg-paper/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-soft">
            {replayCopy.tapeStrip.title}
          </div>
          <p className="mt-1 text-[12px] text-paper/55">
            State changes, rule hits, and line touches on the same clock as the chart.
          </p>
        </div>
        <span className="font-mono text-[12px] tabular-nums text-paper/55">
          {cursorAt ? shortTime(cursorAt) : "--:--"} CT
        </span>
      </div>
      <div className="relative mt-5 h-16 rounded-[10px] border border-paper/10 bg-[#050C10] px-3">
        <div className="absolute left-3 right-3 top-1/2 h-px bg-paper/16" />
        <div
          className="absolute top-2 h-12 w-px bg-gold"
          style={{
            left: `${3 + ((cursorMs - t0) / Math.max(1, t1 - t0)) * 94}%`,
          }}
        />
        {markers.map((marker, index) => {
          const ms = Date.parse(marker.at);
          const left = `${3 + ((ms - t0) / Math.max(1, t1 - t0)) * 94}%`;
          const tone =
            marker.tone === "spy"
              ? "bg-teal"
              : marker.tone === "es"
                ? "bg-violet"
                : marker.tone === "break"
                  ? "bg-bear"
                  : "bg-gold";
          return (
            <button
              key={`${marker.id}-${index}`}
              type="button"
              title={`${marker.label} · ${shortTime(marker.at)}`}
              onClick={() => onSeek(marker.at)}
              className={cn(
                "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/70 outline-none transition hover:scale-125 focus-visible:ring-2 focus-visible:ring-gold",
                tone,
              )}
              style={{ left }}
            >
              <span className="sr-only">
                Jump to {marker.label} at {shortTime(marker.at)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AnchorPanel({
  state,
  spy,
}: {
  state: ReplayState;
  spy: AdaptedSnapshot | null;
}) {
  const anchor = spy?.anchor?.primary ?? null;
  return (
    <DarkPanel>
      <PanelHeader eyebrow="SPY anchors" title="Anchor framework" />
      <div className="space-y-3 px-4 pb-4 md:px-5 md:pb-5">
        {state === "loading" ? (
          <StackSkeleton rows={4} />
        ) : anchor ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <AnchorStat label="Upper" value={anchor.bands.upper.currentValue} />
              <AnchorStat label="Main" value={anchor.bands.main.currentValue} />
              <AnchorStat label="Lower" value={anchor.bands.lower.currentValue} />
            </div>
            <div className="rounded-[10px] border border-paper/10 bg-paper/[0.04] p-3">
              <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-paper/48">
                Primary anchor
              </div>
              <div className="mt-1 font-mono text-[13px] tabular-nums text-paper">
                {anchor.anchorLow.toFixed(2)} · {shortTime(anchor.anchorTime)} CT
              </div>
            </div>
            <PremarketDiagnosticPanel diag={spy?.premarketDiagnostic ?? null} />
          </>
        ) : (
          <EmptyPanelCopy
            title={state === "empty" ? "No date loaded" : "No anchor built"}
            body="SPY anchor levels appear here when the selected date produces a qualifying premarket anchor."
          />
        )}
      </div>
    </DarkPanel>
  );
}

function VerdictLogPanel({
  state,
  events,
  cursorAt,
  onSeek,
}: {
  state: ReplayState;
  events: VerdictEvent[];
  cursorAt: string | null;
  onSeek: (iso: string) => void;
}) {
  return (
    <DarkPanel>
      <PanelHeader eyebrow="Verdict log" title="Decision trail" />
      <div className="px-4 pb-4 md:px-5 md:pb-5">
        {state === "loading" ? (
          <StackSkeleton rows={5} />
        ) : events.length > 0 ? (
          <ol className="space-y-2" aria-live="polite">
            {events.map((event, index) => {
              const active = isSameReplayMinute(event.at, cursorAt);
              return (
              <li
                key={`${event.engine}-${event.at}-${index}`}
                className={cn(
                  "rounded-[10px] border p-3 cursor-pointer",
                  active
                    ? "border-gold/70 bg-gold/12"
                    : "border-paper/10 bg-paper/[0.04]",
                )}
                onClick={() => onSeek(event.at)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-soft">
                    {event.engine} · {event.label}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-paper/50">
                    {shortTime(event.at)}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-paper/72">{event.detail}</p>
              </li>
              );
            })}
          </ol>
        ) : (
          <EmptyPanelCopy
            title="No verdict events"
            body="State transitions and rule notes will appear when the replay snapshot includes them."
          />
        )}
      </div>
    </DarkPanel>
  );
}

function LineTouchPanel({
  state,
  events,
  cursorAt,
  onSeek,
}: {
  state: ReplayState;
  events: TouchEvent[];
  cursorAt: string | null;
  onSeek: (iso: string) => void;
}) {
  return (
    <DarkPanel>
      <PanelHeader eyebrow="Line touches" title="Touches and breaks" />
      <div className="px-4 pb-4 md:px-5 md:pb-5">
        {state === "loading" ? (
          <StackSkeleton rows={6} />
        ) : events.length > 0 ? (
          <ol className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {events.map((event, index) => {
              const active = isSameReplayMinute(event.at, cursorAt);
              return (
              <li
                key={`${event.engine}-${event.line}-${event.at}-${index}`}
                className={cn(
                  "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[10px] border p-3 cursor-pointer",
                  active
                    ? "border-gold/70 bg-gold/12"
                    : "border-paper/10 bg-paper/[0.04]",
                )}
                onClick={() => onSeek(event.at)}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    event.engine === "SPY" ? "bg-bull" : "bg-violet",
                  )}
                />
                <div className="min-w-0">
                  <div className="truncate font-mono text-[12px] uppercase tracking-[0.08em] text-paper">
                    {event.engine} · {event.line}
                  </div>
                  <div className="font-mono text-[12px] tabular-nums text-paper/50">
                    {event.price.toFixed(event.engine === "SPY" ? 2 : 0)}
                  </div>
                </div>
                <span className="font-mono text-[12px] tabular-nums text-paper/56">
                  {shortTime(event.at)}
                </span>
              </li>
              );
            })}
          </ol>
        ) : (
          <EmptyPanelCopy
            title="No line touches"
            body="Touches populate from real intraday bars. Snapshot-only replays do not invent events."
          />
        )}
      </div>
    </DarkPanel>
  );
}

function TrailKindIcon({ kind }: { kind: VerdictEvent["kind"] }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (kind === "rule") return <Target className={cls} aria-hidden />;
  if (kind === "touch") return <CircleDotIcon className={cls} />;
  if (kind === "risk") return <AlertTriangle className={cls} aria-hidden />;
  if (kind === "trade") return <Check className={cls} aria-hidden />;
  if (kind === "state") return <SkipForward className={cls} aria-hidden />;
  return <Zap className={cls} aria-hidden />;
}

function CircleDotIcon({ className }: { className: string }) {
  return (
    <span
      className={cn("inline-block rounded-full border border-current", className)}
      aria-hidden
    />
  );
}

function QuietChartState({
  title,
  body,
  tone = "neutral",
}: {
  title: string;
  body: string;
  tone?: "neutral" | "partial" | "error";
}) {
  const Icon = tone === "error" ? AlertTriangle : tone === "partial" ? Clock : CalendarDays;
  return (
    <div className="grid min-h-[470px] place-items-center rounded-[12px] border border-paper/10 bg-paper/[0.035] px-6 text-center">
      <div className="max-w-md">
        <div
          className={cn(
            "mx-auto grid h-12 w-12 place-items-center rounded-[12px] border",
            tone === "error"
              ? "border-bear/35 bg-bear/10 text-bear"
              : tone === "partial"
                ? "border-gold/35 bg-gold/10 text-gold-soft"
                : "border-paper/15 bg-paper/[0.05] text-paper/64",
          )}
        >
          <Icon size={18} />
        </div>
        <h2 className="mt-4 font-serif text-[24px] leading-tight text-paper">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-paper/68">{body}</p>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="replay-skeleton relative min-h-[470px] overflow-hidden rounded-[12px] border border-paper/10 bg-paper/[0.04] after:absolute after:inset-y-0 after:w-1/2 after:bg-gradient-to-r after:from-transparent after:via-paper/10 after:to-transparent">
      <div className="absolute inset-x-12 top-12 h-px bg-paper/10" />
      <div className="absolute inset-x-12 top-28 h-px bg-paper/10" />
      <div className="absolute inset-x-12 top-44 h-px bg-paper/10" />
      <div className="absolute left-14 right-28 top-64 h-0.5 rotate-[-6deg] bg-paper/24" />
      <div className="absolute left-14 right-28 top-72 h-0.5 rotate-[3deg] bg-gold/24" />
      <div className="absolute bottom-8 left-14 h-3 w-20 rounded-pill bg-paper/10" />
      <div className="absolute bottom-8 right-28 h-3 w-20 rounded-pill bg-paper/10" />
    </div>
  );
}

function StackSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="replay-skeleton relative h-14 overflow-hidden rounded-[10px] border border-paper/10 bg-paper/[0.04] after:absolute after:inset-y-0 after:w-1/2 after:bg-gradient-to-r after:from-transparent after:via-paper/10 after:to-transparent"
        />
      ))}
    </div>
  );
}

function EmptyPanelCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-paper/10 bg-paper/[0.04] p-4">
      <h3 className="font-serif text-[20px] text-paper">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-paper/68">{body}</p>
    </div>
  );
}

function StatusToken({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[12px] uppercase tracking-[0.08em] opacity-55">
        {label}
      </span>
      <span className="font-mono text-[13px] tabular-nums">{value}</span>
    </div>
  );
}

function BuildToken({
  label,
  built,
  loading,
}: {
  label: string;
  built: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[12px] uppercase tracking-[0.08em] opacity-55">
        {label}
      </span>
      <span
        className={cn(
          "inline-flex h-5 items-center gap-1 rounded-pill px-2 font-mono text-[12px]",
          built ? "bg-bull-tint text-bull-ink" : "bg-paper-2 text-ink-3",
        )}
      >
        {loading ? "..." : built ? <Check size={12} /> : "No"}
        {built && !loading ? "Yes" : null}
      </span>
    </div>
  );
}

function TransportButton({
  disabled,
  primary,
  label,
  onClick,
  children,
}: {
  disabled: boolean;
  primary?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[8px] px-3 font-mono text-[12px] uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-35",
        primary
          ? "bg-paper text-ink hover:bg-gold-soft"
          : "border border-paper/10 bg-paper/[0.06] text-paper/70 hover:text-paper",
      )}
    >
      {children}
    </button>
  );
}

function AnchorStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[10px] border border-paper/10 bg-paper/[0.04] p-3">
      <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-paper/48">
        {label}
      </div>
      <div className="mt-1 font-mono text-[14px] font-semibold tabular-nums text-paper">
        {value == null ? "--" : value.toFixed(2)}
      </div>
    </div>
  );
}

function PremarketDiagnosticPanel({ diag }: { diag: PremarketDiagnostic | null }) {
  if (!diag?.bars?.length) return null;
  return (
    <div className="rounded-[10px] border border-paper/10 bg-paper/[0.04] p-3">
      <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.08em] text-paper/48">
        Premarket read
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {diag.bars.map((bar) => (
          <DiagnosticRow key={bar.t} bar={bar} />
        ))}
      </div>
    </div>
  );
}

function DiagnosticRow({ bar }: { bar: PremarketDiagnosticBar }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[48px_1fr_auto] gap-2 rounded-[7px] px-2 py-1.5 font-mono text-[12px] tabular-nums",
        bar.selectedAs ? "bg-gold/15 text-paper" : "bg-paper/[0.035] text-paper/62",
      )}
    >
      <span>{shortTime(bar.t)}</span>
      <span className="truncate">{bar.reason}</span>
      <span>{bar.l.toFixed(2)}</span>
    </div>
  );
}

function buildEsLines(spx: SPXSnapshot | null): ProjectedLine[] {
  if (!spx) return [];
  return spx.lines.map((line) => {
    const anchorMs = new Date(line.anchorTime).getTime();
    const slopePerMs = line.slopePerHour / 36e5;
    return {
      label: esLineLabel(line.kind),
      tone:
        line.kind === "PREV_RTH_HIGH_DESC" || line.kind === "SWING_HIGH_DESC"
          ? "ceiling"
          : line.kind === "PREV_RTH_LOW_DESC" || line.kind === "SWING_LOW_ASC"
            ? "floor"
            : "reference",
      valueAt: (ms: number) => line.anchorPrice + slopePerMs * (ms - anchorMs),
    };
  });
}

function buildSpyLines(spy: AdaptedSnapshot | null): ProjectedLine[] {
  const anchor: AnchorGroup | null = spy?.anchor?.primary ?? null;
  if (!anchor) return [];
  const slope = spy?.anchor?.slopePerHour ?? DEFAULT_SPY_SLOPE;
  const slopePerMs = slope / 36e5;
  const anchorMs = new Date(anchor.anchorTime).getTime();
  return [
    ["Upper", anchor.bands.upper.anchorPrice ?? anchor.anchorLow + SPY_BAND_OFFSET, "ceiling"],
    ["Main", anchor.bands.main.anchorPrice ?? anchor.anchorLow, "anchor"],
    ["Lower", anchor.bands.lower.anchorPrice ?? anchor.anchorLow - SPY_BAND_OFFSET, "floor"],
  ].map(([label, price, tone]) => ({
    label: String(label),
    tone: tone as ProjectedLine["tone"],
    valueAt: (ms: number) => Number(price) + slopePerMs * (ms - anchorMs),
  }));
}

function buildTouchEvents(
  spy: AdaptedSnapshot | null,
  spx: SPXSnapshot | null,
  intraday: IntradayResponse | null,
): TouchEvent[] {
  const events: TouchEvent[] = [];
  events.push(...touchesFor("ES", intraday?.es ?? [], buildEsLines(spx)));
  events.push(...touchesFor("SPY", intraday?.spy ?? [], buildSpyLines(spy)));
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function touchesFor(
  engine: "SPY" | "ES",
  bars: IntradayBar[],
  lines: ProjectedLine[],
): TouchEvent[] {
  const events: TouchEvent[] = [];
  const lens = buildReplayPriceLens(bars);
  for (const bar of bars) {
    const ms = new Date(bar.t).getTime();
    for (const line of lines) {
      const value = line.valueAt(ms);
      if (lineTouchesSafeBar(bar, value, lens)) {
        events.push({
          engine,
          line: line.label,
          at: bar.t,
          price: value,
          side: "touch",
        });
      }
    }
  }
  return events;
}

function buildVerdictEvents(
  spy: AdaptedSnapshot | null,
  spx: SPXSnapshot | null,
  date: string | null,
): VerdictEvent[] {
  const events: VerdictEvent[] = [];
  if (spy) {
    events.push({
      engine: "SPY",
      at: spy.asOf,
      label: spy.decision.verdict,
      kind: "state",
      detail: cleanReplayExplanation(
        spy.decision.finalExplanation || "SPY replay verdict resolved from the selected snapshot.",
        spy.currentPrice,
      ),
    });
    for (const item of spy.stateHistory ?? []) {
      events.push({
        engine: "SPY",
        at: item.ts,
        label: item.state.replace(/_/g, " ").toLowerCase(),
        kind: "state",
        detail: "State transition recorded by the SPY engine.",
      });
    }
    for (const trace of spy.decisionTrace ?? []) {
      events.push({
        engine: "SPY",
        at: trace.ts,
        label: trace.weight === "key" ? "Rule hit" : "Rule note",
        kind: trace.weight === "key" ? "rule" : "note",
        detail: trace.event,
      });
    }
  }
  if (spx) {
    events.push({
      engine: "ES",
      at: spx.asOf,
      label: spx.confluence.action.replace(/_/g, " ").toLowerCase(),
      kind: "state",
      detail: spx.scenarioExplanation || spx.channel.reason,
    });
    for (const item of spx.stateHistory ?? []) {
      events.push({
        engine: "ES",
        at: item.ts,
        label: item.state.replace(/_/g, " ").toLowerCase(),
        kind: "state",
        detail: "State transition recorded by the ES Pivot Fan engine.",
      });
    }
    for (const trace of spx.decisionTrace ?? []) {
      events.push({
        engine: "ES",
        at: trace.ts,
        label: trace.weight === "key" ? "Rule hit" : "Rule note",
        kind: trace.weight === "key" ? "rule" : "note",
        detail: trace.event,
      });
    }
  }
  if (events.length === 0 && date) {
    events.push({
      engine: "SPY",
      at: `${date}T08:30:00-05:00`,
      label: "Awaiting replay",
      kind: "note",
      detail: "No verdict trail returned for this date.",
    });
  }
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 12);
}

function buildPresets(now: Date): Array<{ label: string; value: string | "custom"; title: string }> {
  const lastSession = previousTradingDate(now);
  return [
    { label: "Yesterday", value: lastSession, title: "Load the most recent completed trading session." },
    { label: "Last Session", value: lastSession, title: "Load the last completed market session." },
    { label: "Last FOMC", value: nearestPastEvent(now, [...REPLAY_PRESET_EVENTS.fomc]) ?? lastSession, title: "Load the most recent configured FOMC session." },
    { label: "Last CPI", value: nearestPastEvent(now, [...REPLAY_PRESET_EVENTS.cpi]) ?? lastSession, title: "Load the most recent configured CPI session." },
    { label: "Custom...", value: "custom", title: "Focus the date picker." },
  ];
}

function cleanReplayExplanation(text: string, spot: number): string {
  if (!Number.isFinite(spot) || spot <= 0) return text;
  const gammaFlip = /(?:\s*)dealer gamma (?:positive|negative|flat) with flip near ([0-9]+(?:\.[0-9]+)?)(?:\.|,)?/i;
  const match = text.match(gammaFlip);
  if (!match) return text;
  const flip = Number(match[1]);
  if (!Number.isFinite(flip)) return text;
  if (Math.abs(flip - spot) / spot <= 0.12) return text;
  return text.replace(gammaFlip, "").replace(/\s{2,}/g, " ").trim();
}

function nearestPastEvent(now: Date, dates: string[]): string | null {
  const today = isoDate(now);
  return dates.filter((item) => item <= today).at(-1) ?? null;
}

function previousTradingDate(now: Date): string {
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 14; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const iso = isoDate(cursor);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) return iso;
  }
  return isoDate(now);
}

function isMarketOpenNow(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const total = hour * 60 + minute;
  return !["Sat", "Sun"].includes(weekday) && total >= 8 * 60 + 30 && total < 15 * 60;
}

function timeAtPlayhead(bars: IntradayBar[], playhead: number): string | null {
  if (bars.length === 0) return null;
  const index = barIndexAtPlayhead(bars, playhead);
  return shortTime(bars[index].t);
}

function barIndexAtPlayhead(bars: IntradayBar[], playhead: number): number {
  if (bars.length === 0) return 0;
  return Math.min(
    bars.length - 1,
    Math.max(0, Math.round((bars.length - 1) * playhead)),
  );
}

function stepPlayhead(
  bars: IntradayBar[],
  playhead: number,
  deltaBars: number,
): number {
  if (bars.length < 2) return clamp(playhead, 0, 1);
  const nextIndex = Math.min(
    bars.length - 1,
    Math.max(0, barIndexAtPlayhead(bars, playhead) + deltaBars),
  );
  return nextIndex / Math.max(1, bars.length - 1);
}

function playheadForIso(bars: IntradayBar[], iso: string): number | null {
  if (bars.length < 2) return null;
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bars.length; i++) {
    const distance = Math.abs(Date.parse(bars[i].t) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex / Math.max(1, bars.length - 1);
}

function playheadForTime(bars: IntradayBar[], value: string): number | null {
  if (bars.length < 2 || !/^\d{2}:\d{2}$/.test(value)) return null;
  const target = value.replace(":", "");
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bars.length; i++) {
    const label = shortTime(bars[i].t).replace(":", "");
    const distance = Math.abs(Number(label) - Number(target));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex / Math.max(1, bars.length - 1);
}

function parseSpeed(value: string | null | undefined): PlaybackSpeed {
  const normalized = Number(String(value ?? "").replace("x", ""));
  return PLAYBACK_SPEEDS.includes(normalized as PlaybackSpeed)
    ? (normalized as PlaybackSpeed)
    : 1;
}

function isSameReplayMinute(a: string, b: string | null): boolean {
  if (!b) return false;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return false;
  return Math.abs(aMs - bMs) < 2.5 * 60_000;
}

function lineColor(tone: ProjectedLine["tone"]): string {
  if (tone === "ceiling") return "#D86A55";
  if (tone === "floor") return "#29A970";
  if (tone === "anchor") return "#C9A227";
  return "#9E83D6";
}

function esLineLabel(kind: SPXLine["kind"]): string {
  const map: Record<SPXLine["kind"], string> = {
    PREV_RTH_HIGH_ASC: "Prev high",
    PREV_RTH_HIGH_DESC: "Prev high desc",
    PREV_RTH_LOW_ASC: "Prev low asc",
    PREV_RTH_LOW_DESC: "Prev low",
    SWING_HIGH_ASC: "Overnight high minor",
    SWING_HIGH_DESC: "Swing high desc",
    SWING_LOW_ASC: "Swing low asc",
    SWING_LOW_DESC: "Swing low desc",
  };
  return map[kind];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
