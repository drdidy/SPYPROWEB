"use client";

// Two related primitives backed by lib/sessions:
//
//   <NextEventLine engine /> — thin mono line under each ladder row
//     that re-evaluates every 30s. Shows what the engine is waiting
//     on and how long until it.
//
//   <NextEventCallout engine /> — replaces <FlipsLine> in the card
//     body when the engine is in PRE_CONFIG / CLOSED_*. Larger,
//     boxed treatment matching the existing Flips-condition rhythm
//     so the card geometry stays stable.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatRelToNow,
  getSessionInfo,
  type Engine,
  type SessionInfo,
} from "@/lib/sessions";

function useTickingSession(engine: Engine): SessionInfo | null {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  useEffect(() => {
    const tick = () => setInfo(getSessionInfo(engine, new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [engine]);
  return info;
}

interface LineProps {
  engine: Engine;
  className?: string;
}

export function NextEventLine({ engine, className }: LineProps) {
  const info = useTickingSession(engine);
  if (!info) return null;
  const text = describeNext(info);
  return (
    <span
      className={cn(
        "font-mono text-[10px] tabular-nums text-ink-3",
        className,
      )}
      suppressHydrationWarning
    >
      {text}
    </span>
  );
}

interface CalloutProps {
  engine: Engine;
  className?: string;
}

export function NextEventCallout({ engine, className }: CalloutProps) {
  const info = useTickingSession(engine);
  if (!info) return null;
  const event = info.nextSignificantEvent;
  const dist = formatRelToNow(event.at, new Date());
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <div className={cn("rounded-soft border border-rule bg-paper-2/40 px-3 py-2.5", className)}>
      <span className="eyebrow text-ink-3">Next event</span>
      <p
        className="text-[13px] text-ink leading-snug mt-1 tabular-nums"
        suppressHydrationWarning
      >
        {event.label} {dtf.format(event.at)} CT · in {dist}
      </p>
    </div>
  );
}

function describeNext(info: SessionInfo): string {
  const now = new Date();
  switch (info.phase) {
    case "CONFIG_WINDOW":
      return `observing market · ${formatRelToNow(info.configWindowEnd, now)} remaining`;
    case "POST_CONFIG":
      return `RTH opens in ${formatRelToNow(info.rthOpen, now)}`;
    case "RTH_OPEN":
      return `RTH closes in ${formatRelToNow(info.rthClose, now)}`;
    case "POST_RTH":
    case "PRE_CONFIG":
    case "CLOSED_WEEKEND":
    case "CLOSED_HOLIDAY":
      return `${info.nextSignificantEvent.label} in ${formatRelToNow(info.nextSignificantEvent.at, now)}`;
  }
}
