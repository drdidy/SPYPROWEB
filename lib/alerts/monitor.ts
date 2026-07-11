import { toPublicCryptoSnapshot } from "@/lib/crypto/public";
import { buildCoinbaseCryptoSnapshot } from "@/lib/crypto/coinbase";
import type { PublicCryptoEngineSnapshot } from "@/lib/crypto/types";
import { toPublicStockSnapshot } from "@/lib/stocks/public";
import { buildYahooStockEngineSnapshot } from "@/lib/stocks/yahoo";
import type { PublicStockEngineSnapshot } from "@/lib/stocks/types";
import { buildStockEntryContractProjection } from "@/lib/stock-contract-projection";
import { buildOptionSelfLearningSnapshot } from "@/lib/options/self-learning";
import {
  DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  buildSpxControlPlanContractProjections,
  type SpxReplayContractPreference,
} from "@/lib/spx-contract-projection";
import type { ContractProjection } from "@/lib/contract-projection";
import { adaptSnapshot, type RawSnapshot } from "@/lib/snapshot-adapter";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import type { OptionsIntelBundle, UwOptionChain } from "@/lib/options-intel-fetch";
import type { SPXSnapshot } from "@/lib/types";
import {
  buildCryptoAlerts,
  buildSpxAlerts,
  buildSpyAlerts,
  buildStockAlerts,
  formatAlertMessage,
  type ProphetAlert,
} from "./messages";
import { alertAllowedByPreferences, stockAlertTickers } from "./preferences";
import { alertMemoryConfigured, rememberAlertPayload, shouldSendAlert } from "./store";
import { sendTelegramMessage, telegramChatConfigured, telegramConfigured } from "./telegram";

export type AlertMonitorResult = {
  ok: boolean;
  checked: string[];
  candidates: number;
  sent: number;
  skipped: number;
  errors: string[];
  dryRun: boolean;
};

const CRYPTO_ALERT_ASSETS = ["BTC", "ETH"] as const;

export async function runAlertMonitor({
  origin,
  dryRun = false,
}: {
  origin: string;
  dryRun?: boolean;
}): Promise<AlertMonitorResult> {
  const checked: string[] = [];
  const errors: string[] = [];
  const candidates: ProphetAlert[] = [];

  if (!telegramConfigured() || !telegramChatConfigured()) {
    if (dryRun) {
      errors.push("Telegram delivery is not fully configured.");
    } else {
      return {
        ok: false,
        checked,
        candidates: 0,
        sent: 0,
        skipped: 0,
        errors: ["Telegram delivery is not fully configured."],
        dryRun,
      };
    }
  }

  if (!dryRun && !alertMemoryConfigured()) {
    return {
      ok: false,
      checked,
      candidates: 0,
      sent: 0,
      skipped: 0,
      errors: ["Alert memory is not configured. Add Upstash Redis env vars before enabling live monitoring."],
      dryRun,
    };
  }

  const [spy, spx] = await Promise.allSettled([
    loadSpy(origin),
    loadSpx(origin),
  ]);
  if (spy.status === "fulfilled") {
    checked.push("SPY");
    candidates.push(...buildSpyAlerts(spy.value, new Date()));
  } else {
    errors.push(`SPY: ${reasonText(spy.reason)}`);
  }
  if (spx.status === "fulfilled") {
    checked.push("SPX");
    const spxContract = await loadSpxContract(origin, spx.value, errors);
    candidates.push(...buildSpxAlerts(spx.value, new Date(), spxContract));
  } else {
    errors.push(`SPX: ${reasonText(spx.reason)}`);
  }

  const stockSnapshots = await loadStockSnapshots(errors);
  for (const snapshot of stockSnapshots) checked.push(snapshot.ticker);
  const stockContracts = await loadStockContracts(origin, stockSnapshots, errors);
  for (const snapshot of stockSnapshots) {
    candidates.push(...buildStockAlerts(snapshot, new Date(), stockContracts.get(snapshot.ticker)));
  }

  const crypto = await Promise.allSettled(
    CRYPTO_ALERT_ASSETS.map((asset) =>
      buildCoinbaseCryptoSnapshot(asset).then(toPublicCryptoSnapshot),
    ),
  );
  for (const result of crypto) {
    if (result.status === "fulfilled") {
      checked.push(result.value.asset);
      candidates.push(...buildCryptoAlerts(result.value));
    } else {
      errors.push(`Crypto: ${reasonText(result.reason)}`);
    }
  }

  const filteredCandidates = candidates.filter(alertAllowedByPreferences);
  let sent = 0;
  let skipped = 0;
  for (const alert of filteredCandidates) {
    const allowed = dryRun ? true : await shouldSendAlert(alertKey(alert), alert.ttlSeconds);
    if (!allowed) {
      skipped += 1;
      continue;
    }
    if (!dryRun) {
      const result = await sendTelegramMessage(formatAlertMessage(alert));
      if (!result.ok) {
        errors.push(`${alert.asset}: ${result.description || `Telegram HTTP ${result.status}`}`);
        continue;
      }
      await rememberAlertPayload(`prophet:alert:last:${alert.asset}`, {
        ...alert,
        sentAt: new Date().toISOString(),
      }, 7 * 24 * 60 * 60);
    }
    sent += 1;
  }

  return {
    ok: errors.length === 0,
    checked,
    candidates: filteredCandidates.length,
    sent,
    skipped,
    errors,
    dryRun,
  };
}

export async function buildAlertPreview(origin: string): Promise<{
  spy: AdaptedSnapshot | null;
  spx: SPXSnapshot | null;
  stocks: PublicStockEngineSnapshot[];
  crypto: PublicCryptoEngineSnapshot[];
  alerts: ProphetAlert[];
  errors: string[];
}> {
  const errors: string[] = [];
  const [spy, spx] = await Promise.allSettled([loadSpy(origin), loadSpx(origin)]);
  const spyValue = spy.status === "fulfilled" ? spy.value : null;
  const spxValue = spx.status === "fulfilled" ? spx.value : null;
  if (spy.status === "rejected") errors.push(`SPY: ${reasonText(spy.reason)}`);
  if (spx.status === "rejected") errors.push(`SPX: ${reasonText(spx.reason)}`);
  const stocks = await loadStockSnapshots(errors);
  const stockContracts = await loadStockContracts(origin, stocks, errors);
  const crypto = (
    await Promise.allSettled(
      CRYPTO_ALERT_ASSETS.map((asset) =>
        buildCoinbaseCryptoSnapshot(asset).then(toPublicCryptoSnapshot),
      ),
    )
  ).flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    errors.push(`Crypto: ${reasonText(result.reason)}`);
    return [];
  });
  return {
    spy: spyValue,
    spx: spxValue,
    stocks,
    crypto,
    alerts: [
      ...(spyValue ? buildSpyAlerts(spyValue) : []),
      ...(spxValue ? buildSpxAlerts(spxValue, new Date(), await loadSpxContract(origin, spxValue, errors)) : []),
      ...stocks.flatMap((stock) => buildStockAlerts(stock, new Date(), stockContracts.get(stock.ticker))),
      ...crypto.flatMap((snapshot) => buildCryptoAlerts(snapshot, new Date())),
    ],
    errors,
  };
}

async function loadSpxContract(
  origin: string,
  snapshot: SPXSnapshot,
  errors: string[],
): Promise<ContractProjection | null> {
  let bundle: OptionsIntelBundle;
  try {
    bundle = await fetchJson<OptionsIntelBundle>(`${origin}/api/options/intel?symbols=SPX`);
  } catch (error) {
    errors.push(`SPX options: ${reasonText(error)}`);
    return null;
  }

  const chain = bundle.symbols?.SPX?.chain as UwOptionChain | null | undefined;
  if (!chain) return null;
  const replayPreference = await loadSpxReplayPreference(origin).catch((error) => {
    errors.push(`SPX replay learning: ${reasonText(error)}`);
    return null;
  });
  const controlPlan = buildSpxControlPlanContractProjections({
    snap: snapshot,
    chain,
    maxEntryDebit: DEFAULT_SPX_ENTRY_DEBIT_CEILING,
    replayPreference,
  });
  const latest = snapshot.controlTradePlan?.activeTrade ?? null;
  if (latest?.side === "BUY") {
    return telegramEligibleContract(controlPlan?.active ?? controlPlan?.buySupport ?? null);
  }
  if (latest?.side === "SELL") {
    return telegramEligibleContract(controlPlan?.active ?? controlPlan?.sellResistance ?? null);
  }
  return telegramEligibleContract(
    controlPlan?.buySupport ??
      controlPlan?.sellResistance ??
      null,
  );
}

async function loadSpxReplayPreference(origin: string): Promise<SpxReplayContractPreference | null> {
  const intelligence = await buildOptionSelfLearningSnapshot({
    origin,
    lookback: 3,
    budget: DEFAULT_SPX_ENTRY_DEBIT_CEILING,
  });
  const summary = intelligence.replay.summary;
  if (!intelligence.ok && summary.reviewed === 0) return null;
  if (!summary.bestEntryBand && summary.preferredStrikeDistance === null) return null;
  return {
    entryDebitBand: summary.bestEntryBand,
    preferredStrikeDistance: summary.preferredStrikeDistance,
    confidence: intelligence.confidence,
  };
}

function telegramEligibleContract(
  contract: ContractProjection | null,
): ContractProjection | null {
  if (!contract) return null;
  if (contract.confidence === "low") return null;
  if (!contract.chainAsOf) return null;
  const ageMs = Date.now() - new Date(contract.chainAsOf).getTime();
  if (!Number.isFinite(ageMs)) return null;
  return ageMs <= 30 * 60 * 1000 ? contract : null;
}

async function loadStockSnapshots(errors: string[]): Promise<PublicStockEngineSnapshot[]> {
  const stocks = await Promise.allSettled(
    stockAlertTickers().map((ticker) => buildYahooStockEngineSnapshot(ticker).then(toPublicStockSnapshot)),
  );
  return stocks.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    errors.push(`Stock: ${reasonText(result.reason)}`);
    return [];
  });
}

async function loadStockContracts(
  origin: string,
  stocks: PublicStockEngineSnapshot[],
  errors: string[],
): Promise<Map<string, ReturnType<typeof buildStockEntryContractProjection>>> {
  const eligible = stocks.filter(
    (stock) => stock.setup && stock.decision === "Trade Allowed" && stock.dataMode === "live",
  );
  if (eligible.length === 0) return new Map();
  const symbols = eligible.map((stock) => stock.ticker).join(",");
  let bundle: OptionsIntelBundle;
  try {
    bundle = await fetchJson<OptionsIntelBundle>(
      `${origin}/api/options/intel?symbols=${encodeURIComponent(symbols)}`,
    );
  } catch (error) {
    errors.push(`Stock options: ${reasonText(error)}`);
    return new Map();
  }
  const out = new Map<string, ReturnType<typeof buildStockEntryContractProjection>>();
  for (const stock of eligible) {
    const chain = bundle.symbols?.[stock.ticker]?.chain as UwOptionChain | null | undefined;
    out.set(stock.ticker, buildStockEntryContractProjection({ snapshot: stock, chain }));
  }
  return out;
}

async function loadSpy(origin: string): Promise<AdaptedSnapshot> {
  const raw = await fetchJson<RawSnapshot>(`${origin}/api/snapshot`);
  return adaptSnapshot(raw);
}

async function loadSpx(origin: string): Promise<SPXSnapshot> {
  return fetchJson<SPXSnapshot>(`${origin}/api/spx/snapshot`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const headers: HeadersInit = {};
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
    headers["x-vercel-set-bypass-cookie"] = "samesitenone";
  }
  const res = await fetch(url, { cache: "no-store", headers });
  if (!res.ok) {
    throw new Error(`${url} returned HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function alertKey(alert: ProphetAlert): string {
  return `prophet:alert:sent:${alert.key}`;
}

function reasonText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
