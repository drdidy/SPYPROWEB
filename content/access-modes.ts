import { Activity, Building2, Coins, Columns3, LineChart } from "lucide-react";

export type AccessModeKey = "core" | "edge" | "apex";

export const ACCESS_MODES = [
  {
    key: "core",
    name: "Prophet Core",
    tier: "Basic",
    summary: "The clean SPY routine for traders who want one disciplined morning read.",
    engines: ["SPY"],
    surfaces: ["Decision Slate", "SPY Channel", "Daily Brief", "Replay basics", "Learning Center"],
    icon: LineChart,
    accent: "gold",
  },
  {
    key: "edge",
    name: "Prophet Edge",
    tier: "Pro",
    summary: "Adds ES so SPY trades can respect the lead market before you size.",
    engines: ["SPY", "ES"],
    surfaces: ["Everything in Core", "ES Channel", "SPX Options Lens", "Full Replay", "Planning Lab"],
    icon: Columns3,
    accent: "violet",
  },
  {
    key: "apex",
    name: "Apex",
    tier: "Elite",
    summary: "The full cross-market board: SPY, ES, liquid stocks, BTC, and ETH.",
    engines: ["SPY", "ES", "Stocks", "Crypto"],
    surfaces: ["Everything in Edge", "Stocks Channel", "Crypto Engine", "Premium memory", "Expansion confirmation"],
    icon: Building2,
    accent: "teal",
  },
] as const;

export const ENGINE_MODE_BADGES: Record<string, { label: string; mode: AccessModeKey; icon: typeof Activity }> = {
  "/dashboard": { label: "Apex", mode: "apex", icon: LineChart },
  "/spy": { label: "Core", mode: "core", icon: Activity },
  "/es": { label: "Edge", mode: "edge", icon: Columns3 },
  "/stocks": { label: "Apex", mode: "apex", icon: Building2 },
  "/crypto": { label: "Apex", mode: "apex", icon: Coins },
};
