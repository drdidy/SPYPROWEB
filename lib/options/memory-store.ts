import {
  appendOptionTick,
  buildOptionContractMemoryRead,
  buildOptionMomentumRead,
  type OptionContractMemoryRead,
  type OptionReplayEvent,
  type OptionTapeTick,
} from "@/lib/options/momentum";

type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

export type OptionReplayMemorySnapshot = {
  configured: boolean;
  asOf: string;
  contracts: OptionContractMemoryRead[];
  events: OptionReplayEvent[];
  diagnostics: string[];
  backfill: {
    status: "not_configured" | "recording" | "testing" | "available" | "unavailable";
    detail: string;
  };
};

const REGISTRY_KEY = "prophet:options:memory:contracts:v1";
const EVENTS_KEY = "prophet:options:memory:events:v1";
const BACKFILL_STATUS_KEY = "prophet:options:memory:backfill:v1";
const TAPE_PREFIX = "prophet:options:memory:tape:v1:";
const TAPE_TTL_SECONDS = 21 * 24 * 60 * 60;
const EVENT_TTL_SECONDS = 45 * 24 * 60 * 60;

export function optionReplayMemoryConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

export async function appendOptionMemoryTick(tick: OptionTapeTick): Promise<{
  stored: boolean;
  eventCreated: boolean;
  reason?: string;
}> {
  if (!optionReplayMemoryConfigured()) {
    return { stored: false, eventCreated: false, reason: "Replay memory storage is not configured." };
  }
  if (!tick.contractLabel || !Number.isFinite(tick.mark) || tick.mark <= 0) {
    return { stored: false, eventCreated: false, reason: "Invalid option tick." };
  }

  const key = tapeKey(tick.contractLabel);
  const existing = await readTapeByKey(key);
  const previousRead = buildOptionMomentumRead(existing);
  const next = appendOptionTick(existing, tick);
  const nextRead = buildOptionMomentumRead(next);
  let eventCreated = false;

  const commands: string[][] = [
    ["SADD", REGISTRY_KEY, tick.contractLabel],
    ["SET", key, JSON.stringify(next), "EX", String(TAPE_TTL_SECONDS)],
  ];

  if (previousRead.verdict !== "confirmed" && nextRead.verdict === "confirmed") {
    eventCreated = true;
    const event: OptionReplayEvent = {
      id: `${tick.contractLabel}:${tick.ts}`,
      ts: tick.ts,
      contractLabel: tick.contractLabel,
      side: tick.side,
      strike: tick.strike,
      expiration: tick.expiration,
      mark: tick.mark,
      verdict: nextRead.verdict,
      detail: nextRead.detail,
    };
    commands.push(["LPUSH", EVENTS_KEY, JSON.stringify(event)]);
    commands.push(["LTRIM", EVENTS_KEY, "0", "99"]);
    commands.push(["EXPIRE", EVENTS_KEY, String(EVENT_TTL_SECONDS)]);
  }

  await redisPipeline(commands);
  return { stored: true, eventCreated };
}

export async function loadOptionReplayMemory(): Promise<OptionReplayMemorySnapshot> {
  const asOf = new Date().toISOString();
  if (!optionReplayMemoryConfigured()) {
    return {
      configured: false,
      asOf,
      contracts: [],
      events: [],
      diagnostics: ["Cloud replay memory is not configured."],
      backfill: {
        status: "not_configured",
        detail: "Premium recording needs cloud memory before it can persist contracts.",
      },
    };
  }

  const diagnostics: string[] = [];
  const labels = await redisCommand<string[]>(["SMEMBERS", REGISTRY_KEY]).catch((error) => {
    diagnostics.push(errorText(error));
    return [];
  });
  const uniqueLabels = Array.from(new Set((labels ?? []).filter(Boolean))).slice(0, 24);
  const tapes = await Promise.all(
    uniqueLabels.map((label) =>
      readTapeByKey(tapeKey(label)).catch((error) => {
        diagnostics.push(`${label}: ${errorText(error)}`);
        return [] as OptionTapeTick[];
      }),
    ),
  );
  const contracts = tapes
    .map(buildOptionContractMemoryRead)
    .filter((item): item is OptionContractMemoryRead => item !== null)
    .sort((a, b) => Date.parse(b.lastSeen ?? "") - Date.parse(a.lastSeen ?? ""));

  const eventRows = await redisCommand<string[]>(["LRANGE", EVENTS_KEY, "0", "25"]).catch((error) => {
    diagnostics.push(errorText(error));
    return [];
  });
  const events = (eventRows ?? [])
    .map(parseJson)
    .filter(isReplayEvent)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  const backfillRaw = await redisCommand<string | null>(["GET", BACKFILL_STATUS_KEY]).catch(() => null);
  const backfill = parseBackfillStatus(backfillRaw);

  return {
    configured: true,
    asOf,
    contracts,
    events,
    diagnostics,
    backfill,
  };
}

export async function rememberBackfillStatus(status: OptionReplayMemorySnapshot["backfill"]): Promise<void> {
  if (!optionReplayMemoryConfigured()) return;
  await redisCommand<"OK">(["SET", BACKFILL_STATUS_KEY, JSON.stringify(status), "EX", String(7 * 24 * 60 * 60)]);
}

async function readTapeByKey(key: string): Promise<OptionTapeTick[]> {
  const raw = await redisCommand<string | null>(["GET", key]);
  const parsed = parseJson(raw);
  return Array.isArray(parsed) ? parsed.filter(isTapeTick) : [];
}

async function redisPipeline<T = unknown>(commands: string[][]): Promise<Array<T | null>> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return [];

  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as Array<UpstashResponse<T>> | null;
  if (!res.ok || !body) {
    throw new Error(`Replay memory returned HTTP ${res.status}.`);
  }
  const failed = body.find((item) => item?.error);
  if (failed?.error) throw new Error(failed.error);
  return body.map((item) => item.result ?? null);
}

async function redisCommand<T>(command: string[]): Promise<T | null> {
  const rows = await redisPipeline<T>([command]);
  return rows[0] ?? null;
}

function tapeKey(contractLabel: string): string {
  return `${TAPE_PREFIX}${contractLabel.replace(/[^A-Z0-9./_-]+/gi, "_")}`;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseBackfillStatus(raw: string | null): OptionReplayMemorySnapshot["backfill"] {
  const parsed = parseJson(raw);
  if (
    parsed &&
    typeof parsed === "object" &&
    "status" in parsed &&
    "detail" in parsed &&
    typeof (parsed as { detail: unknown }).detail === "string"
  ) {
    const status = (parsed as { status: string }).status;
    if (["not_configured", "recording", "testing", "available", "unavailable"].includes(status)) {
      return parsed as OptionReplayMemorySnapshot["backfill"];
    }
  }
  return {
    status: "recording",
    detail: "Live premium recording is active for selected contracts. Historical backfill is tested separately.",
  };
}

function isTapeTick(value: unknown): value is OptionTapeTick {
  return Boolean(
    value &&
      typeof value === "object" &&
      "contractLabel" in value &&
      "mark" in value &&
      Number.isFinite((value as OptionTapeTick).mark),
  );
}

function isReplayEvent(value: unknown): value is OptionReplayEvent {
  return Boolean(value && typeof value === "object" && "id" in value && "contractLabel" in value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
