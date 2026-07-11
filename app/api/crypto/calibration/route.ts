import { NextResponse } from "next/server";

import { cryptoCalibrationAuditRows } from "@/lib/crypto/calibration-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    rows: cryptoCalibrationAuditRows(),
  });
}
