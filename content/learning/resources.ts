import { BookOpen, CandlestickChart, Gauge, Landmark, LineChart, ShieldCheck } from "lucide-react";

export type LearningResource = {
  slug: string;
  title: string;
  deck: string;
  level: "Beginner" | "Intermediate";
  minutes: number;
  icon: typeof BookOpen;
  summary: string;
  outcomes: string[];
  pdf: {
    fileName: string;
    subtitle: string;
  };
};

export const learningResources: LearningResource[] = [
  {
    slug: "market-basics",
    title: "Market Basics",
    deck: "Start Here",
    level: "Beginner",
    minutes: 18,
    icon: Landmark,
    summary: "Understand indexes, ETFs, futures, sessions, bid/ask spreads, and why liquidity matters.",
    outcomes: ["Read the difference between SPY, SPX, and ES", "Know what regular session and premarket mean", "Understand why spreads and liquidity affect fills"],
    pdf: {
      fileName: "01_market_basics.pdf",
      subtitle: "A plain-English primer for new traders",
    },
  },
  {
    slug: "candlestick-basics",
    title: "Candlestick Basics",
    deck: "Price Action",
    level: "Beginner",
    minutes: 22,
    icon: CandlestickChart,
    summary: "Learn candle bodies, wicks, closes, rejection, continuation, and why the close matters.",
    outcomes: ["Identify candle body, wick, high, low, open, and close", "Separate a wick touch from a confirmed close", "Understand rejection without needing proprietary rules"],
    pdf: {
      fileName: "02_candlestick_basics.pdf",
      subtitle: "How to read the candle before reading the setup",
    },
  },
  {
    slug: "risk-and-sizing",
    title: "Risk and Sizing",
    deck: "Discipline",
    level: "Beginner",
    minutes: 20,
    icon: ShieldCheck,
    summary: "Build the habit that keeps traders alive: position size, invalidation, daily stop, and no-chase discipline.",
    outcomes: ["Define risk before entry", "Understand why no-chase rules protect capital", "Use a daily stop to avoid revenge trading"],
    pdf: {
      fileName: "03_risk_and_sizing.pdf",
      subtitle: "Protecting capital before pursuing return",
    },
  },
  {
    slug: "options-basics",
    title: "Options Basics",
    deck: "Execution",
    level: "Beginner",
    minutes: 25,
    icon: Gauge,
    summary: "Understand calls, puts, premium, expiration, Greeks, spreads, and why option price can move differently from stock price.",
    outcomes: ["Know what a call and put represent", "Understand delta, theta, and IV at a beginner level", "Recognize why cheap contracts are not always better"],
    pdf: {
      fileName: "04_options_basics.pdf",
      subtitle: "What options traders must know before trading contracts",
    },
  },
  {
    slug: "trend-and-moving-averages",
    title: "Trend and Moving Averages",
    deck: "Chart Skills",
    level: "Intermediate",
    minutes: 18,
    icon: LineChart,
    summary: "Learn what moving averages show, what they do not show, and how traders use them as context.",
    outcomes: ["Understand SMA and EMA differences", "Read support/resistance behavior around a moving average", "Avoid treating indicators as automatic signals"],
    pdf: {
      fileName: "05_trend_and_moving_averages.pdf",
      subtitle: "Using averages as context, not as magic",
    },
  },
  {
    slug: "trader-routine",
    title: "Trader Routine",
    deck: "Process",
    level: "Beginner",
    minutes: 15,
    icon: BookOpen,
    summary: "A repeatable routine for preparing, waiting, executing, reviewing, and improving without overtrading.",
    outcomes: ["Build a premarket checklist", "Know when to stand aside", "Review trades without emotional storytelling"],
    pdf: {
      fileName: "06_trader_routine.pdf",
      subtitle: "A simple daily operating rhythm",
    },
  },
];

export function findLearningResource(slug: string) {
  return learningResources.find((resource) => resource.slug === slug) ?? null;
}
