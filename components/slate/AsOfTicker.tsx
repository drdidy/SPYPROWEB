"use client";

// "as of HH:MM CT" stamp. Minute precision (no seconds) — the snapshot
// itself doesn't update per-second, so a ticking second column was
// just visual jitter. Re-evaluates every 30s.

import { useEffect, useState } from "react";

interface Props {
  iso: string;
  className?: string;
}

export function AsOfTicker({ iso, className }: Props) {
  const [now, setNow] = useState(() => new Date(iso).getTime() || Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span
      className={
        className ?? "font-mono text-[10px] text-ink-3 tabular-nums"
      }
      suppressHydrationWarning
    >
      as of {formatHM(now)} CT
    </span>
  );
}

function formatHM(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}
