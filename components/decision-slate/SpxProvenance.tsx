"use client";

// User-facing SPX provenance affordances.
//
//   <SpxProvenanceBadge />  — small pill rendered next to the SPX
//     price. "Live" stays subtle (text-only). "Synthetic" gets a
//     muted info chip with a tooltip explaining the derivation.
//     "Stale" gets a warning-toned chip so the basis problem is
//     unmissable.
//
//   <SpxDebugOverlay />     — Cmd+Shift+D toggles a fixed-position
//     diagnostic panel with the raw ES spot, basis, computed SPX,
//     and last-refresh timestamp. So this class of bug is
//     diagnosable in seconds rather than minutes spent grepping
//     through the snapshot JSON in devtools.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  type SpxProvenance,
  provenanceLabel,
  provenanceDetail,
} from "@/lib/spx-provenance";

interface BadgeProps {
  provenance: SpxProvenance | null;
  /** Render even for the "live" tier. Default false — live stays
   *  invisible so the cash-market display isn't cluttered. */
  showWhenLive?: boolean;
  className?: string;
}

export function SpxProvenanceBadge({
  provenance,
  showWhenLive = false,
  className,
}: BadgeProps) {
  if (!provenance) return null;
  if (provenance.trust === "live" && !showWhenLive) return null;

  const palette =
    provenance.trust === "stale"
      ? // Warm-warning ochre on the cream surface — unambiguous,
        // matches the brand palette without leaning on red.
        "bg-gold-tint text-gold-ink"
      : // Synthetic — neutral slate text on faint cool surface.
        "bg-paper-2/60 text-ink-3";

  return (
    <InfoTooltip
      label={provenanceLabel(provenance)}
      content={provenanceDetail(provenance)}
    >
      <span
        data-testid="spx-provenance-badge"
        data-trust={provenance.trust}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-px rounded-pill",
          "text-[9px] font-mono font-semibold uppercase tracking-[0.10em]",
          "shadow-[inset_0_0_0_1px_rgba(20,22,26,0.06)] cursor-help",
          palette,
          className,
        )}
      >
        {provenance.trust === "stale" ? "stale" : "synthetic"}
      </span>
    </InfoTooltip>
  );
}

// ---------------------------------------------------------------------
// Cmd+Shift+D dev overlay
// ---------------------------------------------------------------------

interface OverlayProps {
  provenance: SpxProvenance | null;
  /** Front-page SPX value as displayed to the user, for cross-check. */
  displayedSpx: number | null;
}

export function SpxDebugOverlay({ provenance, displayedSpx }: OverlayProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+Shift+D (mac) or Ctrl+Shift+D (everywhere else).
      const cmdLike = e.metaKey || e.ctrlKey;
      if (cmdLike && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const rows: [string, string][] = provenance
    ? [
        ["trust", provenance.trust],
        ["es spot (basis)", provenance.esSpot.toFixed(2)],
        ["spx spot (basis)", provenance.spxSpot.toFixed(2)],
        ["basis (offset)", signed(provenance.basis)],
        ["computed spx", provenance.computedSpx.toFixed(2)],
        [
          "displayed spx",
          displayedSpx == null ? "—" : displayedSpx.toFixed(2),
        ],
        [
          "displayed − computed",
          displayedSpx == null
            ? "—"
            : signed(displayedSpx - provenance.computedSpx),
        ],
        ["basis age", `${Math.round(provenance.basisAgeMs / 1000)}s`],
        ["captured at", provenance.capturedAtISO],
        ["offset source", provenance.offsetSource],
      ]
    : [["state", "no _meta in snapshot — old shape or mock fallback"]];

  return (
    <div
      role="dialog"
      aria-label="SPX debug overlay"
      className={cn(
        "fixed bottom-4 right-4 z-50 max-w-[420px] w-full",
        "rounded-card border border-rule-strong bg-canvas",
        "shadow-[0_8px_30px_-8px_rgba(0,0,0,0.25)]",
        "p-4 text-[11px] font-mono",
      )}
    >
      <header className="flex items-center justify-between mb-3 pb-2 border-b border-rule">
        <span className="font-bold tracking-[0.16em] uppercase text-ink-2">
          SPX provenance · debug
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close debug overlay"
          className="text-ink-3 hover:text-ink rounded-soft outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          <X size={14} aria-hidden />
        </button>
      </header>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-ink text-right truncate">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 pt-2 border-t border-rule text-ink-3 text-[10px] leading-snug">
        Cmd/Ctrl + Shift + D toggles · Esc dismisses. Live values
        update on each snapshot refresh.
      </p>
    </div>
  );
}

function signed(n: number): string {
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}
