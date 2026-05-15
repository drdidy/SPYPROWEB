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
}

export interface EngineTrackRecord {
  engine: Engine;
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
  // TODO(backend): investigate api/spx/snapshot.py
  // _build_spx_replay_block, specifically whether verdictOutcome
  // can ever be set without a prior verdictOpen / verdictClose
  // being computed. If yes, the FE will start reflecting graded
  // days automatically.
  return "SKIP";
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
    // Both fetcher signatures expose the replay block at .data.replay
    // (SPY) or .snap.replay (SPX). Narrow without duplicating types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = res.value as any;
    const block = (v.data?.replay ?? v.snap?.replay) as ReplayLike | null;
    return {
      date: dates[i],
      outcome: classify(block),
      pnlPts: block?.verdictPnl ?? null,
    };
  });

  const wins = sessions.filter((s) => s.outcome === "WIN").length;
  const losses = sessions.filter((s) => s.outcome === "LOSS").length;
  const pushes = sessions.filter((s) => s.outcome === "PUSH").length;
  const skips = sessions.filter((s) => s.outcome === "SKIP").length;
  const graded = wins + losses;
  const hitRate = graded > 0 ? wins / graded : null;

  return { engine, sessions, wins, losses, pushes, skips, hitRate };
}
