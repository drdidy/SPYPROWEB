// Plain-text copy used by the Decision Slate. Centralized so non-
// engineers can tweak strings without touching component code.
//
// Voice rule (slate refinement, 2026-05): calm, expert, plain English.
// No developer-facing jargon ("integration pending", "exposes a hook"),
// no code-style identifiers in user copy. Acronyms get an InfoTooltip.
//
// Keep keys stable for future i18n extraction. Prefer nested,
// domain-specific names such as `preConfig.watchAtOpen` over arrays of
// anonymous strings.

export const SLATE_COPY = {
  // ---- Card subtitles ----
  spySubtitle: "Bias is the directional lean from the overnight and premarket sessions.",
  spxSubtitle:
    "Channel is the overnight envelope. It forms on the first qualifying pivot.",

  // ---- Metric tooltips ----
  metric: {
    conviction: {
      spy: "1–5 score for setup quality. Combines bias strength, signal grade, and risk-reward.",
      spx: "0–100 confluence score. Combines Asian-session direction, London bias, and reaction strength at qualified levels.",
    },
    bias: "Directional lean from the overnight session and premarket flow. Bullish, bearish, or neutral.",
    channel:
      "Direction of the overnight envelope. Forms on the first qualifying pivot; before that it reads not yet formed.",
    grade:
      "Letter grade assigned after the trigger fires. A+, A, B+, B, C, D, or no-trade.",
  },

  // ---- Empty-state examples ----
  metricExample: {
    conviction: "e.g. 3/5",
    convictionSpx: "e.g. 73/100",
    bias: "e.g. bullish",
    channel: "e.g. ascending",
    grade: "e.g. B+",
  },

  // ---- Helper copy under empty metric slots ----
  metricEmptyHelper: {
    conviction: "Populates at setup",
    bias: "Populates at setup",
    channel: "Forms at first overnight pivot",
    grade: "Assigned after the trigger fires",
  },

  // ---- Structure card empty states ----
  // Single sentence each — the prior three-clause format read as a
  // log line, not a sentence.
  structureEmpty: {
    spy: "No active levels yet. SPY's primary lines plot during the 03:00–07:00 CT premarket window.",
    spx: "No active levels yet. SPX's channel resolves on the first qualifying overnight pivot during 17:00–02:00 CT.",
  },

  // ---- PRE-CONFIG briefing ----
  preConfig: {
    title: "Markets quiet",
    body: "Both engines are between sessions. Bias, conviction, grade, and active levels populate once the next setup window opens.",
    // No more "Daily Brief integration pending" — end-user copy.
    watchAtOpen:
      "What to watch at the open will appear here once the daily brief publishes (around 06:30 CT).",
  },

  // ---- Track-record copy ----
  trackRecord: {
    legend: "W · L · skip",
    legendTooltip:
      "Each dot is one session. Green is a winning trade, red is a losing trade, faint is a session the engine watched without trading.",
    noGraded: "No graded sessions yet",
    rangeLabel: (n: number) => `Last ${n}`,
    skipLabel: (n: number) => (n === 1 ? "1 skip" : `${n} skips`),
    skipTooltip:
      "A skip means the engine watched the session but no qualified setup formed.",
    verifyCta: "Open replay",
    watchedNoTrade: "Watched only — no trade taken yesterday.",
  },

  // ---- A11y ----
  a11y: {
    noValueYet: "Populates at setup",
  },

  // ---- Search palette example queries ----
  searchExamples: [
    "spy 5m levels",
    "spx overnight pivot",
    "last go signal",
    "grade history",
  ],

  // ---- Page header help-affordance content ----
  helpAboutSlate: {
    title: "About the Decision Slate",
    body:
      "The Decision Slate is your daily 'should I trade?' command center. " +
      "Each engine — SPY (intraday premarket) and SPX (overnight channel) — " +
      "moves through a fixed pipeline: Pre-config → Stand down → Watch → " +
      "Wait → Armed → Go → Cooldown. The page tells you what state each " +
      "engine is in, why, what to watch for, and how the engine has been performing recently.",
  },
} as const;
