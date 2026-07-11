export const SPY_CHANNEL_COPY = {
  hero: {
    eyebrow: "SPY Channel",
    title: "SPY Channel",
    titleLead: "Today's SPY",
    titleEmphasis: "Control Map.",
    subtitle:
      "Control Line, gates, confirmation, and trade checks stay in one operating surface.",
  },
  anchorSlate: {
    label: "Control Map",
    fallbackHeadline: "Waiting on confirmation",
    noAnchor:
      "SPY Control Map is resolving. Gates appear as soon as the prior-session pivot is available.",
  },
  sections: {
    plays: {
      number: "01",
      title: "Trade Plan",
      optionsTitle: "Execution Lens",
    },
    lines: {
      number: "02",
      title: "Control Gates",
      triggerMapTitle: "Control Room",
      biasTitle: "Opening Bias",
    },
    tape: {
      number: "03",
      title: "Session Review",
      signalTapeTitle: "Session Pulse",
      guardrailsTitle: "Trade Checks",
    },
  },
  empty: {
    triggerMap:
      "SPY Control Map is resolving. Gates appear when the prior-session pivot is available.",
    options:
      "Execution context appears only when it improves the active read.",
    tape: "Session still warming up. The tape fills as levels, bias, and guardrails change.",
  },
  footer: {
    left: "Prophet - SPY Control Map",
    right: "Session surface",
  },
} as const;
