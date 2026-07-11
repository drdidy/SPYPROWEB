import type {
  PublicStockDataMode,
  PublicStockEngineSnapshot,
  PublicStockPivot,
  PublicStockSession,
  StockEngineSnapshot,
  StockPivot,
} from "./types";

export function toPublicStockSnapshot(
  snapshot: StockEngineSnapshot,
): PublicStockEngineSnapshot {
  const { classification, session } = snapshot;
  const publicSession: PublicStockSession = {
    id: session.id,
    ticker: session.ticker,
    session_date: session.session_date,
    primary_pivot_id: session.primary_pivot_id,
    secondary_pivot_id: session.secondary_pivot_id,
    current_price: session.current_price,
    open_price: session.open_price,
    bias_reference_price: session.bias_reference_price,
    bias_reference_main_line: session.bias_reference_main_line,
    bias_reference_timestamp: session.bias_reference_timestamp,
    bias_reference_kind: session.bias_reference_kind,
    initial_bias: session.initial_bias,
    current_bias: session.current_bias,
    bias_flipped: session.bias_flipped,
    status: session.status,
  };

  return {
    ticker: snapshot.ticker,
    primaryPivot: toPublicPivot(snapshot.primaryPivot),
    secondaryPivot: snapshot.secondaryPivot
      ? toPublicPivot(snapshot.secondaryPivot)
      : null,
    projections: snapshot.projections,
    currentProjection: snapshot.currentProjection,
    candles: snapshot.candles,
    latestCandidate: snapshot.latestCandidate,
    setup: snapshot.setup,
    verdict: snapshot.verdict,
    decision: snapshot.decision,
    conviction: snapshot.conviction,
    dataMode: toPublicDataMode(snapshot.dataMode),
    dataAsOf: snapshot.dataAsOf,
    dataSourceLabel: toPublicDataLabel(snapshot.dataMode),
    dataWarning: toPublicDataWarning(snapshot.dataMode),
    notes: toPublicNotes(snapshot.dataMode),
    session: publicSession,
    modelLabel:
      classification.classification_confidence === "confirmed"
        ? "Apex equity read"
        : classification.classification_confidence === "inferred"
          ? "Apex review read"
          : "Review required",
    coverageLabel: "Tracked equity",
  };
}

function toPublicPivot(pivot: StockPivot): PublicStockPivot {
  return {
    ...pivot,
    source: pivot.source === "user" ? "user" : "system",
  };
}

function toPublicDataMode(
  mode: StockEngineSnapshot["dataMode"],
): PublicStockDataMode {
  if (mode === "tastytrade_live" || mode === "schwab_live") return "live";
  if (mode === "validation_fixture") return "validation";
  if (mode === "live_feed_required") return "setup_required";
  return "backup_structure";
}

function toPublicDataLabel(mode: StockEngineSnapshot["dataMode"]): string {
  if (mode === "tastytrade_live" || mode === "schwab_live") return "Live read";
  if (mode === "validation_fixture") return "Planning read";
  if (mode === "live_feed_required") return "Trade-day read pending";
  return "Structure read";
}

function toPublicDataWarning(mode: StockEngineSnapshot["dataMode"]): string | undefined {
  if (mode === "tastytrade_live" || mode === "schwab_live") {
    return undefined;
  }
  if (mode === "live_feed_required") {
    return "Live decisions open when the trade-day read is active.";
  }
  if (mode === "yahoo_delayed") {
    return "Live decisions open when the trade-day read is active.";
  }
  return undefined;
}

function toPublicNotes(mode: StockEngineSnapshot["dataMode"]): string[] {
  if (mode === "tastytrade_live" || mode === "schwab_live") {
    return [
      "Current price, active gate, and decision slate are live.",
      "The session structure is prepared before the trader needs it.",
      "Only high-confidence calibrated tickers are available in this release.",
    ];
  }
  if (mode === "live_feed_required") {
    return [
      "The trade-day read has not opened yet.",
      "The next-session structure remains visible for planning.",
      "Only high-confidence calibrated tickers are available in this release.",
    ];
  }
  return [
    "Live trade reads open when the trade-day read is active.",
    "Structure remains visible for planning.",
    "Only high-confidence calibrated tickers are available in this release.",
  ];
}
