"use client";

// Tiny "as of HH:MM:SS" stamp that ticks every second from a server-
// supplied seed. Card footers use it so users can see the page is
// alive even when the underlying snapshot is unchanged.

import { useEffect, useState } from "react";

interface Props {
  iso: string;
  className?: string;
}

export function AsOfTicker({ iso, className }: Props) {
  const [now, setNow] = useState(() => new Date(iso).getTime() || Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  const label = formatHMS(now);
  return (
    <span
      className={
        className ?? "font-mono text-[10px] text-ink-3 tabular-nums"
      }
      suppressHydrationWarning
    >
      as of {label} CT
    </span>
  );
}

function formatHMS(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}
