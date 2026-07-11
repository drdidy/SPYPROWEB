import type { CryptoAssetKey, CryptoCalibration } from "./types";

const CALIBRATIONS: Record<CryptoAssetKey, CryptoCalibration> = {
  BTC: {
    asset: "BTC",
    productId: "BTC-USD",
    label: "Bitcoin",
    precision: 2,
    slopePtsPerHour: 34,
    deviationPts: 680,
  },
  ETH: {
    asset: "ETH",
    productId: "ETH-USD",
    label: "Ethereum",
    precision: 2,
    slopePtsPerHour: 0.95,
    deviationPts: 14,
  },
};

export function getCryptoAssets(): CryptoAssetKey[] {
  return ["BTC", "ETH"];
}

export function getCryptoCalibration(assetInput: string): CryptoCalibration {
  const asset = assetInput.trim().toUpperCase() as CryptoAssetKey;
  const calibration = CALIBRATIONS[asset];
  if (!calibration) {
    throw new Error(`${assetInput.trim().toUpperCase()} is not tracked by Crypto Engine yet.`);
  }
  return calibration;
}
