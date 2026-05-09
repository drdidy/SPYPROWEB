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
          "inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-soft px-1 -mx-1"
        }
      >
        Why this state?
        <ArrowRight size={11} className="text-ink-4" />
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
