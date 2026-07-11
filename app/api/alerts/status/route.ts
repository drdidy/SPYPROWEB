import { NextResponse } from "next/server";

import { hasAlertSecret } from "@/lib/alerts/auth";
import { alertPreferences } from "@/lib/alerts/preferences";
import { cryptoCalibrationAuditRows } from "@/lib/crypto/calibration-audit";
import { alertMemoryConfigured } from "@/lib/alerts/store";
import { telegramChatConfigured, telegramConfigured } from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    telegramBot: telegramConfigured(),
    telegramChat: telegramChatConfigured(),
    indicatorTelegramBot: telegramConfigured("indicator"),
    indicatorTelegramChat: telegramChatConfigured("indicator"),
    alertSecret: hasAlertSecret(),
    alertMemory: alertMemoryConfigured(),
    cloudMonitor: telegramConfigured() && telegramChatConfigured() && hasAlertSecret() && alertMemoryConfigured(),
    preferences: alertPreferences(),
    cryptoAlertEligibility: cryptoCalibrationAuditRows().map((row) => ({
      asset: row.asset,
      status: row.status,
      botEnabled: row.status === "high",
    })),
  });
}
