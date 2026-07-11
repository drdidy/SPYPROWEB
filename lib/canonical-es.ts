import type {
  SPXAnchor,
  SPXControlPlanMap,
  SPXControlPlanSetup,
  SPXControlPlanSignal,
  SPXControlTradePlan,
  SPXSnapshot,
} from "@/lib/types";

function isUsablePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function appliedOffset(snap: SPXSnapshot): number | null {
  const offset = snap._meta?.appliedOffset;
  return typeof offset === "number" && Number.isFinite(offset) ? offset : null;
}

function toNativeEsPrice(value: number | null | undefined, offset: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return value;
  return value - offset;
}

function nativeOrOriginal(value: number, offset: number): number {
  const converted = toNativeEsPrice(value, offset);
  return converted === null ? value : converted;
}

function convertAnchorToNative(anchor: SPXAnchor, offset: number): SPXAnchor {
  return {
    ...anchor,
    price: nativeOrOriginal(anchor.price, offset),
  };
}

function convertControlMapToNative(
  map: SPXControlPlanMap,
  offset: number,
): SPXControlPlanMap {
  return {
    ...map,
    anchor: convertAnchorToNative(map.anchor, offset),
    controlValue: nativeOrOriginal(map.controlValue, offset),
  };
}

function convertControlSetupToNative<
  T extends SPXControlPlanSetup | SPXControlPlanSignal,
>(setup: T, offset: number): T {
  const converted = {
    ...setup,
    lineValue: nativeOrOriginal(setup.lineValue, offset),
    entryPrice: nativeOrOriginal(setup.entryPrice, offset),
    targetPrice: nativeOrOriginal(setup.targetPrice, offset),
  };

  if ("signalOpen" in setup) {
    return {
      ...converted,
      signalOpen: nativeOrOriginal(setup.signalOpen, offset),
      signalHigh: nativeOrOriginal(setup.signalHigh, offset),
      signalLow: nativeOrOriginal(setup.signalLow, offset),
      signalClose: nativeOrOriginal(setup.signalClose, offset),
    } as T;
  }

  return converted as T;
}

function convertControlTradePlanToNative(
  plan: SPXControlTradePlan | null | undefined,
  offset: number,
): SPXControlTradePlan | null | undefined {
  if (!plan) return plan;
  return {
    ...plan,
    primaryMap: convertControlMapToNative(plan.primaryMap, offset),
    oppositeMap: convertControlMapToNative(plan.oppositeMap, offset),
    activeTrade: plan.activeTrade
      ? convertControlSetupToNative(plan.activeTrade, offset)
      : null,
    setups: plan.setups.map((setup) => convertControlSetupToNative(setup, offset)),
    signals: plan.signals.map((signal) => convertControlSetupToNative(signal, offset)),
  };
}

function rebuildScenarioExplanation(
  snap: SPXSnapshot,
  esLast: number,
): string {
  const reason = snap.channel.reason?.trim();
  if (snap.channel.direction === "NONE") {
    return reason
      ? `No ES Control Map is active: ${reason} The engine is standing down until structure resolves.`
      : "No ES Control Map is active. The engine is standing down until structure resolves.";
  }

  const plan = snap.controlTradePlan;
  if (plan) {
    const map =
      plan.activeTrade?.mapId === plan.oppositeMap.id ||
      plan.setups[0]?.mapId === plan.oppositeMap.id
        ? plan.oppositeMap
        : plan.primaryMap.status === "ARMED"
          ? plan.primaryMap
          : plan.oppositeMap;
    return `ES last ${formatPrice(esLast)} is being evaluated against the ${map.direction === "DESCENDING" ? "descending" : "ascending"} Control Plan at ${formatPrice(map.controlValue)}.`;
  }

  return `ES last ${formatPrice(esLast)} is waiting for the Control Plan to resolve.`;
}

function rewriteTraceEvent(event: string, snap: SPXSnapshot, esLast: number): string {
  if (/Last print\s+\d+(?:\.\d+)?/i.test(event)) {
    return rebuildScenarioExplanation(snap, esLast);
  }
  return event;
}

/**
 * The backend still names this payload SPX because the model began life
 * as a cash-index model. The user-facing surface is ES-native, so any
 * browser surface that renders the snapshot must use `_meta.esSpot` as
 * the canonical last print when it is available.
 */
export function canonicalizeEsSnapshot(snap: SPXSnapshot): SPXSnapshot {
  const esLast =
    snap._meta?.offsetMethod === "close_anchored" && isUsablePrice(snap.price.last)
      ? snap.price.last
      : snap._meta?.esSpot;
  if (!isUsablePrice(esLast)) return snap;
  const offset = appliedOffset(snap);
  const alreadyNative = Math.abs(snap.price.last - esLast) < 0.01;
  if (offset === null || alreadyNative) {
    const lines = snap.lines.map((line) => ({
      ...line,
      distanceFromPrice: line.currentValue - esLast,
    }));
    return {
      ...snap,
      price: {
        ...snap.price,
        last: esLast,
      },
      lines,
      scenarioExplanation: rebuildScenarioExplanation(snap, esLast),
      decisionTrace: snap.decisionTrace?.map((event) => ({
        ...event,
        event: rewriteTraceEvent(event.event, snap, esLast),
      })),
    };
  }

  const lines = snap.lines.map((line) => ({
    ...line,
    anchorPrice: nativeOrOriginal(line.anchorPrice, offset),
    currentValue: nativeOrOriginal(line.currentValue, offset),
    entryValue:
      line.entryValue === null || line.entryValue === undefined
        ? line.entryValue
        : nativeOrOriginal(line.entryValue, offset),
    distanceFromPrice:
      (line.entryValue === null || line.entryValue === undefined
        ? nativeOrOriginal(line.currentValue, offset)
        : nativeOrOriginal(line.entryValue, offset)) - esLast,
  }));
  const converted: SPXSnapshot = {
    ...snap,
    overnight: {
      ...snap.overnight,
      high: {
        ...snap.overnight.high,
        price: nativeOrOriginal(snap.overnight.high.price, offset),
      },
      low: {
        ...snap.overnight.low,
        price: nativeOrOriginal(snap.overnight.low.price, offset),
      },
    },
    sessions: {
      sydney: {
        ...snap.sessions.sydney,
        high: nativeOrOriginal(snap.sessions.sydney.high, offset),
        low: nativeOrOriginal(snap.sessions.sydney.low, offset),
      },
      tokyo: {
        ...snap.sessions.tokyo,
        high: nativeOrOriginal(snap.sessions.tokyo.high, offset),
        low: nativeOrOriginal(snap.sessions.tokyo.low, offset),
      },
    },
    lines,
    price: {
      ...snap.price,
      last: esLast,
    },
    plays: {
      primary: snap.plays.primary
        ? {
            ...snap.plays.primary,
            entryPrice: nativeOrOriginal(snap.plays.primary.entryPrice, offset),
            exitPrice: nativeOrOriginal(snap.plays.primary.exitPrice, offset),
          }
        : null,
      alternate: snap.plays.alternate
        ? {
            ...snap.plays.alternate,
            entryPrice: nativeOrOriginal(snap.plays.alternate.entryPrice, offset),
            exitPrice: nativeOrOriginal(snap.plays.alternate.exitPrice, offset),
          }
        : null,
    },
    invalidation: snap.invalidation
      ? {
          ...snap.invalidation,
          level: nativeOrOriginal(snap.invalidation.level, offset),
        }
      : snap.invalidation,
    plannedEnvelope: snap.plannedEnvelope
      ? {
          low: nativeOrOriginal(snap.plannedEnvelope.low, offset),
          high: nativeOrOriginal(snap.plannedEnvelope.high, offset),
        }
      : snap.plannedEnvelope,
    rthBias: snap.rthBias
      ? {
          ...snap.rthBias,
          openPrice:
            snap.rthBias.openPrice === null
              ? null
              : nativeOrOriginal(snap.rthBias.openPrice, offset),
          referenceValue:
            snap.rthBias.referenceValue === null
              ? null
              : nativeOrOriginal(snap.rthBias.referenceValue, offset),
          continuationValue:
            snap.rthBias.continuationValue === null
              ? null
              : nativeOrOriginal(snap.rthBias.continuationValue, offset),
        }
      : snap.rthBias,
    controlTradePlan: convertControlTradePlanToNative(
      snap.controlTradePlan,
      offset,
    ),
  };

  return {
    ...converted,
    scenarioExplanation: rebuildScenarioExplanation(converted, esLast),
    decisionTrace: converted.decisionTrace?.map((event) => ({
      ...event,
      event: rewriteTraceEvent(event.event, converted, esLast),
    })),
  };
}

export function canonicalEsLast(snap: SPXSnapshot): number {
  if (snap._meta?.offsetMethod === "close_anchored" && isUsablePrice(snap.price.last)) {
    return snap.price.last;
  }
  return isUsablePrice(snap._meta?.esSpot) ? snap._meta.esSpot : snap.price.last;
}
