import {
  buildContractProjection,
  projectionChainFromRows,
  type ContractProjection,
  type ProjectionChain,
  type ProjectionSide,
} from "@/lib/contract-projection";
import type { UwOptionChain, UwOptionContract } from "@/lib/options-intel-fetch";
import type { PublicStockEngineSnapshot, StockLineKey } from "@/lib/stocks/types";

const DEFAULT_STOCK_ENTRY_DEBIT_CEILING = 10.0;

export function buildStockEntryContractProjection({
  snapshot,
  chain,
  maxEntryDebit = DEFAULT_STOCK_ENTRY_DEBIT_CEILING,
}: {
  snapshot: PublicStockEngineSnapshot;
  chain: UwOptionChain | null | undefined;
  maxEntryDebit?: number;
}): ContractProjection | null {
  const debitLimit = normalizeEntryDebitCeiling(maxEntryDebit);
  const setup = snapshot.setup;
  if (!setup || snapshot.decision !== "Trade Allowed" || !chain) return null;
  const side: ProjectionSide = setup.setup_type === "call" ? "CALL" : "PUT";
  const normalized = normalizeStockChain(chain);
  const underlyingNow = finite(chain.atm) ?? snapshot.session.current_price;
  const entryUnderlying = setup.entry_price;
  const targetUnderlying = setup.target_price;
  if (!Number.isFinite(underlyingNow) || !Number.isFinite(entryUnderlying)) return null;
  if (Math.abs(targetUnderlying - entryUnderlying) < 0.05) return null;

  const minutesToEntry = minutesUntilIso(setup.entry_timestamp);
  const projectedEntryAt = setup.entry_timestamp || null;
  const projectedTargetAt = projectedTargetIso(projectedEntryAt, 45);
  const maxOtmDistance = stockMaxOtmDistance(entryUnderlying);
  const rows = side === "CALL" ? normalized.calls : normalized.puts;
  const projections = rows
    .filter((row) => isOtmAtEntry(side, row.strike, entryUnderlying))
    .map((row) =>
      buildContractProjection({
        symbol: snapshot.ticker,
        chain: normalized,
        side,
        preferredStrike: row.strike,
        underlyingNow,
        entryUnderlying,
        targetUnderlying,
        stopUnderlying: setup.stop_price,
        maxOtmDistance,
        maxEntryDebit: debitLimit,
        minutesToEntry,
        minutesToTarget: minutesToEntry + 45,
        projectedEntryAt,
        projectedTargetAt,
        chainAsOf: chain.chainDate ?? chain.sessionDate ?? null,
        selectionReasons: [
          `${snapshot.ticker} ${setup.setup_type.toUpperCase()} setup after an hourly close`,
          `Entry gate ${formatLine(setup.target_line)} target is ${money(targetUnderlying)}`,
        ],
      }),
    )
    .filter((projection): projection is ContractProjection => projection !== null)
    .filter((projection) => projection.projectedEntry.mark <= debitLimit);

  const directional = projections.filter((projection) =>
    projection.projectedTarget
      ? projection.projectedTarget.mark >= projection.projectedEntry.mark + 0.05
      : true,
  );
  const candidates = directional.length ? directional : projections;
  const selected = candidates.sort((a, b) => {
    const distance = Math.abs(a.strikeDistanceFromEntry) - Math.abs(b.strikeDistanceFromEntry);
    if (Math.abs(distance) > 0.001) return distance;
    return b.projectedEntry.mark - a.projectedEntry.mark;
  })[0];
  return selected ? withStockTicketNote(selected, snapshot.ticker) : null;
}

function normalizeStockChain(chain: UwOptionChain): ProjectionChain {
  return projectionChainFromRows({
    calls: cleanRows(chain.calls),
    puts: cleanRows(chain.puts),
    expiration: chain.expiration ?? null,
  });
}

function cleanRows(rows: UwOptionContract[]): Array<UwOptionContract & { strike: number }> {
  return rows.filter(
    (row): row is UwOptionContract & { strike: number } =>
      typeof row.strike === "number" && Number.isFinite(row.strike),
  );
}

function isOtmAtEntry(side: ProjectionSide, strike: number, entryUnderlying: number): boolean {
  return side === "CALL" ? strike > entryUnderlying : strike < entryUnderlying;
}

function stockMaxOtmDistance(entryUnderlying: number): number {
  if (!Number.isFinite(entryUnderlying) || entryUnderlying <= 0) return 8;
  return Math.max(1, Math.min(20, entryUnderlying * 0.04));
}

function minutesUntilIso(iso: string | null | undefined): number {
  if (!iso) return 30;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 30;
  return Math.max(0, Math.ceil((ts - Date.now()) / 60_000));
}

function projectedTargetIso(entryIso: string | null, minutesAfterEntry: number): string | null {
  if (!entryIso) return null;
  const ts = Date.parse(entryIso);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts + minutesAfterEntry * 60_000).toISOString();
}

function withStockTicketNote(projection: ContractProjection, ticker: string): ContractProjection {
  return {
    ...projection,
    modelNote: `${ticker} contract ticket is estimated from the live option chain, current mark, Greeks, and the move from the stock gate entry to the target gate. It is a planning estimate, not a fill guarantee.`,
  };
}

function formatLine(line: StockLineKey): string {
  if (line === "upper_2") return "North Gate II";
  if (line === "upper") return "North Gate I";
  if (line === "lower") return "South Gate I";
  if (line === "lower_2") return "South Gate II";
  return "Control Line";
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEntryDebitCeiling(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_STOCK_ENTRY_DEBIT_CEILING;
  return Math.min(50, Math.max(1, Math.round(parsed * 100) / 100));
}

function money(value: number): string {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "$--";
}
