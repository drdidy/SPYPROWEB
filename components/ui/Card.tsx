import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function Card({
  className,
  children,
  interactive = false,
  tone = "paper",
}: {
  className?: string;
  children: ReactNode;
  interactive?: boolean;
  tone?: "paper" | "sunken" | "gold";
}) {
  const toneCls =
    tone === "sunken"
      ? "bg-paper-2"
      : tone === "gold"
        ? "bg-gold-tint"
        : "bg-paper";
  return (
    <div
      className={cn(
        // h-full + flex-col lets the card fill its grid cell vertically,
        // and CardBody can use flex-1 to push the footer to the bottom
        // so two adjacent cards bottom-align cleanly (P2 polish).
        "rounded-card shadow-card relative flex flex-col h-full",
        toneCls,
        interactive &&
          "transition-shadow duration-200 ease-swift hover:shadow-card-hover cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  eyebrow,
  title,
  meta,
  action,
  divider = true,
}: {
  // ReactNode (not just string) so callers can pass an inline cluster
  // of ticker-badge + section descriptor — the standard slate eyebrow
  // shape used by <EngineCard />. String values keep working unchanged.
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-5 pt-4 pb-3",
        divider && "border-b border-rule",
      )}
    >
      <div>
        {eyebrow && <div className="eyebrow text-ink-3 mb-1.5">{eyebrow}</div>}
        <div className="text-title font-serif tracking-tight text-ink">{title}</div>
        {meta && <div className="text-xs text-ink-3 mt-1">{meta}</div>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-3 border-t border-rule text-xs text-ink-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
