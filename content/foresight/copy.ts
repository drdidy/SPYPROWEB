export const foresightCopy = {
  hero: {
    eyebrow: "PLANNING LAB",
    title: "Plan the next touch before it happens.",
    lede:
      "Planning Lab is the what-if room: pick a future hour, see the nearest Control Map gates, and prepare your plan before price arrives.",
  },
  states: {
    resolving:
      "The engine is still resolving today's structure. Use the latest resolved session as context until today's inputs qualify.",
    standby:
      "The active projection window is closed. Showing the most recent resolved projection as planning context, not a live 0DTE trigger.",
    live: "Projection is current against the latest structural inputs.",
    stale:
      "Projection is past its scheduled refresh. Treat levels as context until the next successful update.",
    failed:
      "The planning window is quiet. Use the channel maps and replay memory until the next projection resolves.",
  },
  sections: {
    projection: "Hour planner",
    scenarios: "What-if paths",
    calibration: "Replay memory",
  },
  info:
    "Planning Lab does not replace the Decision Slate. It helps you rehearse the next touch, then the live Control Map decides.",
};
