"use client";

// Live-ticking countdown — single shared component used everywhere on
// the slate so all instances stay in sync (same tick boundary, same
// render frame). Tier-based interval to avoid 1Hz re-renders when
// the displayed value only changes every minute:
//
//   > 24h  : tick every 60s, format "in Xd Yh"
//   1–24h  : tick every 60s, format "in Xh Ym"
//   < 60m  : tick every 1s,  format "in Mm Ss"
//   ≤ 10s  : "Opening now"
//
// Memoized — the parent's re-renders don't reset the interval, and a
// single `to` value renders one stable subtree. Honors
// prefers-reduced-motion at the parent level via the global CSS rule
// (`@media (prefers-reduced-motion)`); the text itself is not
// animated, so reduced-motion is naturally respected.

import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Target moment, ISO string or Date. */
  to: string | Date;
  /** Verb prefix that replaces the default "in". Pass "" to omit entirely. */
  verb?: string;
  /** Override the "Opening now" terminal label. */
  imminentLabel?: string;
  className?: string;
}

function CountdownImpl({ to, verb = "in", imminentLabel = "Opening now", className }: Props) {
  // We purposely store `now` as state, not a ref — the value is what
  // drives re-renders, and the React-Compiler-friendly thing to do is
  // setState every tick. The tier picker below caps the cost.
  const [now, setNow] = useState(() => Date.now());

  // Holds the most recently scheduled timeout so we can cancel and
  // re-schedule when the tier (1s vs 60s) changes.
  const timer = useRef<number | undefined>(undefined);

  const targetMs =
    to instanceof Date
      ? to.getTime()
      : Number.isFinite(Date.parse(to))
        ? Date.parse(to)
        : 0;
  const diff = targetMs - now;

  useEffect(() => {
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      // Don't burn CPU in hidden tabs; resume when the tab comes back.
      if (typeof document !== "undefined" && document.hidden) {
        timer.current = window.setTimeout(tick, 1000);
        return;
      }
      const current = Date.now();
      const remaining = targetMs - current;
      setNow(current);
      const interval = pickInterval(remaining);
      timer.current = window.setTimeout(tick, interval);
    }
    tick();
    const onVis = () => {
      if (!document.hidden) {
        // Catch up immediately when tab returns to foreground.
        if (timer.current) window.clearTimeout(timer.current);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [targetMs]);

  return (
    <span
      className={cn("tabular-nums", className)}
      data-testid="countdown"
      aria-live="polite"
      // SSR's clock differs from client's; the interval below settles
      // it on the next tick, but we tell React not to warn about the
      // mismatch in the meantime.
      suppressHydrationWarning
    >
      {format(diff, verb, imminentLabel)}
    </span>
  );
}

/** Memoized so a parent's re-render doesn't recreate the interval. */
export const Countdown = memo(CountdownImpl);

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function pickInterval(remainingMs: number): number {
  // <60m: 1Hz so seconds tick visibly. Otherwise 1/min — display only
  // changes every minute, so re-rendering more often is pure waste.
  if (remainingMs < HOUR) return SEC;
  return MIN;
}

function format(diff: number, verb: string, imminentLabel: string): string {
  if (diff <= 10 * SEC) return imminentLabel;
  const prefix = verb ? `${verb} ` : "";

  if (diff > DAY) {
    const d = Math.floor(diff / DAY);
    const h = Math.floor((diff % DAY) / HOUR);
    return `${prefix}${d}d ${h}h`;
  }
  if (diff > HOUR) {
    const h = Math.floor(diff / HOUR);
    const m = Math.floor((diff % HOUR) / MIN);
    return `${prefix}${h}h ${m}m`;
  }
  const m = Math.floor(diff / MIN);
  const s = Math.floor((diff % MIN) / SEC);
  return `${prefix}${m}m ${s}s`;
}

// Pure helpers exported for testing.
export const __test = { format, pickInterval };
