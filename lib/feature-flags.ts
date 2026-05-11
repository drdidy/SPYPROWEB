export type FlagName =
  | "feed_health"
  | "panel_states"
  | "visual_v2"
  | "mock_dashboard"
  | "slate_hero_v2"
  | "slate_verdict_chrome"
  | "slate_entry_cost_tile"
  | "slate_state_rail"
  | "slate_feed_health"
  | "slate_a11y"
  | "verdict_actions"
  | "personalization"
  | "stats_audit"
  | "telemetry_receipts"
  | "notifications"
  | "armed_go"
  | "slate_compliance"
  | "compliance_footer";

type RuntimeName = "development" | "preview" | "staging" | "production" | "test";
type QueryValue = string | string[] | boolean | number | null | undefined;

export interface FeatureFlagUserPrefs {
  featureFlags?: Partial<Record<FlagName, boolean>>;
}

export interface FeatureFlagContext {
  user?: FeatureFlagUserPrefs | null;
  env?: Partial<Record<string, string | undefined>>;
  query?: URLSearchParams | Record<string, QueryValue> | null;
}

interface FlagDefinition {
  defaultEnabled: boolean | Partial<Record<RuntimeName, boolean>>;
  envKey: `NEXT_PUBLIC_FF_${string}`;
  queryKey: `ff_${string}`;
}

const FLAG_DEFINITIONS: Record<FlagName, FlagDefinition> = {
  feed_health: flag("FEED_HEALTH", false),
  panel_states: flag("PANEL_STATES", false),
  visual_v2: flag("VISUAL_V2", {
    development: true,
    preview: true,
    staging: true,
    production: false,
    test: false,
  }),
  mock_dashboard: flag("MOCK_DASHBOARD", false),
  slate_hero_v2: flag("SLATE_HERO_V2", true),
  slate_verdict_chrome: flag("SLATE_VERDICT_CHROME", true),
  slate_entry_cost_tile: flag("SLATE_ENTRY_COST_TILE", true),
  slate_state_rail: flag("SLATE_STATE_RAIL", false),
  slate_feed_health: flag("SLATE_FEED_HEALTH", {
    development: true,
    preview: true,
    staging: true,
    production: false,
    test: false,
  }),
  slate_a11y: flag("SLATE_A11Y", false),
  verdict_actions: flag("VERDICT_ACTIONS", false),
  personalization: flag("PERSONALIZATION", false),
  stats_audit: flag("STATS_AUDIT", false),
  telemetry_receipts: flag("TELEMETRY_RECEIPTS", false),
  notifications: flag("NOTIFICATIONS", false),
  armed_go: flag("ARMED_GO", false),
  slate_compliance: flag("SLATE_COMPLIANCE", false),
  compliance_footer: flag("COMPLIANCE_FOOTER", false),
};

const PUBLIC_ENV: Partial<Record<string, string | undefined>> = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  NEXT_PUBLIC_FF_FEED_HEALTH: process.env.NEXT_PUBLIC_FF_FEED_HEALTH,
  NEXT_PUBLIC_FF_PANEL_STATES: process.env.NEXT_PUBLIC_FF_PANEL_STATES,
  NEXT_PUBLIC_FF_VISUAL_V2: process.env.NEXT_PUBLIC_FF_VISUAL_V2,
  NEXT_PUBLIC_FF_MOCK_DASHBOARD: process.env.NEXT_PUBLIC_FF_MOCK_DASHBOARD,
  NEXT_PUBLIC_FF_SLATE_HERO_V2: process.env.NEXT_PUBLIC_FF_SLATE_HERO_V2,
  NEXT_PUBLIC_FF_SLATE_VERDICT_CHROME: process.env.NEXT_PUBLIC_FF_SLATE_VERDICT_CHROME,
  NEXT_PUBLIC_FF_SLATE_ENTRY_COST_TILE: process.env.NEXT_PUBLIC_FF_SLATE_ENTRY_COST_TILE,
  NEXT_PUBLIC_FF_SLATE_STATE_RAIL: process.env.NEXT_PUBLIC_FF_SLATE_STATE_RAIL,
  NEXT_PUBLIC_FF_SLATE_FEED_HEALTH: process.env.NEXT_PUBLIC_FF_SLATE_FEED_HEALTH,
  NEXT_PUBLIC_FF_SLATE_A11Y: process.env.NEXT_PUBLIC_FF_SLATE_A11Y,
  NEXT_PUBLIC_FF_VERDICT_ACTIONS: process.env.NEXT_PUBLIC_FF_VERDICT_ACTIONS,
  NEXT_PUBLIC_FF_PERSONALIZATION: process.env.NEXT_PUBLIC_FF_PERSONALIZATION,
  NEXT_PUBLIC_FF_STATS_AUDIT: process.env.NEXT_PUBLIC_FF_STATS_AUDIT,
  NEXT_PUBLIC_FF_TELEMETRY_RECEIPTS: process.env.NEXT_PUBLIC_FF_TELEMETRY_RECEIPTS,
  NEXT_PUBLIC_FF_NOTIFICATIONS: process.env.NEXT_PUBLIC_FF_NOTIFICATIONS,
  NEXT_PUBLIC_FF_ARMED_GO: process.env.NEXT_PUBLIC_FF_ARMED_GO,
  NEXT_PUBLIC_FF_SLATE_COMPLIANCE: process.env.NEXT_PUBLIC_FF_SLATE_COMPLIANCE,
  NEXT_PUBLIC_FF_COMPLIANCE_FOOTER: process.env.NEXT_PUBLIC_FF_COMPLIANCE_FOOTER,
};

export function isEnabled(flagName: FlagName, context: FeatureFlagContext = {}): boolean {
  const definition = FLAG_DEFINITIONS[flagName];
  const env = { ...PUBLIC_ENV, ...context.env };
  const runtime = runtimeName(env);

  if (runtime !== "production") {
    const queryValue = readQueryValue(context.query, definition.queryKey);
    const queryBool = parseBoolean(queryValue);
    if (queryBool !== null) return queryBool;
  }

  const userBool = context.user?.featureFlags?.[flagName];
  if (typeof userBool === "boolean") return userBool;

  const envBool = parseBoolean(env[definition.envKey]);
  if (envBool !== null) return envBool;

  return defaultForRuntime(definition.defaultEnabled, runtime);
}

export const FEATURE_FLAGS = Object.keys(FLAG_DEFINITIONS) as FlagName[];

function flag(name: string, defaultEnabled: FlagDefinition["defaultEnabled"]): FlagDefinition {
  return {
    defaultEnabled,
    envKey: `NEXT_PUBLIC_FF_${name}`,
    queryKey: `ff_${name.toLowerCase()}`,
  };
}

function runtimeName(env: Partial<Record<string, string | undefined>>): RuntimeName {
  const raw = env.NEXT_PUBLIC_VERCEL_ENV ?? env.VERCEL_ENV ?? env.NODE_ENV;
  if (raw === "production") return "production";
  if (raw === "preview") return "preview";
  if (raw === "staging") return "staging";
  if (raw === "test") return "test";
  return "development";
}

function defaultForRuntime(
  value: FlagDefinition["defaultEnabled"],
  runtime: RuntimeName,
): boolean {
  if (typeof value === "boolean") return value;
  return value[runtime] ?? false;
}

function readQueryValue(
  query: FeatureFlagContext["query"],
  key: string,
): QueryValue {
  if (!query) return undefined;
  if (query instanceof URLSearchParams) return query.get(key);
  return query[key];
}

function parseBoolean(value: QueryValue): boolean | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === true || first === 1) return true;
  if (first === false || first === 0) return false;
  if (typeof first !== "string") return null;
  const normalized = first.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return null;
}
