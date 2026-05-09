"use client";

// Live-ticking countdown that switches format at thresholds:
//   > 1d  → "in Xd Yh"
//   > 1h  → "in Xh Ym"
//   < 1h  → "in Xm Ys"
//   < 10s → "Opening now"
//   <= 0  → "Opening now"
//
// Updates every second. Suspends the interval when the page is hidden
// to keep idle tabs cheap.

import { useEffect, useState } from "react";

interface Props {
  /** ISO timestamp of the moment to count down to. */
  to: string;
  /** Optional prefix that replaces "in" — e.g. "Closes" → "Closes 2h 14m". */
  verb?: string;
  className?: string;
}

export function LiveCountdown({ to, verb = "in", className }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const id = window.setInterval(tick, 1_000);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const target = Date.parse(to);
  const diff = Number.isFinite(target) ? target - now : 0;

  return (
    <span
      className={className}
      data-testid="live-countdown"
      aria-live="polite"
      suppressHydrationWarning
    >
      {format(diff, verb)}
    </span>
  );
}

function format(ms: number, verb: string): string {
  if (ms <= 10_000) return "Opening now";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) return `${verb} ${days}d ${hours}h`;
  if (hours > 0) return `${verb} ${hours}h ${minutes}m`;
  return `${verb} ${minutes}m ${seconds}s`;
}
