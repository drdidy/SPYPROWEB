// Inline jargon hint — wraps a phrase in a hover/focus popover that
// gives the one-sentence plain-English explanation. Underlines the
// term so visitors know it's interactive. The full definitions live
// on /methodology.

import { type ReactNode } from "react";

interface Props {
  term: string;
  /** Plain-English explanation, one sentence. */
  hint: string;
  children?: ReactNode;
}

export function JargonTooltip({ term, hint, children }: Props) {
  return (
    <span
      tabIndex={0}
      title={`${term}: ${hint}`}
      aria-label={`${term}: ${hint}`}
      className="underline decoration-dotted decoration-rule underline-offset-[3px] cursor-help outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-soft"
    >
      {children ?? term}
    </span>
  );
}
