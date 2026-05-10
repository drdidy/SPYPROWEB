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
        <span className="grid h-6 min-w-6 place-items-center rounded-full border border-rule-strong bg-paper font-mono text-[10px] text-gold-ink tracking-[0.08em] uppercase">
          {number}
        </span>
      )}
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
        {children}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-rule-strong via-rule to-transparent" />
    </div>
  );
}
