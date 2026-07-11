import type { EngineState } from "@/lib/states";

const ENGINE_STATE_LABELS: Record<EngineState, string> = {
  PRE_CONFIG: "Pre-Config",
  STAND_DOWN: "Stand Down",
  WATCH: "Watch",
  WAIT: "Wait",
  ARMED: "Armed",
  GO: "Go",
  COOLDOWN: "Cooldown",
};

const DIRECTION_LABELS: Record<string, string> = {
  BULLISH: "Bullish",
  BEARISH: "Bearish",
  NEUTRAL: "Neutral",
  BALANCED: "Balanced",
  POSITIVE: "Positive",
  NEGATIVE: "Negative",
  FLAT: "Flat",
  WAIT: "Wait",
  LONG: "Long",
  SHORT: "Short",
  TAKE: "Take",
  SELECTIVE: "Selective",
};

export function formatEngineStateLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return ENGINE_STATE_LABELS[value as EngineState] ?? titleizeToken(value);
}

export function formatDirectionLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const normalized = value.replace(/\s+/g, "_").toUpperCase();
  return DIRECTION_LABELS[normalized] ?? titleizeToken(value);
}

export function formatDisplayLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return titleizeToken(value);
}

export function formatSentenceState(value: string | null | undefined): string {
  const label = formatEngineStateLabel(value);
  if (label === "-") return label;
  return label.toLowerCase();
}

function titleizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (upper === "SPY" || upper === "ES" || upper === "SPX" || upper === "VIX") {
        return upper;
      }
      return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
