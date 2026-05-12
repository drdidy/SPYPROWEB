import {
  buildContractProjection,
  projectionChainFromRows,
  type ContractProjection,
  type ProjectionSide,
} from "@/lib/contract-projection";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { TradeSignal } from "@/lib/types";

export function buildSpyContractProjection(
  snap: AdaptedSnapshot,
): ContractProjection | null {
  if (!snap.optionsChain || !snap.strikes) return null;
  const side = chooseSpySide(snap.signal, snap);
  const preferredStrike =
    side === "CALL" ? snap.strikes.callStrike : snap.strikes.putStrike;
  const nearestLine = snap.lines
    .slice()
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];
  const entryUnderlying = snap.signal?.entryPrice ?? nearestLine?.currentValue ?? null;

  return buildContractProjection({
    symbol: "SPY",
    chain: projectionChainFromRows({
      calls: snap.optionsChain.calls,
      puts: snap.optionsChain.puts,
      expiration: snap.optionsChain.expiration,
    }),
    side,
    preferredStrike,
    underlyingNow: snap.currentPrice,
    entryUnderlying,
    stopUnderlying: snap.signal?.stopPrice ?? null,
    targetUnderlying: snap.signal?.targetPrice ?? null,
  });
}

function chooseSpySide(
  signal?: TradeSignal | null,
  snap?: AdaptedSnapshot,
): ProjectionSide {
  if (signal?.type === "PUT") return "PUT";
  if (signal?.type === "CALL") return "CALL";
  if (snap?.decision.verdict === "SHORT" || snap?.bias.bias === "BEARISH") {
    return "PUT";
  }
  return "CALL";
}
