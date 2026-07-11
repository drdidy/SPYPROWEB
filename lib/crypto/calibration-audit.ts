import { getCryptoAssets, getCryptoCalibration } from "./data";
import auditJson from "@/crypto/data/calibration-audit.json";

export type CryptoCalibrationAuditRow = {
  asset: "BTC" | "ETH";
  label: string;
  status: "high" | "medium" | "needs_review" | "fixed_pending_statistical_audit";
  lookbackDays: number[];
  liveFeed: "coinbase";
  sessionsTested?: number;
  validation?: string;
  note: string;
};

export function cryptoCalibrationAuditRows(): CryptoCalibrationAuditRow[] {
  return getCryptoAssets().map((asset) => {
    const calibration = getCryptoCalibration(asset);
    const report = auditJson.reports.find((item) => item.asset === asset);
    return {
      asset,
      label: calibration.label,
      status: (report?.confidence ?? "fixed_pending_statistical_audit") as CryptoCalibrationAuditRow["status"],
      lookbackDays: report?.days ? [report.days] : [30, 60, 90],
      liveFeed: "coinbase",
      sessionsTested: report?.sessionsTested,
      validation: report?.validation,
      note: report
        ? "Latest crypto calibration audit is available. Keep BTC/ETH gated until the desk clears high-confidence status."
        : "Enabled from owner calibration. Statistical high-confidence grading is scheduled through the crypto calibration desk.",
    };
  });
}
