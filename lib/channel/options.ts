import type {
  OptionsIntelBundle,
  UwFlowSummary,
  UwGexSummary,
  UwOptionChain,
  UwOptionContract,
} from "@/lib/options-intel-fetch";
import type {
  AdaptedSnapshot,
  FlowSummary,
  GexSummary,
  OptionsRaw,
} from "@/lib/snapshot-adapter";
import type { OptionsIntel, SelectedStrikes } from "@/lib/types";

export function enrichSpySnapshotWithOptions(
  snap: AdaptedSnapshot,
  bundle: OptionsIntelBundle,
): AdaptedSnapshot {
  const symbol = bundle.symbols.SPY;
  if (!symbol) return snap;

  const chain = toOptionsRaw(symbol.chain);
  const intel = chain ? toOptionsIntel(symbol, chain, snap.currentPrice) : snap.optionsIntel;
  const strikes = chain ? toSelectedStrikes(chain, snap.currentPrice) : snap.strikes;

  return {
    ...snap,
    flow: toFlowSummary(symbol.flow) ?? snap.flow,
    gex: toGexSummary(symbol.gex) ?? snap.gex,
    optionsChain: chain ?? snap.optionsChain,
    optionsIntel: intel,
    strikes,
  };
}

function toOptionsRaw(chain: UwOptionChain | null | undefined): OptionsRaw | null {
  if (!chain || !chain.expiration) return null;
  const calls = chain.calls.map(toContract).filter(isContractRow);
  const puts = chain.puts.map(toContract).filter(isContractRow);
  if (calls.length === 0 && puts.length === 0) return null;
  return {
    expiration: chain.expiration,
    atm: finiteOrNull(chain.atm) ?? inferAtm([...calls, ...puts]) ?? 0,
    calls,
    puts,
    totals: {
      callOi: chain.totals.callOi,
      putOi: chain.totals.putOi,
      callVol: chain.totals.callVol,
      putVol: chain.totals.putVol,
      pcr: chain.totals.pcr,
    },
  };
}

function toContract(row: UwOptionContract): OptionsRaw["calls"][number] | null {
  if (!Number.isFinite(row.strike ?? NaN)) return null;
  return {
    strike: row.strike!,
    bid: finiteOrNull(row.bid),
    ask: finiteOrNull(row.ask),
    iv: finiteOrNull(row.iv),
    delta: finiteOrNull(row.delta),
    gamma: finiteOrNull(row.gamma),
    oi: row.oi,
    volume: row.volume,
  };
}

function isContractRow(
  row: OptionsRaw["calls"][number] | null,
): row is OptionsRaw["calls"][number] {
  return row !== null;
}

function toOptionsIntel(
  symbol: NonNullable<OptionsIntelBundle["symbols"][string]>,
  chain: OptionsRaw,
  spot: number,
): OptionsIntel {
  const allOI = [
    ...chain.calls.map((c) => ({ strike: c.strike, oi: c.oi || 0, type: "CALL" as const })),
    ...chain.puts.map((p) => ({ strike: p.strike, oi: p.oi || 0, type: "PUT" as const })),
  ];
  const highOI = allOI
    .filter((row) => Number.isFinite(row.strike) && row.oi > 0)
    .sort((a, b) => b.oi - a.oi)
    .slice(0, 4);
  const callWall = wallStrike(chain.calls, spot);
  const putWall = wallStrike(chain.puts, spot);
  const maxPain = maxOiStrike(allOI, spot);
  const pcr = chain.totals.pcr ?? (chain.totals.callOi ? chain.totals.putOi / chain.totals.callOi : 0);
  const alignment: OptionsIntel["alignment"] =
    pcr > 1.1 ? "OPPOSED" : pcr < 0.9 ? "ALIGNED" : "MIXED";
  const bits = [
    symbol.flow
      ? `Flow ${symbol.flow.lean.toLowerCase()} (${symbol.flow.bullishCount} bull / ${symbol.flow.bearishCount} bear).`
      : null,
    symbol.gex
      ? `Gamma ${symbol.gex.regime.toLowerCase()}${symbol.gex.flipPoint ? `; flip ${symbol.gex.flipPoint.toFixed(0)}` : ""}.`
      : null,
  ].filter(Boolean);
  const oiNote =
    alignment === "ALIGNED"
      ? `Call open interest dominates put open interest (PCR ${pcr.toFixed(2)}).`
      : alignment === "OPPOSED"
        ? `Put open interest dominates call open interest (PCR ${pcr.toFixed(2)}).`
        : `Put-call open interest is balanced (PCR ${pcr.toFixed(2)}).`;

  return {
    putCallRatio: Number(pcr.toFixed(2)),
    maxPain,
    callWall,
    putWall,
    highOI,
    alignment,
    alignmentNote: [oiNote, ...bits].join(" "),
  };
}

function toSelectedStrikes(chain: OptionsRaw, spot: number): SelectedStrikes {
  const atm = chain.atm || Math.round(spot);
  return {
    underlying: spot,
    callStrike: nearestStrike(chain.calls, atm + 2) ?? atm + 2,
    putStrike: nearestStrike(chain.puts, atm - 2) ?? atm - 2,
    expiration: chain.expiration,
    dteLabel: dteLabel(chain.expiration),
  };
}

function toFlowSummary(flow: UwFlowSummary | null | undefined): FlowSummary | null {
  if (!flow) return null;
  return {
    ticker: flow.ticker,
    bullishCount: flow.bullishCount,
    bearishCount: flow.bearishCount,
    premiumNet: flow.premiumNet,
    lean: flow.lean === "BULLISH" || flow.lean === "BEARISH" ? flow.lean : "BALANCED",
    topPrints: flow.topPrints.map((print) => ({
      strike: print.strike,
      side: print.side ?? "",
      premium: print.premium ?? 0,
      ts: print.ts,
    })),
  };
}

function toGexSummary(gex: UwGexSummary | null | undefined): GexSummary | null {
  if (!gex) return null;
  return {
    ticker: gex.ticker,
    totalGEX: gex.totalGEX,
    regime: gex.regime === "POSITIVE" || gex.regime === "NEGATIVE" ? gex.regime : "FLAT",
    flipPoint: gex.flipPoint,
  };
}

function wallStrike(rows: OptionsRaw["calls"], fallback: number): number {
  return rows.slice().sort((a, b) => (b.oi || 0) - (a.oi || 0))[0]?.strike ?? Math.round(fallback);
}

function maxOiStrike(
  rows: Array<{ strike: number; oi: number }>,
  fallback: number,
): number {
  const byStrike = new Map<number, number>();
  for (const row of rows) {
    byStrike.set(row.strike, (byStrike.get(row.strike) ?? 0) + row.oi);
  }
  let best = Math.round(fallback);
  let bestOi = -1;
  for (const [strike, oi] of byStrike) {
    if (oi > bestOi) {
      best = strike;
      bestOi = oi;
    }
  }
  return best;
}

function nearestStrike(rows: OptionsRaw["calls"], target: number): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) =>
    Math.abs(row.strike - target) < Math.abs(best.strike - target) ? row : best,
  ).strike;
}

function inferAtm(rows: OptionsRaw["calls"]): number | null {
  if (rows.length === 0) return null;
  const sorted = rows.slice().sort((a, b) => a.strike - b.strike);
  return sorted[Math.floor(sorted.length / 2)]?.strike ?? null;
}

function dteLabel(expiration: string): string {
  const exp = Date.parse(`${expiration}T12:00:00-05:00`);
  if (!Number.isFinite(exp)) return "DTE";
  const now = new Date();
  const todayCT = Date.parse(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now) + "T12:00:00-05:00",
  );
  const dte = Math.round((exp - todayCT) / 86_400_000);
  return dte <= 0 ? "0DTE" : `${dte}DTE`;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value ?? NaN) ? value! : null;
}
