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
    <div className={cn("flex items-baseline gap-3", className)}>
      {number && (
        <span className="font-mono text-[10px] text-ink-3 tracking-[0.16em] uppercase">
          {number}
        </span>
      )}
      <span className="eyebrow text-ink-3">{children}</span>
      <div className="flex-1 h-px bg-rule" />
    </div>
  );
}
