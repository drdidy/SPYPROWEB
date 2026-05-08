import { cn } from "@/lib/utils";

const variants = {
  armed: { dot: "bg-state-armed", text: "text-teal", bg: "bg-teal-tint", ring: "shadow-[0_0_0_1px_rgba(10,117,137,0.25)]" },
  watching: { dot: "bg-state-watching", text: "text-gold-ink", bg: "bg-gold-tint", ring: "shadow-[0_0_0_1px_rgba(184,130,31,0.25)]" },
  confirmed: { dot: "bg-state-confirmed", text: "text-bull-ink", bg: "bg-bull-tint", ring: "shadow-[0_0_0_1px_rgba(14,124,80,0.25)]" },
  breached: { dot: "bg-state-breached", text: "text-bear-ink", bg: "bg-bear-tint", ring: "shadow-[0_0_0_1px_rgba(181,48,30,0.25)]" },
  stale: { dot: "bg-ink-4", text: "text-ink-3", bg: "bg-paper-2", ring: "shadow-[0_0_0_1px_rgba(20,22,26,0.08)]" },
  ok: { dot: "bg-state-confirmed", text: "text-bull-ink", bg: "bg-bull-tint", ring: "shadow-[0_0_0_1px_rgba(14,124,80,0.25)]" },
  waiting: { dot: "bg-state-watching", text: "text-gold-ink", bg: "bg-gold-tint", ring: "shadow-[0_0_0_1px_rgba(184,130,31,0.25)]" },
  broken: { dot: "bg-state-breached", text: "text-bear-ink", bg: "bg-bear-tint", ring: "shadow-[0_0_0_1px_rgba(181,48,30,0.25)]" },
  intact: { dot: "bg-state-confirmed", text: "text-bull-ink", bg: "bg-bull-tint", ring: "shadow-[0_0_0_1px_rgba(14,124,80,0.25)]" },
} as const;

export type PillVariant = keyof typeof variants;

export function StatusPill({
  variant,
  pulse = false,
  children,
  className,
}: {
  variant: PillVariant;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const v = variants[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill text-[10px] font-semibold uppercase tracking-[0.12em]",
        v.bg,
        v.text,
        v.ring,
        className,
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          v.dot,
          pulse && "animate-breathe",
        )}
      />
      {children}
    </span>
  );
}
