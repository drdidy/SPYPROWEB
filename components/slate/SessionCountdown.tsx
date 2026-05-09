"use client";

// Adaptive RTH session countdown.
// - Pre-open  → "Opens in 54m"
// - In session → "RTH open · 2h 14m to close"
// - After close → "RTH closed · opens at 08:30 CT"
//
// Times are always America/Chicago. The component re-evaluates every
// 30s, which is plenty for human-readable copy.

import { useEffect, useState } from "react";

interface Props {
  className?: string;
}

const RTH_OPEN_HOUR = 8;
const RTH_OPEN_MIN = 30;
const RTH_CLOSE_HOUR = 15;
const RTH_CLOSE_MIN = 0;

export function SessionCountdown({ className }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ctNow = chicagoNow(now);
  const todayOpen = chicagoAt(now, RTH_OPEN_HOUR, RTH_OPEN_MIN);
  const todayClose = chicagoAt(now, RTH_CLOSE_HOUR, RTH_CLOSE_MIN);

  let label: string;
  if (ctNow < todayOpen) {
    label = `Opens in ${duration(todayOpen - ctNow)}`;
  } else if (ctNow < todayClose) {
    label = `RTH open · ${duration(todayClose - ctNow)} to close`;
  } else {
    label = "RTH closed · opens at 08:30 CT";
  }

  return (
    <span
      className={
        className ?? "font-mono text-[11px] text-ink-3 uppercase tracking-[0.10em]"
      }
      suppressHydrationWarning
    >
      {label}
    </span>
  );
}

// Chicago wall-clock timestamps as ms-since-epoch.
function chicagoNow(d: Date): number {
  return d.getTime();
}

// Build a Date for today's H:M wall-clock in America/Chicago, returning
// the ms-since-epoch.
function chicagoAt(d: Date, hour: number, minute: number): number {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m, day] = dateStr.split("-").map(Number);
  // Build a wall-time Date in Chicago, convert to UTC by subtracting
  // Chicago's offset relative to UTC at this moment.
  const wall = Date.UTC(y, m - 1, day, hour, minute, 0);
  const offsetMin = chicagoOffsetMinutes(d);
  return wall - offsetMin * 60_000;
}

function chicagoOffsetMinutes(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const ctMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((ctMs - d.getTime()) / 60_000);
}

function duration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
