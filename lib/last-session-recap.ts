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
  const side: "LONG" | "SHORT" | null =
    verdict === "LONG" ? "LONG" : verdict === "SHORT" ? "SHORT" : null;
  if (!side) return null;
  if (!block.verdictOutcome || block.verdictOutcome === "N_A") return null;
  return shapeRecap(side, block, snap.asOf);
}

function buildSpxRecap(snap: SPXSnapshot | null): LastSignalSummary | null {
  if (!snap) return null;
  // SPXSnapshot doesn't carry a replay block in the adapter typings
  // today — narrow via runtime check.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const block = (snap as any).replay as
    | {
        verdictOutcome?: "WIN" | "LOSS" | "PUSH" | "N_A" | null;
        verdictPnl?: number | null;
        isReplay?: boolean;
      }
    | null
    | undefined;
  if (!block || !block.isReplay) return null;
  if (!block.verdictOutcome || block.verdictOutcome === "N_A") return null;
  // SPX engine doesn't emit a side; infer from PnL sign as a least-bad
  // proxy. PUSH days return null since direction is meaningless.
  const pnl = block.verdictPnl ?? 0;
  if (pnl === 0) return null;
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
