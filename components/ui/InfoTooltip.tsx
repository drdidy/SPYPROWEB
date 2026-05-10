"use client";

// Accessible inline tooltip — hover, keyboard focus, tap. Dismisses on
// Escape and on outside-click. Mobile-friendly: a tap toggles instead
// of relying on hover. The trigger is a small circled `i` icon by
// default; consumers can pass arbitrary `children` to anchor the
// tooltip to any element.
//
// This is the slate's standard replacement for native `title=""`
// attributes — `title` doesn't keyboard-focus, can't be styled, and
// fails on touch devices.
//
// Usage:
//   <InfoTooltip label="R" content="An R-multiple is the trade's
//   profit measured in units of its initial risk." />
//
//   <InfoTooltip content="…" placement="bottom"><span>custom</span></InfoTooltip>

import { Info } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Short label announced to assistive tech alongside the content. */
  label?: string;
  /** Tooltip body. Plain text or simple inline JSX. */
  content: ReactNode;
  /** Override the default Info-icon trigger. */
  children?: ReactNode;
  /** Tooltip placement relative to the trigger. */
  placement?: "top" | "bottom";
  className?: string;
}

export function InfoTooltip({
  label,
  content,
  children,
  placement = "top",
  className,
}: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  const trigger = children ?? (
    <Info className="size-3.5" strokeWidth={1.6} aria-hidden />
  );
  const accessibleLabel = label ? `${label}: information` : "More information";

  return (
    <span ref={wrapRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={accessibleLabel}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex items-center justify-center text-ink-3 hover:text-ink",
          "cursor-help outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          "rounded-full transition-colors",
        )}
      >
        {trigger}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute z-40 left-1/2 -translate-x-1/2 w-max max-w-[280px]",
            "rounded-soft bg-ink text-paper px-2.5 py-1.5",
            "text-[11px] leading-snug font-normal tracking-normal normal-case",
            "shadow-[0_4px_16px_-4px_rgba(20,22,26,0.20)]",
            placement === "top"
              ? "bottom-full mb-1.5"
              : "top-full mt-1.5",
          )}
        >
          {label && (
            <span className="block font-mono text-[10px] tracking-[0.10em] uppercase text-paper/70 mb-0.5">
              {label}
            </span>
          )}
          {content}
        </span>
      )}
    </span>
  );
}
