import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PanelStateKind =
  | "loading"
  | "empty-by-design"
  | "empty-waiting"
  | "partial"
  | "failed"
  | "ready";

export function PanelState({
  state,
  title,
  body,
  retry,
  children,
  className,
}: {
  state: PanelStateKind;
  title: string;
  body: string;
  retry?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  if (state === "ready") return <>{children}</>;

  const isLoading = state === "loading";
  const isFailed = state === "failed";

  return (
    <div
      className={cn(
        "rounded-card border border-rule bg-paper-2 p-5",
        "text-ink shadow-card",
        className,
      )}
      role={isFailed ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-soft border",
            isFailed
              ? "border-bear/30 bg-bear-tint text-bear"
              : "border-gold/30 bg-gold-tint text-gold",
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-title text-ink">{title}</div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-2">
            {body}
          </p>
          {isLoading && (
            <div className="mt-4 grid gap-2">
              <span className="relative h-3 overflow-hidden rounded-pill bg-paper">
                <span className="absolute inset-y-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
              </span>
              <span className="relative h-3 w-2/3 overflow-hidden rounded-pill bg-paper">
                <span className="absolute inset-y-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
              </span>
            </div>
          )}
          {retry && (
            <button
              type="button"
              onClick={retry}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-soft border border-rule-strong bg-paper px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
