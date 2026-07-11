export type CryptoAssetKey = "BTC" | "ETH";
export type CryptoBias = "bullish" | "bearish" | "neutral";
export type CryptoLineKey = "upper" | "main" | "lower";
export type CryptoRejectionPattern = "short_rejection" | "long_rejection" | "none";

export type CryptoCalibration = {
  asset: CryptoAssetKey;
  productId: string;
  label: string;
  precision: number;
  slopePtsPerHour: number;
  deviationPts: number;
};

export type CryptoCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type CryptoPivot = {
  id: string;
  asset: CryptoAssetKey;
  pivot_role: "primary" | "secondary";
  pivot_close: number;
  pivot_open: number;
  pivot_high: number;
  pivot_low: number;
  pivot_timestamp: string;
  detected_at: string;
  source: "coinbase_exchange" | "user";
};

export type CryptoProjection = {
  session_id: string;
  timestamp: string;
  main_line: number;
  upper_line: number;
  lower_line: number;
  active_line: CryptoLineKey;
};

export type CryptoSessionStatus =
  | "pre_session"
  | "ny_active"
  | "ny_extension"
  | "off_hours"
  | "detection_failed";

export type CryptoSession = {
  id: string;
  asset: CryptoAssetKey;
  session_date: string;
  anchor_session_date: string;
  current_price: number;
  open_price: number | null;
  initial_bias: CryptoBias | null;
  current_bias: CryptoBias | null;
  bias_flipped: boolean;
  status: CryptoSessionStatus;
};

export type CryptoRejectionCandidate = {
  session_id: string;
  candle_timestamp: string;
  candle_open: number;
  candle_high: number;
  candle_low: number;
  candle_close: number;
  candle_color: "bullish" | "bearish";
  line_tested: CryptoLineKey;
  line_price_at_candle: number;
  pattern_matched: CryptoRejectionPattern;
  window: "primary" | "extension";
};

export type CryptoTradeSetup = {
  session_id: string;
  setup_type: "long" | "short";
  rejection_candle_timestamp: string;
  entry_timestamp: string;
  entry_price: number;
  target_price: number;
  target_line: CryptoLineKey;
  stop_price: number;
  breakeven_trigger_price: number;
  chase_guard_active: boolean;
  status: "pending" | "active" | "invalidated";
};

export type CryptoEngineSnapshot = {
  asset: CryptoAssetKey;
  calibration: CryptoCalibration;
  session: CryptoSession;
  primaryPivot: CryptoPivot;
  secondaryPivot: CryptoPivot | null;
  projections: CryptoProjection[];
  candles: CryptoCandle[];
  currentProjection: CryptoProjection;
  latestCandidate: CryptoRejectionCandidate | null;
  setup: CryptoTradeSetup | null;
  verdict: "LONG" | "SHORT" | "NEUTRAL";
  decision: "Trade Allowed" | "Wait for Setup" | "Chase Guard" | "Off Hours";
  conviction: number;
  dataMode: "coinbase_live" | "coinbase_candles";
  dataAsOf: string;
  dataSourceLabel: string;
  dataWarning?: string;
  notes: string[];
};

export type PublicCryptoEngineSnapshot = Omit<CryptoEngineSnapshot, "calibration"> & {
  modelLabel: string;
  coverageLabel: string;
};
