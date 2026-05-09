"use client";

// Primary CTA on the Decision Slate cards. Opens a minimal confirmation
// dialog and (when the underlying alert infra ships) wires through to
// the user's notification channel. SPY Prophet is decision-support
// only — this control NEVER places an order. The dialog copy is
// explicit about that contract.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";

interface SetAlertButtonProps {
  symbol: "SPY" | "SPX";
  level: number;
  context?: string;
  className?: string;
}

export function SetAlertButton({
  symbol,
  level,
  context,
  className,
}: SetAlertButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dialog = open && mounted ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Set ${symbol} alert at ${level.toFixed(2)}`}
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[100] grid place-items-center px-4"
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-paper border border-rule rounded-card shadow-card animate-rise"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-rule">
          <div>
            <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
              {symbol} alert
            </div>
            <div className="font-serif text-headline tracking-tight text-ink mt-0.5">
              {confirmed ? "Alert saved" : `Notify me at ${level.toFixed(2)}`}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-soft text-ink-3 hover:text-ink hover:bg-paper-2/70 outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <X size={15} />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3 text-[13px] text-ink-2 leading-relaxed">
          {confirmed ? (
            <p>
              You'll get a browser notification when {symbol} prints at
              {" "}
              <span className="font-mono tabular-nums text-ink">
                {level.toFixed(2)}
              </span>
              .
            </p>
          ) : (
            <>
              {context && <p className="text-ink-2">{context}</p>}
              <p className="rounded-soft bg-paper-2/50 border border-rule px-3 py-2 text-ink-3">
                Notification only. SPY Prophet does not place orders or
                connect to a broker.
              </p>
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-rule flex items-center justify-end gap-2">
          {confirmed ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 px-3 rounded-pill bg-paper-2 text-ink-2 hover:text-ink font-mono text-[11px] uppercase tracking-[0.10em]"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 px-3 rounded-pill bg-paper-2 text-ink-2 hover:text-ink font-mono text-[11px] uppercase tracking-[0.10em]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setConfirmed(true)}
                className="h-8 px-3 rounded-pill bg-gold-tint text-gold-ink shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)] font-mono text-[11px] font-semibold uppercase tracking-[0.10em]"
              >
                Save alert
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setConfirmed(false);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-gold-tint text-gold-ink",
          "shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)] hover:shadow-[inset_0_0_0_1px_rgba(184,130,31,0.55)]",
          "font-mono text-[11px] font-semibold uppercase tracking-[0.10em] transition-shadow",
          "outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          className,
        )}
      >
        <Bell size={12} strokeWidth={2.2} />
        Set alert at {level.toFixed(2)}
      </button>

      {dialog && createPortal(dialog, document.body)}
    </>
  );
}
