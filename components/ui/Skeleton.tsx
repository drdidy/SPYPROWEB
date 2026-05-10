// Slate skeleton loader. Pulses a subtle shimmer L→R; respects
// prefers-reduced-motion via the global utility in app/globals.css.
//
// Usage: a single primitive, sized via Tailwind classes. The component
// applies a paper-2 base + shimmer overlay so it reads as "this slot
// is loading" without distracting from the surrounding chrome.

import { cn } from "@/lib/utils";

interface Props {
  /** Tailwind sizing classes — e.g. "h-4 w-24". */
  className?: string;
  /** Render as a circle (for dot rows). */
  circle?: boolean;
  /** Optional aria-label override. Default: "Loading". */
  label?: string;
}

export function Skeleton({ className, circle = false, label = "Loading" }: Props) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "relative inline-block overflow-hidden bg-paper-2 align-middle",
        circle ? "rounded-full" : "rounded-soft",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 -translate-x-full",
          "bg-gradient-to-r from-transparent via-paper/60 to-transparent",
          "animate-shimmer",
        )}
      />
    </span>
  );
}
