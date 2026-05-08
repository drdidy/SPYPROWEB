import type { Grade } from "@/lib/types";
import { cn } from "@/lib/utils";

const palette: Record<Grade, { bg: string; text: string; ring: string }> = {
  "A+": { bg: "bg-bull", text: "text-paper", ring: "shadow-[0_0_0_1px_rgba(14,74,48,0.4)]" },
  A:    { bg: "bg-bull-soft", text: "text-bull-ink", ring: "shadow-[0_0_0_1px_rgba(14,124,80,0.35)]" },
  B:    { bg: "bg-gold-soft", text: "text-gold-ink", ring: "shadow-[0_0_0_1px_rgba(184,130,31,0.35)]" },
  C:    { bg: "bg-gold-tint", text: "text-gold-ink", ring: "shadow-[0_0_0_1px_rgba(199,106,30,0.30)]" },
  D:    { bg: "bg-bear-tint", text: "text-bear-ink", ring: "shadow-[0_0_0_1px_rgba(160,64,32,0.35)]" },
  NO_TRADE: { bg: "bg-paper-2", text: "text-ink-3", ring: "shadow-[0_0_0_1px_rgba(20,22,26,0.10)]" },
};

export function GradeBadge({ grade, size = "md" }: { grade: Grade; size?: "sm" | "md" | "lg" }) {
  const p = palette[grade];
  const dim =
    size === "sm" ? "w-9 h-9 text-base" : size === "lg" ? "w-14 h-14 text-xl" : "w-11 h-11 text-lg";
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-soft font-serif font-medium tracking-tight",
        dim,
        p.bg,
        p.text,
        p.ring,
      )}
      aria-label={`Grade ${grade}`}
    >
      {grade === "NO_TRADE" ? "—" : grade}
    </div>
  );
}
