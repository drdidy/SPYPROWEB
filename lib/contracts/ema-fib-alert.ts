import { z } from "zod";

export const EmaFibSymbol = z.enum(["SPY", "SPX", "ES"]);
export type EmaFibSymbol = z.infer<typeof EmaFibSymbol>;

export const EmaFibDirection = z.enum(["long", "short"]);
export type EmaFibDirection = z.infer<typeof EmaFibDirection>;

export const EmaFibAlertKind = z.enum([
  "price_cross_50",
  "ema_cross",
  "ema_cross_21_50",
  "reload_cross",
  "tokyo_cross",
  "straddle_armed",
  "fib50_armed",
  "reload_zone",
  "tokyo_zone",
  "fib50_rejection",
  "entry",
  "reload_entry",
  "tokyo_entry",
  "exit_target",
  "invalidated",
  "exit_timeout",
]);
export type EmaFibAlertKind = z.infer<typeof EmaFibAlertKind>;

export const EmaFibConfirmationMode = z.enum([
  "post_cross_retest",
  "pre_cross_touch",
  "ema50_straddle",
  "afternoon_reload",
  "afternoon_reload_pre_cross_touch",
  "afternoon_reload_retest",
  "tokyo_futures",
  "tokyo_futures_pre_cross_touch",
  "tokyo_futures_retest",
]);
export type EmaFibConfirmationMode = z.infer<typeof EmaFibConfirmationMode>;

export const EmaFibStrategy = z.enum([
  "ema21_ema50_fib50_continuation",
  "ema_fast_ema50_fib_continuation",
  "spy_prophet",
]);
export type EmaFibStrategy = z.infer<typeof EmaFibStrategy>;

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
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    source: z.literal("tradingview"),
    strategy: EmaFibStrategy,
    symbol: EmaFibSymbol,
    ticker: z.string().min(1).max(48),
    timeframe: z.string().min(1).max(12),
    eventAt: z.string().datetime({ offset: true }),
    barOpenAt: z.string().datetime({ offset: true }).optional(),
    barCloseAt: z.string().datetime({ offset: true }).optional(),
    optionQuotePolicy: z.string().max(120).optional(),
    targetQuoteLagMins: z.number().finite().min(0).max(10).optional(),
    kind: EmaFibAlertKind,
    direction: EmaFibDirection,
    last: z.number().finite(),
    fastEmaLength: z.number().int().min(1).max(100).default(14),
    slowEmaLength: z.number().int().min(2).max(200).default(50),
    ema21: z.number().finite(),
    ema50: z.number().finite(),
    pivotLow: z.number().finite(),
    pivotHigh: z.number().finite(),
    shallowFib: z.number().finite().min(0).max(1).optional(),
    deepFib: z.number().finite().min(0).max(1).optional(),
    fib382: z.number().finite().optional(),
    fib618: z.number().finite().optional(),
    fibDeep: z.number().finite().optional(),
    fib50: z.number().finite(),
    targetMultiple: z.number().finite().min(1).max(3).optional(),
    extension150: z.number().finite(),
    target: z.number().finite().optional(),
    targetFar: z.number().finite().optional(),
    stop: z.number().finite().nullable(),
    invalidationMode: z.string().max(80).optional(),
    stopModeMinutes: z.number().finite().optional(),
    invalidationClose: z.number().finite().nullable().optional(),
    targetOptionPricing: z.string().max(120).optional(),
    spxAnchor: z.number().finite().optional(),
    spxCash: z.number().finite().nullable().optional(),
    basis: z.number().finite().nullable().optional(),
    basisState: z.string().max(32).optional(),
    vix: z.number().finite().nullable().optional(),
    vixRegime: z.string().max(32).optional(),
    contractSnapshotFrozen: z.boolean().optional(),
    setupWindow: z.string().max(48).optional(),
    afternoonReload: z.boolean().optional(),
    tokyoFutures: z.boolean().optional(),
    instrumentMode: z.enum(["spxw_options", "futures"]).optional(),
    telegramTitle: z.string().max(120).optional(),
    telegramText: z.string().max(800).optional(),
    humanAction: z.string().max(240).optional(),
    candle: EmaFibCandle,
    confirmationMode: EmaFibConfirmationMode.default("post_cross_retest"),
    touchAt: z.string().datetime({ offset: true }).nullable().optional(),
    touchBarOpenAt: z.string().datetime({ offset: true }).nullable().optional(),
    touchCandle: EmaFibCandle.nullable().optional(),
    note: z.string().max(240).optional(),
  })
  .passthrough();
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
