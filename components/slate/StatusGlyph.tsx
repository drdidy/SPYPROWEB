// Meaningful status decoration for line/trigger rows. Replaces the
// ambient circles with a glyph whose shape carries information:
//   triggered    → filled solid disc
//   armed        → ring (hollow disc)
//   invalidated  → small × cross
//   stale        → faint disc
//
// Phase 2.6 lands this in the structure list. The component is purely
// visual; callers supply ARIA via `label` so screen readers understand
// the row's status.

import { cn } from "@/lib/utils";

export type StatusGlyphKind =
  | "triggered"
  | "armed"
  | "invalidated"
  | "stale";

interface StatusGlyphProps {
  kind: StatusGlyphKind;
  label?: string;
  className?: string;
}

export function StatusGlyph({ kind, label, className }: StatusGlyphProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  if (kind === "invalidated") {
    return (
      <svg
        viewBox="0 0 12 12"
        width={12}
        height={12}
        className={cn("text-state-invalidated", className)}
        {...a11y}
      >
        <path
          d="M3 3 L9 9 M9 3 L3 9"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "armed") {
    return (
      <span
        {...a11y}
        className={cn(
          "inline-block h-3 w-3 rounded-full border-[1.5px] border-state-armed",
          className,
        )}
      />
    );
  }
  if (kind === "stale") {
    return (
      <span
        {...a11y}
        className={cn("inline-block h-3 w-3 rounded-full bg-ink-5/70", className)}
      />
    );
  }
  // triggered (default)
  return (
    <span
      {...a11y}
      className={cn(
        "inline-block h-3 w-3 rounded-full bg-state-triggered",
        className,
      )}
    />
  );
}
