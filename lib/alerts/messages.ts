import type { PublicCryptoEngineSnapshot } from "@/lib/crypto/types";
import type { ContractProjection } from "@/lib/contract-projection";
import type { PublicStockEngineSnapshot } from "@/lib/stocks/types";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";
import { getSessionInfo } from "@/lib/sessions";
import type { SPXSnapshot } from "@/lib/types";

export type AlertSeverity = "watch" | "armed" | "entry" | "risk" | "system";

export type ProphetAlert = {
  key: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  asset: string;
  ttlSeconds: number;
  payload?: Record<string, unknown>;
};

export function formatAlertMessage(alert: ProphetAlert): string {
  const actionLine =
    alert.severity === "entry"
      ? alert.asset === "SPX"
        ? "What to do: open Options Lens, verify bid/ask, then wait for premium momentum confirmation."
        : "What to do: open SPY Prophet, confirm price is still near the entry gate, then review the ticket shown in the app."
      : alert.severity === "watch"
        ? "What to do: stay patient. A watch alert is not an entry."
        : "What to do: open SPY Prophet and review the current slate.";
  return [
    `SPY Prophet - ${labelForSeverity(alert.severity)}`,
    `${alert.asset}: ${alert.title}`,
    "",
    alert.body,
    "",
    actionLine,
    "No chase: skip it if price has already moved away from the gate.",
  ].join("\n");
}

export function buildSpyAlerts(
  snapshot: AdaptedSnapshot,
  now: Date = new Date(),
): ProphetAlert[] {
  if (!isEquityAlertWindow(now)) return [];
  const alerts: ProphetAlert[] = [];
  const signal = snapshot.signal;
  if (signal && snapshot.decision.finalDecision === "TRADE_ALLOWED") {
    alerts.push({
      key: [
        "spy",
        "entry",
        signal.id,
        signal.type,
        roundKey(signal.entryPrice),
        snapshot.asOf.slice(0, 13),
      ].join(":"),
      severity: "entry",
      title: `${signal.type} entry confirmed`,
      body: `SPY has a confirmed setup after the candle close. Entry is near ${money(signal.entryPrice)}. Target is ${money(signal.targetPrice)}. Stop is ${money(signal.stopPrice)}.`,
      asset: "SPY",
      ttlSeconds: 6 * 60 * 60,
      payload: { signal },
    });
  }

  const closest = snapshot.lines
    .filter((line) => Number.isFinite(line.distanceFromPrice))
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];
  if (!signal && closest && Math.abs(closest.distanceFromPrice) <= 0.7) {
    alerts.push({
      key: ["spy", "watch", closest.name, snapshot.asOf.slice(0, 13)].join(":"),
      severity: "watch",
      title: `Approaching ${closest.name}`,
      body: `SPY is ${signed(closest.distanceFromPrice)} from ${closest.name} at ${money(closest.currentValue)}. This is only a heads-up. Wait for a completed candle before acting.`,
      asset: "SPY",
      ttlSeconds: 45 * 60,
      payload: { line: closest },
    });
  }
  return alerts;
}

export function buildSpxAlerts(
  snapshot: SPXSnapshot,
  now: Date = new Date(),
  contract?: ContractProjection | null,
): ProphetAlert[] {
  if (!isEquityAlertWindow(now)) return [];
  const plan = snapshot.controlTradePlan;
  const alerts: ProphetAlert[] = [];
  const hourKey = ctHourKey(now);
  if (plan?.activeTrade) {
    alerts.push({
      key: [
        "spx",
        "control-entry",
        plan.activeTrade.side,
        plan.activeTrade.signalTime,
      ].join(":"),
      severity: "entry",
      title: `${plan.activeTrade.contractType} setup confirmed`,
      body: [
        `The hourly candle tested the Control Line from ${plan.activeTrade.side === "BUY" ? "above" : "below"} and closed back on the correct side.`,
        `Entry window: next hourly open. ES entry area: ${number(plan.activeTrade.entryPrice)}. First target: ${number(plan.activeTrade.targetPrice)}.`,
        contract
          ? formatContractTicket(contract)
          : "Suggested contract: open Options Lens before entering. No contract ticket was available for this debit limit.",
      ].join("\n"),
      asset: "SPX",
      ttlSeconds: 6 * 60 * 60,
      payload: { signal: plan.activeTrade },
    });
    return alerts;
  }

  if (plan && plan.status === "ARMED") {
    const buy = plan.setups.find((setup) => setup.side === "BUY");
    const sell = plan.setups.find((setup) => setup.side === "SELL");
    alerts.push({
      key: ["spx", "control-watch", plan.status, hourKey].join(":"),
      severity: "watch",
      title: "Control Line is in play",
      body: [
        `No entry yet. Wait for a completed hourly candle to touch and respect the Control Line.`,
        buy ? `Call plan: hold ${number(buy.entryPrice)} and target ${number(buy.targetPrice)} first.` : "",
        sell ? `Put plan: reject ${number(sell.entryPrice)} and target ${number(sell.targetPrice)} first.` : "",
      ].filter(Boolean).join("\n"),
      asset: "SPX",
      ttlSeconds: 58 * 60,
      payload: { plan },
    });
    return alerts;
  }
  return alerts;
}

export function buildStockAlerts(
  snapshot: PublicStockEngineSnapshot,
  now: Date = new Date(),
  contract?: ContractProjection | null,
): ProphetAlert[] {
  if (!isEquityAlertWindow(now)) return [];
  if (snapshot.dataMode !== "live") return [];
  const alerts: ProphetAlert[] = [];
  if (snapshot.setup && snapshot.decision === "Trade Allowed") {
    alerts.push({
      key: [
        "stock",
        snapshot.ticker,
        "daily-trade",
        snapshot.session.session_date,
      ].join(":"),
      severity: "entry",
      title: `${snapshot.setup.setup_type === "call" ? "Call" : "Put"} plan for today`,
      body: [
        `${snapshot.ticker} has one valid stock-engine trade plan for ${snapshot.session.session_date}.`,
        `${snapshot.setup.setup_type === "call" ? "Call" : "Put"} idea: entry near ${money(snapshot.setup.entry_price)}, target ${money(snapshot.setup.target_price)}, stop ${money(snapshot.setup.stop_price)}.`,
        contract
          ? formatContractTicket(contract)
          : "Contract ticket: pending. Open the app and use the Options Lens before entering.",
      ].join("\n"),
      asset: snapshot.ticker,
      ttlSeconds: 18 * 60 * 60,
      payload: { setup: snapshot.setup, contract },
    });
  }
  return alerts;
}

export function buildCryptoAlerts(
  snapshot: PublicCryptoEngineSnapshot,
  now: Date = new Date(),
): ProphetAlert[] {
  if (!isEquityAlertWindow(now)) return [];
  const alerts: ProphetAlert[] = [];
  const room = cryptoRoomRead(snapshot);
  const broken = cryptoBrokenGateRead(snapshot);
  const hourKey = ctHourKey(now);
  if (snapshot.setup && snapshot.decision === "Trade Allowed") {
    alerts.push({
      key: [
        "crypto",
        snapshot.asset,
        "entry",
        snapshot.setup.setup_type,
        snapshot.setup.rejection_candle_timestamp,
      ].join(":"),
      severity: "entry",
      title: `${snapshot.setup.setup_type === "long" ? "Long" : "Short"} setup confirmed`,
      body: `${snapshot.asset} has a confirmed setup after the candle close. Entry is near ${number(snapshot.setup.entry_price)}. Target is ${number(snapshot.setup.target_price)}. Stop is ${number(snapshot.setup.stop_price)}.`,
      asset: snapshot.asset,
      ttlSeconds: 6 * 60 * 60,
      payload: { setup: snapshot.setup },
    });
  }

  if (!snapshot.setup && broken) {
    alerts.push({
      key: [
        "crypto",
        snapshot.asset,
        "broken-gate",
        broken.lineLabel,
        broken.role,
        hourKey,
      ].join(":"),
      severity: "watch",
      title: `${broken.lineLabel} became ${lowerRole(broken.role)}`,
      body: `${snapshot.asset} closed through ${broken.lineLabel}. That gate can become ${lowerRole(broken.role)} on the retest. Wait for price to come back to ${number(broken.lineValue)} and prove it.`,
      asset: snapshot.asset,
      ttlSeconds: 58 * 60,
      payload: { broken },
    });
  }

  if (!snapshot.setup && room.lower && room.upper) {
    alerts.push({
      key: [
        "crypto",
        snapshot.asset,
        "room",
        room.lower.key,
        room.upper.key,
        hourKey,
      ].join(":"),
      severity: "watch",
      title: `Inside ${room.lower.label} to ${room.upper.label}`,
      body: `${snapshot.asset} is inside a decision room. Long watch is the lower edge: ${room.lower.label} ${number(room.lower.value)}. Short watch is the upper edge: ${room.upper.label} ${number(room.upper.value)}. No trade until a completed candle confirms one edge.`,
      asset: snapshot.asset,
      ttlSeconds: 58 * 60,
      payload: { room },
    });
  }

  const active =
    snapshot.currentProjection.active_line === "upper"
      ? snapshot.currentProjection.upper_line
      : snapshot.currentProjection.active_line === "lower"
        ? snapshot.currentProjection.lower_line
        : snapshot.currentProjection.main_line;
  const distancePts = Math.abs(
    snapshot.currentProjection.upper_line - snapshot.currentProjection.main_line,
  );
  const distance = snapshot.session.current_price - active;
  if (!snapshot.setup && distancePts > 0 && Math.abs(distance) <= distancePts * 0.12) {
    const label =
      snapshot.currentProjection.active_line === "upper"
        ? "North Gate"
        : snapshot.currentProjection.active_line === "lower"
          ? "South Gate"
          : "Control Line";
    alerts.push({
      key: [
        "crypto",
        snapshot.asset,
        "watch",
        snapshot.currentProjection.active_line,
        snapshot.dataAsOf.slice(0, 13),
      ].join(":"),
      severity: "watch",
      title: `Approaching ${label}`,
      body: `${snapshot.asset} is ${signed(distance)} from ${label} at ${number(active)}. This is only a heads-up. Wait for the candle close.`,
      asset: snapshot.asset,
      ttlSeconds: 45 * 60,
      payload: { activeLine: snapshot.currentProjection.active_line, active },
    });
  }
  return alerts;
}

type RoomLine = {
  key: string;
  label: string;
  value: number;
};

type RoomRead = {
  lower: RoomLine | null;
  upper: RoomLine | null;
};

type BrokenGateRead = {
  lineLabel: string;
  lineValue: number;
  role: "RESISTANCE" | "SUPPORT";
};

function cryptoRoomRead(snapshot: PublicCryptoEngineSnapshot): RoomRead {
  return roomForPrice(
    [
      { key: "lower", label: "South Gate I", value: snapshot.currentProjection.lower_line },
      { key: "main", label: "Control Line", value: snapshot.currentProjection.main_line },
      { key: "upper", label: "North Gate I", value: snapshot.currentProjection.upper_line },
    ],
    snapshot.session.current_price,
  );
}

function roomForPrice(lines: RoomLine[], price: number): RoomRead {
  const ordered = lines.slice().sort((a, b) => a.value - b.value);
  let lower: RoomLine | null = null;
  let upper: RoomLine | null = null;
  for (const line of ordered) {
    if (line.value <= price) lower = line;
    if (line.value > price && upper === null) upper = line;
  }
  return { lower, upper };
}

function cryptoBrokenGateRead(snapshot: PublicCryptoEngineSnapshot): BrokenGateRead | null {
  const latest = snapshot.candles.at(-1);
  const previous = snapshot.candles.at(-2);
  if (!latest || !previous) return null;
  return brokenGateFromCloses(previous.close, latest.close, [
    { key: "lower", label: "South Gate I", value: snapshot.currentProjection.lower_line },
    { key: "main", label: "Control Line", value: snapshot.currentProjection.main_line },
    { key: "upper", label: "North Gate I", value: snapshot.currentProjection.upper_line },
  ]);
}

function brokenGateFromCloses(
  previousClose: number,
  latestClose: number,
  lines: RoomLine[],
): BrokenGateRead | null {
  const candidates: BrokenGateRead[] = [];
  for (const line of lines) {
    if (previousClose > line.value && latestClose < line.value) {
      candidates.push({
        lineLabel: line.label,
        lineValue: line.value,
        role: "RESISTANCE",
      });
      continue;
    }
    if (previousClose < line.value && latestClose > line.value) {
      candidates.push({
        lineLabel: line.label,
        lineValue: line.value,
        role: "SUPPORT",
      });
    }
  }
  return candidates
    .sort((a, b) => Math.abs(latestClose - a.lineValue) - Math.abs(latestClose - b.lineValue))[0] ?? null;
}

function labelForSeverity(severity: AlertSeverity): string {
  if (severity === "entry") return "Entry Alert";
  if (severity === "armed") return "Setup Armed";
  if (severity === "risk") return "Risk Alert";
  if (severity === "system") return "System";
  return "Watch Alert";
}

function lowerRole(role: "RESISTANCE" | "SUPPORT" | null | undefined): string {
  return role === "SUPPORT" ? "support" : "resistance";
}

function money(value: number): string {
  return `$${number(value)}`;
}

function number(value: number): string {
  return Number.isFinite(value) ? value.toFixed(Math.abs(value) >= 1000 ? 2 : 2) : "--";
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatContractTicket(contract: ContractProjection): string {
  const entry = contract.projectedEntry;
  const target = contract.projectedTarget;
  const side = contract.side === "CALL" ? "call" : "put";
  const label = contract.confidence === "low" ? "Contract candidate for review" : "Suggested contract";
  const learningReason = contract.selectionReasons.find((reason) =>
    reason.toLowerCase().includes("self-learning"),
  );
  const targetLine = target
    ? ` Estimated at target: ${money(target.mark)} (${money(target.low)}-${money(target.high)}).`
    : "";
  return [
    `${label}: ${contract.contractLabel} ${side}.`,
    `Estimated debit at entry: ${money(entry.mark)} (${money(entry.low)}-${money(entry.high)}), about $${entry.debitPerContract}/contract.`,
    targetLine.trim(),
    learningReason ? `Learning note: ${learningReason}.` : null,
    contract.chainAsOf ? `Contract data time: ${formatCtTime(contract.chainAsOf)}.` : null,
    `Confidence: ${title(contract.confidence)}. Estimate, not a fill guarantee.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatCtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function roundKey(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "na";
}

function ctHourKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).format(now);
}

function isEquityAlertWindow(now: Date): boolean {
  const session = getSessionInfo("SPY", now);
  if (
    session.phase !== "CONFIG_WINDOW" &&
    session.phase !== "POST_CONFIG" &&
    session.phase !== "RTH_OPEN"
  ) {
    return false;
  }

  const ct = ctParts(now);
  const minutes = ct.hour * 60 + ct.minute;
  return minutes >= 8 * 60 && minutes <= 13 * 60 + 30;
}

function ctParts(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute") };
}
