import sectorRatesJson from "@/stocks/data/sector-rates.json";
import tickerCalibrationsJson from "@/stocks/data/ticker-calibrations.json";
import tickerClassificationsJson from "@/stocks/data/ticker-classifications.json";
import type {
  SectorClassification,
  SectorKey,
  SectorRate,
  TickerCalibration,
} from "./types";

export const sectorRates = sectorRatesJson as SectorRate[];
export const tickerClassifications =
  tickerClassificationsJson as SectorClassification[];
export const tickerCalibrations =
  tickerCalibrationsJson as TickerCalibration[];
export const highConfidenceTickerCalibrations = tickerCalibrations.filter(
  (item) => item.confidence === "high",
);

export function getSectorRate(sector: SectorKey): SectorRate {
  const rate = sectorRates.find((item) => item.sector === sector);
  if (!rate) {
    throw new Error(`Missing sector rate for ${sector}`);
  }
  return rate;
}

export function getTickerClassification(ticker: string): SectorClassification {
  const normalized = ticker.trim().toUpperCase();
  assertHighConfidenceCalibration(normalized);
  const classification = tickerClassifications.find(
    (item) => item.ticker === normalized,
  );
  if (!classification) {
    throw new Error(`${normalized} is not tracked by Stocks Channel yet.`);
  }
  return classification;
}

export function getTickerCalibration(ticker: string): TickerCalibration {
  const normalized = ticker.trim().toUpperCase();
  const calibration = highConfidenceTickerCalibrations.find(
    (item) => item.ticker === normalized,
  );
  if (!calibration) {
    throw new Error(
      `${normalized} is not enabled. Only high-confidence calibrated tickers are available for now.`,
    );
  }
  return calibration;
}

export function getTrackedTickers(): string[] {
  return highConfidenceTickerCalibrations.map((item) => item.ticker).sort();
}

export function getClassificationsBySector() {
  return sectorRates.map((rate) => ({
    rate,
    tickers: highConfidenceTickerCalibrations
      .map((calibration) =>
        tickerClassifications.find((item) => item.ticker === calibration.ticker),
      )
      .filter((item): item is SectorClassification => item !== undefined)
      .filter((item) => item.sector === rate.sector)
      .map((item) => item.ticker)
      .sort(),
  }));
}

function assertHighConfidenceCalibration(ticker: string) {
  if (!highConfidenceTickerCalibrations.some((item) => item.ticker === ticker)) {
    throw new Error(
      `${ticker} is not enabled. Only high-confidence calibrated tickers are available for now.`,
    );
  }
}
