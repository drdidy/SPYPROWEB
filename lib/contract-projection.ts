export type ProjectionSide = "CALL" | "PUT";

export interface ProjectionQuote {
  optionSymbol?: string | null;
  streamerSymbol?: string | null;
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
  optionSymbol: string | null;
  streamerSymbol: string | null;
  side: ProjectionSide;
  strike: number;
  expiration: string | null;
  contractLabel: string;
  underlyingNow: number;
  entryUnderlying: number;
  targetUnderlying: number | null;
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
  projectedEntryAt: string | null;
  projectedTargetAt: string | null;
  pricingModel: "greeks" | "iv_model";
  chainAsOf: string | null;
  thetaApplied: number;
  confidence: "high" | "medium" | "low";
  strikeDistanceFromEntry: number;
  maxEntryDebit: number | null;
  selectionReasons: string[];
  translation: {
    esEntry: number | null;
    spxEntry: number;
    esTarget: number | null;
    spxTarget: number | null;
    basis: number | null;
    basisSource: "live_pair" | "chain_atm" | "unavailable";
  } | null;
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
  minutesToEntry = 30,
  minutesToTarget,
  maxOtmDistance,
  maxEntryDebit = null,
  chainAsOf = null,
  projectedEntryAt = null,
  projectedTargetAt = null,
  translation = null,
  selectionReasons = [],
}: {
  symbol: string;
  chain: ProjectionChain | null | undefined;
  side: ProjectionSide;
  preferredStrike: number | null | undefined;
  underlyingNow: number;
  entryUnderlying: number | null | undefined;
  stopUnderlying?: number | null;
  targetUnderlying?: number | null;
  minutesToEntry?: number;
  minutesToTarget?: number;
  maxOtmDistance?: number;
  maxEntryDebit?: number | null;
  chainAsOf?: string | null;
  projectedEntryAt?: string | null;
  projectedTargetAt?: string | null;
  translation?: ContractProjection["translation"];
  selectionReasons?: string[];
}): ContractProjection | null {
  if (!chain || !Number.isFinite(underlyingNow) || !Number.isFinite(entryUnderlying ?? NaN)) {
    return null;
  }
  if (
    typeof targetUnderlying === "number" &&
    Number.isFinite(targetUnderlying) &&
    Math.abs(targetUnderlying - entryUnderlying!) < 0.25
  ) {
    return null;
  }

  const candidates = side === "CALL" ? chain.calls : chain.puts;
  const quote = nearestQuote(candidates, preferredStrike ?? underlyingNow, entryUnderlying!, side, maxOtmDistance);
  if (!quote) return null;

  const mark = quoteMark(quote);
  const hasUsableGreeks = isUsableDelta(quote.delta) && isUsableGamma(quote.gamma);
  const delta = hasUsableGreeks ? normalizedDelta(side, quote.delta) : 0;
  const gamma = hasUsableGreeks ? finiteOrZero(quote.gamma) : 0;
  if (!Number.isFinite(mark)) {
    return null;
  }

  const estimator = hasUsableGreeks ? estimateAt : estimateAtModeled;
  const targetMinutes =
    typeof minutesToTarget === "number" && Number.isFinite(minutesToTarget)
      ? minutesToTarget
      : minutesToEntry + 45;
  const entry = estimator(quote, side, underlyingNow, entryUnderlying!, mark, minutesToEntry);
  const stop =
    typeof stopUnderlying === "number" && Number.isFinite(stopUnderlying)
      ? estimator(quote, side, underlyingNow, stopUnderlying, mark, minutesToEntry)
      : null;
  const target =
    typeof targetUnderlying === "number" && Number.isFinite(targetUnderlying)
      ? estimator(quote, side, underlyingNow, targetUnderlying, mark, targetMinutes)
      : null;
  const spread = quoteSpread(quote);
  const thetaApplied = roundPrice(finiteOrZero(quote.theta) * (Math.max(0, minutesToEntry) / 1440));
  const confidence = projectionConfidence({
    hasUsableGreeks,
    spread,
    mark,
    entry,
    target,
    chainAsOf,
  });
  const strikeDistanceFromEntry = roundPrice(
    side === "CALL" ? quote.strike - entryUnderlying! : entryUnderlying! - quote.strike,
  );
  const reasons = [
    `${side === "CALL" ? "Call" : "Put"} stays OTM at projected entry`,
    `Projected entry debit ${entry.mark <= (maxEntryDebit ?? Number.POSITIVE_INFINITY) ? "fits" : "exceeds"} the planned budget`,
    `Strike is ${Math.abs(strikeDistanceFromEntry).toFixed(1)} SPX points from entry`,
    hasUsableGreeks ? "Uses live delta/gamma" : "Uses IV model because Greeks are incomplete",
    ...selectionReasons,
  ];

  return {
    symbol,
    optionSymbol: quote.optionSymbol ?? null,
    streamerSymbol: quote.streamerSymbol ?? quote.optionSymbol ?? null,
    side,
    strike: quote.strike,
    expiration: quote.expiration,
    contractLabel: `${symbol} ${formatExpiration(quote.expiration)} ${formatStrike(quote.strike)}${side === "CALL" ? "C" : "P"}`,
    underlyingNow,
    entryUnderlying: entryUnderlying!,
    targetUnderlying: typeof targetUnderlying === "number" && Number.isFinite(targetUnderlying) ? targetUnderlying : null,
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
    projectedEntryAt,
    projectedTargetAt,
    pricingModel: hasUsableGreeks ? "greeks" : "iv_model",
    chainAsOf,
    thetaApplied,
    confidence,
    strikeDistanceFromEntry,
    maxEntryDebit,
    selectionReasons: reasons,
    translation,
    modelNote: hasUsableGreeks
      ? "Projected debit uses live mark plus delta/gamma for the move to the engine line. It is a planning estimate, not a fill guarantee."
      : "Projected debit uses live mark and an implied-volatility option model because usable Greeks are unavailable for this chain. It is a planning estimate, not a fill guarantee.",
  };
}

export function projectionChainFromRows<
  T extends {
    optionSymbol?: string | null;
    streamerSymbol?: string | null;
    strike: number;
    bid: number | null;
    ask: number | null;
    mark?: number | null;
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
      optionSymbol: row.optionSymbol ?? null,
      streamerSymbol: row.streamerSymbol ?? row.optionSymbol ?? null,
      side: "CALL",
      strike: row.strike,
      expiration: input.expiration ?? null,
      bid: row.bid,
      ask: row.ask,
      mark: row.mark ?? null,
      iv: row.iv ?? null,
      delta: row.delta,
      gamma: row.gamma,
      theta: row.theta ?? null,
      vega: row.vega ?? null,
    })),
    puts: input.puts.map((row) => ({
      optionSymbol: row.optionSymbol ?? null,
      streamerSymbol: row.streamerSymbol ?? row.optionSymbol ?? null,
      side: "PUT",
      strike: row.strike,
      expiration: input.expiration ?? null,
      bid: row.bid,
      ask: row.ask,
      mark: row.mark ?? null,
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
  entryUnderlying?: number,
  side?: ProjectionSide,
  maxOtmDistance?: number,
): ProjectionQuote | null {
  const valid = quotes.filter(
    (quote) =>
      Number.isFinite(quote.strike) &&
      Number.isFinite(quoteMark(quote)) &&
      withinOtmDistance(quote, entryUnderlying, side, maxOtmDistance),
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
  minutesForward: number,
): ProjectionEstimate {
  const move = underlyingAt - underlyingNow;
  const delta = normalizedDelta(side, quote.delta);
  const gamma = finiteOrZero(quote.gamma);
  const theta = finiteOrZero(quote.theta);
  const thetaDays = Math.max(0, minutesForward) / 1440;
  const raw = currentMark + delta * move + 0.5 * gamma * move * move + theta * thetaDays;
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

function estimateAtModeled(
  quote: ProjectionQuote,
  side: ProjectionSide,
  underlyingNow: number,
  underlyingAt: number,
  currentMark: number,
  minutesForward: number,
): ProjectionEstimate {
  const minutesToExpiryNow = minutesUntilOptionExpiry(quote.expiration);
  const yearsNow = Math.max(minutesToExpiryNow / 525_600, 1 / 525_600);
  const yearsThen = Math.max((minutesToExpiryNow - Math.max(0, minutesForward)) / 525_600, 1 / 525_600);
  const iv = usableIv(quote.iv) ?? impliedVolatility({
    side,
    underlying: underlyingNow,
    strike: quote.strike,
    yearsToExpiry: yearsNow,
    marketPrice: currentMark,
  });
  const modeled = blackScholesPrice({
    side,
    underlying: underlyingAt,
    strike: quote.strike,
    yearsToExpiry: yearsThen,
    volatility: iv,
  });
  const mark = Math.max(0.01, roundPrice(modeled));
  const spread = quoteSpread(quote);
  const uncertainty = Math.max(spread * 0.5, mark * 0.12, 0.05);
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

function intrinsicValue(side: ProjectionSide, underlying: number, strike: number): number {
  return side === "CALL"
    ? Math.max(0, underlying - strike)
    : Math.max(0, strike - underlying);
}

function withinOtmDistance(
  quote: ProjectionQuote,
  entryUnderlying?: number,
  side?: ProjectionSide,
  maxOtmDistance?: number,
): boolean {
  if (
    typeof entryUnderlying !== "number" ||
    !Number.isFinite(entryUnderlying) ||
    !side ||
    typeof maxOtmDistance !== "number" ||
    !Number.isFinite(maxOtmDistance)
  ) {
    return true;
  }
  const distance = side === "CALL" ? quote.strike - entryUnderlying : entryUnderlying - quote.strike;
  return distance > 0 && distance <= maxOtmDistance;
}

function usableIv(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? NaN) || Math.abs(value!) >= 900 || value! <= 0) return null;
  const decimal = value! > 3 ? value! / 100 : value!;
  return decimal > 0 && decimal < 5 ? decimal : null;
}

function impliedVolatility({
  side,
  underlying,
  strike,
  yearsToExpiry,
  marketPrice,
}: {
  side: ProjectionSide;
  underlying: number;
  strike: number;
  yearsToExpiry: number;
  marketPrice: number;
}): number {
  let lo = 0.01;
  let hi = 5;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    const price = blackScholesPrice({
      side,
      underlying,
      strike,
      yearsToExpiry,
      volatility: mid,
    });
    if (price > marketPrice) hi = mid;
    else lo = mid;
  }
  return Math.max(0.01, Math.min(5, (lo + hi) / 2));
}

function blackScholesPrice({
  side,
  underlying,
  strike,
  yearsToExpiry,
  volatility,
}: {
  side: ProjectionSide;
  underlying: number;
  strike: number;
  yearsToExpiry: number;
  volatility: number;
}): number {
  const r = 0.045;
  const sqrtT = Math.sqrt(Math.max(yearsToExpiry, 1 / 525_600));
  const sigma = Math.max(0.01, volatility);
  const d1 = (Math.log(underlying / strike) + (r + 0.5 * sigma * sigma) * yearsToExpiry) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (side === "CALL") {
    return underlying * normCdf(d1) - strike * Math.exp(-r * yearsToExpiry) * normCdf(d2);
  }
  return strike * Math.exp(-r * yearsToExpiry) * normCdf(-d2) - underlying * normCdf(-d1);
}

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

function minutesUntilOptionExpiry(expiration: string | null): number {
  if (!expiration) return 360;
  const [year, month, day] = expiration.split("-").map(Number);
  if (!year || !month || !day) return 360;
  const expiry = chicagoDateAt({ year, month, day }, 15, 0);
  return Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / 60_000));
}

function chicagoDateAt(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
): Date {
  const wallUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const noonGuess = new Date(Date.UTC(date.year, date.month - 1, date.day, 17, 0));
  return new Date(wallUtc - chicagoOffsetMin(noonGuess) * 60_000);
}

function chicagoOffsetMin(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wallMs - d.getTime()) / 60_000);
}

function isUsableDelta(value: number | null | undefined): boolean {
  return Number.isFinite(value ?? NaN) && Math.abs(value!) <= 1;
}

function isUsableGamma(value: number | null | undefined): boolean {
  return Number.isFinite(value ?? NaN) && value! >= 0 && value! <= 1;
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

function projectionConfidence({
  hasUsableGreeks,
  spread,
  mark,
  entry,
  target,
  chainAsOf,
}: {
  hasUsableGreeks: boolean;
  spread: number;
  mark: number;
  entry: ProjectionEstimate;
  target: ProjectionEstimate | null;
  chainAsOf: string | null;
}): ContractProjection["confidence"] {
  const spreadPct = mark > 0 ? spread / mark : 1;
  const hasFreshChain = Boolean(chainAsOf);
  const targetIsDirectional = !target || Math.abs(target.mark - entry.mark) >= 0.05;
  if (hasUsableGreeks && spreadPct <= 0.18 && hasFreshChain && targetIsDirectional) return "high";
  if (hasUsableGreeks && spreadPct <= 0.35 && targetIsDirectional) return "medium";
  return "low";
}

function formatExpiration(expiration: string | null): string {
  if (!expiration) return "expiry";
  return expiration.slice(5).replace("-", "/");
}

function formatStrike(strike: number): string {
  return Number.isInteger(strike) ? strike.toFixed(0) : strike.toFixed(1).replace(/\.0$/, "");
}
