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
        "relative overflow-hidden rounded-[14px] border border-rule-tier2 bg-[linear-gradient(180deg,#FFFFFF_0%,#FBF7EE_100%)] px-4 py-3 shadow-[0_14px_34px_-28px_rgba(20,22,26,0.34),inset_0_1px_0_rgba(255,255,255,0.9)]",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/55 before:to-transparent",
        "after:pointer-events-none after:absolute after:right-3 after:top-3 after:h-8 after:w-8 after:rounded-full after:border after:border-gold/15",
        className,
      )}
    >
      <div className="relative font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
        {label}
      </div>
      <div
        className={cn("relative mt-1 font-mono text-[22px] font-semibold tabular-nums", toneCls)}
        data-num
      >
        {value}
      </div>
      {note && <div className="relative mt-1 text-[11px] leading-snug text-ink-3">{note}</div>}
    </div>
  );
}
