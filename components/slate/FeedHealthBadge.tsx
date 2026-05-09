"use client";

// Phase-1 hardening primitive.
//
// A small dot + hover-revealed detail row showing how fresh the feed is.
//   green dot  : last tick within 5s
//   amber dot  : 5–15s old
//   red dot    : > 15s old
//
// The component re-evaluates its own freshness every second so the
// dot stays current even if the upstream `lastTickTs` doesn't change
// for a while (e.g. when polling pauses).

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface FeedHealthBadgeProps {
  lastTickTs: string;
  source: string;
  className?: string;
}

type Health = "fresh" | "stale" | "broken";

export function FeedHealthBadge({
  lastTickTs,
  source,
  className,
}: FeedHealthBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const ts = parseTickTs(lastTickTs);
  const ageMs = ts ? now - ts : Number.POSITIVE_INFINITY;
  const health: Health = ageMs < 5_000 ? "fresh" : ageMs < 15_000 ? "stale" : "broken";

  const dotClass = {
    fresh: "bg-bull",
    stale: "bg-gold",
    broken: "bg-bear",
  }[health];

  const labelClass = {
    fresh: "text-bull-ink",
    stale: "text-gold-ink",
    broken: "text-bear-ink",
  }[health];

  const tickLabel = ts
    ? new Date(ts).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";

  const title = `Last tick ${tickLabel} · feed: ${source}`;

  return (
    <span
      tabIndex={0}
      title={title}
      aria-label={title}
      className={cn(
        "group relative inline-flex items-center gap-1.5 outline-none",
        "focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas rounded-pill",
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {health === "fresh" && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-50 animate-breathe" />
        )}
        <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", dotClass)} />
      </span>
      <span
        className={cn(
          "eyebrow tabular-nums opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity",
          labelClass,
        )}
      >
        LIVE
      </span>
    </span>
  );
}

function parseTickTs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
