// Shared Chip primitive. One shape, swappable color tokens.
//
// Used by:
//   - BETA badge (Wordmark, top-left)
//   - Engine state chip (Pre-config / Stand down / Watch / Wait /
//     Armed / Go / Cooldown) — when the StatePipeline ever needs
//     a standalone chip away from the stepper.
//   - Status pips (synthetic / stale on the SPX provenance badge).
//
// All call-sites pass colors via inline `style` (bg, color,
// borderColor) so no theme-var or Tailwind compile chain can
// reorder the values — a v5 lesson learned the hard way.
//
// Shape spec (v10 P1-10):
//   - rounded-pill
//   - px-1.5 py-px
//   - text-[9px] font-mono uppercase tracking-[0.10em]
//   - font-weight 500 (medium)
//   - 1px border
//
// Same for every chip on the slate. Tone differences live in the
// color tokens, never in shape.

import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChipTone {
  bg: string;
  fg: string;
  border: string;
}

interface Props {
  tone: ChipTone;
  /** Optional small dot rendered before the label (used by the
   *  stale-provenance chip to show a pulsing alert). */
  leading?: ReactNode;
  className?: string;
  /** Forwarded to the rendered <span>. */
  ariaLabel?: string;
  children: ReactNode;
}

export function Chip({ tone, leading, className, ariaLabel, children }: Props) {
  const style: CSSProperties = {
    backgroundColor: tone.bg,
    color: tone.fg,
    border: `1px solid ${tone.border}`,
  };
  return (
    <span
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-px rounded-pill",
        "text-[9px] font-mono font-medium tracking-[0.10em] uppercase",
        className,
      )}
      style={style}
    >
      {leading}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------
// Canonical tones used across the slate. Keep these in one place so
// any chip-tone change lands everywhere it's used.
// ---------------------------------------------------------------------

export const CHIP_TONES = {
  // v8 spec: muted ochre that matches the warm palette without
  // shouting. Same family as the engine-state chips below.
  beta: { bg: "#E8DCC2", fg: "#6B4F2A", border: "#C9B58C" },
  // Engine state chips. Same shape as the BETA pip — only the
  // tones differ.
  preConfig: { bg: "#EFE9DA", fg: "#3D424D", border: "#D5CDB9" },
  standDown: { bg: "#EFE9DA", fg: "#3D424D", border: "#D5CDB9" },
  watch: { bg: "#FBEFCC", fg: "#5C3F0B", border: "#C9A227" },
  wait: { bg: "#FBEFCC", fg: "#5C3F0B", border: "#C9A227" },
  armed: { bg: "#DDE6F0", fg: "#1F3A5F", border: "#4A6FA5" },
  go: { bg: "#D9EFE3", fg: "#0A4A30", border: "#2F7D3F" },
  cooldown: { bg: "#EFE9DA", fg: "#3D424D", border: "#B8B0A0" },
  // Provenance chips on the SPX/ES diagnostics.
  synthetic: { bg: "#F4E4BC", fg: "#6B4F2A", border: "#C9B58C" },
  stale: { bg: "#F4D9A2", fg: "#5C3F0B", border: "#B8821F" },
} as const satisfies Record<string, ChipTone>;
