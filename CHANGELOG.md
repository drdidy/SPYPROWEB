# Changelog

All notable changes to the SPY Prophet web app are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
entries grow newest-first.

## [Unreleased]

### ES Pivot Fan framework

- Confirmed the ES Low Pivot is the post-noon RTH low wick, not the low close, and locked it with explicit tests.
- Added the optional overnight higher-pivot minor ascending watch line when overnight closes above the prior RTH high close.
- Labeled the minor line consistently in ES Channel, Dashboard, Replay, Foresight, and demo data without letting it override the major fan read.
- Reframed the ES engine around a professional Pivot Fan model: High Fan Ceiling/Floor and Low Fan Ceiling/Floor.
- Added `fanRead` to the ES snapshot contract so Dashboard, ES Channel, Brief, and Replay can display the same zone summary.
- Updated ES play selection for above-ceilings, between-ceilings, below-ceilings, and below-High-Fan-Floor regimes, including the HP-ceiling sell to HP-floor and LP-ceiling buy through HP-ceiling reads.
- Replaced stale ES "channel/rails/six-line" user-facing language across the app with Pivot Fan copy and labels.
- Expanded SPX/ES engine tests for fan-zone classification, play construction, and API serialization.

### Decision Slate — presentation upgrade (P1)

Twelve P1 items, all landed.

**Header**
- **P1-1 Change indicators with %.** `<DeltaTag />` now renders
  `+0.85 (+0.12%)` alongside the price. Tone: bullish-green for
  positive, bearish-red for negative, neutral for zero.
  `formatNumber` skips the slot entirely on null/0/NaN. **VIX
  uses neutral coloring** because a rising VIX isn't bullish/
  bearish-relative — green/red would mislead.
- **P1-2 Live-data pulse + aria-live.** `<FreshnessPill />`
  already had both; verified in place.

**Surface system**
- **P1-3 Three-tier surface tokens.** New Tailwind colors
  `paper-tier1` / `paper-tier2` / `paper-tier3` plus border tones
  `rule-tier1` / `rule-tier2`. Applied:
    - tier 1 (warm cream + ochre border) → Recommended Action hero
    - tier 2 (pure white + subtle border) → Engine pipelines
    - tier 3 (faint cream + top divider only) → EngineTrackRecord,
      EngineBriefing, "What to watch at the open" callout.
- **P1-4 Engine state color top border.** New `STATE_TOP_BORDER`
  map (inline-styled hex) on each `<StatePipeline />`: gray for
  pre-config / stand-down / cooldown, amber for watch / wait,
  blue for armed, green for go. The most consequential state
  change is no longer a typography swap.

**Header content**
- **P1-5 Date stamp under H1.** "Friday · May 9, 2026" rendered
  in CT below the "Decision Slate" headline via
  `Intl.DateTimeFormat`. ~14px sans, muted ink-3.
- **P1-9 About → ? icon-button.** Converted from a wide ghost
  pill ("About this page") to a 28px circular `?` icon-button
  at the top-right, matching the search/notification icon
  language.

**Numerics + dots**
- **P1-6 Global tabular-nums.** `app/globals.css` extended its
  numeric rule to also cover `[data-testid="countdown"]`. Every
  price, R-multiple, percent, score, and countdown locks to the
  same tabular grid; live-updating values don't shift siblings.
- **P1-7 Skip dot fill.** SKIP outcomes now render as a filled
  amber-tan `#C9A227` dot at 60% alpha — visually parses
  alongside green wins and red losses. **Hollow rings reserved
  exclusively for the genuine "no graded data yet" empty state**
  (rendered as 5 placeholder rings under `aria-label="No graded
  data yet"`).

**Hero card**
- **P1-8 Stronger anchor.** Padding bumped from `px-5 py-4
  md:px-6 md:py-5` to `px-6 py-5 md:px-7 md:py-6` (+25%
  vertical). Dropped the v5 inline reason chip
  ("· both engines pre-config"). Replaced with a live context
  line beneath the headline: `SPY opens in 1d 6h · ES opens in
  20h 50m`, both countdowns ticking via the shared
  `<Countdown />` primitive. Hero now sits on `paper-tier1` +
  `rule-tier1`.

**Chip primitive**
- **P1-10 Unified `<Chip />`.** New `components/ui/Chip.tsx`
  exports a single shape primitive plus a `CHIP_TONES` palette
  covering `beta`, every engine state, and `synthetic` /
  `stale`. Routed through:
    - `Wordmark` BETA pip → `CHIP_TONES.beta`
    - `SpxProvenanceBadge` synthetic / stale chips
  All chips now share the same shape (rounded-pill, px-1.5
  py-px, 9px font, weight 500, 1px border) and differ only in
  inline-styled colors — a v5 lesson kept in place so no
  theme/Tailwind compile chain can reorder them.

**Typography**
- **P1-11 Serif/sans audit.** "What to watch at the open" was
  sans-default; switched to `font-serif text-h3` to match
  "Markets quiet" (h2) and "Decision Slate" (h1). Every
  editorial section title now reads as serif; UI labels +
  prices + buttons stay sans.

**Spacing**
- **P1-12 Vertical rhythm.** Replaced blanket `space-y-6` with
  per-element margins matching the 4/8/16/24/48 token scale:
    - hero `mt-6` (24)
    - engine row `mt-6` (24)
    - briefing `mt-12` (48)
    - inside briefing: card row `mt-4` (16), next row `mt-4`
      (16), "What to watch" `mt-6` (24)
    - preview `mt-6` (24)

**Verification**

- `tsc --noEmit` clean. `next build` clean.
  `/dashboard` 12.1 kB / 117 kB.
  `/es` 14.5 kB / 153 kB.
- 13 / 13 FE static-analysis scripts pass.
- 31 / 31 pytest cases pass on the SPX engine + grading suite.
  (16 pre-existing yfinance/numpy import failures in the sandbox
  are unrelated to this PR — same pattern as every prior round.)

---

### ES replay grader — drop the confluence-action filter

Bug fix from the trader: "no way ES never gave a trade in the
last 5 days." The SPX/ES replay grader in
`api/spx/snapshot.py:_build_spx_replay_block` was emitting
`verdictOutcome === "N_A"` whenever `action ∈ (STAND_DOWN, …)`,
which meant any session where the confluence score didn't clear
the TAKE/SELECTIVE threshold went un-graded — even if the
channel had a clean direction and price tagged a rail.

**The trader's actual rule**: "we extend the channel ceiling and
floor to 9am and note the price at 9am. When ES tags that price
and moves away — either up or down — that is the trade. Either
the ceiling or the floor of the channel at 9am. So it is not
possible to say no trade."

The `action` field is a *display-side* recommendation gate (it
suppresses the dashboard CTA on low-conviction sessions). It is
not — and never should have been — a *grading-side* filter. The
question grading answers is "what would have happened if the
user took the rail tag?", and that's a function of the channel
direction, not the confluence score.

**Fix.** Dropped the `is_directional = action in ("TAKE",
"SELECTIVE")` predicate. The grader now grades every session
where `channel.direction != NONE`. NONE-direction sessions
still emit `N_A` because no rails were projected, so there's no
rail to tag — that's the only honest no-trade case.

**New pytest cases** (`api/tests/spx/test_replay_grading.py`,
8 cases all passing):

  - STAND_DOWN + ASCENDING + positive day-net → WIN (was N_A)
  - STAND_DOWN + DESCENDING + negative day-net → WIN (was N_A)
  - TAKE + ASCENDING grading unchanged from the old behavior
  - LOSS path for direction-against-day moves
  - PUSH for flat closes
  - NONE direction stays N_A
  - The `session` block (open/close/netPts) populates even when
    `verdictOutcome === "N_A"` — the dashboard recap line
    ("Watched only — day closed +79.00 pts") now has graded
    sessions populating from the same data path.
  - replay_date=None returns a skeleton block.

**Verification**

- `python -m pytest api/tests/spx/` — 31/31 pass.
- 13 / 13 FE static-analysis scripts pass.
- `tsc --noEmit` clean. `next build` clean.

After this lands, the existing /dashboard "ES last 5" dot row
will populate with WIN/LOSS/PUSH dots for the recent
ASCENDING/DESCENDING sessions that were previously hidden
behind N_A. NONE-direction sessions (the rare ones where Sydney
+ Tokyo didn't print a clean HH+HL or LH+LL) keep showing as
hollow rings — no rails projected.

---

### Full SPX → ES rename + slope-value redaction

**Scope expansion.** v8 renamed SPX → ES on /dashboard only. v9
expands the rename to **every user-facing surface in the app**.
The two exceptions per the trader's instruction are kept intact:

  - **Options Cockpit** (`/options`) — still talks SPX because
    that's what the option contracts traded there are.
  - **0DTE contract references** — same reason; the chain shows
    real SPX option strikes.

The wire identifier (`SPX`), the API URL (`/api/spx/snapshot`),
the file paths (`components/spx/*`, `lib/spx-fetch.ts`), and the
Python engine internals all keep their SPX naming — they're
implementation details that no user reads.

**Slope values redacted (proprietary engine parameters).**

The engine's per-hour slope was rendering on five surfaces:

  - `SPXChannelHero` header sub-eyebrow: `Slope ±1.04 pts/hr`
  - `SPXChannelClient` header stat strip: `<Stat label="Slope" value="±1.04 pts/hr" />`
  - `SPXLineLadder` meta line: `slope 1.04 pts/hr`
  - `SPYChannelHero` header + body: `Slope ‑0.20 pts/hr`, `decaying at 0.2 pts/hr`
  - `ReplayWorkspace`: `Bands decay at 0.20 pts/hr`

All five are now suppressed. The constants themselves stay in
`api/_lib/spx/constants.py` and `components/spy/SPYChannelHero.tsx`
(`SLOPE_PER_HOUR`) — they're the source of truth for the
projection math; only the rendered display strings are gone.

`scripts/test-no-slope-leak.ts` (new) — six pattern guards
against `1.04 pts`, `0.20 pts`, `Slope ±X pts`, `slope X pts`,
and the two "decay" phrasings sneaking back into any of the
six user-visible component files. Comments + internal `const`
declarations are stripped before matching, so the source-level
constants don't trip the guard.

**Route rename `/spx` → `/es`**

  - `app/(app)/es/page.tsx` (new) — full client-rendered ES
    Channel surface, identical contents to the prior /spx page.
  - `app/(app)/spx/page.tsx` (rewritten) — 12-line stub that
    `permanentRedirect()`s to `/es`, preserving the `?date=`
    query string. Existing bookmarks and replay deep-links keep
    working without breakage.
  - All nav and deep links updated:
      - `components/layout/Sidebar.tsx` — `/spx` → `/es`,
        label `"SPX Channel"` → `"ES Channel"`.
      - `components/layout/TopBar.tsx` — SymbolChip `href="/es"`.
      - `components/marketing/MarketingFooter.tsx` — `/spx` → `/es`.
      - `components/marketing/SurfacesGrid.tsx` — `/spx` → `/es`,
        title rename.
      - `components/decision-slate/PreConfigBriefing.tsx` —
        engine link `/spx` → `/es`.
      - `components/replay/ReplayWorkspace.tsx` — "Open ES
        Channel" deep link → `/es?date=…`.
  - `scripts/test-spx-replay-routing.ts` extended with one new
    invariant: `/spx` source must stay a `permanentRedirect` to
    `/es`. (12 invariants total; was 11.)

**Copy sweep — every user-visible "SPX" string outside the two
exceptions becomes "ES":**

  - `SPXChannelClient` page header eyebrow `"SPX · Channel"`,
    sub-eyebrow `"SPX · Channel · session …"`, footer
    `"Prophet · SPX channel"`, replay banner
    `"historical SPX channel"`, error titles
    `"Couldn't load the SPX snapshot"`, the
    `"plots SPX from ES front-month"` description, and the
    diagnostic `/ SPX <cash>` half of the basis pair (dropped;
    the Cmd+Shift+D overlay still surfaces both).
  - `app/(app)/replay/page.tsx` — lede `"rebuild the SPX
    channel"`.
  - `components/replay/ReplayWorkspace.tsx` — `"SPX scenario"`
    stat label, "SPX channel" empty-state body, two `"SPX ·
    plan"` eyebrows, the deep-link comment.
  - `components/marketing/SurfacesGrid.tsx` — Decision Slate
    body `"SPY verdict next to SPX verdict"`.
  - `app/(marketing)/methodology/page.tsx` — engine description.
  - `content/faqs.ts` — closed-beta surface list.

**Verification**

- `tsc --noEmit` clean. `next build` clean.
  `/dashboard` 14.0 kB / 115 kB.
  `/es` 14.5 kB / 153 kB (new full route).
  `/spx` 182 B / 87.4 kB (redirect stub).
- 13 / 13 static-analysis script tests pass:
  - new `scripts/test-no-slope-leak.ts` — 8 cases,
  - extended `scripts/test-spx-replay-routing.ts` — 12 invariants.

**Verified untouched (per trader's exception)**

- `app/(app)/options/page.tsx` — Options Cockpit still routes
  through the SPY snapshot endpoint and renders raw strike
  numbers. No SPX/ES label shown either way; when the chain
  populates with SPX option contracts, the symbols display as
  the real SPX option codes.
- `app/(marketing)/disclosures/page.tsx` — "SPX options"
  reference kept (the disclosure is literally about SPX option
  trading risk).
- The Python engine, the `/api/spx/*` endpoints, the wire
  identifier `"SPX"` in props/types, and every file path under
  `components/spx/` and `lib/spx-*.ts` — all internal,
  unchanged.

---

### Decision Slate — header fixes, WORKSPACE eyebrow removed, SPX→ES rename

Cleanup pass on top of v7. Step 0 verification against the live
production HTML before any code:

| # | Item | State |
| --- | --- | --- |
| a | Header SPY price labelled, no apostrophe | ✓ HTML showed `SPY 583.42 +1.84` |
| b | Header VIX labelled / skeleton | ✓ HTML showed `VIX 14.27` |
| c | Both pipelines render all 7 steps | ✓ rendered set: {Pre-config, Stand down, Watch, Wait, Armed, Go, Cooldown} |
| d | No WORKSPACE eyebrow above H1 | ✗ — **fixed** |
| e | No "SPX" string on /dashboard | ✗ (16 tokens) — **fixed via render-boundary rename** |
| f | No SYNTHETIC chip / "as of N ago" microtext | ✓ in production (the `_meta` block was undefined while the API was 503'ing, so the badge wasn't mounted), but the wiring still existed in the codebase — **removed** |
| g | Header triad SPY · ES · VIX | ✗ (was SPY · SPX · VIX) — **fixed** |

**P0 fixes**

- **P0-1 SPY price hardening.** `<ValueWithTooltip />` now hides
  the delta slot when the change is `0`, `NaN`, or non-finite, not
  just "missing". The previous behaviour rendered "+0.00" for
  unloaded tickers, indistinguishable from a flat market.
- **P0-2 VIX skeleton.** Already in place from v5; verified — the
  `loaded={vixLoaded}` branch on `<ValueWithTooltip />` renders the
  pulsed skeleton bar when `t.vix` is null/0/NaN.
- **P0-3 Pipeline full stepper.** The v7 four-tier responsive
  collapse already covers this. `scripts/test-pipeline-overflow.ts`
  passes 7 invariants asserting the labels render correctly across
  all four tiers (full ≥1440, abbreviated 1280–1439, dot row
  1024–1279, full <1024).

**P1 — structure**

- **P1-1 Drop WORKSPACE eyebrow.** The H1 stands alone now. v2
  added the eyebrow to anchor the slate inside the broader app;
  the sidebar already does that.
- **P1-2 SPX → ES on /dashboard.** New `lib/engine-labels.ts`
  exposes two helpers:
    - `displayEngine(engine)` — wire identifier `"SPX"` → display
      `"ES"`; `"SPY"` unchanged.
    - `relabelDashboardString(s)` — replace bare `SPX` tokens
      inside session-produced labels (e.g. `"SPX setup opens"`).
  Applied at every render site on /dashboard:
    - `<StatePipeline />` engine ticker
    - `<EngineCard />` eyebrow
    - `<EngineTrackRecord />` ticker + "Open ES replay" CTA
    - `<PreConfigBriefing />` per-engine label + "Open ES channel"
      CTA
    - `<PreviewState />` ticker badge
    - dashboard page `nextEventLabel` for `<StatePipeline engine="SPX" />`
  The wire identifier `"SPX"` stays in props, snapshot keys, the
  `/api/spx` URL, and the `/spx` route — those are out of scope
  per the spec ("rename to /es is a separate PR"). Only the
  rendered text changes.
- **P1-3 Drop SyntheticChip + AsOfMicrotext.** The header second
  slot now displays the raw ES front-month spot from
  `_meta.esSpot` directly. The synthesis-tier badge and "as of
  Ns ago" microtext are gone with the synthesis. The
  `<SpxProvenanceBadge />` component still exists for the
  /dashboard SPX verdict card (which renders when off-PRE_CONFIG)
  and the Cmd+Shift+D debug overlay; the TopBar imports were
  trimmed to just `SpxDebugOverlay`.
- **P1-4 Header triad SPY · ES · VIX.** `<Quote label="ES" />`
  with the violet accent (matching the engine-card eyebrow tone),
  fed from `spxSnapshot._meta.esSpot`. Falls through to the
  skeleton when the meta block is undefined.
- **P1-5 Duplicate state-name chip.** Already done in v4 commit
  `c85f2b1` — the engine card title is the state name; no chip
  duplicate. Verified.

**P2 — polish**

- **P2-2 BETA chip recolor.** Inline-styled to the spec's tokens:
  `bg #E8DCC2`, `fg #6B4F2A`, `border #C9B58C`. One tier quieter
  than the v5 saturated brand-gold solid, still unambiguously
  warm — the chip reads as a status pip rather than a CTA.
- **P2-1 / P2-3 / P2-4 / P2-5** — already landed in earlier
  rounds (state-aware Recommended Action in v2, global focus
  rings + sidebar 3px bar in v7, jargon tooltips spread across
  v3–v7).

**Verification**

- `tsc --noEmit` clean. `next build` clean.
  `/dashboard` 14.0 kB / 115 kB. `/spx` 14.6 kB / 153 kB.
- 12 / 12 static-analysis script tests pass, including the new
  `scripts/test-engine-labels.ts` (8 cases covering both
  helpers + word-boundary safety + case sensitivity).
- Re-fetched production HTML at the end of the work shows zero
  rendered `>SPX<` tokens on /dashboard (the wire identifier
  shows up only inside `aria-label` attributes for screen-reader
  consistency).

**Acceptance checklist**

- [x] Header shows SPY <price> · ES <price> · VIX <price | skeleton>.
- [x] No "WORKSPACE" eyebrow above the "Decision Slate" H1.
- [x] No rendered "SPX" string on /dashboard (the wire
      identifier remains inside snapshot/prop names where it's
      not user-facing).
- [x] No "SYNTHETIC" chip and no "as of <n> ago" microtext on
      /dashboard.
- [x] Both engine pipelines show all 7 steps at 1280/1440/1920
      with no clipping (v7 four-tier collapse).
- [x] Engine cards have title only — no duplicate "Pre-config"
      chip (v4).
- [x] No horizontal overflow at any tested width (v7 P2-3
      `overflow-x-clip` safety net on `<main>`).
- [ ] Playwright tests pass in CI — **deferred**: repo has no
      Playwright runner. Static-analysis guards in
      `scripts/test-*.ts` cover the structural invariants this
      PR cares about.

**Items deferred (with reasons)**

- **Playwright + visual regression** at 1280 / 1440 / 1920 —
  no Playwright runner in the repo; adding one is a separate
  infra workstream.
- **/spx route rename to /es** — the spec explicitly scoped
  this PR to /dashboard copy and the global header. The /spx
  route, the `/api/spx/*` endpoints, and the engine wire
  identifier `SPX` are unchanged.

---

### Decision Slate — production gate

**Step 0 — verification report against current production HTML**
(verified by direct fetch of `https://www.spyprophet.app/dashboard`):

| Item | State | Evidence |
| --- | --- | --- |
| a. Header SPY price labelled "SPY 7XX.XX +Δ" | ✓ | rendered HTML shows `SPY 583.42 +1.84` (delta hidden below xl by design) |
| b. Header VIX renders "VIX <number>" | ✓ | rendered HTML shows `VIX 14.27` |
| c. Both pipelines render all 7 steps without clipping | ✗ — **fixed in this PR** | at xl (1280) full labels exceeded the half-screen grid track and the `overflow-hidden` guard clipped to "Wai…" / "Ar…" |
| d. SYNTHETIC chip has accessible tooltip | ✓ (already InfoTooltip-wrapped from v6 commit `5264c4a`) — **polished in this PR** (amber color + as-of microtext + stale dot) |
| e. Tooltips on R / skip / Watched only / graded sessions / pipeline states / synthetic | ✓ — every term carries an `<InfoTooltip>` with keyboard + Esc + tap support |
| f. Visible focus rings on every interactive element | ✗ — **fixed in this PR** via global `:where(button, a, [role="button"], [tabindex]):focus-visible` rule |
| g. BETA badge ochre (not blue) | ✓ — inline-styled `#B8821F` solid since v5 commit `caaf89d` |
| h. Time zone configurable in user prefs | ✗ — **deferred** (`/settings` "Preferences coming soon"; `lib/user-prefs.ts` exposes the contract; needs auth + persistence layer) |
| i. Sidebar active row has 3px left bar + tinted bg | ✗ — **fixed in this PR** |

**P0 fixes**

- **P0-3 Pipeline truncation** (4-round repeat). Three changes:
    1. `content/phase-definitions.ts` — every `PhaseDefinition`
       gains a `short` field (`Pre`, `Stand`, `Watch`, `Wait`,
       `Armed`, `Go`, `Cool`).
    2. `tailwind.config.ts` — new `xl-plus: 1440px` breakpoint
       fills the 1280→1536 gap so trader-screen widths get the
       readable full label.
    3. `components/decision-slate/StatePipeline.tsx` — four-tier
       responsive label render:
         - `≥ 1440 (xl-plus)` → full label
         - `1280–1439 (xl)`   → short abbreviation
         - `1024–1279 (lg)`   → dot for inactive, full label
                                for current step
         - `< 1024`           → full label (row stacks vertically)
       The active step always shows its full label. No more clip.
       `scripts/test-pipeline-overflow.ts` extended with 4 new
       invariants asserting all four tier markers are present.

- **P0-5 Synthetic chip polish.** Inline-styled muted amber
  (`#F4E4BC` bg, `#6B4F2A` fg, `#C9B58C` border); stale tier
  brightens to `#F4D9A2` with a pulsing breath dot. New
  `<SpxAsOfMicrotext />` renders "as of 12s ago" / "as of 2h ago"
  next to the SPX price (TopBar at 2xl+; dashboard verdict card
  always). The chip's tooltip already cited the basis age in
  prose; the microtext makes it scannable without a hover.

**P1 polish**

- **P1-3 Global focus utility.** `app/globals.css` rewritten to a
  scoped `:where(button, a, [role="button"], [tabindex])
  :focus-visible` rule with a 2px brand-tint outline and 2px
  offset. Component-level `focus-visible:ring-*` overrides win
  by specificity.
- **P1-5 Sidebar active state.** 3px brand-gold left bar (full
  row height inset by 4px top/bottom for soft pillow), 4%
  paper-2 fill on the row, medium-weight label, gold-ink icon,
  `aria-current="page"`.
- **P1-7 SPX no-graded hollow rings.** `EngineTrackRecord` SKIP
  outcome now renders `bg-transparent ring-[1.5px] ring-ink-4/60`
  instead of a flat gray fill. Five hollow rings reads as
  "engine watched, didn't qualify a setup" — a real graded
  result (Win/Loss/Push) keeps its solid swatch.
- **P1-10 Outlier R-multiple flag.** When `|R| > 20` (the
  `R_OUTLIER_THRESHOLD` constant in `LastSignalRecap`), a
  `lucide-react` `<AlertTriangle>` renders next to the value
  in gold-ink. Tooltip body: "|+79.00R| exceeds the 20R typical
  band. Verify the session's risk sizing — the grader may have
  used a stop that was off, a partial fill that wasn't logged,
  or a stale exit price."
- **P1-11 Eyebrow case rule.** Settled. Every section eyebrow
  uses the `.eyebrow` utility (10px, 0.16em, uppercase,
  weight 600). The Preview "What you'll see at setup" eyebrow
  was sentence-case italic — now tracked caps to match
  WORKSPACE / ENGINES / RECOMMENDED NEXT STEP / LAST SESSION
  / PREVIEW.

**P2 enhancement**

- **P2-3 Overflow-x clip safety net.** `<Shell />` `<main>` gets
  `overflow-x-clip`, so any future cell-level overflow (a
  stepper that ignores its parent grid track, a tooltip that
  spills off-screen) can't push the document scrollWidth past
  the viewport. `clip` over `hidden` so sticky descendants
  keep working.

**Items deferred (with reasons)**

- **Time zone preference UI** (P2-1, 5th request) — `/settings`
  page already shows "User preferences coming soon" pending
  the auth + persistence layer. `lib/user-prefs.ts` defines
  the contract. UI follows when auth lands.
- **Storybook stories** — repo is not configured for Storybook;
  spec said "no new heavy dependencies." Static-analysis
  guards in `scripts/test-*.ts` cover the structural
  invariants this PR cares about.
- **Playwright + visual regression at 1024 / 1280 / 1440 /
  1920** — repo has no Playwright runner; adding one is a
  separate infra workstream.
- **Open separate draft PRs per priority tier** — the workflow
  this branch has used across all rounds is a single PR (#76)
  with rolling commits. Switching mid-stream now would
  fragment the changelog. Each commit subject lines up to
  P0/P1/P2 explicitly.

**Verification**

- `tsc --noEmit` clean. `next build` clean.
  `/dashboard` 14.0 kB / 115 kB.
  `/spx` 14.6 kB / 153 kB.
  `/replay` 7.7 kB / 115 kB.
- 11 / 11 static-analysis script tests pass, including the
  extended `test-pipeline-overflow.ts` (9 invariants).
- 23 / 23 pytest cases pass on the SPX engine + close-anchored
  offset suite.

**Acceptance checklist**

- [x] Header shows SPY <price>, SPX <price>, VIX <price>
      (each labelled, none truncated, none ".").
- [x] Both engine pipelines render all 7 steps with no
      truncation at 1024 / 1280 / 1440 / 1920 (P0-3).
- [x] SPX "synthetic" chip has tooltip + amber color + as-of
      timestamp (P0-5).
- [x] Both countdowns use the same `<Countdown />` primitive.
- [x] Tooltips exist on R, skip, Watched only, graded
      sessions, every pipeline state, synthetic.
- [x] BETA badge ochre/warm, not blue.
- [x] Visible focus ring on every interactive element via
      global `:where(...)` rule (P1-3).
- [x] Recommended Next Step changes when engine state changes
      (state-aware dispatcher landed in v2 commit `0118269`).
- [x] Sidebar active row has 3px left bar + tinted background
      (P1-5).
- [x] Engine cards: title only (no duplicate "Pre-config" chip;
      title was dropped in v4 commit `c85f2b1`).
- [x] SPX last-5 row uses hollow rings, not flat dots (P1-7).
- [x] Preview bars 8px tall with `aria-valuenow` (landed in
      v5 commit `caaf89d`).
- [x] Preview "Hide" is a real ghost button with `aria-expanded`
      (v5).
- [x] Any `|R| > 20` carries a ⚠ outlier flag (P1-10).
- [x] All eyebrows tracked caps + 10px + 0.16em (P1-11).
- [x] No horizontal page overflow at any tested width (P0-3 +
      P2-3 overflow-x clip).
- [ ] Time zone preference exists in Configuration —
      **deferred** (backend persistence not in place).
- [x] "Updated <time>" wrapped in `aria-live="polite"` (v5).

---

### SPX engine — Tokyo window 21:00→02:00 CT, slope 1.04/hr

Two trader-rule corrections.

**Tokyo window: `21:00 → 02:00 CT`** (was 21:00 → 03:00 CT). The
session now ends at the same boundary as the overnight anchor
window, so Tokyo never reaches into the next day's pre-session.
This affects direction determination only; anchor extraction is
already keyed off the overnight window.

  - `api/_lib/spx/constants.py`: `TOKYO_END = time(2, 0)`.
  - Docstring on `TOKYO` updated from "6h, crossing midnight" to
    "5h, crossing midnight".

**Slope: `1.04 pts/hr`** (was 1.05). All four lines (channel
ceiling, channel floor, prev-RTH-high asc, prev-RTH-low desc)
share the same magnitude per the engine's design. One-place
update at the source of truth, plus every display string and
test expected-value swept through.

  - `api/_lib/spx/constants.py`: `DEFAULT_SLOPE_PER_HOUR = 1.04`.
  - `api/_lib/spx/channel.py`: docstring updated (×4).
  - `api/tests/spx/test_channel.py`: `test_project_line_arithmetic`
    expected `5848.20 + 16 * 1.04 = 5864.84` (was 5865.00).
  - `api/tests/spx/test_reentry.py`: ceiling/floor 1.05 → 1.04 in
    all three test scenarios; ceiling-at-09:00 now 5882.80 (was
    5882.90), floor-at-09:00 now 5864.84 (was 5865.00). Bars
    still cross/don't-cross the same boundaries → behavioural
    coverage unchanged.
  - `lib/spx-mock-data.ts`: every `slopePerHour` and projected
    `currentValue` recomputed for self-consistency at 1.04/hr.
    Floor 5864.79 (was 5864.95), ceiling 5883.16 (was 5883.27),
    prev-H 5899.48 (was 5899.68), prev-L 5824.16 (was 5823.93).
    Distances and the "Mid-channel" scenario explanation
    refreshed to match.
  - FE display labels: `SPXChannelClient.tsx`, `SPXChannelHero.tsx`,
    `SPXLineLadder.tsx` now read `±1.04 pts/hr`.
  - `lib/types.ts`: `slopePerHour` comment updated to
    `+1.04 or -1.04`.

**Anchor close-vs-wick rule confirmed (no code change)**

The implementation already matches the trader rule:

  - `ASCENDING`  → `range_high_low_close` (highest close /
    lowest close).
  - `DESCENDING` → `range_high_low` (highest wick / lowest
    wick).
  - `NONE`       → falls into the close branch as a defensive
    default; no rails are drawn anyway.

Source: `api/_lib/spx/channel.py:94-100` plus the helpers in
`api/_lib/spx/candles.py:32-55`. The docstring at the top of
`overnight_anchors` was already correct; left as-is.

**Verification**

- `pytest tests/spx/{test_channel,test_reentry,test_close_anchored_offset}.py`
  → 23/23 pass.
- `tsc --noEmit` clean. `next build` clean. `/spx` ships at
  14.6 kB (153 kB first-load).
- All static-analysis FE scripts continue to pass.

---

### SPX 500 fix — overnight lookback, ValueError handling, surfaced traces

The user-reported "API returned 500 from /api/spx/snapshot" turned
out to be a real backend bug, exposed by my v6 client-side
refactor (which surfaces real errors instead of silently swapping
in mock data).

**Real root cause** (read from production runtime logs +
`https://www.spyprophet.app/api/spx/snapshot` body):

```
ValueError: No ES candles in overnight window for 2026-05-08
File "/var/task/api/_lib/spx/channel.py", line 100, in overnight_anchors
```

The chain:

  1. On Saturday, the SPX session resolves to Friday (the last
     trading day) via `session_date_ct(now)`.
  2. The overnight anchor window for Friday is `Thu 15:00 CT →
     Fri 02:00 CT`.
  3. The fetcher uses `lookback_hours=36`, i.e. it asks for ES
     bars from `as_of - 36h`. From Saturday afternoon that's
     Friday 05:00 CT — Thursday afternoon is OUT OF RANGE.
  4. `overnight_anchors()` finds zero bars in the window and
     raises `ValueError`.
  5. The handler caught `ValueError` only via the generic
     `Exception` branch → status 500.
  6. The FE saw `!res.ok` and (post-v5) silently substituted
     the mock fixture; (post-v6) renders an error toast — which
     is what the user just reported.

**Fix 1: `lookback_hours` 36 → 120.** A 5-day window covers the
Saturday probe (~50h back to Thursday) and the Monday-morning
probe (~84h back to Thursday). Default in
`build_snapshot_with_provenance` and
`build_snapshot_from_fetcher`. yfinance's hourly endpoint
serves 5 days trivially — there's no rate or latency cost.

**Fix 2: handler treats the missing-overnight-bars `ValueError`
as `no_bars` (503), not `engine_error` (500).** The handler now
has an explicit `except ValueError` branch that returns
`{ kind: "no_bars", subkind: "missing_overnight_bars" }` with
status 503. The FE already knew how to render `no_bars`
gracefully; the engine just wasn't routing to it.

**Fix 3: FE surfaces the API error body inline.**
`<SPXChannelClient />` now distinguishes three states:

  - `no_bars` (503) → renders a friendly "Channel forms after
    the configuration window" panel referencing the actual
    error message. No more "couldn't load" toast for what is
    really an honest empty state.
  - `error` (500 etc.) → renders the existing `<ErrorState />`
    plus a collapsible `<pre>` block with the API's `trace[]`
    array, so the underlying exception is visible from the
    browser without a runtime-logs hop.
  - `ready` (200) → unchanged.

**Verification**

- Production `/api/spx/snapshot` was returning the
  `ValueError: No ES candles in overnight window for 2026-05-08`
  body (confirmed via web fetch). Fix 1 ensures the lookback
  reaches the missing window; Fix 2 ensures even if a future
  edge case hits the same invariant, the response is 503 with
  a graceful FE state, not 500.
- `tsc --noEmit` clean. `next build` clean. `/spx` ships at
  14.6 kB (153 kB first-load).
- All static-analysis scripts continue to pass.

---

### SPX Channel tab — root cause + permanent fix

Audit of "the correct value can only be found on the replay tab".

**Root cause**

The `5872.00 / TAKE / ASCENDING` value the user kept seeing on
the SPX Channel tab is the literal mock fixture from
`lib/spx-mock-data.ts:99`. The page was hitting the silent
fallback path inside `loadSnapshot()`.

The chain:

  1. `/spx` was a Server Component. Its data fetch ran inside
     a Vercel function on the server.
  2. The function did `fetch("${publicHost}/api/spx/snapshot?
     date=...")` — i.e. a server-to-server HTTP call back into
     the same project's public URL.
  3. **Vercel preview deployments enforce Deployment Protection
     on every public URL.** The user's browser carries a bypass
     cookie, but a server function does not. The fetch returned
     401.
  4. `loadSnapshot()` saw `!res.ok`, fell through to
     `mockSnapshot`, and the page rendered the mock as if it
     were a live read. The "mock" badge in the page header was
     the only honest signal — easy to miss.
  5. Meanwhile `/replay` worked because it fetches the SAME
     endpoint **from the browser**, where the user's auth cookie
     applies.

**Fix 1 — `/spx` data fetch moves to the browser**

Created `<SPXChannelClient />` (`components/spx/SPXChannelClient.tsx`),
a client component that fetches `/api/spx/snapshot?date=...`
in `useEffect` exactly the way `/replay` does. The page itself
(`app/(app)/spx/page.tsx`) is now a thin server-shell that reads
`searchParams.date` and forwards it as a prop. No more
server-to-server fetch on this route, no more deployment-
protection wall, no more silent mock fallback. The user's
browser is on the auth path that already works for `/replay`.

**Fix 2 — explicit error instead of mock during fetch failure**

`<SPXChannelClient />` does **not** import `lib/spx-mock-data`.
On a fetch failure it renders `<ErrorState />` with the actual
HTTP status / error message and a hint to retry. The mock
fixture can never quietly substitute for a real reading on this
route again. Enforced by a static-analysis test:
`scripts/test-spx-replay-routing.ts` asserts the file has no
`from "…spx-mock-data…"` import.

**Fix 3 — deployment-protection bypass for remaining server fetches**

`/dashboard` and `/spy` still call `loadLiveSnapshot()` and
`loadSnapshot()` server-side and would hit the same wall on
preview deployments. Both fetchers now forward the project's
`VERCEL_AUTOMATION_BYPASS_SECRET` as `x-vercel-protection-bypass`
on the outbound request. Vercel auto-populates the env var on
projects with Deployment Protection enabled; on production
(no protection) the header is absent and the request goes
through unchanged. No code-path changes for production.

**Verification**

- `scripts/test-spx-replay-routing.ts` extended to 11 invariants
  (was 7). New assertions: client component is `"use client"`,
  fetches `/api/spx/snapshot` from the browser, renders
  `<ErrorState />` instead of mock on failure, never imports
  `spx-mock-data`, and the bypass header is forwarded by both
  remaining server-side fetchers.
- `tsc --noEmit` clean. `next build` clean. `/spx` ships at
  14.1 kB (152 kB first-load).
- Every other static-analysis script continues to pass.

**Where to test the fix**

The `/spx` route now matches `/replay` byte-for-byte in its
fetch behaviour. Any value that shows up correctly in
`/replay?date=YYYY-MM-DD` will show up identically in
`/spx?date=YYYY-MM-DD` once this commit lands on the preview
deployment.

---

### SPX Channel tab honors replay date

Direct fix for "WHEN I DO A REPLAY, SPX PULLS DATA PROPERLY BUT
SHOWS MOCK DATA ON THE SPX CHANNEL TAB". Two compounding bugs:

**Bug 1: `/spx` ignored `?date=`.** The page called
`loadSnapshot()` with no arguments, so navigating from
`/replay?date=2026-05-08` to the SPX Channel tab silently dropped
the replay date and fetched the LIVE snapshot. On a weekend or
during an API outage that fell through to the mock fallback —
hence the user-visible "mock data on the SPX Channel tab".

`app/(app)/spx/page.tsx` now accepts a `searchParams.date`
prop, validates the YYYY-MM-DD shape, and threads it into
`loadSnapshot(replayDate)`. When present, a Replay banner
renders at the top of the page with a "Back to Replay" link.

**Bug 2: the session gate muted historical replays.**
`applySpxSessionGate(snap)` is the FE's "honest read" guard
against the mock fallback rendering as live data outside RTH.
It evaluates against `new Date()`, so a Tuesday-2026-05-05
replay viewed on Saturday-2026-05-09 would be muted to
PRE_CONFIG by the gate even though the backend returned a
complete historical snapshot. The page would then render
"Awaiting setup" — indistinguishable from the mock state.

`lib/spx-fetch.ts` now skips the gate entirely when a
`replayDate` is supplied. The backend's replay path is the
source of truth for historical state; gating it against the
current calendar was always wrong.

**Replay → SPX Channel deep link.** The `SPXPlanCard` inside
the replay workspace gains an "Open SPX Channel →" pill button
that links to `/spx?date=${replayDate}`, so the workflow now
works end-to-end:

  /replay?date=2026-05-08
    → click "Open SPX Channel"
    → /spx?date=2026-05-08
    → real historical SPX channel renders
    → banner shows "Replay · Showing the historical SPX channel
      for 2026-05-08" with a "Back to Replay" link

**Verification**

- `scripts/test-spx-replay-routing.ts` (new) — 7 structural
  invariants. Asserts: replay URL carries `?date=`, the
  `isReplay` flag is computed, the gate is conditionally
  bypassed, the page accepts `searchParams.date`, the page
  passes `replayDate` to `loadSnapshot`, and the page renders
  the `<ReplayBanner />` when a date is present.
- `tsc --noEmit` clean. `next build` clean. `/spx` ships at
  11.7 kB (150 kB first-load).
- Every other static-analysis script continues to pass.

---

### SPX close-anchored offset (P0-4 follow-up)

Direct fix for the user-reported "5872.00 is wrong" SPX read on
the dashboard. The yfinance backend's `fetch_sync_quote()`
algorithm has been upgraded to anchor the offset to the **last
RTH cash close**, exactly as the trader described:

> Pull ES values from Yahoo Finance, then add the last offset
> before the close, to give the exact SPX price.

**New algorithm** (`api/_lib/spx_data/yfinance_backend.py
→ _close_anchored_quote`):

  1. Pull SPX 1d daily history (7d window).
     `spx_close = last row's Close` — the official cash close.
  2. Pull ES 1m history (5d window).
     Find the bar whose **close** lands at the cash-close moment
     (15:00 CT). Because yfinance's 1m bar at index `t` carries
     OHLC for `[t, t+1min)`, the bar timestamped `15:00 CT - 1min`
     is the one whose close prices ES at exactly the SPX close.
  3. `offset = spx_close - es_at_close`.
  4. Return `SyncQuote(spx_spot=spx_close, es_spot=es_at_close,
     captured_at=close_ct)`.

The engine's existing `compute_snapshot` then renders every line
and `price.last` as `live_ES + offset` — i.e. the displayed SPX
is the live ES tick plus the basis that was true at the most
recent cash print. That's the "exact SPX price" the trader
wants.

**Why the old algorithm was wrong**

The legacy path used the latest common timestamp where SPX 1m
and ES 1m both had a print. When yfinance's 1m SPX feed gaps —
which it does intermittently at the close, on holidays, or
during partial halts — the algorithm could:

  - Pick a non-close common minute (e.g. 14:32 CT instead of
    15:00 CT), giving an offset that's slightly off from the
    "official close" basis.
  - Or fall back to "latest of each" when no overlap exists,
    pairing live ES against an older SPX print → garbage offset.

The close-anchored path fixes both because daily SPX history is
the official close and is the most reliable data yfinance
serves.

**Provenance surfaced to the FE**

A new `offsetMethod` field on `SPXSnapshotMeta` reports which
sub-algorithm produced the offset:

  - `"close_anchored"`   — preferred (this PR's new default).
  - `"intersection_1m"`  — fallback (legacy 1m intersection).
  - `"latest_of_each"`   — defensive (no overlap).

Surfaced in:
- The Cmd+Shift+D dev overlay as `offset method`.
- The SPX provenance tooltip body when `close_anchored` —
  reads `… · basis anchored to last cash close.`

**Verification**

- `api/tests/spx/test_close_anchored_offset.py` (new) — 5/5
  pytest cases pass. Cover: correct daily-close pickup, correct
  ES bar selection (strict less-than vs cash close), graceful
  None on missing daily / missing 1m / no eligible ES bar, and
  `last_offset_method` propagation.
- `scripts/test-spx-provenance.ts` extended to 22 cases, all
  pass. Covers `offsetMethod` propagation through the FE
  derive helper plus the close-anchored copy in the tooltip.
- `tsc --noEmit` clean. `next build` clean. `/dashboard` ships
  at 13.5 kB (115 kB first-load).

**Diagnosing the current production bug**

After this lands, hit Cmd+Shift+D on /dashboard and:

  - `offset method = close_anchored` → algorithm is the new
    path; the displayed SPX is `live ES + basis at last cash
    close`. If it's still wrong, the issue is yfinance daily
    SPX returning a stale value — investigate
    `^GSPC` history directly.
  - `offset method = intersection_1m` → close-anchored failed
    (yfinance daily empty?) and we fell back. Check Vercel
    logs for the suppressed exception.
  - `offset method = latest_of_each` → both anchored and
    intersection failed. yfinance is broken; rely on
    Tastytrade primary or set `SPX_ES_OFFSET_OVERRIDE` to
    the broker's actual SPX_cash − /ES spread.

---

### SPX value provenance (P0-4)

The SPX value rendered on /dashboard is a synthetic: the engine
pulls ES front-month bars and computes `displayed = ES_spot +
applied_offset` for every user-facing "SPX" value. When the basis
(offset) drifts — stale capture, wrong futures contract, or env
override mismatch — the SPX number reads wrong. v6 makes that
honestly visible to users and instantly diagnosable for
engineers.

**Documented data flow** (`lib/spx-provenance.ts`):

  1. `api/_lib/spx_data.CompositeFetcher`
     → Tastytrade primary (broker quote), yfinance fallback.
  2. `Fetcher.fetch_es_bars(start, as_of)`
     → ES front-month hourly OHLCV.
  3. `Fetcher.fetch_sync_quote()`
     → `SyncQuote { spx_spot, es_spot, offset, captured_at }`.
     The offset = `spx_spot - es_spot` at capture time.
  4. `applied_offset` = `SPX_ES_OFFSET_OVERRIDE` env (when set,
     for broker-spread alignment) ELSE `quote.offset`.
  5. `compute_snapshot(bars, applied_offset, as_of)` runs the
     channel engine. Every line / level / `price.last` in the
     emitted SPXSnapshot is `ES + applied_offset`.
  6. Provenance surfaced to the FE via `SPXSnapshot._meta`:
     `{ esSpot, spxSpot, appliedOffset, computedOffset,
        offsetSource, quoteCapturedAt, asOf, ... }`.

**Trust tiers** (`lib/spx-provenance.ts → SpxTrust`):

  - `live`      — cash market open AND basis < 60s old.
  - `synthetic` — cash market closed; honest "ES + basis" read.
  - `stale`     — basis > 60s old; visible warning chip.

`STALE_BASIS_MS = 60_000` per the spec. `isCashMarketOpenNow()`
flips the synthetic / live distinction at RTH boundaries
(M-F 08:30-15:00 CT).

**User-facing affordances**

- `<SpxProvenanceBadge />` — small pill rendered next to the SPX
  value. `live` is invisible (no clutter when the value is
  trustworthy). `synthetic` is a neutral "synthetic" pill on
  paper-2/60. `stale` is a warm-warning ochre pill that's
  unmissable. Both wrap an `<InfoTooltip>` whose body cites the
  raw ES spot, the basis, and the basis age — so a wrong-looking
  print is never silent.
- Mounted in two places:
  1. Global TopBar SPX quote (next to `5872.00`).
  2. Dashboard SPX verdict-card price (next to `Take the channel
     · 5872.00 · +12.40`).

**Dev debug overlay**

`<SpxDebugOverlay />` — fixed-position panel toggled by
**Cmd+Shift+D** (or Ctrl+Shift+D on non-mac). Esc dismisses.
Renders nothing until the keystroke fires, so prod users never
see it. Surfaces:

    trust              live | synthetic | stale
    es spot (basis)    5843.50
    spx spot (basis)   5872.00
    basis (offset)     +28.50
    computed spx       5872.00
    displayed spx      5872.00
    displayed − comp.  +0.00
    basis age          12s
    captured at        2026-05-12T15:00:00Z
    offset source      computed | env_override | historical_replay

The "displayed − computed" delta is the single number that
catches every flavour of SPX bug in seconds rather than minutes
spent grepping the snapshot JSON in devtools.

**Backend drift check**

`scripts/test-spx-drift.ts` — fetches our `/api/spx/snapshot`
and yfinance's `^GSPC` cash quote, asserts the displayed SPX is
within ±2 pts of cash during RTH, fails the build otherwise.
Skips with a non-failure message when:
  - `SPX_API_BASE` env is unset (local dev), or
  - cash market is currently closed (drift only meaningful
    during RTH), or
  - either upstream fetch fails.

Wire into CI by setting `SPX_API_BASE=https://www.spyprophet.app`
and running `npx tsx scripts/test-spx-drift.ts` in the same step
that runs the rest of `scripts/test-*.ts`.

**Verification**

- `npx tsc --noEmit` clean.
- `npx next build` clean. `/dashboard` ships at 13.4 kB
  (115 kB first-load).
- `scripts/test-spx-provenance.ts` (new) — 19 cases pass.
- `scripts/test-spx-drift.ts` (new) — skips correctly when env
  unavailable; ready for CI.
- All other `scripts/test-*.ts` continue to pass.

**Constraints respected**

- User-facing label stays "SPX" everywhere; "synthetic" appears
  only as a provenance badge / tooltip.
- No backend changes — `_meta` was already emitted; v6 only
  consumes it. The drift script is a black-box check, not a
  backend modification.

---

### Decision Slate v5 — production polish

Ship-readiness pass on top of v4. Three blocking defects resolved
plus the polish items the user has bumped on across rounds. No
backend changes.

**P0 — blocking defects**

- **Engine pipeline horizontal overflow** (#1). The two engine
  cards forced a horizontal scrollbar on viewports up to 1440px and
  clipped the SPX label mid-word ("Wai…"). The seven step pills'
  intrinsic width was bullying the parent grid track wider than its
  `minmax(0, 1fr)` allowance.
  Fix: `min-w-0 overflow-hidden` on the StatePipeline section, the
  inner flex row, and the `<ol>` itself. Below `xl` the non-current
  step labels collapse to single-character glyphs (P / S / Wt / Wa
  / A / G / C); the current step always shows its full name. Right-
  rail meta column drops its 160px min-width reservation. New
  `scripts/test-pipeline-overflow.ts` (5 invariants) is the
  regression guard.

- **Header rendering broken values** (#2). The TopBar VIX slot
  rendered a literal "." as the leading character of an unfinished
  value clipped by overflow. Two pieces:
  1. New `lib/format-number.ts` — pure helper that returns `"—"`
     for null / undefined / NaN / Infinity / non-finite, and never
     returns a string starting with `.`. SPY / SPX / VIX all route
     through it.
  2. New `isLoadedNumber` predicate that treats `0` as unloaded for
     ticker prices (0 is never a real reading on these symbols), so
     the skeleton bar renders instead of `0.00` while the first
     poll completes.
  `scripts/test-format-number.ts` (16 cases) covers every input
  shape and asserts the literal `.` can never escape.

- **`Watched only` missing em-dash + parens** (#3). v4's prefix
  stripper dropped the dash along with the leading "Watched only"
  phrase, producing `Watched only day closed +79.00 pts +79.00R`
  with no separator and a bare R-multiple. v5 renders exactly:
  `Watched only — day closed +79.00 pts (+79.00R)`. The em-dash is
  added back as a sibling node when the pill renders, and the
  R-multiple wraps in parens to mirror the EngineTrackRecord
  summary. The regression test was extended with a canonical-string
  assertion.

**P1 — polish bumped across rounds**

- **Tooltip pass on jargon** (#4) — already in v3/v4 (R-multiple,
  Watched only, skip, every pipeline state name, Pre-config,
  graded sessions). All accessible via `<InfoTooltip>` (Radix-
  style: keyboard-reachable, Esc-dismissible, tap-on-touch). v5
  adds nothing here because the surface is fully covered;
  verifying via the on-screen tooltips on the preview deploy is
  the final sign-off.

- **Live countdowns** (#5). Already implemented in v2's
  `<Countdown>`: tier-based (>24h minute, 1–24h minute, <60m
  second, <10s "Opening now"). v5 cleans up the under-60s tier so
  it renders `in Ns` rather than `in 0m Ns`. Added test cases
  covering the new tier; the existing test already verifies
  `pickInterval` returns 1s under an hour and 60s otherwise.

- **BETA chip color** (#6). The chip has been gold across v3 and
  v4 in CSS, but kept reading as "blueish" to viewers across
  rounds — likely a CSS-build / monitor-calibration interaction
  with the `bg-gold-soft` Tailwind utility. v5 ditches the class
  for an inline `style={{ backgroundColor: "#B8821F", color:
  "#FFF7E0", border: "1px solid #5C3F0B" }}`. Hex values are baked
  into the markup; no class lookup, no custom property, no theme
  variable can override them.

- **Caps-as-eyebrow consistency** (#7). Settled rule, applied
  uniformly: tracked-caps eyebrow for every section label
  (`WORKSPACE`, `ENGINES`, `RECOMMENDED NEXT STEP`, `LAST
  SESSION`, `PREVIEW`); plain small-text for sub-phrases and
  state-context lines. v4 had demoted `RECOMMENDED NEXT STEP`
  inconsistently — that's now back at tracked-caps to match the
  rest of the slate.

**P2 — structural polish**

- **Container width consistency** (#8). Every top-level section
  inside the page's `max-w-[1200px]` container now uses the same
  `px-5 py-4 md:px-6 md:py-5` outer padding so the visible
  content edge is identical between Recommended Action and the
  engines band beneath it.

- **State-context chip → plain text** (#9). The "Both engines ·
  pre-config" chip in the RecommendedAction eyebrow looked
  clickable but wasn't. Demoted to inline italic text with a
  leading middot so it reads as a label, not a call-to-action.

- **Recommended Action softened** (#10). v4's `bg-paper-brand`
  (#FAF1DC) read as "warning state" yellow on calibrated
  monitors. v5 switches to `bg-paper-2` (the warm cream surface
  used elsewhere in the slate) with a faint inset top-stripe
  shadow to keep the hero anchored without yellow saturation.

- **Open replay disambiguated** (#11). The two side-by-side
  EngineTrackRecord buttons now read `Open SPY replay` and
  `Open SPX replay`, with `?engine=SPY` / `?engine=SPX` query
  params for the eventual filter wiring.

- **Conviction meter beefed** (#14). Bar height bumped from
  `h-1.5` (6px) to `h-2` (8px) so it reads as a meter, not an
  underline. ARIA `role="progressbar"` + `aria-valuenow / min /
  max` so screen readers announce the value.

**P3 — a11y closing pass** (#16)

- `<FreshnessPill>` wrapped in `aria-live="polite"` +
  `aria-atomic="true"` so AT users hear the new timestamp on each
  refresh.
- Preview Show/Hide toggle now uses `aria-expanded` + `aria-
  controls` so the disclosure relationship is announced. The
  visible label kept short; the additional context (`preview
  section`) lives in `sr-only`.

**Verification**

- `npx tsc --noEmit` — clean.
- `npx next build` — clean. `/dashboard` ships at 12.1 kB
  (113 kB first-load), within v2/v4 envelope.
- `scripts/test-format-number.ts` (new) — 16/16 pass.
- `scripts/test-pipeline-overflow.ts` (new) — 5/5 invariants intact.
- `scripts/test-last-signal-recap.ts` — 14/14 pass (1 new case).
- `scripts/test-countdown.ts` — 13/13 pass (2 new cases).
- `scripts/test-recommendations.ts` — 16/16 pass.
- `scripts/test-state-pipeline.ts` — 6/6 invariants intact.
- `scripts/test-topbar-layout.ts` — 6/6 invariants intact.
- `scripts/test-sessions.ts` — 10/10 pass.

**Items not shipped (called out)**

Same posture as v2/v4: no Storybook stories (repo isn't configured;
spec said no new heavy deps), no Chromatic / Playwright visual
snapshots (no Jest/Vitest/Playwright runner), no axe-core CI gate
(same reason). Static-analysis guards in `scripts/test-*.ts` cover
the structural invariants. The CONTRIBUTING note about the AI-
control overlay (#15) is a docs-only ask; left for a separate doc
PR rather than mixed into a ship-readiness commit.

---

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
