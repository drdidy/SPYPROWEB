// Metric column primitive used by the verdict cards. Carries a label,
// an info tooltip explaining the scale + computation, and a faint
// example value when the real value is missing — better than a bare
// em-dash because it tells the user what they're going to see.

import { type ReactNode } from "react";
import { HelpHint } from "@/components/slate/HelpHint";
import { SLATE_COPY } from "@/content/copy";

interface Props {
  label: string;
  /** Render the live value when present. Pass null/undefined for empty state. */
  children?: ReactNode;
  /** Tooltip explaining the scale + how the value is computed. */
  hint: string;
  /** Faint placeholder shown when `children` is empty (e.g. "e.g. B+"). */
  example?: string;
}

export function Metric({ label, children, hint, example }: Props) {
  const isEmpty =
    children === undefined ||
    children === null ||
    (typeof children === "string" && children.trim() === "");
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[12px] tracking-[0.10em] uppercase text-ink-2">
          {label}
        </span>
        <HelpHint label={label} hint={hint} />
      </div>
      <div className="min-h-[28px] flex items-end">
        {isEmpty ? (
          <span
            aria-label={SLATE_COPY.a11y.noValueYet}
            className="font-mono text-[12px] text-ink-4 italic"
          >
            {example ?? "—"}
          </span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
