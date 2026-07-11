"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  freshnessISO: string;
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

  const ctLabel = Number.isFinite(ts) ? formatCT(ts) : "--";
  const statusLabel =
    tone === "fresh" ? "Fresh" : tone === "stale" ? "Aging" : "Stale";

  void source;
  const title = `${statusLabel} session read. Updated ${ctLabel}.`;

  return (
    <span
      tabIndex={0}
      title={title}
      aria-label={title}
      data-testid="freshness-pill"
      data-tone={tone}
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
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dotClass)} />
      </span>
      <span className={cn("font-mono text-[10px] tabular-nums", textTone)}>
        {statusLabel} - {ctLabel}
      </span>
    </span>
  );
}

function formatCT(ms: number): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms)) + " CT"
  );
}
