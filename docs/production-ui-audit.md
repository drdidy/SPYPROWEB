# SPY Prophet Production UI/UX Audit

Date: 2026-05-14

## Executive Read

The app has a strong visual thesis on the primary trading surfaces, but production readiness is uneven by tab. Decision Slate, SPY Channel, ES Channel, Replay, Foresight, and Daily Brief now carry the core product language. Secondary surfaces need to feel less like endpoint viewers and more like operator workspaces.

The highest-impact shared fixes are:

1. Reduce decorative chrome in shared headers and empty states.
2. Keep provider and infrastructure names out of user-facing surfaces.
3. Use one visual grammar for status, panels, numbers, and no-data states.
4. Make every tab explain what it is doing in trader language, without exposing proprietary rule mechanics.
5. Keep legal/disclaimer/build metadata consistent across the product.

## Route Findings

### Landing Page

Status: polished enough for beta, but still more narrative than operational.

Needed:
- Keep the hero focused on the product outcome, not internal methodology.
- Avoid publishing exact proprietary thresholds in public methodology copy.
- Keep CTA copy restrained and concrete.

### Decision Slate

Status: closest to production.

Needed:
- Continue protecting chart readability at mobile and tablet widths.
- Keep scorecard and state-rail spacing from becoming dense when more fields are added.
- Keep all ES references aligned to Pivot Fan vocabulary.

### SPY Channel

Status: strong but still data-truth sensitive.

Needed:
- Single freshness source for hero, panels, and option-chain states.
- Keep chart as the main visual; avoid small duplicated reference tables.
- Options chain empty state must always show retry/freshness rather than appearing broken.

### ES Channel

Status: now aligned to the Pivot Fan strategy.

Needed:
- Preserve native ES values; no offset applied to fan lines.
- Low Pivot is post-noon RTH low wick.
- Overnight higher-pivot ascending line is minor watch only.
- Labels should stay High Fan Ceiling/Floor and Low Fan Ceiling/Floor.

### Replay

Status: functional shell exists; usability depends on chart scale and transport coupling.

Needed:
- Chart panes should remain large and zoomed to active structure.
- ES replay lines should use Pivot Fan labels.
- Play controls must drive chart, trail, touch markers, and URL state together.

### Foresight

Status: useful conceptually, but should remain honest about projections.

Needed:
- SPY should render the six relevant lines only.
- ES should render Pivot Fan projections, including the minor overnight watch when present.
- Calibration must remain read-only unless written by Replay.

### Options Cockpit

Status: good data density, but still feels provider-led in places.

Needed:
- Keep a trader-centered frame: flow, chain, gamma, contract model.
- Never render synthetic chain rows.
- Show 5 above / 5 below plus ATM by default unless the user expands.

### Intelligence / Market Context / Order Flow

Status: useful, but secondary-tab polish is below the core surfaces.

Needed:
- Remove vendor names from rendered copy.
- Keep headlines/calendar stale-state language plain and session-aware.
- Use compact cards and measured empty states.

### Daily Brief

Status: improved after narrative refactor.

Needed:
- Keep it as a story first, evidence second.
- News after-hours should be recap context, not 0DTE trigger language.
- No model/vendor/infrastructure names in UI or rendered brief text.

### Learning

Status: visually polished but slightly too decorative.

Needed:
- Reduce illustrative fake line art when it does not teach a real concept.
- Keep public copy high-level enough that the exact strategy cannot be reverse-engineered.

### Journal / Signal Log

Status: acceptable for beta.

Needed:
- Archive should deepen into Replay links by timestamp.
- Empty state is good; keep it honest.

### Configuration

Status: safe but static.

Needed:
- Keep secrets and environment variable names out of UI.
- When account persistence arrives, convert preference cards into real controls.

## Changes Landed From This Audit Pass

- Compact shared app page headers and remove decorative geometry.
- Simplify shared dark empty states so they read as operational states, not marketing panels.
- Gate the sidebar workspace label by runtime environment.
- Remove user-facing vendor names from Order Flow copy.
- Document the ES Pivot Fan strategy vocabulary and production UI priorities.

