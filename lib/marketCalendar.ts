// US equity market calendar — single source of truth for whether the
// market is open, and when it opens next. Drives the TopBar session
// status string. NYSE schedule (matches CME equity-future RTH).
//
// 2026 holidays + early-close days hardcoded below. Add a TODO to
// swap in a calendar API when the project graduates beyond a single
// year of operating runway. Other years return naive weekend logic.

export type SessionState =
  | "PRE_MARKET"
  | "RTH_OPEN"
  | "POST_MARKET"
  | "CLOSED_WEEKEND"
  | "CLOSED_HOLIDAY";

export interface SessionStatus {
  state: SessionState;
  /** ISO date of next regular open (e.g. "2026-05-11"). */
  nextOpenDate: string;
  /** Wall-clock time of next open in CT, e.g. "08:30". */
  nextOpenTime: string;
  /** ms until the relevant transition (open / close / next open). */
  msUntilTransition: number;
  /** Optional human label for the next open day, e.g. "Mon". */
  nextOpenWeekday: string;
  /** RTH close wall-clock for today in CT (15:00 normally, 13:00 on early closes). */
  rthCloseTime: string;
}

// 2026 NYSE full-day holidays. Format: YYYY-MM-DD.
// TODO(2027+): pull from a calendar feed (e.g. nyse-holidays npm
// package or a small worker). Hardcoded for now to avoid runtime
// uncertainty and drift between dev / prod.
const HOLIDAYS_2026: Set<string> = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Jr Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed; July 4 is Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
]);

// 2026 early-close days (1:00 PM ET = 12:00 CT close).
const EARLY_CLOSE_2026: Set<string> = new Set([
  "2026-07-02", // Day before Independence Day
  "2026-11-27", // Day after Thanksgiving (Black Friday)
  "2026-12-24", // Christmas Eve
]);

const RTH_OPEN_HOUR = 8;
const RTH_OPEN_MIN = 30;
const RTH_CLOSE_HOUR = 15;
const RTH_CLOSE_MIN = 0;
const EARLY_CLOSE_HOUR = 12;
const EARLY_CLOSE_MIN = 0;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Compute the current market session status.
 *
 * `now` defaults to wall-clock time. Pass a fixed Date in tests.
 */
export function getSessionStatus(now: Date = new Date()): SessionStatus {
  const ct = chicagoParts(now);
  const todayKey = isoDate(ct.year, ct.month, ct.day);
  const todayDow = chicagoDayOfWeek(now);
  const isWeekend = todayDow === 0 || todayDow === 6;
  const isHoliday = HOLIDAYS_2026.has(todayKey);
  const isEarlyClose = EARLY_CLOSE_2026.has(todayKey);

  const closeHour = isEarlyClose ? EARLY_CLOSE_HOUR : RTH_CLOSE_HOUR;
  const closeMin = isEarlyClose ? EARLY_CLOSE_MIN : RTH_CLOSE_MIN;
  const rthCloseTime = formatHM(closeHour, closeMin);

  // All comparisons in absolute UTC ms — chicagoAt resolves the CT
  // wall-clock time to a UTC instant, and now.getTime() is also UTC.
  const nowMs = now.getTime();
  const todayOpenMs = chicagoAt(now, RTH_OPEN_HOUR, RTH_OPEN_MIN);
  const todayCloseMs = chicagoAt(now, closeHour, closeMin);

  // Closed-weekend / holiday short-circuits everything.
  if (isWeekend || isHoliday) {
    const nextOpen = nextTradingDay(now);
    return {
      state: isWeekend ? "CLOSED_WEEKEND" : "CLOSED_HOLIDAY",
      nextOpenDate: nextOpen.iso,
      nextOpenTime: formatHM(RTH_OPEN_HOUR, RTH_OPEN_MIN),
      nextOpenWeekday: WEEKDAY_SHORT[nextOpen.weekday],
      msUntilTransition: nextOpen.openMs - nowMs,
      rthCloseTime,
    };
  }

  // Trading day.
  if (nowMs < todayOpenMs) {
    return {
      state: "PRE_MARKET",
      nextOpenDate: todayKey,
      nextOpenTime: formatHM(RTH_OPEN_HOUR, RTH_OPEN_MIN),
      nextOpenWeekday: WEEKDAY_SHORT[todayDow],
      msUntilTransition: todayOpenMs - nowMs,
      rthCloseTime,
    };
  }
  if (nowMs < todayCloseMs) {
    return {
      state: "RTH_OPEN",
      nextOpenDate: todayKey,
      nextOpenTime: formatHM(RTH_OPEN_HOUR, RTH_OPEN_MIN),
      nextOpenWeekday: WEEKDAY_SHORT[todayDow],
      msUntilTransition: todayCloseMs - nowMs,
      rthCloseTime,
    };
  }
  // After close — show next trading day's open.
  const nextOpen = nextTradingDay(now);
  return {
    state: "POST_MARKET",
    nextOpenDate: nextOpen.iso,
    nextOpenTime: formatHM(RTH_OPEN_HOUR, RTH_OPEN_MIN),
    nextOpenWeekday: WEEKDAY_SHORT[nextOpen.weekday],
    msUntilTransition: nextOpen.openMs - nowMs,
    rthCloseTime,
  };
}

/** Human label for the TopBar based on session state. */
export function sessionLabel(status: SessionStatus): {
  label: string;
  detail: string;
} {
  switch (status.state) {
    case "RTH_OPEN":
      return {
        label: "RTH OPEN",
        detail: `closes in ${formatDuration(status.msUntilTransition)}`,
      };
    case "PRE_MARKET":
      return {
        label: "PRE-MARKET",
        detail: `opens in ${formatDuration(status.msUntilTransition)}`,
      };
    case "POST_MARKET":
      return {
        label: "POST-MARKET",
        detail: `opens ${status.nextOpenWeekday} ${status.nextOpenTime} CT`,
      };
    case "CLOSED_WEEKEND":
    case "CLOSED_HOLIDAY":
      return {
        label: "MARKETS CLOSED",
        detail: `opens ${status.nextOpenWeekday} ${status.nextOpenTime} CT`,
      };
  }
}

// ---------------------------------------------------------------------
// Internal helpers — Chicago wall-clock arithmetic without dayjs/luxon.
// ---------------------------------------------------------------------

function chicagoParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function chicagoWallMs(d: Date): number {
  const p = chicagoParts(d);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}

function chicagoOffsetMin(d: Date): number {
  return Math.round((chicagoWallMs(d) - d.getTime()) / 60_000);
}

// Return ms-since-epoch for "today HH:MM in America/Chicago" given a
// reference Date (today is the reference's CT date).
function chicagoAt(ref: Date, hour: number, minute: number): number {
  const p = chicagoParts(ref);
  const wallUtc = Date.UTC(p.year, p.month - 1, p.day, hour, minute);
  return wallUtc - chicagoOffsetMin(ref) * 60_000;
}

function chicagoDayOfWeek(d: Date): number {
  // Build a Date at noon CT (avoids DST edge cases) and read getUTCDay
  // since UTC and the noon-CT instant agree on weekday.
  const p = chicagoParts(d);
  const noonCt = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0));
  return noonCt.getUTCDay();
}

function isoDate(y: number, m: number, day: number): string {
  return (
    `${y.toString().padStart(4, "0")}-` +
    `${m.toString().padStart(2, "0")}-` +
    `${day.toString().padStart(2, "0")}`
  );
}

function formatHM(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Walk forward day by day until we land on a non-weekend, non-holiday
// date. Returns its iso date, weekday, and the ms-since-epoch at its
// 08:30 CT open.
function nextTradingDay(ref: Date): {
  iso: string;
  weekday: number;
  openMs: number;
} {
  // Start from "tomorrow CT" so we don't return today even if today's
  // pre-open. Callers handle pre-open via PRE_MARKET branch.
  const p = chicagoParts(ref);
  const cursor = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0));
  for (let i = 0; i < 14; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const cy = cursor.getUTCFullYear();
    const cm = cursor.getUTCMonth() + 1;
    const cd = cursor.getUTCDate();
    const dow = cursor.getUTCDay();
    const iso = isoDate(cy, cm, cd);
    if (dow === 0 || dow === 6) continue;
    if (HOLIDAYS_2026.has(iso)) continue;
    // Compute the 08:30 CT open in absolute ms. Build a synthetic
    // Date for noon on the candidate to derive that day's CT offset.
    const noon = new Date(Date.UTC(cy, cm - 1, cd, 17, 0)); // ~noon CT in summer/winter
    const offsetMin = chicagoOffsetMin(noon);
    const openMs = Date.UTC(cy, cm - 1, cd, RTH_OPEN_HOUR, RTH_OPEN_MIN) - offsetMin * 60_000;
    return { iso, weekday: dow, openMs };
  }
  // Pathological — should never hit.
  return { iso: isoDate(p.year, p.month, p.day), weekday: 1, openMs: ref.getTime() };
}
