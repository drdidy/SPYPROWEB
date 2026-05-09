// Single state shape consumed by both engine cards on the Decision
// Slate. The discriminated union on `instrument` lets a single card
// component render either side without per-engine prop drilling.
//
// This type does NOT replace the existing AdaptedSnapshot / SPXSnapshot
// shapes — the cards pull what they need from those, then assemble
// this view-state at the page boundary. Keeping a slim, slate-specific
// shape decouples the editorial UI from the wire formats.

import type { EngineState } from "@/lib/states";

export type Instrument = "SPY" | "SPX";

export type GradeLetter =
  | "A+"
  | "A"
  | "B+"
  | "B"
  | "C"
  | "D"
  | "NO_TRADE"
  | null;

export interface LastSignalSummary {
  side: "LONG" | "SHORT";
  /** ISO timestamp of the signal trigger. */
  triggerAt: string;
  /** ISO timestamp of the exit, or null if still open. */
  exitAt: string | null;
  /** R-multiple realized, or null for unfilled / open. */
  rMultiple: number | null;
  /** One-line description for the recap card ("LONG @ 583.10 → 587.40 (+1.6R)"). */
  oneLine: string;
}

interface SlateBase {
  /** Shared identifier so consumers can write a discriminated union. */
  instrument: Instrument;
  phase: EngineState;
  /** Conviction value on the engine's native scale. SPY: 0..5, SPX: 0..100. */
  conviction: number | null;
  /** Conviction max — drives the ConvictionTrack scale. */
  convictionMax: number;
  /** Letter grade or null when not yet graded. */
  grade: GradeLetter;
  /** ISO timestamp of the next scheduled session transition. */
  nextEventISO: string;
  /** Human-readable label for the next event. */
  nextEventLabel: string;
  /** ISO timestamp of the last data refresh; drives <FreshnessPill>. */
  freshnessISO: string;
  /** Where the data came from. Surfaced in the FreshnessPill tooltip. */
  source: string;
  /** Optional recap of yesterday's last signal; null when none. */
  lastSignal: LastSignalSummary | null;
}

export interface SpySlateState extends SlateBase {
  instrument: "SPY";
  /** SPY-specific middle metric. */
  bias: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
}

export interface SpxSlateState extends SlateBase {
  instrument: "SPX";
  /** SPX-specific middle metric. NONE / not yet formed reads neutral. */
  channel: "ASCENDING" | "DESCENDING" | "NONE" | null;
}

export type DecisionSlateState = SpySlateState | SpxSlateState;
