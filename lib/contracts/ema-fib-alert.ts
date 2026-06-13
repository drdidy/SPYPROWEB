import { z } from "zod";

export const EmaFibSymbol = z.enum(["SPY", "SPX", "ES"]);
export type EmaFibSymbol = z.infer<typeof EmaFibSymbol>;

export const EmaFibDirection = z.enum(["long", "short"]);
export type EmaFibDirection = z.infer<typeof EmaFibDirection>;

export const EmaFibAlertKind = z.enum([
  "ema_cross",
  "fib50_armed",
  "fib50_rejection",
  "entry",
  "exit_target",
  "invalidated",
]);
export type EmaFibAlertKind = z.infer<typeof EmaFibAlertKind>;

export const EmaFibCandle = z
  .object({
    open: z.number().finite(),
    high: z.number().finite(),
    low: z.number().finite(),
    close: z.number().finite(),
  })
  .strict();
export type EmaFibCandle = z.infer<typeof EmaFibCandle>;

export const EmaFibAlertPayload = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("tradingview"),
    strategy: z.literal("ema21_ema50_fib50_continuation"),
    symbol: EmaFibSymbol,
    ticker: z.string().min(1).max(48),
    timeframe: z.string().min(1).max(12),
    eventAt: z.string().datetime({ offset: true }),
    kind: EmaFibAlertKind,
    direction: EmaFibDirection,
    last: z.number().finite(),
    ema21: z.number().finite(),
    ema50: z.number().finite(),
    pivotLow: z.number().finite(),
    pivotHigh: z.number().finite(),
    fib50: z.number().finite(),
    extension150: z.number().finite(),
    stop: z.number().finite().nullable(),
    candle: EmaFibCandle,
    note: z.string().max(240).optional(),
  })
  .strict();
export type EmaFibAlertPayload = z.infer<typeof EmaFibAlertPayload>;

export const EmaFibAlertRecord = z
  .object({
    id: z.string().min(1),
    receivedAt: z.string().datetime({ offset: true }),
    status: z.enum(["accepted", "rejected"]),
    reasons: z.array(z.string()),
    payload: EmaFibAlertPayload,
    notification: z
      .object({
        attempted: z.boolean(),
        delivered: z.boolean(),
        error: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
export type EmaFibAlertRecord = z.infer<typeof EmaFibAlertRecord>;
