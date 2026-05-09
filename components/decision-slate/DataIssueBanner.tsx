// Non-blocking banner shown when snapshot validation fails at the
// boundary. The slate keeps rendering with whatever fields parsed
// successfully; this banner tells the operator something upstream is
// off without crashing the page.

import { AlertCircle } from "lucide-react";

interface Props {
  /** What failed — keep short, surface the field path if available. */
  message: string;
  className?: string;
}

export function DataIssueBanner({ message, className }: Props) {
  return (
    <div
      role="alert"
      className={
        className ??
        "rounded-card border border-state-bearish/30 bg-bear-tint/40 px-4 py-2.5 flex items-start gap-2.5"
      }
    >
      <AlertCircle size={14} className="text-state-bearish mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="eyebrow text-state-bearish">Data issue</div>
        <p className="text-[12px] text-ink-2 leading-snug mt-0.5">{message}</p>
      </div>
    </div>
  );
}
