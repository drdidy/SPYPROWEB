import type { CryptoEngineSnapshot, PublicCryptoEngineSnapshot } from "./types";

export function toPublicCryptoSnapshot(
  snapshot: CryptoEngineSnapshot,
): PublicCryptoEngineSnapshot {
  const { calibration, ...publicSnapshot } = snapshot;
  void calibration;
  return {
    ...publicSnapshot,
    dataSourceLabel:
      snapshot.dataMode === "coinbase_live" ? "Live read" : "Structure read",
    dataWarning:
      snapshot.dataMode === "coinbase_live"
        ? undefined
        : "Live crypto decisions open when the active session read is available.",
    notes: [
      "Premium Crypto Engine is limited to BTC and ETH in this release.",
      "The session read is prepared before it appears on the slate.",
      "The model stays protected while the decision stays clear.",
    ],
    modelLabel: "Apex crypto read",
    coverageLabel: "Premium crypto asset",
  };
}
