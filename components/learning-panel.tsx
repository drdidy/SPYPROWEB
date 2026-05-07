"use client";
// "What this is teaching you" — collapsible educational panel from
// e108b48a* in the design bundle.
import { useState } from "react";

export function LearningPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          height: 56, display: "flex", alignItems: "center", width: "100%",
          padding: "0 24px", background: "transparent", border: 0, gap: 12,
          color: "var(--text-primary)",
        }}
      >
        <span className="t-heading">WHAT THIS IS TEACHING YOU</span>
        <div style={{ flex: 1 }}/>
        <span style={{
          fontFamily: "var(--font-mono)",
          color: "var(--text-secondary)",
          fontSize: 18,
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 200ms ease-out",
          display: "inline-block", width: 14, textAlign: "center",
        }}>›</span>
      </button>
      {open && (
        <div style={{ padding: "0 24px 24px" }}>
          <p className="t-body c-secondary" style={{ lineHeight: 1.65, margin: "0 0 14px" }}>
            Rejection signals at major time-frame supply levels carry weight in inverse proportion to how aggressively price arrived. Today's approach into 583.40 was deliberate — three consecutive 5-minute candles climbing on declining volume — which is the textbook setup for a high-quality fade. Aggressive pushes get absorbed by the level; cautious ones get reversed by it.
          </p>
          <div style={{
            border: "1px solid var(--border-subtle)",
            borderLeft: "2px solid var(--amber)",
            padding: 12,
            marginBottom: 14,
          }}>
            <div className="t-label c-tertiary" style={{ marginBottom: 4 }}>PRINCIPLE</div>
            <div className="t-body c-primary" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Rejections at 4H supply with declining volume have a 64% follow-through rate in this regime.
            </div>
          </div>
          <p className="t-body c-secondary" style={{ lineHeight: 1.65, margin: 0 }}>
            The relevant constraint: this edge only holds while VIX term structure remains in contango and dealer gamma is positive. When either condition flips, the same setup degrades to a coin flip — the level functions as a magnet rather than a barrier. Always confirm context tiles before committing size.
          </p>
        </div>
      )}
    </div>
  );
}
