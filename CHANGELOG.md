# Changelog

All notable changes to the SPY Prophet web app are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
entries grow newest-first.

## [Unreleased]

### Decision Slate redesign — production polish pass

A focused refinement of the `/dashboard` route to bring the daily
"should I trade?" command center to a production-ready, end-user
state. No backend / API contracts changed.

**New reusable components**

- `components/decision-slate/StatePipeline.tsx` — replaces the flat
  phase-rail row with a real horizontal stepper. Per-engine strip
  carries ticker badge, seven-node pipeline (active node filled,
  passed nodes muted, future nodes ghosted), current-state name,
  one-line plain-English explanation, and a live countdown. Real
  `<ol>` with `aria-current="step"`.
- `components/decision-slate/EngineCard.tsx` — standardized card
  anatomy (eyebrow → title → body → metrics → footer). Both engines'
  verdict + structure cards now flow through this so SPY and SPX
  share an identical visual rhythm.
- `components/decision-slate/MetricSlot.tsx` — supersedes the legacy
  `<Metric />`. Enforces an explicit em-dash + helper text when a
  metric is unpopulated, so the column never renders a label-only
  ghost.
- `components/decision-slate/Countdown.tsx` — re-export of the
  existing `LiveCountdown` under the deliverable name.
- `components/ui/InfoTooltip.tsx` — accessible tooltip (hover,
  keyboard focus, tap-to-show on touch, dismiss on Escape /
  outside-click). Slate-wide replacement for native `title=""`
  reliance. `HelpHint` now delegates to `InfoTooltip`, so all
  pre-existing call-sites pick up keyboard + screen-reader + touch
  support automatically.
- `components/ui/Skeleton.tsx` — shimmer block primitive with
  `prefers-reduced-motion` honored.
- `components/ui/ErrorState.tsx` — inline retry card for partial
  data outages; SPY-only / SPX-only failures no longer leave a card
  silently blank.

**Tokens & theme**

- `tailwind.config.ts`: explicit `h2 / h3 / body / meta` font tiers
  alongside the existing `display / headline / title / eyebrow`
  scale. Added `shimmer` keyframe + `animate-shimmer`.
- `app/globals.css`: `.visually-hidden` utility, plus a
  `prefers-reduced-motion` override that pauses decorative loops
  (`animate-breathe`, `animate-shimmer`, `animate-ticker`).

**Page-level changes**

- `app/(app)/dashboard/page.tsx` rewritten:
  - Engine ladders replaced with two `<StatePipeline />` strips,
    one per engine.
  - New page header with `<InfoTooltip>`-driven "About this view"
    affordance.
  - **Single contextual primary action** at the top — picks
    "Open live slate" / "Open replay" / "Open daily brief" based
    on the most active engine state.
  - Verdict + structure cards now route through `<EngineCard />`
    for consistent anatomy.
  - Triple "idle" messaging collapsed: when both engines are
    pre-config, only the redesigned `<PreConfigBriefing />` hero
    state renders. The "Today's read · Awaiting setup" + "The
    read · 0 lines active" duplications are gone.
  - SPY-only / SPX-only graceful fallback: a hard error on one
    side renders an `<ErrorState />` and the working side renders
    normally.
  - Max content width tightened from 1440px → 1280px per spec.
  - Section headers use sentence case ("Today's read", "Active
    levels") in serif H2.

**Microcopy & polish**

- `content/copy.ts`: rewrote every slate string for clarity. Notable:
  - "Daily Brief integration pending — 'what to watch at the open'
    lands when the brief route exposes a programmatic hook." → "What
    to watch at the open will appear here once the daily brief
    publishes (around 06:30 CT)."
  - "0 lines active. SPY primary triggers plot during the…" → "No
    active levels yet. SPY's primary lines plot during the 03:00–
    07:00 CT premarket window."
  - "Awaiting next session" → "Markets quiet" (used as
    the briefing hero title; per-engine pipelines carry the
    countdown).
  - Added per-metric `metricEmptyHelper` strings ("Populates at
    setup", "Forms at first overnight pivot", "Assigned after the
    trigger fires") rendered under the em-dash by `MetricSlot`.
- `content/phase-definitions.ts`: phase labels converted from
  `PRE-CONFIG / STAND DOWN / WATCH` to sentence case (`Pre-config`,
  `Stand down`, `Watch`). Tooltip body copy lightly rewritten to
  drop developer-facing jargon.
- `lib/last-session-recap.ts`: "engine watched · day +79.00 pts" →
  "Watched only — day closed +79.00 pts (583.10 → 662.10)". Added
  `humanizeVerdict()` so raw tokens like `STAND_DOWN` render as
  "Stood down" instead of "stand down".
- `components/decision-slate/EngineTrackRecord.tsx`: rewritten
  copy ("5 skip" → "5 skips" with InfoTooltip definition; "Verify
  in Replay" → "Open replay"; "no graded sessions" → "No graded
  sessions yet"). Added a visible W / L / Skip legend under the
  dot row so the dot palette doesn't require guessing.
- `components/slate/StateLadder.tsx`: dropped `uppercase` so
  ladder labels render in the new sentence case across non-slate
  surfaces (it remained in use for SPY / SPX channel pages).

**Accessibility & a11y**

- StatePipeline is a real `<ol>` with `aria-current="step"` on
  the active node and per-step InfoTooltip wrappers (keyboard +
  ESC + touch).
- All decorative icons marked `aria-hidden`; meaningful icons get
  explicit `aria-label`.
- Focus rings: `focus-visible:ring-2 focus-visible:ring-gold/40` on
  every new interactive element. The page-level CSS focus-visible
  rule already provides a global fallback.
- Help affordance ("?") in the page header is keyboard-focusable
  and announces its label.

**Beta badge relocation**

- `components/brand/Wordmark.tsx`: "Beta" pip rendered next to the
  logo in the header.
- `components/layout/Sidebar.tsx`: removed the "closed beta" line
  under the user avatar (it was easy to miss); the slot now reads
  "Signed in".

**Notes & deliberate non-changes**

- Storybook stories: not added — Storybook is not configured in
  this repo (no Storybook deps in `package.json`). The deliverables
  list called for stories *if Storybook is configured*.
- New unit-test runner: not added — the repo has no Jest / Vitest
  scaffold and `package.json` has no `test` script. A `<StatePipeline />`
  static-analysis guard was added at
  `scripts/test-state-pipeline.ts`, mirroring the existing
  `scripts/test-topbar-layout.ts` and `scripts/test-sessions.ts`
  pattern, and runs via `npx tsx`.
- TopBar `SymbolChip` left untouched. The chip is a global
  navigation surface used across every route, not slate-only chrome
  — collapsing it into a single status chip would degrade the
  workflow for non-dashboard pages. Worth a follow-up if the global
  navigation pattern is revisited.
- Time-zone preference (spec item #10): default rendering is already
  America/Chicago everywhere. Adding a user-controlled tz preference
  is a settings-level concern; deferred to a follow-up PR.

**Verification**

- `npx tsc --noEmit` — clean.
- `npx next build` — clean. `/dashboard` route ships at
  9.54 kB (111 kB first-load), down slightly from the prior
  composition.
- `npx tsx scripts/test-topbar-layout.ts` — 6/6 invariants intact.
- `npx tsx scripts/test-state-pipeline.ts` (new) — 6/6 invariants
  intact (ol container, `aria-current`, InfoTooltip per step,
  PHASE_DEFINITIONS source of truth, LiveCountdown, EngineStatusChip
  export).
- `npx tsx scripts/test-sessions.ts` — 10/10 cases pass.
