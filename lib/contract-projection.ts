export type ProjectionSide = "CALL" | "PUT";

export interface ProjectionQuote {
  optionSymbol?: string | null;
  side: ProjectionSide;
  strike: number;
  expiration: string | null;
  bid: number | null;
  ask: number | null;
  mark?: number | null;
  delta: number | null;
  gamma: number | null;
  theta?: number | null;
  vega?: number | null;
  iv?: number | null;
}

export interface ProjectionChain {
  calls: ProjectionQuote[];
  puts: ProjectionQuote[];
}

export interface ContractProjection {
  symbol: string;
  side: ProjectionSide;
  strike: number;
  expiration: string | null;
  contractLabel: string;
  underlyingNow: number;
  entryUnderlying: number;
  underlyingMove: number;
  currentMark: number;
  currentBid: number | null;
  currentAsk: number | null;
  projectedEntry: ProjectionEstimate;
  projectedStop: ProjectionEstimate | null;
  projectedTarget: ProjectionEstimate | null;
  delta: number;
  gamma: number;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  modelNote: string;
}

export interface ProjectionEstimate {
  underlying: number;
  mark: number;
  low: number;
  high: number;
  debitPerContract: number;
}

export function buildContractProjection({
  symbol,
  chain,
  side,
  preferredStrike,
  underlyingNow,
  entryUnderlying,
  stopUnderlying,
  targetUnderlying,
}: {
  symbol: string;
  chain: ProjectionChain | null | undefined;
  side: ProjectionSide;
  preferredStrike: number | null | undefined;
  underlyingNow: number;
  entryUnderlying: number | null | undefined;
  stopUnderlying?: number | null;
  targetUnderlying?: number | null;
}): ContractProjection | null {
  if (!chain || !Number.isFinite(underlyingNow) || !Number.isFinite(entryUnderlying ?? NaN)) {
    return null;
  }

  const candidates = side === "CALL" ? chain.calls : chain.puts;
  const quote = nearestQuote(candidates, preferredStrike ?? underlyingNow);
  if (!quote) return null;

  const mark = quoteMark(quote);
  const delta = normalizedDelta(side, quote.delta);
  const gamma = finiteOrZero(quote.gamma);
  if (!Number.isFinite(mark) || !Number.isFinite(delta) || !Number.isFinite(gamma)) {
    return null;
  }

  const entry = estimateAt(quote, side, underlyingNow, entryUnderlying!, mark);
  const stop =
    typeof stopUnderlying === "number" && Number.isFinite(stopUnderlying)
      ? estimateAt(quote, side, underlyingNow, stopUnderlying, mark)
      : null;
  const target =
    typeof targetUnderlying === "number" && Number.isFinite(targetUnderlying)
      ? estimateAt(quote, side, underlyingNow, targetUnderlying, mark)
      : null;

  return {
    symbol,
    side,
    strike: quote.strike,
    expiration: quote.expiration,
    contractLabel: `${symbol} ${formatExpiration(quote.expiration)} ${quote.strike.toFixed(0)}${side === "CALL" ? "C" : "P"}`,
    underlyingNow,
    entryUnderlying: entryUnderlying!,
    underlyingMove: entryUnderlying! - underlyingNow,
    currentMark: mark,
    currentBid: finiteOrNull(quote.bid),
    currentAsk: finiteOrNull(quote.ask),
    projectedEntry: entry,
    projectedStop: stop,
    projectedTarget: target,
    delta,
    gamma,
    theta: finiteOrNull(quote.theta),
    vega: finiteOrNull(quote.vega),
    iv: finiteOrNull(quote.iv),
    modelNote:
      "Projected debit uses live mark plus delta/gamma for the move to the engine line. It is a planning estimate, not a fill guarantee.",
  };
}

export function projectionChainFromRows<
  T extends {
    strike: number;
    bid: number | null;
    ask: number | null;
    iv?: number | null;
    delta: number | null;
    gamma: number | null;
    theta?: number | null;
    vega?: number | null;
  },
>(input: {
  calls: T[];
  puts: T[];
  expiration?: string | null;
}): ProjectionChain {
  return {
    calls: input.calls.map((row) => ({
      side: "CALL",
      strike: row.strike,
      expiration: input.expiration ?? null,
      bid: row.bid,
      ask: row.ask,
      iv: row.iv ?? null,
      delta: row.delta,
      gamma: row.gamma,
      theta: row.theta ?? null,
      vega: row.vega ?? null,
    })),
    puts: input.puts.map((row) => ({
      side: "PUT",
      strike: row.strike,
      expiration: input.expiration ?? null,
      bid: row.bid,
      ask: row.ask,
      iv: row.iv ?? null,
      delta: row.delta,
      gamma: row.gamma,
      theta: row.theta ?? null,
      vega: row.vega ?? null,
    })),
  };
}

function nearestQuote(
  quotes: ProjectionQuote[],
  preferredStrike: number,
): ProjectionQuote | null {
  const valid = quotes.filter(
    (quote) =>
      Number.isFinite(quote.strike) &&
      Number.isFinite(quoteMark(quote)) &&
      quote.delta !== null &&
      quote.gamma !== null,
  );
  if (valid.length === 0) return null;
  return valid.reduce((best, quote) =>
    Math.abs(quote.strike - preferredStrike) < Math.abs(best.strike - preferredStrike)
      ? quote
      : best,
  );
}

function estimateAt(
  quote: ProjectionQuote,
  side: ProjectionSide,
  underlyingNow: number,
  underlyingAt: number,
  currentMark: number,
): ProjectionEstimate {
  const move = underlyingAt - underlyingNow;
  const delta = normalizedDelta(side, quote.delta);
  const gamma = finiteOrZero(quote.gamma);
  const theta = finiteOrZero(quote.theta);
  const raw = currentMark + delta * move + 0.5 * gamma * move * move + theta * (30 / 1440);
  const mark = Math.max(0.01, roundPrice(raw));
  const spread = quoteSpread(quote);
  const uncertainty = Math.max(spread * 0.5, mark * 0.08, 0.03);
  const low = Math.max(0.01, roundPrice(mark - uncertainty));
  const high = roundPrice(mark + uncertainty);
  return {
    underlying: underlyingAt,
    mark,
    low,
    high,
    debitPerContract: Math.round(mark * 100),
  };
}

function normalizedDelta(side: ProjectionSide, delta: number | null): number {
  const raw = finiteOrZero(delta);
  if (side === "CALL") return Math.abs(raw);
  return raw > 0 ? -raw : raw;
}

function quoteMark(quote: ProjectionQuote): number {
  if (Number.isFinite(quote.mark ?? NaN) && (quote.mark ?? 0) > 0) {
    return quote.mark!;
  }
  const bid = finiteOrNull(quote.bid);
  const ask = finiteOrNull(quote.ask);
  if (bid !== null && ask !== null && ask >= bid) return (bid + ask) / 2;
  return bid ?? ask ?? Number.NaN;
}

function quoteSpread(quote: ProjectionQuote): number {
  const bid = finiteOrNull(quote.bid);
  const ask = finiteOrNull(quote.ask);
  if (bid === null || ask === null || ask < bid) return 0;
  return ask - bid;
}

function finiteOrZero(value: number | null | undefined): number {
  return Number.isFinite(value ?? NaN) ? value! : 0;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value ?? NaN) ? value! : null;
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatExpiration(expiration: string | null): string {
  if (!expiration) return "expiry";
  return expiration.slice(5).replace("-", "/");
}
