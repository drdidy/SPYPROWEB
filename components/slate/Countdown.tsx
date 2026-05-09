"use client";

// Phase-1 hardening primitive.
//
// Renders the time remaining until `to`. Server renders the initial
// value (so SSR is stable), then ticks client-side every 30s. Format
// snaps to "Xh Ym" when there's at least an hour, "Mm" under an hour,
// "now" when already elapsed.

import { useEffect, useState } from "react";

interface CountdownProps {
  to: Date | string;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function Countdown({
  to,
  prefix = "",
  suffix = "",
  className,
}: CountdownProps) {
  const target = typeof to === "string" ? new Date(to).getTime() : to.getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = target - now;
  const label = formatRemaining(remaining);
  const text = [prefix, label, suffix].filter(Boolean).join(" ");

  return (
    <span className={className} aria-live="polite" suppressHydrationWarning>
      {text}
    </span>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
