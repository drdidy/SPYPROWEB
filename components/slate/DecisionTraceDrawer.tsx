"use client";

// Right-side drawer that explains *why* the engine is in its current
// state. Renders the decision-trace events from the API in chronological
// order. Events with weight: "key" render bolder; "info" reads as
// supporting context. Esc and click-outside dismiss; the close button
// is keyboard-focusable.
//
// Wire-up: cards render a "Why this state? →" link that calls onOpen.
// The drawer keeps its own open state when used as a self-controlled
// component, or accepts open/onClose for parent control.

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";

export interface TraceEvent {
  ts: string;
  event: string;
  weight?: "info" | "key";
}

export interface DecisionTraceDrawerProps {
  engine: "SPY" | "SPX";
  open: boolean;
  onClose: () => void;
  trace: TraceEvent[];
  flipCondition?: string;
  currentStateLabel?: string;
}

export function DecisionTraceDrawer({
  engine,
  open,
  onClose,
  trace,
  flipCondition,
  currentStateLabel,
}: DecisionTraceDrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useFocusTrap(panelRef, open);

  // Esc to close, focus the close button on open for keyboard users.
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Why ${engine} is in this state`}
      className="fixed inset-0 z-50 flex"
      onClick={onClose}
    >
      {/* Scrim */}
      <div className="flex-1 bg-ink/30" aria-hidden />
      {/* Panel — full-screen on mobile (375px target), fixed-width drawer at sm+. */}
      <aside
        ref={panelRef}
        onClick={stop}
        className={cn(
          "w-full sm:max-w-md h-full bg-paper sm:border-l border-rule shadow-card",
          "flex flex-col animate-rise",
        )}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-rule">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
              {engine} · decision trace
            </div>
            <div className="font-serif text-headline tracking-tight text-ink mt-0.5">
              Why this state{currentStateLabel ? `: ${currentStateLabel}` : ""}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-soft text-ink-3 hover:text-ink hover:bg-paper-2/70 outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <X size={15} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {flipCondition && (
            <div className="rounded-soft border border-rule bg-paper-2/40 px-3 py-2.5">
              <div className="eyebrow text-ink-3 mb-1">Flip condition</div>
              <p className="text-[13px] text-ink leading-snug">{flipCondition}</p>
            </div>
          )}

          {trace.length === 0 ? (
            <p className="text-[13px] text-ink-3">No trace events yet for this session.</p>
          ) : (
            <ol className="space-y-2.5 border-l border-rule pl-4 ml-1">
              {trace.map((e, i) => {
                const isKey = e.weight === "key";
                return (
                  <li key={`${e.ts}-${i}`} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -left-[1.05rem] top-1.5 h-2 w-2 rounded-full",
                        isKey ? "bg-state-triggered" : "bg-ink-5/80",
                      )}
                    />
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-mono text-[10px] text-ink-3 tabular-nums whitespace-nowrap">
                        {formatTs(e.ts)}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] leading-snug",
                          isKey ? "text-ink font-semibold" : "text-ink-2",
                        )}
                      >
                        {e.event}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-rule text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em]">
          {engine} · trust artifact · derived from engine state
        </footer>
      </aside>
    </div>
  );
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "";
  }
}
