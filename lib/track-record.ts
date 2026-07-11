// Aggregates the engine's last N session outcomes from the replay
// snapshot endpoints. Surfaces a compact W/L/Push/Skip count so the
// user can see "is the engine actually any good?" at a glance —
// answering the implicit question every weekend the slate is empty.
//
// Cheap on a normal weekday because /api/snapshot caches replay
// responses for 24h (max-age=300, swr=86400). Cold on a fresh deploy.

import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import { getTradingDayCloseForDate, type Engine } from "@/lib/sessions";

export interface SessionOutcome {
  date: string; // YYYY-MM-DD
  outcome: "WIN" | "LOSS" | "PUSH" | "SKIP"; // SKIP = engine watched, no trade
  pnlPts: number | null;
  direction?: "BULLISH" | "BEARISH" | null;
  note?: string;
}

export interface EngineTrackRecord {
  engine: Engine;
  label?: string;
  metricLabel?: string;
  methodology?: string;
  sessions: SessionOutcome[];
  wins: number;
  losses: number;
  pushes: number;
  skips: number;
  /** Hit rate over GRADED sessions (WIN + LOSS); null when none. */
  hitRate: number | null;
}

const DEFAULT_LOOKBACK = 5;

function chicagoDateISO(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysISO(dateISO: string, offsetDays: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0));
  return [
    next.getUTCFullYear().toString().padStart(4, "0"),
    (next.getUTCMonth() + 1).toString().padStart(2, "0"),
    next.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function previousNTradingDates(now: Date, count: number): string[] {
  const out: string[] = [];
  const todayISO = chicagoDateISO(now);
  const todayClose = getTradingDayCloseForDate(todayISO);
  const includeToday = todayClose !== null && now.getTime() >= todayClose.getTime();
  let probeOffset = includeToday ? 0 : 1;
  // Bound the walk at 30 calendar days for safety (covers ~21 trading
  // days, plenty for a 5- or 10-session lookback).
  while (out.length < count && probeOffset <= 30) {
    const probeISO = addDaysISO(todayISO, -probeOffset);
    probeOffset++;
    if (getTradingDayCloseForDate(probeISO) === null) continue;
    out.push(probeISO);
  }
  return out;
}

interface ReplayLike {
  isReplay?: boolean;
  verdictOutcome?: "WIN" | "LOSS" | "PUSH" | "N_A" | null;
  verdictPnl?: number | null;
  entry?: {
    side?: string | null;
    time?: string | null;
  } | null;
  exit?: {
    time?: string | null;
  } | null;
}

interface CandleLike {
  t?: string;
  o?: number;
  c?: number;
}

function classify(block: ReplayLike | null | undefined): SessionOutcome["outcome"] {
  if (!block || !block.isReplay) return "SKIP";
  const o = block.verdictOutcome;
  if (o === "WIN" || o === "LOSS" || o === "PUSH") return o;
  // v4 note: the SPX track-record consistently classifies recent
  // sessions as SKIP while SPY shows graded WIN/LOSS days. Two
  // possible causes (both backend, none fixable from the FE):
  //   1) yfinance returns empty for ES=F on the dates being graded;
  //      the SPX replay path then can't compute open/close → no
  //      verdictOutcome. PR #73 widened the fetch window but didn't
  //      eliminate the failure mode.
  //   2) The SPX engine's qualifying conditions (channel formed,
  //      rejection candle, confirmation) were genuinely not met on
  //      those days — in which case SKIP is honest.
  // Backend follow-up: inspect api/spx/snapshot.py
  // _build_spx_replay_block, specifically whether verdictOutcome can
  // ever be set without a prior verdictOpen / verdictClose being
  // computed. If yes, the FE will start reflecting graded days
  // automatically.
  return "SKIP";
}

function replayDirection(block: ReplayLike | null | undefined): SessionOutcome["direction"] {
  const side = block?.entry?.side?.toUpperCase();
  if (!side) return null;
  if (["LONG", "BUY", "CALL", "BULLISH"].includes(side)) return "BULLISH";
  if (["SHORT", "SELL", "PUT", "BEARISH"].includes(side)) return "BEARISH";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function replayBlockFromLoaded(value: any): ReplayLike | null {
  return (value?.data?.replay ?? value?.snap?.replay ?? null) as ReplayLike | null;
}

function summarize(
  engine: Engine,
  sessions: SessionOutcome[],
  overrides: Partial<Pick<EngineTrackRecord, "label" | "metricLabel" | "methodology">> = {},
): EngineTrackRecord {
  const wins = sessions.filter((s) => s.outcome === "WIN").length;
  const losses = sessions.filter((s) => s.outcome === "LOSS").length;
  const pushes = sessions.filter((s) => s.outcome === "PUSH").length;
  const skips = sessions.filter((s) => s.outcome === "SKIP").length;
  const graded = wins + losses;
  const hitRate = graded > 0 ? wins / graded : null;

  return {
    engine,
    ...overrides,
    sessions,
    wins,
    losses,
    pushes,
    skips,
    hitRate,
  };
}

function candlesFromLoaded(value: unknown): CandleLike[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = value as any;
  const candles = v?.data?.candles ?? v?.snap?.candles ?? [];
  return Array.isArray(candles) ? (candles as CandleLike[]) : [];
}

function addHoursISO(iso: string, hours: number): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString();
}

function gradeSpyCandlesByEsWindow(
  candles: CandleLike[],
  esBlock: ReplayLike | null,
): Pick<SessionOutcome, "outcome" | "pnlPts" | "direction"> | null {
  const direction = replayDirection(esBlock);
  const entryISO = esBlock?.entry?.time ?? null;
  if (!direction || !entryISO) return null;
  const exitISO =
    esBlock?.exit?.time && new Date(esBlock.exit.time).getTime() > new Date(entryISO).getTime()
      ? esBlock.exit.time
      : addHoursISO(entryISO, 1);
  const entryMs = new Date(entryISO).getTime();
  const exitMs = new Date(exitISO).getTime();
  if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs) || exitMs <= entryMs) return null;

  const sorted = candles
    .filter((bar) => typeof bar.t === "string" && Number.isFinite(bar.o) && Number.isFinite(bar.c))
    .sort((a, b) => new Date(a.t as string).getTime() - new Date(b.t as string).getTime());
  const windowBars = sorted.filter((bar) => {
    const t = new Date(bar.t as string).getTime();
    return t >= entryMs && t < exitMs;
  });
  if (windowBars.length === 0) return null;

  const entry = Number(windowBars[0].o);
  const exit = Number(windowBars.at(-1)?.c);
  const pnl = direction === "BULLISH" ? exit - entry : entry - exit;
  return {
    outcome: pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "PUSH",
    pnlPts: Math.round(pnl * 100) / 100,
    direction,
  };
}

export async function fetchTrackRecord(
  engine: Engine,
  now: Date = new Date(),
  lookback: number = DEFAULT_LOOKBACK,
): Promise<EngineTrackRecord> {
  const dates = previousNTradingDates(now, lookback);
  const fetcher = engine === "SPY" ? loadLiveSnapshot : loadSpxSnapshot;
  const settled = await Promise.allSettled(dates.map((d) => fetcher(d)));

  const sessions: SessionOutcome[] = settled.map((res, i) => {
    if (res.status !== "fulfilled") {
      return { date: dates[i], outcome: "SKIP", pnlPts: null };
    }
    const block = replayBlockFromLoaded(res.value);
    return {
      date: dates[i],
      outcome: classify(block),
      pnlPts: block?.verdictPnl ?? null,
      direction: replayDirection(block),
    };
  });

  return summarize(engine, sessions);
}

export async function fetchSpyEsConfluenceTrackRecord(
  now: Date = new Date(),
  lookback: number = DEFAULT_LOOKBACK,
): Promise<EngineTrackRecord> {
  const dates = previousNTradingDates(now, lookback);
  const settled = await Promise.allSettled(
    dates.map(async (date) => {
      const [spy, spx] = await Promise.allSettled([
        loadLiveSnapshot(date),
        loadSpxSnapshot(date),
      ]);
      return { date, spy, spx };
    }),
  );

  const sessions: SessionOutcome[] = settled.map((res, i) => {
    const date = dates[i];
    if (res.status !== "fulfilled") {
      return {
        date,
        outcome: "SKIP",
        pnlPts: null,
        direction: null,
        note: "Replay fetch failed.",
      };
    }

    const spxBlock =
      res.value.spx.status === "fulfilled"
        ? replayBlockFromLoaded(res.value.spx.value)
        : null;
    const spxOutcome = classify(spxBlock);
    const spyCandles =
      res.value.spy.status === "fulfilled" ? candlesFromLoaded(res.value.spy.value) : [];
    const esLedSpy = gradeSpyCandlesByEsWindow(spyCandles, spxBlock);

    if (spxOutcome === "SKIP" || esLedSpy === null) {
      return {
        date,
        outcome: "SKIP",
        pnlPts: null,
        direction: replayDirection(spxBlock),
        note:
          spxOutcome === "SKIP"
            ? "Filtered out: ES did not produce a graded entry."
            : "Filtered out: SPY candles were unavailable for the ES entry window.",
      };
    }

    return {
      date,
      outcome: esLedSpy.outcome,
      pnlPts: esLedSpy.pnlPts,
      direction: esLedSpy.direction,
      note: "SPY was graded in the direction of the ES entry over the same ES decision window.",
    };
  });

  return summarize("SPY", sessions, {
    label: "SPY + ES",
    metricLabel: "ES-led SPY hit rate",
    methodology:
      "Only sessions where ES produced a graded entry are counted. SPY is scored in the ES direction over that same ES decision window; days without an ES entry are skips.",
  });
}
