import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CommandStat({
  label,
  value,
  note,
  tone = "ink",
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "ink" | "bull" | "bear" | "gold" | "teal";
  className?: string;
}) {
  const toneCls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : tone === "gold"
          ? "text-gold-ink"
          : tone === "teal"
            ? "text-teal"
            : "text-ink";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card border border-rule-tier2 bg-paper px-4 py-3 shadow-card",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/40 before:to-transparent",
        className,
      )}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
        {label}
      </div>
      <div
        className={cn("mt-1 font-mono text-[22px] font-semibold tabular-nums", toneCls)}
        data-num
      >
        {value}
      </div>
      {note && <div className="mt-1 text-[11px] leading-snug text-ink-3">{note}</div>}
    </div>
  );
}
