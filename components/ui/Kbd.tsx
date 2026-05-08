import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-[4px] bg-paper-2 text-ink-2 font-mono text-[10px] shadow-rule",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
