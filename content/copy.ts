// Plain-text copy used by the Decision Slate. Centralized so non-
// engineers can tweak strings without touching component code.

export const SLATE_COPY = {
  // ---- Card subtitles ----
  spySubtitle: "Bias = directional lean from overnight + premarket flow.",
  spxSubtitle:
    "Channel = overnight envelope; resolves on first qualifying pivot.",

  // ---- Metric tooltips ----
  metric: {
    conviction: {
      spy: "1–5 scale of setup quality. Sums bias strength, signal grade, and risk-reward into a single number.",
      spx: "0–100 confluence score. Combines Asian-session direction, London bias, and reaction strength at qualified levels.",
    },
    bias: "Directional lean derived from overnight session + premarket flow. BULLISH / BEARISH / NEUTRAL.",
    channel:
      "Overnight envelope direction. Forms on the first qualifying pivot; before that it reads 'not yet formed'.",
    grade: "Letter grade assigned post-trigger. A+/A/B+/B/C/D / NO_TRADE.",
  },

  // ---- Empty-state examples ----
  metricExample: {
    conviction: "e.g. 3/5",
    convictionSpx: "e.g. 73/100",
    bias: "e.g. BULLISH",
    channel: "e.g. ASCENDING",
    grade: "e.g. B+",
  },

  // ---- Structure card empty states ----
  // Three-part template: count · what triggers them · when next check.
  structureEmpty: {
    spy: "0 lines active. SPY primary triggers plot during the 03:00–07:00 CT premarket window. Next check on next-session open.",
    spx: "0 lines active. SPX channel resolves on the first qualifying overnight pivot. Next check during the 17:00–02:00 CT window.",
  },

  // ---- PRE-CONFIG briefing ----
  preConfig: {
    title: "Awaiting next session",
    body: "Both engines are between configuration windows. The slate populates once the next overnight session begins.",
    watchAtOpen:
      "Daily Brief integration pending — 'what to watch at the open' lands when the brief route exposes a programmatic hook.",
  },

  // ---- A11y ----
  a11y: {
    noValueYet: "no value yet",
  },

  // ---- Search palette example queries ----
  searchExamples: [
    "spy 5m levels",
    "spx overnight pivot",
    "last GO signal",
    "grade history",
  ],
} as const;
