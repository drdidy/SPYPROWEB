export type BriefGlossaryTerm = {
  term: string;
  definition: string;
  href?: string;
};

export const briefGlossary: Record<string, BriefGlossaryTerm> = {
  COOLDOWN: {
    term: "Cooldown",
    definition: "The system is standing down after a completed move until a fresh valid setup appears.",
    href: "/learn#cooldown",
  },
  ARMED: {
    term: "Armed",
    definition: "A setup is active, but the app is still waiting for the required confirmation before action.",
    href: "/learn#armed",
  },
  WATCHING: {
    term: "Watching",
    definition: "A line is close enough to monitor, but it has not produced a confirmed action.",
  },
  BREACHED: {
    term: "Breached",
    definition: "Price moved through a reference line instead of respecting it.",
  },
  "INSIDE DESCENDING": {
    term: "Inside descending",
    definition: "ES is trading inside a descending structural pair, so the next touch must confirm direction.",
  },
  ASCENDING: {
    term: "Ascending",
    definition: "A structure line that rises through time and is judged at the session's active decision time.",
  },
  "ANCHOR MAIN": {
    term: "Anchor main",
    definition: "The primary reference line from the SPY anchor model for the current session.",
  },
  "ANCHOR UPPER": {
    term: "Anchor upper",
    definition: "The upper reference line from the SPY anchor model.",
  },
  "BACKUP MAIN": {
    term: "Backup main",
    definition: "A secondary main reference used when the primary anchor is not the closest useful line.",
  },
  "BACKUP UPPER": {
    term: "Backup upper",
    definition: "A secondary upper reference used for context, exits, or backup reaction checks.",
  },
  PDH: {
    term: "PDH",
    definition: "Previous day high.",
  },
  PDL: {
    term: "PDL",
    definition: "Previous day low.",
  },
  "DAY OPEN": {
    term: "Day open",
    definition: "The regular-session opening price for the current trading day.",
  },
  "PIVOT FAN": {
    term: "Pivot Fan",
    definition: "The ES reference model built from the prior RTH high close and the post-noon RTH low wick.",
  },
  "SWING HIGH ASC/DESC": {
    term: "Swing high asc/desc",
    definition: "The ascending and descending ES lines projected from the overnight swing-high close.",
  },
  "SWING LOW ASC/DESC": {
    term: "Swing low asc/desc",
    definition: "The ascending and descending ES lines projected from the overnight swing-low close.",
  },
  "TOUCH-WINDOW": {
    term: "Touch-window",
    definition: "The session window where a line touch can become an actionable setup after confirmation.",
  },
  GEX: {
    term: "GEX",
    definition: "Gamma exposure, a dealer-position estimate that helps describe whether hedging may amplify or dampen moves.",
  },
  FLIP: {
    term: "Flip",
    definition: "The price area where dealer gamma context is estimated to change sign.",
  },
  PCR: {
    term: "PCR",
    definition: "Put/call ratio, comparing put activity to call activity.",
  },
  "DARK PREMIUM": {
    term: "Dark premium",
    definition: "Estimated dollar value of dark-pool prints included in the options context.",
  },
  "DARK PRINTS": {
    term: "Dark prints",
    definition: "Count of dark-pool prints included in the current options read.",
  },
  "NET PREMIUM": {
    term: "Net premium",
    definition: "Premium-weighted difference between bullish and bearish options flow.",
  },
  CONVICTION: {
    term: "Conviction",
    definition: "The app's internal strength read for whether a setup deserves attention.",
  },
  CONFLUENCE: {
    term: "Confluence",
    definition: "A combined read of multiple independent factors that support or oppose the setup.",
  },
  INVALIDATION: {
    term: "Invalidation",
    definition: "The price or condition that says the current plan is no longer valid.",
  },
};

export type BriefGlossaryKey = keyof typeof briefGlossary;
