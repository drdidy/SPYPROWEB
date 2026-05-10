// MetricSlot — slate-deliverable replacement for <Metric />. Same
// label / hint / value contract, but enforces the rule that a
// metric without a value must show an em-dash AND helper copy
// underneath, so the column never renders a label-only ghost.
//
// The original <Metric /> is preserved for legacy callers, but new
// code should reach for <MetricSlot />.

import { type ReactNode } from "react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SLATE_COPY } from "@/content/copy";

interface Props {
  label: string;
  /** Live value when present; null/undefined renders the placeholder. */
  children?: ReactNode;
  /** Tooltip explaining the metric. */
  hint: string;
  /** Helper copy shown below the em-dash when empty. */
  helperWhenEmpty?: string;
  /** Faint placeholder shown next to the em-dash (e.g. "e.g. B+"). */
  example?: string;
}

const DEFAULT_HELPER = "Populates at setup";

export function MetricSlot({
  label,
  children,
  hint,
  helperWhenEmpty = DEFAULT_HELPER,
  example,
}: Props) {
  const isEmpty =
    children === undefined ||
    children === null ||
    (typeof children === "string" && children.trim() === "");
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[11px] tracking-[0.10em] uppercase text-ink-2">
          {label}
        </span>
        <InfoTooltip label={label} content={hint} />
      </div>
      <div className="min-h-[28px] flex items-end">
        {isEmpty ? (
          <span
            aria-label={SLATE_COPY.a11y.noValueYet}
            className="font-mono text-meta tabular-nums text-ink-3 inline-flex items-baseline gap-1.5"
          >
            <span aria-hidden className="text-ink-4">
              —
            </span>
            {example && (
              <span className="text-ink-4 italic normal-case tracking-normal">
                {example}
              </span>
            )}
          </span>
        ) : (
          children
        )}
      </div>
      {isEmpty && (
        <p className="mt-1 text-[10.5px] tracking-[0.02em] text-ink-3">
          {helperWhenEmpty}
        </p>
      )}
    </div>
  );
}
