import type { SPXSnapshot } from "@/lib/types";

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

function rebuildScenarioExplanation(
  snap: SPXSnapshot,
  esLast: number,
): string {
  const reason = snap.channel.reason?.trim();
  if (snap.channel.direction === "NONE") {
    return reason
      ? `No ES Pivot Fan is active: ${reason} The engine is standing down until structure resolves.`
      : "No ES Pivot Fan is active. The engine is standing down until structure resolves.";
  }

  const envelope = snap.plannedEnvelope;
  if (snap.scenario === "OUTSIDE_PLAY" && envelope) {
    const inside = esLast >= envelope.low && esLast <= envelope.high;
    const range = `${formatPrice(envelope.low)}-${formatPrice(envelope.high)}`;
    return inside
      ? `ES last ${formatPrice(esLast)} is inside the planned envelope (${range}), but no fan-qualified play is active.`
      : `ES last ${formatPrice(esLast)} is outside the active play scope; re-entry into ${range} reactivates the play.`;
  }

  const existing = snap.scenarioExplanation || "";
  if (existing) {
    return existing.replace(
      /Last print\s+\d+(?:\.\d+)?/i,
      `ES last ${formatPrice(esLast)}`,
    );
  }
  return `ES last ${formatPrice(esLast)} is being evaluated against the active Pivot Fan.`;
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
  const esLast = snap._meta?.esSpot;
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
  return isUsablePrice(snap._meta?.esSpot) ? snap._meta.esSpot : snap.price.last;
}
