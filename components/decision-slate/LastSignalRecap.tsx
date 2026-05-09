// Single-line recap of the previous session's last signal — visible
// only while the engine is between sessions (PRE_CONFIG / STAND_DOWN /
// COOLDOWN). When no recap is available it returns null so the card
// doesn't render an empty box.
//
// v4 polish:
//   - The "Watched only" path no longer renders the phrase twice.
//     v3 swapped the side label to a pill but left the body
//     ("Watched only — day closed +79.00 pts") untouched, so the
//     user saw "watched only Watched only — day closed". The body
//     is now stripped of its leading "Watched only" prefix when
//     the pill renders.
//   - "R" gets an InfoTooltip ("Profit/loss in multiples of initial
//     risk") on its first occurrence per recap. The trigger is the
//     literal letter R appended to the multiple, so the helping
//     gloss sits exactly where the unfamiliar token does.

import type { LastSignalSummary } from "@/types/decision-slate";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/utils";

interface Props {
  recap: LastSignalSummary | null;
  className?: string;
}

// Match "Watched only" or "watched only", optionally followed by a
// dash/middot/colon and surrounding whitespace. Captures the rest so
// we can render it as the body without the duplicated phrase.
const WATCHED_PREFIX = /^\s*watched only\s*(?:[—–\-·:]\s*)?/i;

export function LastSignalRecap({ recap, className }: Props) {
  if (!recap) return null;
  const sideTone =
    recap.side === "LONG" ? "text-state-bullish" : "text-state-bearish";
  const isWatched = WATCHED_PREFIX.test(recap.oneLine);
  // When the pill takes over the "Watched only" branding, the body
  // should be the remaining sentence only — no second copy of the
  // phrase.
  const body = isWatched
    ? recap.oneLine.replace(WATCHED_PREFIX, "").trim()
    : recap.oneLine;
  const rValue =
    recap.rMultiple == null
      ? "—"
      : `${recap.rMultiple > 0 ? "+" : ""}${recap.rMultiple.toFixed(2)}`;
  const rTone =
    recap.rMultiple == null
      ? "text-ink-3"
      : recap.rMultiple > 0
        ? "text-state-bullish"
        : recap.rMultiple < 0
          ? "text-state-bearish"
          : "text-state-neutral";

  return (
    <div className={className}>
      <div className="eyebrow text-ink-3 mb-1">Last session</div>
      <div className="flex items-baseline gap-2 flex-wrap text-[12px] font-mono tabular-nums">
        {isWatched ? (
          <InfoTooltip
            label="Watched only"
            content="Engine generated a setup but no graded execution was logged for this session."
          >
            <span className="text-ink-3 font-semibold tracking-[0.02em] cursor-help">
              Watched only
            </span>
          </InfoTooltip>
        ) : (
          <span className={cn("font-semibold", sideTone)}>{recap.side}</span>
        )}
        {/* v5 #3: restore the em-dash separator that v4 stripped along
            with the leading "Watched only" prefix. The pill carries
            the phrase, the dash carries the connector, the body
            carries the substance. */}
        {isWatched && body && (
          <span className="text-ink-4" aria-hidden>
            —
          </span>
        )}
        <span className="text-ink-2">{body}</span>
        {/* v5 #3: R-multiple now renders in parens to match the
            EngineTrackRecord summary pattern — visual rhyme between
            the two surfaces. */}
        <span className={cn("font-semibold inline-flex items-baseline", rTone)}>
          (
          {rValue}
          <InfoTooltip
            label="R-multiple"
            content="Profit or loss expressed as multiples of the trade's initial risk. +1.5R means the move was 1.5× the original stop distance in the favorable direction."
          >
            <span className="cursor-help">R</span>
          </InfoTooltip>
          )
        </span>
      </div>
    </div>
  );
}

// Pure helper exported for testing — used by scripts/test-last-signal-recap.ts
// to assert the duplication can't sneak back in.
export const __test = { WATCHED_PREFIX };
