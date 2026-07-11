export type SectorKey =
  | "index_etf"
  | "healthcare"
  | "financials"
  | "energy"
  | "tech_mega_cap"
  | "consumer_staples"
  | "high_vol_momentum";

export type ClassificationConfidence = "confirmed" | "inferred" | "unconfirmed";

export type StockBias = "bullish" | "bearish" | "neutral";
export type StockLineKey = "upper_2" | "upper" | "main" | "lower" | "lower_2";
export type RejectionPattern = "short_rejection" | "long_rejection" | "none";
export type StockBiasReferenceKind = "preopen_to_9" | "cash_open";

export type SectorRate = {
  sector: SectorKey;
  label: string;
  slope_rate: number;
  distance_rate: number;
  high_vol_extension_multiplier?: number;
  description: string;
};

export type SectorClassification = {
  ticker: string;
  sector: SectorKey;
  classification_confidence: ClassificationConfidence;
  notes?: string;
};

export type TickerCalibrationConfidence = "high" | "medium" | "needs_review";

export type TickerCalibration = {
  ticker: string;
  slope_pts_per_hour: number;
  distance_pts: number;
  confidence: TickerCalibrationConfidence;
  lookback_days: number;
  validation: string;
  notes?: string;
};

export type StockCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type StockPivot = {
  id: string;
  ticker: string;
  pivot_role: "primary" | "secondary";
  pivot_high: number;
  pivot_open: number;
  pivot_close: number;
  pivot_low: number;
  pivot_timestamp: string;
  detection_method: "auto" | "manual_override";
  detected_at: string;
  source: "yahoo_finance" | "tastytrade" | "user" | "validation_fixture" | "system";
};

export type StockSessionStatus =
  | "pre_open"
  | "open"
  | "mid_session"
  | "window_closed"
  | "stand_down"
  | "detection_pending"
  | "detection_failed"
  | "model_preview";

export type StockSession = {
  id: string;
  ticker: string;
  session_date: string;
  primary_pivot_id: string;
  secondary_pivot_id: string | null;
  sector: SectorKey;
  current_price: number;
  slope_rate: number;
  distance_rate: number;
  slope_pts_per_hour: number;
  distance_pts: number;
  open_price: number | null;
  bias_reference_price: number | null;
  bias_reference_main_line: number | null;
  bias_reference_timestamp: string | null;
  bias_reference_kind: StockBiasReferenceKind | null;
  initial_bias: StockBias | null;
  current_bias: StockBias | null;
  bias_flipped: boolean;
  status: StockSessionStatus;
};

export type LineProjection = {
  session_id: string;
  timestamp: string;
  upper_2_line: number;
  main_line: number;
  upper_line: number;
  lower_line: number;
  lower_2_line: number;
  active_line: StockLineKey;
};

export type RejectionCandidate = {
  session_id: string;
  candle_timestamp: string;
  candle_open: number;
  candle_high: number;
  candle_low: number;
  candle_close: number;
  candle_color: "bullish" | "bearish";
  line_tested: StockLineKey;
  line_price_at_candle: number;
  pattern_matched: RejectionPattern;
};

export type StockTradeSetup = {
  session_id: string;
  setup_type: "put" | "call";
  rejection_candle_timestamp: string;
  entry_timestamp: string;
  entry_price: number;
  target_price: number;
  target_line: StockLineKey;
  stop_price: number;
  breakeven_trigger_price: number;
  chase_guard_active: boolean;
  status: "pending" | "active" | "target_hit" | "stopped_out" | "invalidated";
};

export type StockEngineSnapshot = {
  ticker: string;
  classification: SectorClassification;
  sectorRate: SectorRate;
  session: StockSession;
  primaryPivot: StockPivot;
  secondaryPivot: StockPivot | null;
  projections: LineProjection[];
  currentProjection: LineProjection;
  candles: StockCandle[];
  latestCandidate: RejectionCandidate | null;
  setup: StockTradeSetup | null;
  verdict: "LONG" | "SHORT" | "NEUTRAL";
  decision: "Trade Allowed" | "Wait for Setup" | "Chase Guard" | "Stand Down";
  conviction: number;
  dataMode:
    | "validation_fixture"
    | "tastytrade_live"
    | "schwab_live"
    | "yahoo_delayed"
    | "live_feed_required";
  dataAsOf: string;
  dataSourceLabel: string;
  dataWarning?: string;
  notes: string[];
};

export type PublicStockSession = Omit<
  StockSession,
  "sector" | "slope_rate" | "distance_rate" | "slope_pts_per_hour" | "distance_pts"
>;

export type PublicStockDataMode =
  | "live"
  | "backup_structure"
  | "setup_required"
  | "validation";

export type PublicStockPivot = Omit<StockPivot, "source"> & {
  source: "system" | "user";
};

export type PublicStockEngineSnapshot = Omit<
  StockEngineSnapshot,
  | "classification"
  | "sectorRate"
  | "session"
  | "primaryPivot"
  | "secondaryPivot"
  | "dataMode"
> & {
  modelLabel: string;
  coverageLabel: string;
  dataMode: PublicStockDataMode;
  primaryPivot: PublicStockPivot;
  secondaryPivot: PublicStockPivot | null;
  session: PublicStockSession;
};
