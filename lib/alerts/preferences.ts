import type { AlertSeverity, ProphetAlert } from "./messages";
import { cryptoCalibrationAuditRows } from "@/lib/crypto/calibration-audit";
import { getTrackedTickers } from "@/lib/stocks/data";

export type AlertPreferenceSnapshot = {
  entries: boolean;
  watches: boolean;
  crypto: boolean;
  stocks: string[];
  quietMode: boolean;
};

export function alertPreferences(): AlertPreferenceSnapshot {
  return {
    entries: envBool("ALERT_ENABLE_ENTRIES", true),
    watches: envBool("ALERT_ENABLE_WATCHES", true),
    crypto: envBool("ALERT_ENABLE_CRYPTO", true),
    stocks: stockAlertTickers(),
    quietMode: envBool("ALERT_QUIET_MODE", false),
  };
}

export function alertAllowedByPreferences(alert: ProphetAlert): boolean {
  const prefs = alertPreferences();
  if (prefs.quietMode && alert.severity !== "entry" && alert.severity !== "risk") return false;
  if (alert.severity === "entry" && !prefs.entries) return false;
  if (alert.severity === "watch" && !prefs.watches) return false;
  if (alert.asset === "BTC" || alert.asset === "ETH") {
    if (!prefs.crypto) return false;
    if (!highConfidenceCryptoAssets().has(alert.asset)) return false;
  }
  return severityRank(alert.severity) >= severityRank(minSeverity());
}

export function stockAlertTickers(): string[] {
  const configured = process.env.ALERT_STOCK_TICKERS?.trim();
  const raw = configured || "AAPL,NVDA,MSFT,AMZN,GOOGL,JPM";
  const enabled = new Set(getTrackedTickers());
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter((item) => /^[A-Z.]{1,8}$/.test(item))
        .filter((item) => enabled.has(item)),
    ),
  );
}

function minSeverity(): AlertSeverity {
  const raw = process.env.ALERT_MIN_SEVERITY?.trim().toLowerCase();
  if (raw === "entry" || raw === "risk" || raw === "system" || raw === "armed") return raw;
  return "watch";
}

function severityRank(severity: AlertSeverity): number {
  if (severity === "watch") return 1;
  if (severity === "armed") return 2;
  if (severity === "entry") return 3;
  if (severity === "risk") return 4;
  return 5;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function highConfidenceCryptoAssets(): Set<string> {
  return new Set(
    cryptoCalibrationAuditRows()
      .filter((row) => row.status === "high")
      .map((row) => row.asset),
  );
}
