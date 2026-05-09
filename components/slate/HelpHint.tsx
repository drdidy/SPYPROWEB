// Inline help affordance — small circled `i` icon. Hover, keyboard
// focus, and tap all reveal the tooltip. Dismissible with Escape.
// Implementation now delegates to <InfoTooltip /> (the slate's a11y-
// first tooltip primitive) so all existing call-sites get keyboard +
// screen-reader + touch support without per-component plumbing.

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  hint: string;
  className?: string;
}

export function HelpHint({ label, hint, className }: Props) {
  return <InfoTooltip label={label} content={hint} className={cn(className)} />;
}
