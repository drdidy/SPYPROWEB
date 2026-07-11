import type { AccessModeKey } from "@/content/access-modes";

const ORDER: AccessModeKey[] = ["core", "edge", "apex"];

export function currentAccessMode(): AccessModeKey {
  const raw = (process.env.NEXT_PUBLIC_PROPHET_PLAN || process.env.PROPHET_PLAN || "apex")
    .trim()
    .toLowerCase();
  if (raw === "core" || raw === "edge" || raw === "apex") return raw;
  return "apex";
}

export function canAccess(required: AccessModeKey, actual: AccessModeKey = currentAccessMode()): boolean {
  return ORDER.indexOf(actual) >= ORDER.indexOf(required);
}

export function accessSummary() {
  const mode = currentAccessMode();
  return {
    mode,
    unlocked: {
      spy: canAccess("core", mode),
      brief: canAccess("core", mode),
      replay: canAccess("core", mode),
      es: canAccess("edge", mode),
      options: canAccess("edge", mode),
      planning: canAccess("edge", mode),
      stocks: canAccess("apex", mode),
      crypto: canAccess("apex", mode),
      prophetDesk: canAccess("apex", mode),
    },
  };
}
