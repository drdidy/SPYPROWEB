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
    a: "A workspace. Signals are a small piece of it. The real value is the routine. Same read, same lines, same bar, every day. Run it long enough and reading the day stops feeling like work.",
  },
  {
    q: "Which symbols are covered?",
    a: "SPY and ES, side by side. Each gets its own surface tuned to how it actually trades. We'll add other liquid index instruments when our read on them is as good.",
  },
  {
    q: "How does Prophet decide?",
    a: "One bar pulls several factors into one yes-or-no answer. The bar is high. Most setups don't clear it. The ones that do are rare and easy to read.",
  },
  {
    q: "Will this work in my time zone?",
    a: "The workspace shows your local time. Underneath, the read is anchored to the market's home zone. You don't have to think about it.",
  },
  {
    q: "What's included today?",
    a: "Today's decision, the ES Pivot Fan, the levels in play, the structure read, the day's foresight, the options cockpit, the signal log, and a daily brief.",
  },
  {
    q: "Is it advice?",
    a: "No. It's a structured way to think about price. Trading carries real risk. Every order you place and every position you carry is on you.",
  },
] as const;
