"use client";

// Inline error fallback for a single card / region. Used when an
// engine's snapshot fetch fails and we don't want to silently render
// an empty surface (the dashboard's #11 issue: never let a card render
// blank).
//
// Props:
//   - title:   short label, e.g. "SPY data unavailable"
//   - message: optional one-liner with more detail
//   - onRetry: optional retry handler. When omitted, the retry button
//              is not rendered. (Server components can pass a `<form
//              action="…">` instead — see consumer for that pattern.)

import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title, message, onRetry, className }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-bear/30 bg-bear-tint/40 px-5 py-4",
        "flex items-start gap-3",
        className,
      )}
    >
      <AlertTriangle
        size={16}
        className="text-bear-ink mt-0.5 shrink-0"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-h3 font-serif text-bear-ink">{title}</p>
        {message && (
          <p className="text-body text-ink-2 mt-1 leading-snug">{message}</p>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill",
              "bg-paper text-ink-2 hover:text-ink hover:bg-paper-2/70",
              "border border-rule transition-colors",
              "font-mono text-[11px] uppercase tracking-[0.10em]",
              "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
            )}
          >
            <RefreshCw size={11} aria-hidden />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
