import { cn } from "@/lib/utils";
import { formatSessionTime } from "@/lib/session-time";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  reason,
  detail,
  retryAt,
  action,
  kind = "empty",
  className,
}: {
  title: string;
  reason: string;
  detail?: string;
  retryAt?: string | null;
  action?: ReactNode;
  kind?: "empty" | "waiting" | "stale" | "error";
  className?: string;
}) {
  const tone =
    kind === "error"
      ? "border-bear/25 bg-bear-tint/35"
      : kind === "stale"
        ? "border-gold/30 bg-gold-tint/35"
        : "border-rule bg-paper-2/60";

  return (
    <div className={cn("rounded-soft border px-4 py-5", tone, className)}>
      <div className="font-serif text-headline text-ink-3 italic font-light">
        {title}
      </div>
      <p className="mt-3 max-w-md text-[13px] leading-relaxed text-ink-3">
        {reason}
      </p>
      {detail && (
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-4">
          {detail}
        </p>
      )}
      {retryAt && (
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 tabular-nums">
          Next check {formatSessionTime(retryAt)}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
