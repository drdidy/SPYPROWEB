export type BriefGlossaryTerm = {
  term: string;
  definition: string;
  href?: string;
};

export const briefGlossary: Record<string, BriefGlossaryTerm> = {
  COOLDOWN: {
    term: "Reset",
    definition: "The prior opportunity has finished. Prophet waits for the next clean setup before showing a new action.",
    href: "/learn#cooldown",
  },
  ARMED: {
    term: "Armed",
    definition: "A qualified setup is live. Wait for final confirmation before taking action.",
    href: "/learn#armed",
  },
  WATCHING: {
    term: "Watching",
    definition: "Price is near an important area. No trade is active until confirmation appears.",
  },
  BREACHED: {
    term: "Breached",
    definition: "Price crossed through a key area. Treat the prior read as weakened until structure rebuilds.",
  },
  "INSIDE DESCENDING": {
    term: "Inside Control Map",
    definition: "Price is inside the active map, so direction must be confirmed by the next clean close.",
  },
  ASCENDING: {
    term: "Rising Reference",
    definition: "A backup reference that rises through time. It is context, not a standalone trade signal.",
  },
  "ANCHOR MAIN": {
    term: "Primary Control Line",
    definition: "The main session reference for the current instrument.",
  },
  "ANCHOR UPPER": {
    term: "Primary North Gate",
    definition: "The first important decision area above the Control Line.",
  },
  "BACKUP MAIN": {
    term: "Backup Control Line",
    definition: "A secondary reference kept for context when the primary map is not the nearest useful read.",
  },
  "BACKUP UPPER": {
    term: "Backup North Gate",
    definition: "A secondary upper decision area used for context, exits, or reaction checks.",
  },
  PDH: {
    term: "Previous Day High",
    definition: "The prior regular-session high. Used as context around the active map.",
  },
  PDL: {
    term: "Previous Day Low",
    definition: "The prior regular-session low. Used as context around the active map.",
  },
  "DAY OPEN": {
    term: "Session Open",
    definition: "The regular-session opening price for the current trading day.",
  },
  "PIVOT FAN": {
    term: "ES Control Map",
    definition: "The ES operating map for the session: Control Line, gates, current price, and decision state.",
  },
  "SWING HIGH ASC/DESC": {
    term: "Overnight High Watch",
    definition: "A contextual overnight high that can matter if price returns to that area cleanly.",
  },
  "SWING LOW ASC/DESC": {
    term: "Overnight Low Watch",
    definition: "A contextual overnight low that can matter if price returns to that area cleanly.",
  },
  "TOUCH-WINDOW": {
    term: "Decision Window",
    definition: "The part of the session where a touch can become actionable after confirmation.",
  },
  CONVICTION: {
    term: "Conviction",
    definition: "Prophet's strength read for whether a setup deserves attention.",
  },
  CONFLUENCE: {
    term: "Alignment",
    definition: "A combined read of independent factors that support, oppose, or neutralize the setup.",
  },
  "CONTROL LINE": {
    term: "Control Line",
    definition: "The main decision reference for the session. Gates above and below it frame the plan.",
  },
  "DEVIATION FAN": {
    term: "Gate Map",
    definition: "The session's Control Line with the working gates above and below it.",
  },
  "CHASE GUARD": {
    term: "Chase Guard",
    definition: "A risk filter that blocks entries after price has already moved too far from the trigger area.",
  },
  "OPERATOR READ": {
    term: "Trader Read",
    definition: "The plain-language summary of what matters now and what should happen next.",
  },
  "ANCHOR SLATE": {
    term: "Session References",
    definition: "The primary areas that define the current trading map.",
  },
  "PROCESS RAIL": {
    term: "State Path",
    definition: "The setup sequence from preparation through action, reset, or stand down.",
  },
  "ACTIVE LINE": {
    term: "Active Level",
    definition: "The current decision area that price must respect or reclaim before a trade can qualify.",
  },
  "REJECTION": {
    term: "Rejection",
    definition: "A touch of a decision area followed by a close back away from it, showing that the area held.",
  },
  "RETEST": {
    term: "Retest",
    definition: "A second visit to the same area after confirmation. It only matters while the setup remains valid.",
  },
  "ENTRY WINDOW": {
    term: "Entry Window",
    definition: "The part of the session where fresh entries are allowed.",
  },
  INVALIDATION: {
    term: "Invalidation",
    definition: "The price or condition that says the current plan is no longer valid.",
  },
  "NORTH GATE": {
    term: "North Gate",
    definition: "A decision area above the Control Line.",
  },
  "SOUTH GATE": {
    term: "South Gate",
    definition: "A decision area below the Control Line.",
  },
  "CONTROL ROOM": {
    term: "Control Room",
    definition: "The visual map that shows current price, the Control Line, nearby gates, and the active decision state.",
  },
  "STAND DOWN": {
    term: "Stand Down",
    definition: "No fresh trade should be taken until the next valid setup appears.",
  },
  "TRADE ALLOWED": {
    term: "Trade Allowed",
    definition: "The setup has met the required conditions and is ready for the next execution step.",
  },
  "WAIT FOR SETUP": {
    term: "Wait for Setup",
    definition: "The map is prepared, but price has not produced a qualified entry yet.",
  },
};

export type BriefGlossaryKey = keyof typeof briefGlossary;
