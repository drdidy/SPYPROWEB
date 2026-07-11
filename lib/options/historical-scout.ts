import type { SPXSnapshot } from "@/lib/types";

export type HistoricalScoutSession = {
  date: string;
  room: string;
  verdict: "CALL_EDGE" | "PUT_EDGE" | "NO_CLEAN_ENTRY" | "INCOMPLETE";
  entryLine: string | null;
  entryValue: number | null;
  targetLine: string | null;
  targetValue: number | null;
  entryTime: string | null;
  targetHit: boolean;
  moveCaptured: number | null;
  note: string;
};

export type HistoricalScoutSnapshot = {
  asOf: string;
  sessions: HistoricalScoutSession[];
  summary: {
    reviewed: number;
    cleanEntries: number;
    targetHits: number;
    hitRate: number | null;
    callEdges: number;
    putEdges: number;
    tomorrowRead: string;
  };
};

type IntradayBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
};

type IntradayResponse = {
  es?: IntradayBar[];
  error?: string;
};

type Line = {
  label: string;
  value: number;
  index: number;
};

const CT_ZONE = "America/Chicago";
const NYSE_HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);

export async function buildHistoricalOptionScout({
  origin,
  lookback = 5,
}: {
  origin: string;
  lookback?: number;
}): Promise<HistoricalScoutSnapshot> {
  const dates = recentTradingDates(new Date(), lookback);
  const sessions = (
    await Promise.all(dates.map((date) => analyzeSession(origin, date).catch(() => null)))
  ).filter((item): item is HistoricalScoutSession => item !== null);
  const cleanEntries = sessions.filter((session) => session.verdict !== "NO_CLEAN_ENTRY" && session.verdict !== "INCOMPLETE");
  const targetHits = cleanEntries.filter((session) => session.targetHit).length;
  const callEdges = cleanEntries.filter((session) => session.verdict === "CALL_EDGE").length;
  const putEdges = cleanEntries.filter((session) => session.verdict === "PUT_EDGE").length;
  const hitRate = cleanEntries.length ? Math.round((targetHits / cleanEntries.length) * 100) : null;

  return {
    asOf: new Date().toISOString(),
    sessions,
    summary: {
      reviewed: sessions.length,
      cleanEntries: cleanEntries.length,
      targetHits,
      hitRate,
      callEdges,
      putEdges,
      tomorrowRead: tomorrowRead({ cleanEntries: cleanEntries.length, targetHits, callEdges, putEdges }),
    },
  };
}

async function analyzeSession(origin: string, date: string): Promise<HistoricalScoutSession> {
  const [snap, intraday] = await Promise.all([
    fetchJson<SPXSnapshot>(`${origin}/api/spx/snapshot?date=${date}`),
    fetchJson<IntradayResponse>(`${origin}/api/replay/intraday?date=${date}`),
  ]);
  const fan = snap.descendingDeviationFan;
  const bars = (intraday.es ?? []).filter((bar) => isBetweenCt(bar.t, "09:00", "14:00"));
  if (!fan || bars.length < 6) {
    return incomplete(date, "Not enough replay bars were available for this session.");
  }
  const nineBar = bars.find((bar) => isAtOrAfterCt(bar.t, "09:00")) ?? bars[0];
  if (!nineBar) return incomplete(date, "No 9 AM replay bar was available.");

  const lines = fan.lines
    .map((line) => ({ label: line.label, value: line.value, index: line.index }))
    .sort((a, b) => a.value - b.value);
  const room = roomForPrice(lines, nineBar.c);
  if (!room) {
    return incomplete(date, "The 9 AM price was outside the available gate map.");
  }

  const primaryBars = bars.filter((bar) => isBetweenCt(bar.t, "09:00", "12:00"));
  const call = findGateEntry(primaryBars, room.lower, room.upper, "CALL");
  const put = findGateEntry(primaryBars, room.upper, room.lower, "PUT");
  const chosen = chooseEntry(call, put);
  if (!chosen) {
    return {
      date,
      room: `${room.lower.label} to ${room.upper.label}`,
      verdict: "NO_CLEAN_ENTRY",
      entryLine: null,
      entryValue: null,
      targetLine: null,
      targetValue: null,
      entryTime: null,
      targetHit: false,
      moveCaptured: null,
      note: "No clean primary-window gate rejection appeared.",
    };
  }

  const forward = bars.filter((bar) => Date.parse(bar.t) >= Date.parse(chosen.bar.t));
  const targetHit = chosen.side === "CALL"
    ? forward.some((bar) => bar.h >= chosen.target.value)
    : forward.some((bar) => bar.l <= chosen.target.value);
  const moveCaptured = chosen.side === "CALL"
    ? Math.max(...forward.map((bar) => bar.h)) - chosen.entry.value
    : chosen.entry.value - Math.min(...forward.map((bar) => bar.l));

  return {
    date,
    room: `${room.lower.label} to ${room.upper.label}`,
    verdict: chosen.side === "CALL" ? "CALL_EDGE" : "PUT_EDGE",
    entryLine: chosen.entry.label,
    entryValue: roundQuarter(chosen.entry.value),
    targetLine: chosen.target.label,
    targetValue: roundQuarter(chosen.target.value),
    entryTime: chosen.bar.t,
    targetHit,
    moveCaptured: roundQuarter(moveCaptured),
    note: targetHit
      ? "The first clean edge reached the opposite gate."
      : "The edge appeared, but the opposite gate was not reached before the review window closed.",
  };
}

function findGateEntry(
  bars: IntradayBar[],
  entry: Line,
  target: Line,
  side: "CALL" | "PUT",
): { side: "CALL" | "PUT"; entry: Line; target: Line; bar: IntradayBar } | null {
  for (const bar of bars) {
    const touched = bar.l <= entry.value && bar.h >= entry.value;
    if (!touched) continue;
    if (side === "CALL" && bar.c >= entry.value) {
      return { side, entry, target, bar };
    }
    if (side === "PUT" && bar.c <= entry.value) {
      return { side, entry, target, bar };
    }
  }
  return null;
}

function chooseEntry(
  call: ReturnType<typeof findGateEntry>,
  put: ReturnType<typeof findGateEntry>,
): NonNullable<ReturnType<typeof findGateEntry>> | null {
  if (call && put) {
    return Date.parse(call.bar.t) <= Date.parse(put.bar.t) ? call : put;
  }
  return call ?? put;
}

function roomForPrice(lines: Line[], price: number): { lower: Line; upper: Line } | null {
  for (let i = 0; i < lines.length - 1; i += 1) {
    const lower = lines[i];
    const upper = lines[i + 1];
    if (price >= lower.value && price <= upper.value) {
      return { lower, upper };
    }
  }
  const below = lines[0];
  const above = lines.at(-1);
  if (!below || !above) return null;
  if (price < below.value) return { lower: below, upper: lines[1] ?? below };
  return { lower: lines.at(-2) ?? above, upper: above };
}

function recentTradingDates(now: Date, count: number): string[] {
  const cursor = new Date(now);
  const out: string[] = [];
  while (out.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const key = cursor.toISOString().slice(0, 10);
    if (isTradingDate(key)) out.push(key);
  }
  return out;
}

function isTradingDate(key: string): boolean {
  const date = new Date(`${key}T12:00:00Z`);
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !NYSE_HOLIDAYS_2026.has(key);
}

function isBetweenCt(iso: string, start: string, end: string): boolean {
  const mins = ctMinutes(iso);
  return mins >= parseWall(start) && mins <= parseWall(end);
}

function isAtOrAfterCt(iso: string, wall: string): boolean {
  return ctMinutes(iso) >= parseWall(wall);
}

function ctMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value);
}

function parseWall(wall: string): number {
  const [hour, minute] = wall.split(":").map(Number);
  return hour * 60 + minute;
}

function tomorrowRead(input: {
  cleanEntries: number;
  targetHits: number;
  callEdges: number;
  putEdges: number;
}): string {
  if (input.cleanEntries < 2) {
    return "Too little recent evidence. Use the live Control Map and keep premium size conservative.";
  }
  const hitRate = input.targetHits / input.cleanEntries;
  const edge = input.callEdges > input.putEdges ? "buy-bottom" : input.putEdges > input.callEdges ? "sell-top" : "balanced";
  if (hitRate >= 0.7) {
    return `Recent maps favored ${edge} execution. Tomorrow, prioritize the first clean gate reaction and avoid late chases.`;
  }
  return `Recent maps were mixed. Tomorrow, require a cleaner close at the gate and let the option momentum confirm before entry.`;
}

function incomplete(date: string, note: string): HistoricalScoutSession {
  return {
    date,
    room: "Unavailable",
    verdict: "INCOMPLETE",
    entryLine: null,
    entryValue: null,
    targetLine: null,
    targetValue: null,
    entryTime: null,
    targetHit: false,
    moveCaptured: null,
    note,
  };
}

function roundQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

async function fetchJson<T>(target: string): Promise<T> {
  const headers: HeadersInit = {};
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
    headers["x-vercel-set-bypass-cookie"] = "samesitenone";
  }
  const res = await fetch(target, { cache: "no-store", headers });
  if (!res.ok) throw new Error(`${target} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}
