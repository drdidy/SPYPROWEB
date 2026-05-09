"use client";

// Self-contained "Why this state? →" link + DecisionTraceDrawer pair.
// Cards drop this in their footer and pass the trace + flip condition;
// the link manages its own open state so the parent card can stay a
// pure server component.

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { DecisionTraceDrawer, type TraceEvent } from "./DecisionTraceDrawer";

interface Props {
  engine: "SPY" | "SPX";
  trace: TraceEvent[];
  flipCondition?: string;
  currentStateLabel?: string;
  className?: string;
}

export function WhyThisStateLink({
  engine,
  trace,
  flipCondition,
  currentStateLabel,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          // Discoverable button affordance — thin border, padded hit
          // target, hover state. The trust artifact of the slate
          // shouldn't read as plain mono text.
          "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border border-rule bg-paper hover:bg-paper-2/70 hover:border-rule-strong text-ink-2 hover:text-ink font-mono text-[10px] uppercase tracking-[0.14em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        }
      >
        Why this state?
        <ArrowRight size={11} className="text-ink-3" />
      </button>
      <DecisionTraceDrawer
        engine={engine}
        open={open}
        onClose={() => setOpen(false)}
        trace={trace}
        flipCondition={flipCondition}
        currentStateLabel={currentStateLabel}
      />
    </>
  );
}
