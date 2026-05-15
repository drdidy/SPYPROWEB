import {
  buildContractProjection,
  projectionChainFromRows,
  type ContractProjection,
  type ProjectionChain,
} from "@/lib/contract-projection";
import type { SPXContractSuggestion, SPXSnapshot, SPXTrade } from "@/lib/types";

export interface SpxProjectionContractRow {
  strike: number | null;
  bid: number | null;
  ask: number | null;
  mark?: number | null;
  iv?: number | null;
  delta: number | null;
  gamma: number | null;
  theta?: number | null;
  vega?: number | null;
}

export interface SpxProjectionChainInput {
  expiration?: string | null;
  calls: SpxProjectionContractRow[];
  puts: SpxProjectionContractRow[];
}

export function buildSpxContractProjection({
  snap,
  chain,
  trade = snap.plays.primary,
  contract = snap.contracts.forPrimary,
}: {
  snap: SPXSnapshot;
  chain: SpxProjectionChainInput | null | undefined;
  trade?: SPXTrade | null;
  contract?: SPXContractSuggestion | null;
}): ContractProjection | null {
  if (!trade || !contract || !chain) return null;
  return buildContractProjection({
    symbol: "SPX",
    chain: normalizeSpxChain(chain),
    side: contract.type,
    preferredStrike: contract.strike,
    underlyingNow: snap.price.last,
    entryUnderlying: trade.entryPrice,
    targetUnderlying: trade.exitPrice,
    stopUnderlying: null,
  });
}

function normalizeSpxChain(chain: SpxProjectionChainInput): ProjectionChain {
  const calls = chain.calls
    .filter((row): row is Required<Pick<SpxProjectionContractRow, "strike">> & SpxProjectionContractRow => row.strike !== null)
    .map((row) => ({ ...row, strike: row.strike! }));
  const puts = chain.puts
    .filter((row): row is Required<Pick<SpxProjectionContractRow, "strike">> & SpxProjectionContractRow => row.strike !== null)
    .map((row) => ({ ...row, strike: row.strike! }));
  return projectionChainFromRows({
    calls,
    puts,
    expiration: chain.expiration ?? null,
  });
}
