// Inline help affordance — small circled `i` icon. Hover/focus reveals
// the definition via native `title` (SSR-safe). The icon comes from
// Lucide so it sits in the same visual family as the rest of the
// slate's iconography. Cursor changes to pointer to read as
// interactive at a glance.

import { Info } from "lucide-react";
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
        "inline-flex items-center justify-center text-ink-3 hover:text-ink",
        "cursor-help outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-full transition-colors",
        className,
      )}
    >
      <Info className="size-3.5" strokeWidth={1.6} aria-hidden />
    </span>
  );
}
