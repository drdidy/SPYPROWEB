"use client";

// Right-side drawer that explains *why* the engine is in its current
// state. Renders the decision-trace events from the API in chronological
// order. Events with weight: "key" render bolder; "info" reads as
// supporting context. Esc and click-outside dismiss.
//
// Rendered via React portal to document.body so it escapes any
// stacking-context trap created by ancestors with backdrop-filter
// (the TopBar uses backdrop-blur, which would otherwise pin a z-50
// drawer below it). Panel is opaque, backdrop is a separate full-
// viewport overlay, and the close button has a 32×32 hit target.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

  useFocusTrap(panelRef, open);

  // Portal target — only available on the client.
  useEffect(() => setMounted(true), []);

  // Esc to close, focus the close button on open for keyboard users.
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while the drawer is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  if (!open || !mounted) return null;

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Why ${engine} is in this state`}
      className="fixed inset-0 z-[100]"
      onClick={onClose}
    >
      {/* Backdrop — full viewport, registers the modal context. */}
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      {/* Panel — full-screen on mobile (≤sm), 28rem drawer at sm+,
          opaque so any backdrop-filter behind it can't bleed through. */}
      <aside
        ref={panelRef}
        onClick={stop}
        className={cn(
          "absolute right-0 top-0 bottom-0 flex flex-col",
          "w-full sm:w-[28rem] max-w-full bg-paper sm:border-l border-rule shadow-card",
          "animate-rise",
        )}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-rule shrink-0">
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
            className="w-8 h-8 grid place-items-center rounded-soft text-ink-3 hover:text-ink hover:bg-paper-2/70 outline-none focus-visible:ring-2 focus-visible:ring-gold/40 shrink-0"
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

        <footer className="px-5 py-3 border-t border-rule text-[10px] text-ink-3 font-mono uppercase tracking-[0.18em] shrink-0">
          {engine} · trust artifact · derived from engine state
        </footer>
      </aside>
    </div>
  );

  return createPortal(node, document.body);
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
