// Single source of truth for the marketing FAQ — consumed by both the
// visual <FAQ> component and the FAQPage JSON-LD block on the home
// page. Edit copy here only.

export const FAQS = [
  {
    q: "What does Prophet actually do?",
    a: "It reads the day through one fixed structure and asks the same questions of every move. So at any moment you know what's true and what would change it. You don't have to redo the work each morning.",
  },
  {
    q: "Is this a signal service or a workspace?",
    a: "A command workspace. It maps SPY and ES structure, waits for a confirmed setup, defines risk, and displays an SPXW contract only when the live chain is usable.",
  },
  {
    q: "Which symbols are covered?",
    a: "The trading product is deliberately focused on SPY, ES, SPX, and SPXW options.",
  },
  {
    q: "How does Prophet decide?",
    a: "The Map identifies meaningful structure. The Engine waits for the price-cross, pivot, close, and room conditions. Context can warn, but price confirmation makes the decision.",
  },
  {
    q: "Will this work in my time zone?",
    a: "The workspace shows your local time. Underneath, the read is anchored to the market's home zone. You don't have to think about it.",
  },
  {
    q: "What's included today?",
    a: "Today, Prophet Map, SPXW Contract Desk, Replay, Journal, Learn, and Telegram alert settings.",
  },
  {
    q: "Is it advice?",
    a: "No. It's a structured way to think about price. Trading carries real risk. Every order you place and every position you carry is on you.",
  },
] as const;
