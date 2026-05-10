export const SPY_CHANNEL_COPY = {
  hero: {
    eyebrow: "SPY · Channel · Session today",
    title: "The trading day, read aloud.",
    titleLead: "The trading day,",
    titleEmphasis: "read aloud.",
    subtitle:
      "Anchor lines, trigger proximity, tape, and guardrails stay in one operating surface.",
  },
  anchorSlate: {
    label: "Anchor Slate",
    fallbackHeadline: "Waiting on confirmation",
    noAnchor:
      "No anchor today. The channel falls back to nearest qualified structure until a fresh anchor qualifies.",
  },
  sections: {
    plays: {
      number: "01",
      title: "Plays",
      optionsTitle: "Options Intelligence",
    },
    lines: {
      number: "02",
      title: "Lines",
      triggerMapTitle: "Trigger Map",
      biasTitle: "Pre-Open Bias",
    },
    tape: {
      number: "03",
      title: "Tape",
      signalTapeTitle: "Signal Tape",
      guardrailsTitle: "Risk Guardrails",
    },
  },
  empty: {
    triggerMap:
      "No qualified levels yet. Levels arm during the premarket window once structure is confirmed.",
    options:
      "Options intelligence is waiting for the provider session. Prior-session context appears when available.",
    tape: "Session still warming up. The tape fills as levels, bias, and guardrails change.",
  },
  footer: {
    left: "Prophet · SPY channel",
    right: "End of slate",
  },
} as const;
