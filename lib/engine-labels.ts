// One-place mapping from engine identifier (the wire / data prop)
// to the user-facing label rendered in the UI.
//
// Why split label from identifier:
//   The engine the dashboard refers to as "ES" is the same one the
//   snapshot code, the API, and the routes call "SPX". The wire
//   contract uses SPX (channel logic, ^GSPC grading, /api/spx/*,
//   /spx route). The user-facing label as of v8 is ES — it's the
//   futures contract the engine actually pulls bars from, and the
//   number the trader reads off the chart. Renaming the identifier
//   would touch every backend file plus the route; renaming only
//   the label is a one-import change at the render boundary.
//
// Use:  <span>{displayEngine("SPX")}</span>  // → "ES"
//       <span>{displayEngine("SPY")}</span>  // → "SPY"

import type { Engine } from "@/lib/sessions";

export function displayEngine(engine: Engine): string {
  return engine === "SPX" ? "ES" : engine;
}

/**
 * Replace bare "SPX" tokens inside a free-form label with "ES".
 * Used on the dashboard for strings produced by lib/sessions.ts
 * ("SPX setup opens", "SPX RTH closes") — those are also consumed
 * by /spx and other routes that haven't been renamed, so the
 * source string stays as SPX and the dashboard relabels at the
 * render boundary.
 */
export function relabelDashboardString(s: string): string {
  return s.replace(/\bSPX\b/g, "ES");
}
