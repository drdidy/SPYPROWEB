import {
  Activity,
  BadgeDollarSign,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  CalendarClock,
  ChartSpline,
  ClipboardCheck,
  DatabaseZap,
  Radar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ProphetDeskKey =
  | "calibration"
  | "replay-memory"
  | "options-contract"
  | "data-trust"
  | "ui-critic"
  | "language"
  | "tiering"
  | "morning-brief"
  | "anomaly"
  | "product-qa";

export type ProphetDesk = {
  key: ProphetDeskKey;
  name: string;
  label: string;
  icon: LucideIcon;
  cadence: string;
  owner: string;
  status: "launch-critical" | "active" | "watch";
  firstJob: string;
  privateChecks: string[];
  productOutput: string;
  linkedSurface: string;
};

export const prophetDesks: ProphetDesk[] = [
  {
    key: "calibration",
    name: "Map Quality Desk",
    label: "Model quality",
    icon: ChartSpline,
    cadence: "After close and before the next open",
    owner: "Tesla",
    status: "launch-critical",
    firstJob:
      "Verify each enabled market has a valid Control Line, gate distance, session clock, and 9 AM reference.",
    privateChecks: [
      "SPY and ES slope drift",
      "Ticker-specific stock gates",
      "BTC and ETH gate behavior",
      "High-confidence symbol eligibility",
    ],
    productOutput:
      "Only high-confidence maps appear in the app. Review names stay hidden until the desk clears them.",
    linkedSurface: "Stocks, Crypto, SPY, ES",
  },
  {
    key: "replay-memory",
    name: "Replay Memory Desk",
    label: "Compounding edge",
    icon: Brain,
    cadence: "End of every completed trade day",
    owner: "Jason",
    status: "active",
    firstJob:
      "Score whether the Control Line held, which gate mattered, and whether the best trade was buy-bottom or sell-top.",
    privateChecks: [
      "Best entry side",
      "Gate-to-gate completion",
      "Early, late, or correct read",
      "Replay notes for future tuning",
    ],
    productOutput:
      "Replay becomes a memory system that improves future entry and exit reads.",
    linkedSurface: "Replay",
  },
  {
    key: "options-contract",
    name: "Options Contract Desk",
    label: "SPX execution",
    icon: BadgeDollarSign,
    cadence: "Pre-open and when ES reaches a gate",
    owner: "Jason",
    status: "launch-critical",
    firstJob:
      "Convert the ES zone into an SPX ticket, project debit at entry and target, then improve the next estimate from replayed premium behavior.",
    privateChecks: [
      "ES to SPX level translation",
      "OTM contract under budget",
      "5-minute 200 SMA context",
      "1-minute 8/21 EMA confirmation",
      "Replay-derived debit and exit bias",
    ],
    productOutput:
      "Options Lens presents a self-learning SPX ticket, not a generic chain table.",
    linkedSurface: "Options Lens, Replay",
  },
  {
    key: "data-trust",
    name: "Data Trust Desk",
    label: "Number integrity",
    icon: DatabaseZap,
    cadence: "Every release and every market session",
    owner: "Laplace",
    status: "launch-critical",
    firstJob:
      "Catch stale labels, source leaks, mismatched prices, demo fallbacks, and SPY/ES line disagreements before users see them.",
    privateChecks: [
      "Schwab broker feed status",
      "Coinbase crypto isolation",
      "SPY price consistency",
      "Options chain freshness",
    ],
    productOutput:
      "The UI says what the trader needs to know without exposing connection plumbing.",
    linkedSurface: "All live surfaces",
  },
  {
    key: "ui-critic",
    name: "UI Critic Desk",
    label: "Visual quality",
    icon: Activity,
    cadence: "Before every production deploy",
    owner: "Arendt",
    status: "active",
    firstJob:
      "Screenshot every route and flag contrast, overlap, dead space, tiny text, mobile overflow, and repeated labels.",
    privateChecks: [
      "Desktop and mobile screenshots",
      "Chart label collision",
      "Dead-space audit",
      "Dark and light contrast",
    ],
    productOutput:
      "Screens feel calm, premium, and legible before release.",
    linkedSurface: "All visual routes",
  },
  {
    key: "language",
    name: "Language Desk",
    label: "Plain-English read",
    icon: BookOpen,
    cadence: "Every copy change",
    owner: "Feynman",
    status: "active",
    firstJob:
      "Turn mechanical engine wording into confident trader language without revealing the proprietary method.",
    privateChecks: [
      "AI-sounding sentences",
      "Capitalization consistency",
      "Glossary coverage",
      "Secret-sauce exposure",
    ],
    productOutput:
      "The app reads like a premium decision tool, not internal engineering notes.",
    linkedSurface: "Daily Brief, Learning, headers",
  },
  {
    key: "tiering",
    name: "Access Desk",
    label: "Plan boundaries",
    icon: BriefcaseBusiness,
    cadence: "Before pricing or release changes",
    owner: "Poincare",
    status: "watch",
    firstJob:
      "Keep Core, Edge, and Apex cleanly separated so advanced engines support paid upgrades without confusing new users.",
    privateChecks: [
      "Locked and unlocked routes",
      "Plan badge accuracy",
      "Upgrade paths",
      "Apex-only engine visibility",
    ],
    productOutput:
      "The product feels intentional at every plan level.",
    linkedSurface: "Sidebar, Settings, Marketing",
  },
  {
    key: "morning-brief",
    name: "Morning Brief Desk",
    label: "Battle card",
    icon: CalendarClock,
    cadence: "06:30 CT on trade days",
    owner: "Feynman",
    status: "launch-critical",
    firstJob:
      "Publish one clean morning card: line in the sand, valid trades, invalidation, no-chase warning, and high-confidence maps.",
    privateChecks: [
      "SPY and ES control levels",
      "Two valid trade paths",
      "What not to chase",
      "Apex stock and crypto context",
    ],
    productOutput:
      "Daily Brief becomes the morning battle card.",
    linkedSurface: "Daily Brief, Dashboard",
  },
  {
    key: "anomaly",
    name: "Anomaly Desk",
    label: "Caution regime",
    icon: Radar,
    cadence: "Pre-open and event windows",
    owner: "Laplace",
    status: "active",
    firstJob:
      "Flag days where the map should be handled with caution: data conflict, major macro event, large gap, or premium distortion.",
    privateChecks: [
      "CPI, FOMC, NFP days",
      "VIX shock",
      "Overnight gap size",
      "Price outside Gate II",
    ],
    productOutput:
      "The app can say when today is not a normal map day.",
    linkedSurface: "Dashboard, Daily Brief",
  },
  {
    key: "product-qa",
    name: "Release QA Desk",
    label: "Ship gate",
    icon: ClipboardCheck,
    cadence: "Before production deployment",
    owner: "Arendt",
    status: "launch-critical",
    firstJob:
      "Run the release checklist: screenshots, console errors, mobile, copy, links, data consistency, and private-method exposure.",
    privateChecks: [
      "Broken links",
      "Console errors",
      "Mobile overflow",
      "Provider and calibration leaks",
    ],
    productOutput:
      "Production deploys only after the app passes the desk.",
    linkedSurface: "Release workflow",
  },
];

export const deskRunOrder: ProphetDeskKey[] = [
  "calibration",
  "data-trust",
  "anomaly",
  "morning-brief",
  "options-contract",
  "replay-memory",
  "language",
  "tiering",
  "ui-critic",
  "product-qa",
];

export const deskTierPlan = [
  {
    name: "Prophet Core",
    audience: "First read",
    access: "SPY, Daily Brief, Replay basics, Learning Center",
  },
  {
    name: "Prophet Edge",
    audience: "Active index trader",
    access: "SPY, ES, SPX Options Lens, full Replay, Planning Lab",
  },
  {
    name: "Prophet Apex",
    audience: "Full map",
    access: "SPY, ES, Stocks, Crypto, high-confidence maps, premium memory",
  },
];
