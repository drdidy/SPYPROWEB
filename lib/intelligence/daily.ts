import type { EmaFibAlertRecord } from "@/lib/contracts/ema-fib-alert";
import { readEmaFibAlerts } from "@/lib/ema-fib-alerts";

type ReplayBar = { t: string; o?: number; h: number; l: number; c: number };
type AlertPayload = EmaFibAlertRecord["payload"];

export type ReviewedTrade = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryAt: string;
  exitAt: string;
  entry: number;
  exit: number;
  stop: number | null;
  target: number;
  outcome: "WIN" | "LOSS" | "TIMEOUT";
  durationMinutes: number;
  realizedR: number | null;
  favorablePoints: number | null;
  adversePoints: number | null;
  targetProgressPct: number | null;
  timing: "FAST" | "CLEAN" | "LATE" | "REVIEW";
  lesson: string;
};

export type DailyIntelligenceSnapshot = {
  ok: boolean;
  asOf: string;
  sessionDate: string;
  mode: "evidence_bound_review";
  persistence: "cloud" | "request_only";
  evidence: {
    acceptedAlerts: number;
    completedTrades: number;
    replayBars: number;
    rollingTrades: number;
    newsSource: string;
    briefSource: string;
  };
  scorecard: {
    wins: number;
    losses: number;
    timeouts: number;
    winRate: number | null;
    averageR: number | null;
    averageDurationMinutes: number | null;
  };
  trades: ReviewedTrade[];
  improvements: Array<{
    title: string;
    finding: string;
    action: string;
    confidence: "HIGH" | "MEDIUM" | "LEARNING";
    sample: number;
  }>;
  nextSession: {
    headline: string;
    context: string;
    focus: string[];
    avoid: string[];
    newsWatch: string[];
  };
  ai: {
    used: boolean;
    source: string;
    headline: string;
    review: string;
    timingLesson: string;
    nextSessionFocus: string;
    riskRule: string;
  };
};

const ENTRY_KINDS = new Set(["entry", "fib50_rejection", "reload_entry", "tokyo_entry"]);
const EXIT_KINDS = new Set(["exit_target", "invalidated", "exit_timeout"]);
const CT = "America/Chicago";
const MEMORY_PREFIX = "prophet:intelligence:daily:v1:";
const MEMORY_REGISTRY = "prophet:intelligence:daily:registry:v1";

export async function buildDailyIntelligence({
  origin,
  date,
}: {
  origin: string;
  date?: string | null;
}): Promise<DailyIntelligenceSnapshot> {
  const records = (await readEmaFibAlerts(500))
    .filter((row) => row.status === "accepted")
    .sort((a, b) => Date.parse(a.payload.eventAt) - Date.parse(b.payload.eventAt));
  const allPairs = pairCompletedTrades(records);
  const sessionDate = validDate(date) ?? latestCompletedDate(allPairs) ?? previousWeekday();
  const pairs = allPairs.filter((pair) => chicagoDate(pair.entry.payload.eventAt) === sessionDate);

  const [replay, macro, brief] = await Promise.all([
    fetchJson<{ spy?: ReplayBar[]; es?: ReplayBar[] }>(`${origin}/api/replay/intraday?date=${sessionDate}`),
    fetchJson<Record<string, unknown>>(`${origin}/api/macro/context`),
    fetchJson<Record<string, unknown>>(`${origin}/api/spy/brief`),
  ]);

  const trades = pairs.map((pair) => reviewTrade(pair, replay));
  const rolling = allPairs.slice(-40);
  const scorecard = summarize(trades);
  const improvements = buildImprovements(trades, rolling);
  const nextSession = buildNextSessionPlan({ scorecard, improvements, macro, brief });
  const ai = await synthesizeWithAI({ sessionDate, scorecard, trades, improvements, nextSession, macro, brief });

  const snapshot: DailyIntelligenceSnapshot = {
    ok: true,
    asOf: new Date().toISOString(),
    sessionDate,
    mode: "evidence_bound_review",
    persistence: redisConfigured() ? "cloud" : "request_only",
    evidence: {
      acceptedAlerts: records.length,
      completedTrades: trades.length,
      replayBars: (replay?.spy?.length ?? 0) + (replay?.es?.length ?? 0),
      rollingTrades: rolling.length,
      newsSource: nestedString(macro, ["news", "source"]) ?? "unavailable",
      briefSource: stringValue(brief?.source) ?? "deterministic",
    },
    scorecard,
    trades,
    improvements,
    nextSession,
    ai,
  };

  await rememberSnapshot(snapshot).catch(() => undefined);
  return snapshot;
}

type TradePair = { entry: EmaFibAlertRecord; exit: EmaFibAlertRecord };

function pairCompletedTrades(records: EmaFibAlertRecord[]): TradePair[] {
  const active = new Map<string, EmaFibAlertRecord>();
  const pairs: TradePair[] = [];
  for (const record of records) {
    const payload = record.payload;
    const key = `${payload.symbol}:${payload.direction}`;
    if (ENTRY_KINDS.has(payload.kind)) {
      active.set(key, record);
      continue;
    }
    if (!EXIT_KINDS.has(payload.kind)) continue;
    const entry = active.get(key);
    if (!entry) continue;
    if (chicagoDate(entry.payload.eventAt) !== chicagoDate(payload.eventAt)) {
      active.delete(key);
      continue;
    }
    pairs.push({ entry, exit: record });
    active.delete(key);
  }
  return pairs;
}

function reviewTrade(pair: TradePair, replay: { spy?: ReplayBar[]; es?: ReplayBar[] } | null): ReviewedTrade {
  const entryPayload = pair.entry.payload;
  const exitPayload = pair.exit.payload;
  const entry = entryPayload.fib50;
  const target = entryPayload.extension150;
  const stop = finite(entryPayload.stop);
  const outcome = exitPayload.kind === "exit_target" ? "WIN" : exitPayload.kind === "invalidated" ? "LOSS" : "TIMEOUT";
  const exit = outcome === "WIN" ? target : finite(exitPayload.invalidationClose) ?? exitPayload.last;
  const risk = stop === null ? null : Math.abs(entry - stop);
  const realizedR = risk && risk > 0
    ? round(entryPayload.direction === "long" ? (exit - entry) / risk : (entry - exit) / risk, 2)
    : null;
  const bars = (entryPayload.symbol === "SPY" ? replay?.spy : replay?.es) ?? [];
  const during = bars.filter((bar) => {
    const ts = Date.parse(bar.t);
    return ts >= Date.parse(entryPayload.eventAt) && ts <= Date.parse(exitPayload.eventAt);
  });
  const favorablePoints = during.length
    ? entryPayload.direction === "long"
      ? Math.max(...during.map((bar) => bar.h)) - entry
      : entry - Math.min(...during.map((bar) => bar.l))
    : null;
  const adversePoints = during.length
    ? entryPayload.direction === "long"
      ? entry - Math.min(...during.map((bar) => bar.l))
      : Math.max(...during.map((bar) => bar.h)) - entry
    : null;
  const targetDistance = Math.abs(target - entry);
  const targetProgressPct = favorablePoints !== null && targetDistance > 0
    ? round(Math.max(0, favorablePoints) / targetDistance * 100, 1)
    : null;
  const durationMinutes = Math.max(0, Math.round((Date.parse(exitPayload.eventAt) - Date.parse(entryPayload.eventAt)) / 60_000));
  const timing = outcome === "WIN" && durationMinutes <= 15
    ? "FAST"
    : outcome === "WIN"
      ? "CLEAN"
      : targetProgressPct !== null && targetProgressPct >= 70
        ? "LATE"
        : "REVIEW";
  return {
    id: pair.entry.id,
    symbol: entryPayload.symbol,
    direction: entryPayload.direction,
    entryAt: entryPayload.eventAt,
    exitAt: exitPayload.eventAt,
    entry: round(entry, 2),
    exit: round(exit, 2),
    stop: stop === null ? null : round(stop, 2),
    target: round(target, 2),
    outcome,
    durationMinutes,
    realizedR,
    favorablePoints: favorablePoints === null ? null : round(Math.max(0, favorablePoints), 2),
    adversePoints: adversePoints === null ? null : round(Math.max(0, adversePoints), 2),
    targetProgressPct,
    timing,
    lesson: tradeLesson({ outcome, durationMinutes, targetProgressPct, realizedR }),
  };
}

function tradeLesson(input: { outcome: ReviewedTrade["outcome"]; durationMinutes: number; targetProgressPct: number | null; realizedR: number | null }): string {
  if (input.outcome === "WIN" && input.durationMinutes <= 15) return "The setup converted quickly. Preserve the confirmation rule and avoid chasing after the first expansion.";
  if (input.outcome === "WIN") return "The thesis held, but patience was required. The defined stop mattered more than intrabar noise.";
  if ((input.targetProgressPct ?? 0) >= 70) return "The trade made meaningful progress before failing. Study partial-profit and breakeven behavior across similar cases before changing the default.";
  if (input.outcome === "TIMEOUT" && (input.realizedR ?? 0) > 0) return "The target did not complete, but the session cutoff protected positive R. Keep timeout separate from a structural loss.";
  return "The setup failed before proving enough favorable excursion. Review higher-timeframe agreement, entry timing, and available target room.";
}

function summarize(trades: ReviewedTrade[]): DailyIntelligenceSnapshot["scorecard"] {
  const wins = trades.filter((trade) => trade.outcome === "WIN").length;
  const losses = trades.filter((trade) => trade.outcome === "LOSS").length;
  const timeouts = trades.filter((trade) => trade.outcome === "TIMEOUT").length;
  const decided = wins + losses;
  const rValues = trades.map((trade) => trade.realizedR).filter((value): value is number => value !== null);
  return {
    wins,
    losses,
    timeouts,
    winRate: decided ? round(wins / decided * 100, 1) : null,
    averageR: rValues.length ? round(average(rValues), 2) : null,
    averageDurationMinutes: trades.length ? round(average(trades.map((trade) => trade.durationMinutes)), 1) : null,
  };
}

function buildImprovements(trades: ReviewedTrade[], rolling: TradePair[]): DailyIntelligenceSnapshot["improvements"] {
  const rows: DailyIntelligenceSnapshot["improvements"] = [];
  const lateFailures = trades.filter((trade) => trade.outcome !== "WIN" && (trade.targetProgressPct ?? 0) >= 70);
  if (lateFailures.length) rows.push({
    title: "Protect mature progress",
    finding: `${lateFailures.length} trade${lateFailures.length === 1 ? "" : "s"} reached at least 70% of target before failing to complete.`,
    action: "Research a partial or breakeven rule across at least 10 comparable sessions. Do not change production from this day alone.",
    confidence: lateFailures.length >= 3 ? "MEDIUM" : "LEARNING",
    sample: lateFailures.length,
  });
  const quickFailures = trades.filter((trade) => trade.outcome === "LOSS" && trade.durationMinutes <= 10);
  if (quickFailures.length) rows.push({
    title: "Audit immediate adverse moves",
    finding: `${quickFailures.length} loss${quickFailures.length === 1 ? "" : "es"} invalidated within ten minutes of entry.`,
    action: "Compare the confirmation candle, 5/20-minute alignment, and room to the next mapped level before proposing a filter.",
    confidence: quickFailures.length >= 3 ? "MEDIUM" : "LEARNING",
    sample: quickFailures.length,
  });
  const windowStats = rollingWindowStats(rolling);
  if (windowStats.best && windowStats.best.count >= 5) rows.push({
    title: "Respect the proven time block",
    finding: `${windowStats.best.label} leads the recent sample at ${windowStats.best.winRate.toFixed(0)}% across ${windowStats.best.count} decided trades.`,
    action: "Treat this as context, not permission. The full setup must still confirm.",
    confidence: windowStats.best.count >= 10 ? "HIGH" : "MEDIUM",
    sample: windowStats.best.count,
  });
  if (!rows.length) rows.push({
    title: "Keep collecting clean evidence",
    finding: trades.length ? "No repeated failure pattern cleared the minimum evidence threshold today." : "No completed engine trade was available for this session.",
    action: "Preserve the current rules and collect the next completed session before changing entries, exits, or timing.",
    confidence: "LEARNING",
    sample: trades.length,
  });
  return rows.slice(0, 4);
}

function rollingWindowStats(pairs: TradePair[]) {
  const groups = new Map<string, { label: string; wins: number; losses: number }>();
  for (const pair of pairs) {
    const outcome = pair.exit.payload.kind === "exit_target" ? "win" : pair.exit.payload.kind === "invalidated" ? "loss" : null;
    if (!outcome) continue;
    const parts = chicagoParts(pair.entry.payload.eventAt);
    const minutes = parts.hour * 60 + parts.minute;
    const label = minutes < 10 * 60 + 55 ? "Morning window" : minutes >= 12 * 60 + 5 && minutes <= 13 * 60 + 55 ? "Afternoon reload" : "Other window";
    const row = groups.get(label) ?? { label, wins: 0, losses: 0 };
    row[outcome === "win" ? "wins" : "losses"] += 1;
    groups.set(label, row);
  }
  const stats = [...groups.values()].map((row) => ({ ...row, count: row.wins + row.losses, winRate: (row.wins / Math.max(1, row.wins + row.losses)) * 100 }));
  return { best: stats.sort((a, b) => b.winRate - a.winRate || b.count - a.count)[0] ?? null };
}

function buildNextSessionPlan({
  scorecard,
  improvements,
  macro,
  brief,
}: {
  scorecard: DailyIntelligenceSnapshot["scorecard"];
  improvements: DailyIntelligenceSnapshot["improvements"];
  macro: Record<string, unknown> | null;
  brief: Record<string, unknown> | null;
}): DailyIntelligenceSnapshot["nextSession"] {
  const headlines = newsHeadlines(macro);
  const briefHeadline = stringValue(brief?.tldr) ?? stringValue(brief?.brief);
  return {
    headline: scorecard.losses ? "Reset the process. Demand complete proof." : "Carry the process forward, not the outcome.",
    context: briefHeadline?.slice(0, 360) ?? "Live context will populate when the connected Daily Brief and market feeds are available.",
    focus: [
      "Verify SPY and ES sources before reading direction.",
      "Map the nearest control level and confirm there is room to target.",
      improvements[0]?.action ?? "Wait for the full confirmation sequence.",
    ],
    avoid: [
      "Do not let one session silently retune the strategy.",
      "Do not enter from a level without the engine confirmation close.",
      "Do not use estimated option premium when the live chain is unavailable.",
    ],
    newsWatch: headlines.length ? headlines : ["No verified headline feed is available. Treat news risk as unknown, not absent."],
  };
}

async function synthesizeWithAI(input: {
  sessionDate: string;
  scorecard: DailyIntelligenceSnapshot["scorecard"];
  trades: ReviewedTrade[];
  improvements: DailyIntelligenceSnapshot["improvements"];
  nextSession: DailyIntelligenceSnapshot["nextSession"];
  macro: Record<string, unknown> | null;
  brief: Record<string, unknown> | null;
}): Promise<DailyIntelligenceSnapshot["ai"]> {
  const fallback = {
    used: false,
    source: "deterministic",
    headline: input.nextSession.headline,
    review: input.trades.length ? input.trades.map((trade) => trade.lesson).join(" ") : "No completed trade was available to grade.",
    timingLesson: input.improvements[0]?.finding ?? "More completed sessions are required.",
    nextSessionFocus: input.nextSession.focus[0],
    riskRule: "Recommendations remain advisory and never change production rules automatically.",
  };
  const provider = aiProvider();
  if (!provider) return fallback;
  const prompt = JSON.stringify({
    instruction: "Review only the supplied evidence. Do not invent news, trades, prices, causes, or probabilities. Do not promise profitability. A single day may suggest research but may not justify a production rule change. Return JSON with headline, review, timingLesson, nextSessionFocus, and riskRule. Each value must be plain English and under 220 characters.",
    sessionDate: input.sessionDate,
    scorecard: input.scorecard,
    trades: input.trades,
    improvements: input.improvements,
    nextSession: input.nextSession,
    news: newsHeadlines(input.macro),
    currentBrief: stringValue(input.brief?.tldr) ?? null,
  });
  const text = await callAI(provider, prompt).catch(() => null);
  const parsed = parseAiJson(text);
  return parsed ? { used: true, source: provider.name, ...parsed } : fallback;
}

function aiProvider(): { name: string; url: string; key: string; model: string; responses: boolean } | null {
  const deepseek = process.env.DEEPSEEK_API_KEY?.trim() || process.env.SPYPROPHET?.trim();
  if (deepseek) return { name: "deepseek", url: process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions", key: deepseek, model: process.env.DEEPSEEK_MODEL || "deepseek-chat", responses: false };
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) return { name: "openai", url: process.env.OPENAI_RESPONSES_API_URL || "https://api.openai.com/v1/responses", key: openai, model: process.env.OPENAI_MODEL || "gpt-4.1-mini", responses: true };
  return null;
}

async function callAI(provider: NonNullable<ReturnType<typeof aiProvider>>, prompt: string): Promise<string | null> {
  const body = provider.responses
    ? { model: provider.model, instructions: "You are SPY Prophet Review AI, an evidence-bound trading process reviewer.", input: prompt, max_output_tokens: 700 }
    : { model: provider.model, messages: [{ role: "system", content: "You are SPY Prophet Review AI, an evidence-bound trading process reviewer." }, { role: "user", content: prompt }], temperature: 0.1, max_tokens: 700 };
  const response = await fetch(provider.url, { method: "POST", headers: { authorization: `Bearer ${provider.key}`, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(14_000) });
  if (!response.ok) return null;
  const json = await response.json() as Record<string, unknown>;
  if (provider.responses) {
    if (typeof json.output_text === "string") return json.output_text;
    const output = Array.isArray(json.output) ? json.output : [];
    for (const item of output) for (const part of Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : []) if (typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    return null;
  }
  const choices = Array.isArray(json.choices) ? json.choices : [];
  return stringValue((choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content);
}

function parseAiJson(text: string | null): Omit<DailyIntelligenceSnapshot["ai"], "used" | "source"> | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const value = JSON.parse(cleaned) as Record<string, unknown>;
    const keys = ["headline", "review", "timingLesson", "nextSessionFocus", "riskRule"] as const;
    if (!keys.every((key) => typeof value[key] === "string" && String(value[key]).trim())) return null;
    return Object.fromEntries(keys.map((key) => [key, String(value[key]).slice(0, 240)])) as Omit<DailyIntelligenceSnapshot["ai"], "used" | "source">;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(18_000) });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

function newsHeadlines(macro: Record<string, unknown> | null): string[] {
  const news = macro?.news && typeof macro.news === "object" ? macro.news as Record<string, unknown> : null;
  const rows = Array.isArray(news?.items) ? news.items : Array.isArray(news?.headlines) ? news.headlines : [];
  return rows.map((row) => typeof row === "string" ? row : stringValue((row as Record<string, unknown>)?.headline) ?? stringValue((row as Record<string, unknown>)?.title) ?? "").filter(Boolean).slice(0, 5);
}

function nestedString(value: Record<string, unknown> | null, path: string[]): string | null {
  let cursor: unknown = value;
  for (const key of path) cursor = cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>)[key] : null;
  return stringValue(cursor);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validDate(value?: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function latestCompletedDate(pairs: TradePair[]): string | null {
  const last = pairs.at(-1);
  return last ? chicagoDate(last.entry.payload.eventAt) : null;
}

function previousWeekday(): string {
  const date = new Date();
  do date.setUTCDate(date.getUTCDate() - 1); while ([0, 6].includes(date.getUTCDay()));
  return chicagoDate(date.toISOString());
}

function chicagoDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function chicagoParts(value: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CT, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(value));
  return { hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0), minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0) };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

async function rememberSnapshot(snapshot: DailyIntelligenceSnapshot): Promise<void> {
  if (!redisConfigured()) return;
  const key = `${MEMORY_PREFIX}${snapshot.sessionDate}`;
  await redisPipeline([
    ["SET", key, JSON.stringify(snapshot), "EX", String(120 * 24 * 60 * 60)],
    ["ZADD", MEMORY_REGISTRY, String(Date.parse(snapshot.asOf)), snapshot.sessionDate],
    ["ZREMRANGEBYRANK", MEMORY_REGISTRY, "0", "-121"],
  ]);
}

async function redisPipeline(commands: string[][]): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return;
  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(commands), cache: "no-store" });
  if (!response.ok) throw new Error(`Review memory returned HTTP ${response.status}.`);
}
