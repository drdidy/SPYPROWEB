"use client";

// /replay's main client surface.
//
// Owns: the chosen date (URL-driven), three concurrent fetches (SPY
// snapshot, SPX snapshot, intraday 5m bars), a play/pause/scrubbed
// playhead, and the layout that combines a date input, the two
// trade-plan summary cards, and the synced playback panel.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Gauge,
} from "lucide-react";

import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  adaptSnapshot,
  type AdaptedSnapshot,
  type AnchorGroup,
  type PremarketDiagnostic,
  type PremarketDiagnosticBar,
  type RawSnapshot,
} from "@/lib/snapshot-adapter";
import type { SPXSnapshot, SPXLine } from "@/lib/types";
import { ReplayPlayback } from "./ReplayPlayback";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntradayBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
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

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function ReplayWorkspace({ initialDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(initialDate ?? "");
  const [date, setDate] = useState<string | null>(initialDate);

  const [spy, setSpy] = useState<AdaptedSnapshot | null>(null);
  const [spx, setSpx] = useState<SPXSnapshot | null>(null);
  const [intraday, setIntraday] = useState<IntradayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playhead in [0..1]; 0 = first bar, 1 = last. Driven by play/pause +
  // requestAnimationFrame, scrubbable via slider.
  const [playhead, setPlayhead] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Sync URL → state
  useEffect(() => {
    setDraft(initialDate ?? "");
    setDate(initialDate);
  }, [initialDate]);

  const apply = (next: string | null) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    if (next) sp.set("date", next);
    else sp.delete("date");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Three concurrent fetches when the date changes.
  useEffect(() => {
    if (!date) {
      setSpy(null);
      setSpx(null);
      setIntraday(null);
      setError(null);
      return;
    }
    let abort = false;
    setLoading(true);
    setError(null);
    // Honor the API's Cache-Control headers — historical dates are stable,
    // so revisits should hit the browser cache instantly.
    Promise.all([
      fetch(`/api/snapshot?date=${date}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j ? adaptSnapshot(j as RawSnapshot) : null))
        .catch(() => null),
      fetch(`/api/spx/snapshot?date=${date}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/replay/intraday?date=${date}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([s1, s2, s3]) => {
      if (abort) return;
      setSpy(s1);
      setSpx(s2 as SPXSnapshot | null);
      setIntraday(s3 as IntradayResponse | null);
      setLoading(false);
      setPlayhead(1);
      setPlaying(false);
      const errs: string[] = [];
      if (s1?.replay?.error) errs.push(`SPY: ${s1.replay.error}`);
      if ((s3 as IntradayResponse | null)?.error)
        errs.push(`Intraday: ${(s3 as IntradayResponse).error}`);
      if (errs.length) setError(errs.join(" · "));
    });
    return () => {
      abort = true;
    };
  }, [date]);

  // Animation loop: when `playing`, advance playhead toward 1.
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
      setPlayhead((p) => {
        const PLAY_DURATION_S = 8 / speed;
        const next = p + dt / PLAY_DURATION_S;
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
  }, [playing, speed]);

  // ---------------------------------------------------------------------------

  const todayISO = new Date().toISOString().slice(0, 10);
  const intradayHasData =
    !!intraday && (intraday.spy.length > 0 || intraday.es.length > 0);

  return (
    <div className="space-y-8">
      {/* Calendar bar */}
      <Card className="bg-paper">
        <div className="flex flex-col md:flex-row md:items-end gap-4 p-5">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CalendarDays size={14} className="text-gold-ink" strokeWidth={1.6} />
              <span className="eyebrow text-gold-ink">Replay date</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="date"
                max={todayISO}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft !== (date ?? "")) apply(draft || null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") apply(draft || null);
                }}
                className="bg-paper-2 border border-rule rounded-pill px-3 py-2 font-mono text-[13px] text-ink tabular-nums focus:outline-none focus:ring-1 focus:ring-ink-3"
              />
              {date && (
                <button
                  type="button"
                  onClick={() => apply(null)}
                  className="font-mono text-[10px] uppercase tracking-[0.10em] text-ink-3 hover:text-ink transition-colors"
                >
                  clear
                </button>
              )}
              {loading && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-3">
                  <Loader2 size={12} className="animate-spin" strokeWidth={2} />
                  fetching session…
                </span>
              )}
            </div>
            {error && (
              <div className="mt-2 font-mono text-[11px] text-bear-ink">{error}</div>
            )}
          </div>
          {date && (
            <div className="flex items-end gap-6 text-right">
              <Stat label="Date" value={date} mono />
              <Stat
                label="SPY verdict"
                value={spy?.decision.verdict ?? "—"}
                tone={
                  spy?.decision.verdict === "LONG"
                    ? "bull"
                    : spy?.decision.verdict === "SHORT"
                      ? "bear"
                      : undefined
                }
              />
              <Stat
                label="SPX scenario"
                value={spx?.scenario.replace(/_/g, " ") ?? "—"}
              />
            </div>
          )}
        </div>
      </Card>

      {!date && <EmptyState />}

      {date && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SPYPlanCard snap={spy} />
            <SPXPlanCard snap={spx} />
          </div>

          <Card className="bg-paper">
            <div className="p-5 border-b border-rule flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="eyebrow text-ink-3">Intraday playback</span>
                <h3 className="mt-1 text-title font-serif text-ink">
                  How the tape met the framework
                </h3>
              </div>
              <PlaybackControls
                playing={playing}
                onTogglePlay={() => {
                  if (playhead >= 1) setPlayhead(0);
                  setPlaying((p) => !p);
                }}
                onReset={() => {
                  setPlayhead(0);
                  setPlaying(false);
                }}
                playhead={playhead}
                onScrub={(v) => {
                  setPlaying(false);
                  setPlayhead(v);
                }}
                speed={speed}
                onSpeed={setSpeed}
              />
            </div>
            <div className="p-5">
              {intradayHasData ? (
                <ReplayPlayback
                  spy={spy}
                  spx={spx}
                  intraday={intraday!}
                  playhead={playhead}
                />
              ) : (
                <div className="font-mono text-[12px] text-ink-3 italic py-12 text-center">
                  No intraday data for this date
                  {date && (
                    <>
                      {" "}
                      <span className="text-ink-4">
                        (yfinance 5m history is limited to ~60 days)
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>

          <ReplayOutcomeCard snap={spy} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <Card className="bg-paper-2/40">
      <div className="p-12 text-center">
        <div className="inline-flex w-12 h-12 rounded-full bg-paper-2 items-center justify-center mb-4">
          <CalendarDays size={20} className="text-ink-3" strokeWidth={1.5} />
        </div>
        <h3 className="text-title font-serif text-ink">Pick a trading day</h3>
        <p className="mt-2 text-[13px] text-ink-2 max-w-md mx-auto">
          Choose a past date above to rebuild that session's SPX channel
          and SPY anchor framework, then watch the day play out.
        </p>
      </div>
    </Card>
  );
}

function SPYPlanCard({ snap }: { snap: AdaptedSnapshot | null }) {
  const anchor = snap?.anchor?.primary ?? null;
  const verdict = snap?.decision.verdict ?? "—";
  const verdictTone =
    verdict === "LONG" ? "confirmed" : verdict === "SHORT" ? "breached" : "watching";

  return (
    <Card className="bg-paper">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="eyebrow text-ink-3">SPY · plan</span>
            <h3 className="mt-1 text-title font-serif text-ink">
              Anchor framework
            </h3>
          </div>
          <StatusPill variant={verdictTone}>{verdict}</StatusPill>
        </div>

        {anchor ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <BandStat
                label="Upper"
                anchor={anchor.bands.upper.anchorPrice}
                current={anchor.bands.upper.currentValue}
              />
              <BandStat
                label="Main"
                anchor={anchor.bands.main.anchorPrice}
                current={anchor.bands.main.currentValue}
                emphasized
              />
              <BandStat
                label="Lower"
                anchor={anchor.bands.lower.anchorPrice}
                current={anchor.bands.lower.currentValue}
              />
            </div>
            <p className="text-[12.5px] text-ink-2 leading-relaxed">
              Primary anchor low{" "}
              <span className="font-mono font-semibold">
                {anchor.anchorLow.toFixed(2)}
              </span>{" "}
              set at <span className="font-mono">{shortTime(anchor.anchorTime)}</span> CT.
              Bands decay at {(snap?.anchor?.slopePerHour ?? 0.2).toFixed(2)} pts/hr.
            </p>
          </>
        ) : (
          <div className="font-mono text-[12px] text-ink-3 italic py-4">
            No qualifying premarket anchor for this date
          </div>
        )}

        {snap?.premarketDiagnostic && (
          <PremarketDiagnosticPanel diag={snap.premarketDiagnostic} />
        )}
      </div>
    </Card>
  );
}

function SPXPlanCard({ snap }: { snap: SPXSnapshot | null }) {
  if (!snap) {
    return (
      <Card className="bg-paper">
        <div className="p-5">
          <span className="eyebrow text-ink-3">SPX · plan</span>
          <h3 className="mt-1 text-title font-serif text-ink">Channel</h3>
          <div className="mt-3 font-mono text-[12px] text-ink-3 italic">
            No data
          </div>
        </div>
      </Card>
    );
  }
  const dirTone =
    snap.channel.direction === "ASCENDING"
      ? "confirmed"
      : snap.channel.direction === "DESCENDING"
        ? "breached"
        : "watching";
  return (
    <Card className="bg-paper">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="eyebrow text-ink-3">SPX · plan</span>
            <h3 className="mt-1 text-title font-serif text-ink">
              {snap.scenario.replace(/_/g, " ").toLowerCase()}
            </h3>
          </div>
          <StatusPill variant={dirTone}>
            {snap.channel.direction}
          </StatusPill>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {snap.lines.slice(0, 4).map((l) => (
            <div
              key={l.name}
              className="px-2.5 py-1.5 rounded-soft bg-paper-2 shadow-rule"
            >
              <div className="eyebrow text-ink-3 mb-0.5 truncate">{l.name}</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-ink">
                {l.currentValue.toFixed(2)}
              </div>
              <div
                className={`font-mono text-[10px] tabular-nums ${
                  l.distanceFromPrice >= 0 ? "text-bear-ink" : "text-bull-ink"
                }`}
              >
                {l.distanceFromPrice >= 0 ? "+" : ""}
                {l.distanceFromPrice.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-2 leading-relaxed">
          {snap.scenarioExplanation}
        </p>
      </div>
    </Card>
  );
}

function ReplayOutcomeCard({ snap }: { snap: AdaptedSnapshot | null }) {
  const replay = snap?.replay;
  if (!replay || !replay.session) return null;
  const outcome = replay.verdictOutcome ?? "N_A";
  const outcomeTone =
    outcome === "WIN"
      ? "confirmed"
      : outcome === "LOSS"
        ? "breached"
        : outcome === "PUSH"
          ? "watching"
          : "stale";
  const verdict = snap?.decision.verdict ?? "—";
  const session = replay.session;
  return (
    <Card className="bg-paper">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="eyebrow text-ink-3">Verdict outcome</span>
            <h3 className="mt-1 text-title font-serif text-ink">
              {outcome === "N_A"
                ? "No directional call"
                : outcome === "WIN"
                  ? "Profitable call"
                  : outcome === "LOSS"
                    ? "Underwater"
                    : "Flat"}
            </h3>
          </div>
          <StatusPill variant={outcomeTone}>
            {outcome === "N_A" ? "N/A" : outcome}
          </StatusPill>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed">
          Engine called <span className="font-mono font-semibold">{verdict}</span>.
          {replay.verdictPnl !== null && replay.verdictPnl !== undefined && (
            <>
              {" "}
              Verdict PnL was{" "}
              <span
                className={`font-mono font-semibold ${
                  replay.verdictPnl > 0
                    ? "text-bull-ink"
                    : replay.verdictPnl < 0
                      ? "text-bear-ink"
                      : "text-ink-3"
                }`}
              >
                {replay.verdictPnl >= 0 ? "+" : ""}
                {replay.verdictPnl.toFixed(2)} pts
              </span>{" "}
              from RTH open to close.
            </>
          )}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Stat label="Open" value={session.open.toFixed(2)} mono />
          <Stat label="High" value={session.high.toFixed(2)} mono tone="bull" />
          <Stat label="Low" value={session.low.toFixed(2)} mono tone="bear" />
          <Stat
            label="Close"
            value={session.close.toFixed(2)}
            mono
            tone={
              session.netPts > 0 ? "bull" : session.netPts < 0 ? "bear" : undefined
            }
          />
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function PlaybackControls({
  playing,
  onTogglePlay,
  onReset,
  playhead,
  onScrub,
  speed,
  onSpeed,
}: {
  playing: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  playhead: number;
  onScrub: (v: number) => void;
  speed: number;
  onSpeed: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onTogglePlay}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-ink text-paper text-[11px] font-medium uppercase tracking-[0.10em] hover:opacity-90 transition-opacity"
      >
        {playing ? <Pause size={12} strokeWidth={2.5} /> : <Play size={12} strokeWidth={2.5} />}
        {playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-pill bg-paper-2 text-ink-2 text-[11px] hover:text-ink transition-colors ring-1 ring-rule"
      >
        <RotateCcw size={11} strokeWidth={2} />
        Reset
      </button>
      <div className="flex items-center gap-1.5 ml-1">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={playhead}
          onChange={(e) => onScrub(parseFloat(e.target.value))}
          className="w-44 accent-gold"
        />
        <span className="font-mono text-[10px] text-ink-3 tabular-nums w-9 text-right">
          {(playhead * 100).toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center gap-1 ml-2 ring-1 ring-rule rounded-pill p-0.5">
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeed(s)}
            className={`px-2 py-0.5 rounded-pill text-[10px] font-mono transition-colors ${
              speed === s ? "bg-ink text-paper" : "text-ink-3 hover:text-ink"
            }`}
          >
            {s}×
          </button>
        ))}
        <Gauge size={10} className="text-ink-4 mx-0.5" strokeWidth={2} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "bull" | "bear";
}) {
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div
        className={`text-[13px] font-semibold tabular-nums ${mono ? "font-mono" : ""} ${
          tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink"
        }`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}

function BandStat({
  label,
  anchor,
  current,
  emphasized = false,
}: {
  label: string;
  anchor: number | null;
  current: number | null;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`px-2.5 py-1.5 rounded-soft bg-paper-2 shadow-rule ${
        emphasized ? "ring-1 ring-gold/40" : ""
      }`}
    >
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-ink" data-num>
        {current !== null ? current.toFixed(2) : "—"}
      </div>
      {anchor !== null && (
        <div className="font-mono text-[10px] text-ink-3 tabular-nums">
          @ {anchor.toFixed(2)}
        </div>
      )}
    </div>
  );
}

function PremarketDiagnosticPanel({ diag }: { diag: PremarketDiagnostic }) {
  if (!diag.bars || diag.bars.length === 0) return null;
  return (
    <details className="mt-1 group">
      <summary className="cursor-pointer select-none flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-3 hover:text-ink transition-colors">
        <span className="inline-block w-2 transition-transform group-open:rotate-90">
          ›
        </span>
        Premarket bars · what the engine read
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead>
            <tr className="text-ink-3">
              <th className="text-left font-normal pb-1.5 px-2">Time CT</th>
              <th className="text-right font-normal pb-1.5 px-2">Open</th>
              <th className="text-right font-normal pb-1.5 px-2">High</th>
              <th className="text-right font-normal pb-1.5 px-2">Low</th>
              <th className="text-right font-normal pb-1.5 px-2">Close</th>
              <th className="text-left font-normal pb-1.5 px-2">Color</th>
              <th className="text-left font-normal pb-1.5 px-2 w-full">
                Anchor verdict
              </th>
            </tr>
          </thead>
          <tbody>
            {diag.bars.map((b) => (
              <DiagnosticRow key={b.t} bar={b} />
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function DiagnosticRow({ bar }: { bar: PremarketDiagnosticBar }) {
  const selected = bar.selectedAs !== null;
  const colorChip =
    bar.color === "red"
      ? "bg-bear-tint text-bear-ink"
      : bar.color === "green"
        ? "bg-bull-tint text-bull-ink"
        : "bg-paper-2 text-ink-3";
  return (
    <tr
      className={`border-t border-rule ${
        selected ? "bg-gold-tint/40" : ""
      }`}
    >
      <td className="px-2 py-1 text-ink-2">
        {shortTime(bar.t)}
      </td>
      <td className="px-2 py-1 text-right text-ink-2">{bar.o.toFixed(2)}</td>
      <td className="px-2 py-1 text-right text-ink-2">{bar.h.toFixed(2)}</td>
      <td
        className={`px-2 py-1 text-right ${
          selected ? "text-gold-ink font-semibold" : "text-ink"
        }`}
      >
        {bar.l.toFixed(2)}
      </td>
      <td className="px-2 py-1 text-right text-ink-2">{bar.c.toFixed(2)}</td>
      <td className="px-2 py-1">
        <span
          className={`inline-block px-1.5 py-0.5 rounded-pill text-[9px] uppercase tracking-[0.10em] ${colorChip}`}
        >
          {bar.color}
        </span>
      </td>
      <td className="px-2 py-1 text-ink-3">
        {selected ? (
          <span className="text-gold-ink font-semibold">
            ← {bar.selectedAs === "PRIMARY" ? "primary" : "anchor 2"} ·{" "}
            {bar.reason}
          </span>
        ) : bar.qualified ? (
          <span className="text-ink-2">qualified · {bar.reason}</span>
        ) : (
          <span>{bar.reason}</span>
        )}
      </td>
    </tr>
  );
}

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

export type { SPXLine, AnchorGroup };
