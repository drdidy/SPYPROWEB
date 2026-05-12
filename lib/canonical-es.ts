import type { SPXSnapshot } from "@/lib/types";

function isUsablePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function rebuildScenarioExplanation(
  snap: SPXSnapshot,
  esLast: number,
): string {
  const reason = snap.channel.reason?.trim();
  if (snap.channel.direction === "NONE") {
    return reason
      ? `No ES channel is active: ${reason} The engine is standing down until structure resolves.`
      : "No ES channel is active. The engine is standing down until structure resolves.";
  }

  const envelope = snap.plannedEnvelope;
  if (snap.scenario === "OUTSIDE_PLAY" && envelope) {
    const inside = esLast >= envelope.low && esLast <= envelope.high;
    const range = `${formatPrice(envelope.low)}-${formatPrice(envelope.high)}`;
    return inside
      ? `ES last ${formatPrice(esLast)} is inside the planned envelope (${range}), but no channel-qualified play is active.`
      : `ES last ${formatPrice(esLast)} is outside the active play scope; re-entry into ${range} reactivates the play.`;
  }

  const existing = snap.scenarioExplanation || "";
  if (existing) {
    return existing.replace(
      /Last print\s+\d+(?:\.\d+)?/i,
      `ES last ${formatPrice(esLast)}`,
    );
  }
  return `ES last ${formatPrice(esLast)} is being evaluated against the active channel structure.`;
}

function rewriteTraceEvent(event: string, snap: SPXSnapshot, esLast: number): string {
  if (/Last print\s+\d+(?:\.\d+)?/i.test(event)) {
    return rebuildScenarioExplanation(snap, esLast);
  }
  return event;
}

/**
 * The backend still names this payload SPX because the model began life
 * as a cash-index channel. The user-facing channel is ES-native, so any
 * browser surface that renders the snapshot must use `_meta.esSpot` as
 * the canonical last print when it is available.
 */
export function canonicalizeEsSnapshot(snap: SPXSnapshot): SPXSnapshot {
  const esLast = snap._meta?.esSpot;
  if (!isUsablePrice(esLast)) return snap;

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

export function canonicalEsLast(snap: SPXSnapshot): number {
  return isUsablePrice(snap._meta?.esSpot) ? snap._meta.esSpot : snap.price.last;
}
