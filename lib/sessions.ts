// Per-engine session calendar. Drives every "what state is the engine
// in?" decision on the slate. Pure / deterministic — takes `now` as a
// parameter so we can test with mocked dates and so SSR can pin a
// stable value.
//
// Two engines, two configuration windows, both feeding the same RTH:
//
//   SPX engine — observes ES futures during overnight 17:00 → 02:00 CT
//                relative to the *upcoming* trading day. (Sun 17:00 →
//                Mon 02:00 plots Monday; Mon 17:00 → Tue 02:00 plots
//                Tuesday; etc.) The "previous-evening" anchor walks
//                back over weekends and holidays so a Mon trading day
//                always anchors to Sun 17:00.
//
//   SPY engine — observes premarket SPY during 03:00 → 07:00 CT of
//                the trading day itself.
//
// Both use NYSE RTH 08:30 → 15:00 CT (12:00 CT on early-close days).
// All Date math goes through Chicago wall-clock helpers so DST flips
// don't break the windows.

export type Engine = "SPY" | "SPX";

export type SessionPhase =
  | "PRE_CONFIG"
  | "CONFIG_WINDOW"
  | "POST_CONFIG"
  | "RTH_OPEN"
  | "POST_RTH"
  | "CLOSED_WEEKEND"
  | "CLOSED_HOLIDAY";

export interface SessionInfo {
  engine: Engine;
  phase: SessionPhase;
  /** Start of the relevant config window (the one we're in or the next one). */
  configWindowStart: Date;
  /** End of the same config window. */
  configWindowEnd: Date;
  /** RTH open of the trading day this config window plots for. */
  rthOpen: Date;
  /** RTH close of the same trading day. */
  rthClose: Date;
  /** Whatever transition the user is waiting on right now. */
  nextSignificantEvent: { label: string; at: Date };
}

// 2026 NYSE full-day holidays. TODO: replace with calendar API.
const HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Jr Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed; Jul 4 is Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
]);

// 2026 NYSE early-close days (12:00 CT close = 13:00 ET).
//   - Day before Independence Day (Jul 2)
//   - Day after Thanksgiving / Black Friday (Nov 27)
//   - Christmas Eve (Dec 24)
const EARLY_CLOSE_2026: ReadonlySet<string> = new Set([
  "2026-07-02",
  "2026-11-27",
  "2026-12-24",
]);

const RTH_OPEN_H = 8;
const RTH_OPEN_M = 30;
const RTH_CLOSE_H = 15;
const RTH_CLOSE_M = 0;
const EARLY_CLOSE_H = 12;

const SPY_CONFIG_START_H = 3; // 03:00 CT (trading day)
const SPY_CONFIG_END_H = 7; //   07:00 CT (trading day)
const SPX_CONFIG_START_H = 17; // 17:00 CT (previous calendar day)
const SPX_CONFIG_END_H = 2; //    02:00 CT (trading day)

// ---------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------

export function getSessionInfo(engine: Engine, now: Date): SessionInfo {
  const tradingDay = nextOrCurrentTradingDay(now);
  const earlyClose = EARLY_CLOSE_2026.has(tradingDay.iso);
  const rthOpen = chicagoDateAt(tradingDay.year, tradingDay.month, tradingDay.day, RTH_OPEN_H, RTH_OPEN_M);
  const rthClose = chicagoDateAt(
    tradingDay.year,
    tradingDay.month,
    tradingDay.day,
    earlyClose ? EARLY_CLOSE_H : RTH_CLOSE_H,
    RTH_CLOSE_M,
  );

  let configWindowStart: Date;
  let configWindowEnd: Date;
  if (engine === "SPY") {
    configWindowStart = chicagoDateAt(
      tradingDay.year,
      tradingDay.month,
      tradingDay.day,
      SPY_CONFIG_START_H,
      0,
    );
    configWindowEnd = chicagoDateAt(
      tradingDay.year,
      tradingDay.month,
      tradingDay.day,
      SPY_CONFIG_END_H,
      0,
    );
  } else {
    // SPX: previous *calendar* day at 17:00 CT through trading day at
    // 02:00 CT. Previous calendar day even if non-trading (Sun before
    // Mon trading day is correct).
    const prevCal = previousCalendarDay(tradingDay);
    configWindowStart = chicagoDateAt(prevCal.year, prevCal.month, prevCal.day, SPX_CONFIG_START_H, 0);
    configWindowEnd = chicagoDateAt(tradingDay.year, tradingDay.month, tradingDay.day, SPX_CONFIG_END_H, 0);
  }

  const nowMs = now.getTime();
  const todayKey = chicagoDateKey(now);
  const todayDow = chicagoDayOfWeek(now);
  const isWeekend = todayDow === 0 || todayDow === 6;
  const isHoliday = HOLIDAYS_2026.has(todayKey);

  // Phase resolution. Weekend / holiday short-circuits dominate, then
  // we run the standard pre/config/post chain for trading-day cycles.
  // POST_RTH is only meaningful while we're still on the same CT
  // calendar day as today's close — once the calendar rolls into the
  // next morning we're in PRE_CONFIG for the upcoming session, not
  // lingering after yesterday's. This keeps the Mon-02:30 (post a Fri
  // close) and Tue-02:30 (post a Mon close) cases honest as PRE_CONFIG.
  const previousClose = previousTradingDayCloseMs(now);
  const sameCalendarDayAsClose =
    previousClose !== null &&
    chicagoDateKey(new Date(previousClose)) === todayKey;
  const inPostRthGap =
    previousClose !== null &&
    previousClose < nowMs &&
    nowMs < configWindowStart.getTime() &&
    sameCalendarDayAsClose;

  let phase: SessionPhase;
  if (isHoliday) {
    phase = "CLOSED_HOLIDAY";
  } else if (isWeekend) {
    if (engine === "SPX" && nowMs >= configWindowStart.getTime()) {
      // Sunday after 17:00 CT — SPX's config window has opened.
      phase = nowMs < configWindowEnd.getTime() ? "CONFIG_WINDOW" : "POST_CONFIG";
    } else {
      phase = "CLOSED_WEEKEND";
    }
  } else if (nowMs < configWindowStart.getTime()) {
    phase = inPostRthGap ? "POST_RTH" : "PRE_CONFIG";
  } else if (nowMs < configWindowEnd.getTime()) {
    phase = "CONFIG_WINDOW";
  } else if (nowMs < rthOpen.getTime()) {
    phase = "POST_CONFIG";
  } else if (nowMs < rthClose.getTime()) {
    phase = "RTH_OPEN";
  } else {
    phase = "POST_RTH";
  }

  const next = nextEvent(
    phase,
    engine,
    configWindowStart,
    configWindowEnd,
    rthOpen,
    rthClose,
  );

  return {
    engine,
    phase,
    configWindowStart,
    configWindowEnd,
    rthOpen,
    rthClose,
    nextSignificantEvent: next,
  };
}

function nextEvent(
  phase: SessionPhase,
  engine: Engine,
  configStart: Date,
  configEnd: Date,
  rthOpen: Date,
  rthClose: Date,
): { label: string; at: Date } {
  switch (phase) {
    case "CONFIG_WINDOW":
      return { label: "Config window closes", at: configEnd };
    case "POST_CONFIG":
      return { label: "RTH opens", at: rthOpen };
    case "RTH_OPEN":
      return { label: "RTH closes", at: rthClose };
    case "PRE_CONFIG":
    case "CLOSED_WEEKEND":
    case "CLOSED_HOLIDAY":
      return { label: `${engine} setup opens`, at: configStart };
    case "POST_RTH":
      // The trading-day picker has already rolled forward to the next
      // session, so configStart here is the *next* engine cycle's
      // window opening. No recursion needed.
      return { label: `${engine} setup opens`, at: configStart };
  }
}

// ---------------------------------------------------------------------
// Trading-day resolution
// ---------------------------------------------------------------------

interface DayKey {
  year: number;
  month: number; // 1-12
  day: number;
  iso: string; // YYYY-MM-DD
  weekday: number; // 0 Sun .. 6 Sat
}

/** First trading day whose RTH close is still in the future. */
function nextOrCurrentTradingDay(now: Date): DayKey {
  const today = chicagoDayKey(now);
  for (let offset = 0; offset < 14; offset++) {
    const candidate = addDays(today, offset);
    if (!isTradingDay(candidate)) continue;
    const earlyClose = EARLY_CLOSE_2026.has(candidate.iso);
    const closeMs = chicagoDateAt(
      candidate.year,
      candidate.month,
      candidate.day,
      earlyClose ? EARLY_CLOSE_H : RTH_CLOSE_H,
      RTH_CLOSE_M,
    ).getTime();
    if (closeMs > now.getTime()) return candidate;
  }
  return today;
}

/**
 * Most recent trading-day close that's strictly before `now`. Returns
 * null when no qualifying close exists in the recent past (within 14
 * days). Used to detect the post-RTH gap.
 */
function previousTradingDayCloseMs(now: Date): number | null {
  const today = chicagoDayKey(now);
  for (let offset = 0; offset < 14; offset++) {
    const candidate = addDays(today, -offset);
    if (!isTradingDay(candidate)) continue;
    const earlyClose = EARLY_CLOSE_2026.has(candidate.iso);
    const closeMs = chicagoDateAt(
      candidate.year,
      candidate.month,
      candidate.day,
      earlyClose ? EARLY_CLOSE_H : RTH_CLOSE_H,
      RTH_CLOSE_M,
    ).getTime();
    if (closeMs < now.getTime()) return closeMs;
  }
  return null;
}

function isTradingDay(d: DayKey): boolean {
  if (d.weekday === 0 || d.weekday === 6) return false;
  if (HOLIDAYS_2026.has(d.iso)) return false;
  return true;
}

function previousCalendarDay(d: DayKey): DayKey {
  return addDays(d, -1);
}

function addDays(d: DayKey, n: number): DayKey {
  const base = Date.UTC(d.year, d.month - 1, d.day, 12, 0, 0);
  const next = new Date(base + n * 86_400_000);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    iso: isoDate(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    ),
    weekday: next.getUTCDay(),
  };
}

// ---------------------------------------------------------------------
// Chicago wall-clock helpers
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

function chicagoDayKey(d: Date): DayKey {
  const p = chicagoParts(d);
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    iso: isoDate(p.year, p.month, p.day),
    weekday: chicagoDayOfWeek(d),
  };
}

function chicagoDateKey(d: Date): string {
  const p = chicagoParts(d);
  return isoDate(p.year, p.month, p.day);
}

function chicagoDayOfWeek(d: Date): number {
  const p = chicagoParts(d);
  const noonCt = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0));
  return noonCt.getUTCDay();
}

/** Build a Date for "year-month-day HH:MM in America/Chicago". */
function chicagoDateAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // Probe Chicago's offset at noon-CT on the same date — avoids the
  // once-a-year ambiguous hour at DST end.
  const probe = new Date(Date.UTC(year, month - 1, day, 17, 0));
  const offsetMin = chicagoOffsetMin(probe);
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(wallUtc - offsetMin * 60_000);
}

function chicagoOffsetMin(d: Date): number {
  const p = chicagoParts(d);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((wallAsUtc - d.getTime()) / 60_000);
}

function isoDate(y: number, m: number, day: number): string {
  return (
    `${y.toString().padStart(4, "0")}-` +
    `${m.toString().padStart(2, "0")}-` +
    `${day.toString().padStart(2, "0")}`
  );
}

// ---------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------

/**
 * Best single string for the TopBar's session segment given both
 * engines' status. Reflects whichever event is sooner: a SPY-only
 * morning will show SPY, a Sunday afternoon will show "SPX setup
 * opens Sun 17:00 CT", and during RTH it shows "RTH OPEN · closes in".
 */
export function renderSessionSegment(
  spy: SessionInfo,
  spx: SessionInfo,
  now: Date,
): string {
  // Inside RTH for either engine: RTH OPEN dominates.
  if (spy.phase === "RTH_OPEN" || spx.phase === "RTH_OPEN") {
    const target = spy.phase === "RTH_OPEN" ? spy : spx;
    return `RTH OPEN · closes in ${formatRel(target.rthClose, now)}`;
  }
  // Otherwise show the earliest next event by absolute time.
  const events = [spy, spx].sort(
    (a, b) =>
      a.nextSignificantEvent.at.getTime() - b.nextSignificantEvent.at.getTime(),
  );
  const lead = events[0];
  return `${lead.nextSignificantEvent.label} ${formatAbsolute(lead.nextSignificantEvent.at)}`;
}

export function formatRelToNow(target: Date, now: Date): string {
  return formatRel(target, now);
}

function formatRel(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "now";
  const totalMin = Math.floor(diff / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAbsolute(d: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return dtf.format(d) + " CT";
}

/** "Mon 03:00–07:00 CT" — used in the PRE_CONFIG card body. */
export function formatConfigWindow(s: SessionInfo): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(s.configWindowStart);
  const hm = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  return `${day} ${hm(s.configWindowStart)}–${hm(s.configWindowEnd)} CT`;
}
