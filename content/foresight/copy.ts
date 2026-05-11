export const foresightCopy = {
  hero: {
    eyebrow: "FORESIGHT · PROJECTION · STRUCTURE",
    title: "See the lines before price gets there.",
    lede:
      "Foresight projects the engine's structural lines hour by hour; it is a calibration map, not a forecast oracle.",
  },
  states: {
    resolving:
      "The engine is still resolving today's structure. Use the latest resolved session as context until today's inputs qualify.",
    standby:
      "Markets are outside the active resolution window. Showing the most recent resolved projection.",
    live:
      "Projection is current against the latest structural inputs.",
    stale:
      "Projection is past its scheduled refresh. Treat levels as context until the next successful update.",
    failed:
      "Projection feed is offline. Existing channel and replay surfaces remain available.",
  },
  sections: {
    projection: "Forward projection",
    scenarios: "Scenarios & sensitivity",
    calibration: "Calibration",
  },
  info:
    "Projection uses each line's own slope. Lines with no active slope hold flat across future buckets.",
};
