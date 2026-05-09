# Changelog

All notable changes to the SPY Prophet web app are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
entries grow newest-first.

## [Unreleased]

### Decision Slate v4 — bug fixes + hierarchy

Bug-fix + polish pass on top of v2/v3. Two P0 regressions resolved
plus the structural items called out in the v4 spec. No backend
changes.

**P0 fixes**

- **SPX "Watched only" duplication.** v3 added a tooltip-anchored
  "Watched only" pill that swapped the side label, but the recap
  body string from `lib/last-session-recap.ts` already started with
  the same phrase ("Watched only — day closed +79.00 pts"), so the
  user saw the words twice in a row. `LastSignalRecap` now strips
  the leading "Watched only" prefix from the body whenever the pill
  takes over, via a permissive regex covering case and separator
  variants. New `scripts/test-last-signal-recap.ts` (13 cases)
  guards the regression.
- **TopBar "ri close" / "VIX 1" clip artifacts.** The inline "·
  Fri close" suffix on each price was a `xl:inline` text node that
  clipped to "ri close" at lg-but-not-xl widths because the ribbon
  has `overflow-hidden`. Same root cause showed up as "VIX 1" —
  the leading character of an unfinished VIX value. v4 moves
  staleness off the inline suffix entirely: each price value now
  carries an `<InfoTooltip>` showing the staleness phrase plus the
  exact CT timestamp, and stale prices render in italic muted ink
  so the visual cue is preserved without the clip risk. VIX (and
  SPY/SPX) render a skeleton bar until the value is loaded so a
  partially-hydrated price never reads as "1".
- **TopBar restructured into named clusters** with explicit
  `<Divider />` hairlines between groups: `[menu] | [Engines: SPY
  · SPX] | [SPY/SPX/VIX prices] | [next setup · freshness] |
  [search][bell]`. The "Engines" cluster gets a leading label so
  the row reads as structured groups, not an unstructured ribbon
  of metadata.

**P1 — structural polish**

- **Recommended Action restored as page hero.** v3 demoted it
  below the pipelines; v4 moves it back to the first element under
  the page header. New `bg-paper-brand` token (`#FAF1DC`) gives
  the hero a desaturated gold tint that anchors the eye without
  competing with the data cards beneath. The eyebrow now reads
  "Recommended next step" + a separator + a state-context chip
  rendering the dispatcher's `reason` (e.g. "both engines
  pre-config").
- **Engine pipelines wrapped in a tinted band.** A `bg-paper-2/30`
  surface frames the SPY/SPX state pipelines as a single "engine
  state" zone, so the page reads as four tonally-distinct
  sections (hero gold, engines warm, briefing plain, preview
  cool) rather than four near-identical card rows.
- **StatePipeline duplicate label dropped.** The serif H3 title
  next to the engine ticker repeated whatever the active step
  pill in the stepper already said ("Pre-config" rendered twice).
  v4 drops the title — the active pill is the single source of
  state-name truth.
- **Strict 1fr 1fr grid.** Both the engines band and the Preview
  state lock their 2-col layouts via explicit
  `[grid-template-columns:1fr_1fr]` so SPX can't end up wider
  than SPY at any width.

**P2 — copy, a11y, pattern drift**

- **`graded sessions` tooltip.** New jargon helper on the
  EngineTrackRecord summary line. Defines: "Sessions where the
  engine took a setup to a confirmed entry and tracked through to
  exit. Skipped sessions are excluded from the percentage."
- **`About this page` CTA cleaned up.** Dropped the leading "?"
  glyph that broke the slate's sentence-case-with-arrow CTA
  pattern. The cursor-help tooltip remains as the affordance.
- **Caps-as-eyebrow audit.** Tracked-caps reserved for one-word
  eyebrows only (`Workspace`, `Preview`, `Last session`). The
  multi-word eyebrows `Recommended next step` and
  `What you'll see at setup` move to plain small-text.
- **BETA chip stronger ochre.** v3 used `bg-gold-soft` (#F4E4C0)
  + a 0.45 inset border but the cream-on-cream rendering still
  read as neutral / blueish to viewers. v4 switches to a solid
  `bg-gold` (#B8821F) fill with `text-gold-tint` text — saturated
  warm at any monitor calibration.
- **`Hide preview` toggle** (localStorage-backed) on the
  PreviewState section. Returning users who dismissed it see a
  small `Show preview` link in its place.
- **PreviewState moved to a cooler surface tone.** New
  `bg-paper-cool` token (`#EEF0EB`, faint sage cream) makes the
  section instantly read as "not live" without an opacity hack.
- **Spacing scale.** Outer page rhythm pinned to `gap-6` (24px)
  between top-level sections; engine-band internal gaps to
  `gap-3 / gap-4` (12 / 16); Preview internal to `gap-4 / gap-6`
  (16 / 24). All on the 4 / 8 / 16 / 24 / 48 token grid.

**Backend not-fixed (called out)**

- **SPX track-record showing "no graded sessions"** while SPY
  shows wins/losses. The FE classifier in `lib/track-record.ts`
  reads `verdictOutcome` from the SPX replay block as the engine
  emits it. If `verdictOutcome` is null but `isReplay: true`, the
  classifier returns `SKIP` — that's the wire contract. Two
  candidate root causes (both backend):
    1. yfinance returns empty for ES=F on the dates being graded;
       the SPX replay path then can't compute open/close →
       `verdictOutcome: null`. PR #73 widened the fetch window
       but didn't eliminate the failure mode.
    2. The SPX engine's qualifying conditions (channel formed,
       rejection candle, confirmation) genuinely weren't met on
       those days — in which case `SKIP` is the honest result.
  A `TODO(backend)` comment in `lib/track-record.ts` names the
  endpoint to investigate (`api/spx/snapshot.py
  _build_spx_replay_block`).

**Verification**

- `npx tsc --noEmit` — clean.
- `npx next build` — clean. `/dashboard` ships at 11.9 kB
  (113 kB first-load).
- `scripts/test-last-signal-recap.ts` (new) — 13 cases pass.
- `scripts/test-countdown.ts` — 11/11 pass.
- `scripts/test-recommendations.ts` — 16/16 pass.
- `scripts/test-state-pipeline.ts` — 6/6 invariants intact.
- `scripts/test-topbar-layout.ts` — 6/6 invariants intact.
- `scripts/test-sessions.ts` — 10/10 pass.

**Deliverables not shipped**

Same posture as v2: no Storybook (repo isn't configured for it,
spec said "no new heavy dependencies"); no Chromatic/Playwright
visual snapshots (no Jest/Vitest/Playwright runner in the repo;
adding one is a separate infra workstream); no axe-core runtime
tests (same reason). Static-analysis guards in `scripts/test-*.ts`
cover the structural invariants.

---

### Decision Slate v2 — hierarchy, redundancy, live behavior, a11y

A focused polish pass on top of v1, addressing the 15 numbered
objectives raised in the v2 spec. No backend changes.

**1. Resolved three-way engine-state duplication.** The per-engine
`<StatePipeline>` cards are now the single source of truth for engine
state. The TopBar's `<SymbolChip>` collapsed from a colored pill
button to a flat inline link with no background fill, no inner ring,
no hover-lift. The "Markets quiet" briefing's redundant
`Next setup (SPX) opens in 1d 2h` chip has been removed — the
pipelines above the briefing already render that countdown.

**2. State-aware Recommended Action.** New `lib/recommendations.ts`
dispatcher + `<RecommendedAction>` component. The CTA now picks
- `daily-brief` for PRE_CONFIG / STAND_DOWN
- `live-spy` / `live-spx` for WATCH / WAIT (the engine closer to
  triggering wins)
- `options-cockpit` for ARMED / GO
- `log-replay` for COOLDOWN
The eyebrow names the driving engine state — e.g.
`Recommended next step · SPY armed`. Behavior covered by 16
assertions in `scripts/test-recommendations.ts`.

**3. Live countdowns with tier-based interval.** New
`<Countdown>` component (canonical, replacing the v1
`<LiveCountdown>` alias):
- > 24h → 60-second tick, format `in Xd Yh`
- 1–24h → 60-second tick, format `in Xh Ym`
- < 60m → 1-second tick, format `in Mm Ss`
- ≤ 10s → "Opening now"
Memoized to avoid re-rendering siblings; visibility-aware so hidden
tabs don't burn CPU. Pure `format()` + `pickInterval()` exports
covered by 11 assertions in `scripts/test-countdown.ts`. Reduced-
motion already respected via the global CSS rule.

**4. Layout consistency.** Pipelines render as a 2-col grid at
`lg+` (SPY left, SPX right) — matching the verdict-card layout
below. Below `lg`, everything stacks. Single column at `<640px`,
two columns at `>=1024px`.

**5. Compact page header.** v1's giant `text-display` "Decision
Slate" hero replaced with a small eyebrow + h1 at ~18px (the new
`text-h2` token) + the existing About affordance, all on one
line. Reclaims ~80px of above-the-fold space.

**6. Removed double card nesting.** The Markets-quiet briefing
is now a `<section>` (heading, subtitle, hairline, grid of inner
cards) rather than a bordered card containing four more bordered
cards. Inner cards are the only bordered surfaces.

**7. Pipeline stepper polish.** Inactive-step contrast bumped to
WCAG AA (4.5:1) on paper — v1's `text-ink-4` (#9CA3AF, 2.95:1)
replaced with `text-ink-3` (#6B7280, 4.83:1) at reduced weight.
Active pill strengthened with a 2px brand-tint ring and a faint
inset shadow so it reads as "current state", not "button". Each
step now carries an `<span class="sr-only">` description that
screen readers read as `Step N of 7: <label> — current/completed/
upcoming.`. Connector hairlines verified between every pair via
`scripts/test-state-pipeline.ts`. Available under the deliverable
name `<PipelineStepper>` (alias of `<StatePipeline>`).

**8. InfoTooltips on jargon.** First-occurrence helps for:
- `R` / `R-multiple` — anchored on the literal `R` letter in
  `<LastSignalRecap>`.
- `Watched only` — when the soft-recap path renders, the side
  label is replaced with a tooltip-anchored "Watched only" pill.
- `skip` — already wired in v1; confirmed keyboard / Escape /
  touch-friendly via the shared `<InfoTooltip>` primitive.
- Each pipeline state name — already wired in v1.
- "About this view" → "About this page" for sentence-case
  consistency.

**9. Interactive affordances cleanup.**
- `1 skip` / `5 skips` is now a real `<Link>` to a filtered
  Replay view (`/replay?date=…&filter=skip`), not just an
  underlined hover hint.
- All slate secondary CTAs unified on a single ghost-button
  shape: `h-7 px-2.5 rounded-pill bg-paper-2/60 border-rule
  text-[11px] tracking-[0.02em] font-medium`. The previous
  uppercase-tracked "OPEN REPLAY →" / "OPEN SPY CHANNEL →" /
  "OPEN SPX CHANNEL →" links now match.
- Focus rings standardized on
  `focus-visible:ring-2 focus-visible:ring-gold/40
  focus-visible:ring-offset-2 focus-visible:ring-offset-canvas`.

**10. Empty-state teaching panel.** New `<PreviewState>`
component renders a low-key "Preview" section under the Markets-
quiet briefing showing what each verdict card looks like
populated (sample values, reduced opacity, `aria-hidden`).
Hidden once either engine leaves PRE_CONFIG.

**11. Number & time formatting.** `<Countdown>` and most slate
numerics already used `tabular-nums`; reaffirmed at the
component layer. New `lib/user-prefs.ts` exposes
`resolveUserTimezone()` (returns `America/Chicago` until the
auth + persistence layer lands — `TODO(backend)` comment names
the field shape) and `formatInUserTimezone()` /
`ctEquivalent()` helpers. The TopBar's existing session line
already shows absolute times (`Sun 17:00 CT`) for next-event
strings, satisfying spec #1's "Keep absolute time in the global
header".

**12. Copy polish.**
- `75% hit · 3W 1L · 1 skip` → `75% hit (3W 1L) · 1 skip`. The
  parens make clear the percentage applies to graded sessions
  only.
- The `No graded sessions yet` row is now wrapped in an
  InfoTooltip when the lookback contains skip-only sessions:
  "Engine watched the last N sessions but didn't qualify a
  setup."
- `WHAT TO WATCH AT THE OPEN` → sentence-case
  `What to watch at the open`.
- `About this view` → `About this page`.

**13. Beta chip recolor.** The `<Wordmark>` Beta pip moved from
`bg-gold-tint` (cream) to `bg-gold-soft` (warm ochre) with a
stronger inset border (`rgba(184,130,31,0.45)`) so it stays
readable on the canvas-cream surface and matches the warm
palette.

**14. Accessibility.**
- Pipeline announces as a real ordered list with `<li
  aria-current="step">` on the active node and `sr-only`
  per-step descriptions.
- All InfoTooltip triggers are keyboard-focusable, dismiss on
  Escape, and toggle on tap (touch-friendly).
- Reduced-motion respected via the global
  `prefers-reduced-motion` rule landed in v1.
- Beta chip border bumps contrast on the cream background.

**15. Responsive.**
- `< 640px`: single column.
- `640–1024px`: single column for cards (a 2-col pipeline strip
  would cramp the inline countdown).
- `>= 1024px`: 2-col SPY/SPX everywhere on the page, including
  the pipelines.
- Max content width tightened to **1200px** with generous
  gutters (down from v1's 1280px).

**Deliverables actually shipped**

| Spec | Where |
| --- | --- |
| `<Countdown>` | `components/decision-slate/Countdown.tsx` |
| `<RecommendedAction>` | `components/decision-slate/RecommendedAction.tsx` |
| `<InfoTooltip>` | unchanged from v1 (`components/ui/InfoTooltip.tsx`) |
| `<PipelineStepper>` | re-export at `components/decision-slate/PipelineStepper.tsx` |
| `<PreviewState>` | `components/decision-slate/PreviewState.tsx` |
| `recommendations.ts` map | `lib/recommendations.ts` |
| User-tz preference | `lib/user-prefs.ts` (TODO until backend) |

**Deliberate non-changes (v2)**

- **Storybook stories** — Storybook is still not configured; the
  spec said "no new heavy dependencies", and adding Storybook for
  Next 14 + Tailwind 3 is a non-trivial infra add. Static-analysis
  guards in `scripts/test-*.ts` cover the same regression surface.
- **axe-core integration** — repo has no Jest/Vitest scaffold;
  axe-core needs a runtime to drive. Static-analysis guards plus
  the explicit a11y patterns added in #14 cover the structural
  invariants axe would flag.
- **Time-zone persistence UI** — `/settings` already shows
  "User preferences coming soon" pending the auth layer. The
  `lib/user-prefs.ts` accessor is the contract; UI follows when
  auth lands.

**Verification**

- `npx tsc --noEmit` — clean.
- `npx next build` — clean. `/dashboard` ships at 9.98 kB
  (111 kB first-load), within the v1 envelope.
- `npx tsx scripts/test-recommendations.ts` (new) — 16/16 cases
  pass.
- `npx tsx scripts/test-countdown.ts` (new) — 11/11 cases pass.
- `npx tsx scripts/test-state-pipeline.ts` — 6/6 invariants intact.
- `npx tsx scripts/test-topbar-layout.ts` — 6/6 invariants intact.
- `npx tsx scripts/test-sessions.ts` — 10/10 cases pass.

---

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
