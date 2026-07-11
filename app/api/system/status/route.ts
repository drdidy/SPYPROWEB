import { NextResponse } from "next/server";

import { alertPreferences } from "@/lib/alerts/preferences";
import { cryptoCalibrationAuditRows } from "@/lib/crypto/calibration-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Check = {
  key: string;
  label: string;
  status: "ready" | "degraded" | "offline";
  detail: string;
  checkedAt: string;
};

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const checkedAt = new Date().toISOString();
  const [alerts, agents, spx, stock, crypto, options, optionsMemory] = await Promise.all([
    checkJson(`${origin}/api/alerts/status`, "alerts"),
    checkJson(`${origin}/api/agents/status`, "agents"),
    checkJson(`${origin}/api/spx/snapshot`, "spx"),
    checkJson(`${origin}/api/stocks/snapshot?ticker=AAPL`, "stock"),
    checkJson(`${origin}/api/crypto/snapshot?asset=BTC`, "crypto"),
    checkJson(`${origin}/api/options/intel?symbols=SPY,SPX,AAPL`, "options"),
    checkJson(`${origin}/api/options/replay-memory`, "options-memory"),
  ]);

  const checks: Check[] = [
    {
      key: "alerts",
      label: "Phone alerts",
      status: alerts.ok && alerts.data?.cloudMonitor ? "ready" : "degraded",
      detail: alerts.ok
        ? alerts.data?.cloudMonitor
          ? "Watch and entry alerts are configured."
          : "Alert delivery needs attention."
        : productSafeError("alerts"),
      checkedAt,
    },
    {
      key: "agents",
      label: "Decision desks",
      status: agents.ok && agents.data?.ok ? "ready" : agents.ok ? "degraded" : "offline",
      detail: agents.ok ? (agents.data?.ok ? "Desk checks are active." : "Desk checks need attention.") : productSafeError("agents"),
      checkedAt,
    },
    {
      key: "spx",
      label: "ES/SPX Control Map",
      status: spx.ok && !spx.data?._meta?.barsError && !spx.data?._meta?.quoteError ? "ready" : spx.ok ? "degraded" : "offline",
      detail: spx.ok
        ? spx.data?._meta?.quoteSource === "fallback"
          ? "Control Map is reachable, but the live feed needs review."
          : "Control Map snapshot is reachable."
        : productSafeError("spx"),
      checkedAt,
    },
    {
      key: "stocks",
      label: "Stocks Engine",
      status: stock.ok && stock.data?.dataMode === "live" ? "ready" : stock.ok ? "degraded" : "offline",
      detail: stock.ok ? stockEngineDetail(stock.data) : productSafeError("stocks"),
      checkedAt,
    },
    {
      key: "crypto",
      label: "Crypto Engine",
      status: crypto.ok ? "ready" : "offline",
      detail: crypto.ok
        ? cryptoAlertsReady()
          ? "BTC/ETH maps and alerts are eligible."
          : "BTC/ETH maps are reachable. Bot alerts are gated until high confidence."
        : productSafeError("crypto"),
      checkedAt,
    },
    {
      key: "options",
      label: "SPX option tickets",
      status: options.ok && options.data?.available
        ? "ready"
        : options.ok
          ? "degraded"
          : "offline",
      detail: options.ok
        ? options.data?.available
          ? optionsDetail(options.data)
          : "Contract data is not available yet. Try again closer to the session."
        : productSafeError("options"),
      checkedAt,
    },
    {
      key: "options-memory",
      label: "Premium memory",
      status: optionsMemory.ok && optionsMemory.data?.configured ? "ready" : optionsMemory.ok ? "degraded" : "offline",
      detail: optionsMemory.ok
        ? optionsMemory.data?.configured
          ? `Premium recorder ready. ${optionsMemory.data?.contracts?.length ?? 0} ticket tapes stored.`
          : "Premium recorder needs cloud memory."
        : productSafeError("options-memory"),
      checkedAt,
    },
  ];

  return NextResponse.json({
    ok: checks.every((check) => check.status === "ready"),
    checkedAt,
    checks,
    alertPreferences: alertPreferences(),
  });
}

function hasGreekCoverage(data: any): boolean {
  if (!data?.symbols || typeof data.symbols !== "object") return false;
  return Object.values(data.symbols).some((value) => {
    const coverage = value && typeof value === "object" ? (value as any).greekCoverage : null;
    return Boolean(coverage?.ready);
  });
}

function optionsDetail(data: any): string {
  const chainDate = data?.chainDate ?? "nearest";
  if (hasGreekCoverage(data)) return `Contract data and pricing inputs are available. Chain date ${chainDate}.`;
  return `Contract data is available. Pricing projection is active while coverage improves. Chain date ${chainDate}.`;
}

function stockEngineDetail(data: any): string {
  if (data?.dataMode === "live") return "AAPL live read is reachable.";
  if (data?.dataMode === "setup_required") return "AAPL is waiting for the next valid setup window.";
  if (data?.dataMode === "validation") return "AAPL is showing planning context.";
  return "Live quote needs attention.";
}

async function checkJson(url: string, key: string): Promise<{ ok: boolean; data?: any; error: string }> {
  try {
    const headers: HeadersInit = {};
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      headers["x-vercel-protection-bypass"] = bypass;
      headers["x-vercel-set-bypass-cookie"] = "samesitenone";
    }
    const res = await fetch(url, { cache: "no-store", headers });
    const data = await res.json().catch(() => null);
    return {
      ok: res.ok,
      data,
      error: res.ok ? "" : `${key} returned HTTP ${res.status}`,
    };
  } catch (error) {
    console.warn(`[system-status] ${key} failed`, error);
    return {
      ok: false,
      error: productSafeError(key),
    };
  }
}

function cryptoAlertsReady(): boolean {
  return cryptoCalibrationAuditRows().some((row) => row.status === "high");
}

function productSafeError(key: string): string {
  if (key === "alerts") return "Alert delivery could not be checked.";
  if (key === "agents") return "Decision desks could not be checked.";
  if (key === "spx") return "Control Map could not be checked.";
  if (key === "stocks") return "Stock maps could not be checked.";
  if (key === "crypto") return "Crypto maps could not be checked.";
  if (key === "options") return "SPX tickets could not be checked.";
  if (key === "options-memory") return "Premium memory could not be checked.";
  return "Status check unavailable.";
}
