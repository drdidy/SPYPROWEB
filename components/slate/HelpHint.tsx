// Small inline help affordance: a "?" circle that, on hover or focus,
// reveals a one-line definition. The popover uses native `title` for
// SSR-safety; phase 3 may swap in a richer popover with examples.

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  hint: string;
  className?: string;
}

export function HelpHint({ label, hint, className }: Props) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${hint}`}
      title={hint}
      tabIndex={0}
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded-full border border-rule",
        "text-[9px] font-mono font-bold text-ink-3 hover:text-ink hover:border-rule-strong",
        "outline-none focus-visible:ring-2 focus-visible:ring-gold/40 transition-colors",
        className,
      )}
    >
      ?
    </span>
  );
}
