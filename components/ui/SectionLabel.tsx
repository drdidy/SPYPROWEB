import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function SectionLabel({
  number,
  children,
  className,
}: {
  number?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {number && (
        <span className="grid h-7 min-w-7 place-items-center rounded-[8px] border border-gold/35 bg-[#071116] font-mono text-[10px] text-gold-soft shadow-[0_10px_26px_-20px_rgba(7,17,22,0.8)] tracking-[0.08em] uppercase">
          {number}
        </span>
      )}
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-2">
        {children}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-gold/55 via-rule to-transparent" />
    </div>
  );
}
