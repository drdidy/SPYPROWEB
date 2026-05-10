"use client";

// Single source of truth for "how fresh is this slate?". Replaces the
// duplicated red dot + "Updated 10:50 CT" + per-card as-of stamps.
// Thresholds per the spec:
//   green : age < 60s
//   amber : 60s..300s
//   red   : > 300s or unparseable
//
// The pill self-refreshes every second so the color stays honest even
// when the upstream snapshot isn't polling. Tooltip surfaces both UTC
// and CT timestamps + the data source.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** ISO timestamp of the snapshot the rest of the slate is rendering. */
  freshnessISO: string;
  /** Where the data came from. e.g. "yfinance", "tastytrade". */
  source: string;
  className?: string;
}

type Tone = "fresh" | "stale" | "broken";

export function FreshnessPill({ freshnessISO, source, className }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const ts = Date.parse(freshnessISO);
  const ageMs = Number.isFinite(ts) ? now - ts : Number.POSITIVE_INFINITY;
  const tone: Tone =
    ageMs < 60_000 ? "fresh" : ageMs < 300_000 ? "stale" : "broken";

  const dotClass = {
    fresh: "bg-bull",
    stale: "bg-gold",
    broken: "bg-bear",
  }[tone];

  const textTone = {
    fresh: "text-bull-soft",
    stale: "text-gold-soft",
    broken: "text-bear-soft",
  }[tone];

  const ctLabel = Number.isFinite(ts) ? formatCT(ts) : "—";
  const utcLabel = Number.isFinite(ts) ? formatUTC(ts) : "—";

  // Title carries the rich tooltip; visible label stays compact.
  void source;
  const title = `Updated ${ctLabel} · ${utcLabel} UTC · market data feed`;

  return (
    <span
      tabIndex={0}
      title={title}
      aria-label={title}
      data-testid="freshness-pill"
      data-tone={tone}
      // v5 #16: aria-live="polite" so AT users hear the new
      // timestamp when the snapshot refreshes. atomic so the full
      // text is re-announced rather than the diff.
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "inline-flex items-center gap-1.5 outline-none",
        "focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-1 rounded-pill",
        "shrink-0 whitespace-nowrap",
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {tone === "fresh" && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-50 animate-breathe" />
        )}
        <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", dotClass)} />
      </span>
      <span className={cn("font-mono text-[10px] tabular-nums", textTone)}>
        Updated {ctLabel}
      </span>
    </span>
  );
}

function formatCT(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms)) + " CT";
}

function formatUTC(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}
