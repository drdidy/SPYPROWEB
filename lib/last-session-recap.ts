// Derives a one-line recap of the previous trading day's outcome by
// pulling that day's snapshot through /api/snapshot (SPY) and
// /api/spx/snapshot (SPX) in replay mode. The engine's replay block
// carries `verdictOutcome` (WIN/LOSS/PUSH/N_A) and `verdictPnl`
// (point delta); we shape those into a LastSignalSummary the cards
// render. SPX side is inferred from PnL sign because the SPX engine
// doesn't emit a verb on the replay block.
//
// Important caveat: the recap reflects the ENGINE's signal outcome
// for that day, not the user's personal trade. SPY Prophet does not
// track user-side execution.

import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import { getSessionInfo, type Engine } from "@/lib/sessions";
import type { LastSignalSummary } from "@/types/decision-slate";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { SPXSnapshot } from "@/lib/types";

function chicagoDateISO(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function previousTradingDateISO(engine: Engine, now: Date): string {
  const todayISO = chicagoDateISO(now);
  for (let offset = 1; offset <= 14; offset++) {
    const probe = new Date(now.getTime() - offset * 86_400_000);
    if (chicagoDateISO(probe) === todayISO) continue;
    const session = getSessionInfo(engine, probe);
    const tradingDateISO = chicagoDateISO(session.rthClose);
    if (tradingDateISO < todayISO) return tradingDateISO;
  }
  return todayISO;
}

export async function fetchLastSessionRecaps(
  now: Date = new Date(),
): Promise<{
  spy: LastSignalSummary | null;
  spx: LastSignalSummary | null;
}> {
  const spyDate = previousTradingDateISO("SPY", now);
  const spxDate = previousTradingDateISO("SPX", now);

  const [spy, spx] = await Promise.allSettled([
    loadLiveSnapshot(spyDate),
    loadSpxSnapshot(spxDate),
  ]);

  return {
    spy: spy.status === "fulfilled" ? buildSpyRecap(spy.value.data) : null,
    spx: spx.status === "fulfilled" ? buildSpxRecap(spx.value.snap) : null,
  };
}

function buildSpyRecap(snap: AdaptedSnapshot | null): LastSignalSummary | null {
  if (!snap || !snap.replay || !snap.replay.isReplay) return null;
  const block = snap.replay;
  const verdict = snap.decision.verdict;
  const session = block.session;

  // Strong recap when the engine actually graded a trade.
  const side: "LONG" | "SHORT" | null =
    verdict === "LONG" ? "LONG" : verdict === "SHORT" ? "SHORT" : null;
  if (
    side &&
    block.verdictOutcome &&
    block.verdictOutcome !== "N_A"
  ) {
    return shapeRecap(side, block, snap.asOf);
  }

  // Soft recap: even on a WAIT / STAND_DOWN day, surface what the
  // engine saw — verdict + how the day moved. Better than "no recap"
  // when the user did trade off price action.
  if (session) {
    return shapeSoftRecap("SPY", verdict, session, snap.asOf);
  }
  return null;
}

function buildSpxRecap(snap: SPXSnapshot | null): LastSignalSummary | null {
  if (!snap) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const block = (snap as any).replay as
    | {
        verdictOutcome?: "WIN" | "LOSS" | "PUSH" | "N_A" | null;
        verdictPnl?: number | null;
        isReplay?: boolean;
        session?: { netPts?: number; close?: number; open?: number } | null;
      }
    | null
    | undefined;
  if (!block || !block.isReplay) return null;

  // Strong recap when there's a directional outcome.
  if (block.verdictOutcome && block.verdictOutcome !== "N_A") {
    const pnl = block.verdictPnl ?? 0;
    if (pnl !== 0) {
      const side: "LONG" | "SHORT" = pnl > 0 ? "LONG" : "SHORT";
      return shapeRecap(
        side,
        {
          verdictOutcome: block.verdictOutcome,
          verdictPnl: block.verdictPnl ?? null,
        },
        snap.asOf,
      );
    }
  }

  // Soft recap from the day's net move.
  if (block.session && typeof block.session.netPts === "number") {
    const pnl = block.session.netPts;
    return {
      side: pnl >= 0 ? "LONG" : "SHORT",
      triggerAt: snap.asOf,
      exitAt: snap.asOf,
      rMultiple: pnl,
      oneLine: `Watched only — day closed ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} pts`,
    };
  }
  return null;
}

function shapeRecap(
  side: "LONG" | "SHORT",
  block: { verdictOutcome: "WIN" | "LOSS" | "PUSH" | "N_A" | null; verdictPnl: number | null },
  ts: string,
): LastSignalSummary {
  const pnl = block.verdictPnl;
  const oneLine =
    pnl == null
      ? `${block.verdictOutcome?.toLowerCase() ?? "settled"}`
      : pnl >= 0
        ? `closed +${pnl.toFixed(2)} pts`
        : `closed ${pnl.toFixed(2)} pts`;
  return {
    side,
    triggerAt: ts,
    exitAt: ts,
    rMultiple: pnl,
    oneLine,
  };
}

// Soft recap surfaces the engine's posture + how the day moved, even
// when no graded trade occurred. Shown as a secondary "engine watched"
// line so the user knows what the engine saw without conflating it
// with a real signal.
function shapeSoftRecap(
  _engine: "SPY" | "SPX",
  verdict: string | undefined,
  session: { open: number; close: number; netPts: number },
  ts: string,
): LastSignalSummary {
  const pnl = session.netPts;
  // Sentence-case, human-friendly framing. Verdict labels like
  // "stand_down" become "stood down"; absent verdict reads "watched".
  const verdictLabel = verdict
    ? humanizeVerdict(verdict)
    : "Watched";
  const oneLine = `${verdictLabel} — day closed ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} pts (${session.open.toFixed(2)} → ${session.close.toFixed(2)})`;
  return {
    side: pnl >= 0 ? "LONG" : "SHORT",
    triggerAt: ts,
    exitAt: ts,
    rMultiple: pnl,
    oneLine,
  };
}

// Map raw verdict tokens to a calm, sentence-cased phrase suitable for
// the last-session line. Unknown tokens fall back to the lowercased
// raw value so we don't accidentally render code identifiers.
function humanizeVerdict(verdict: string): string {
  const normalized = verdict.toUpperCase().replace(/-/g, "_");
  const map: Record<string, string> = {
    LONG: "Leaned long",
    SHORT: "Leaned short",
    HOLD: "Held position",
    WAIT: "Waited",
    STAND_DOWN: "Stood down",
    TAKE: "Took the channel",
    SELECTIVE: "Traded selectively",
    NO_TRADE: "Watched",
    NA: "Watched",
    N_A: "Watched",
  };
  return map[normalized] ?? verdict.toLowerCase().replace(/_/g, " ");
}
