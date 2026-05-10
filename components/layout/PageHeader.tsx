import type { LiveSnapshotSource } from "@/lib/snapshot-fetch";

const sourcePalette: Record<LiveSnapshotSource, { cls: string; dot: string }> = {
  live: {
    cls: "bg-bull-tint text-bull-ink shadow-[inset_0_0_0_1px_rgba(14,124,80,0.30)]",
    dot: "bg-bull animate-breathe",
  },
  degraded: {
    cls: "bg-gold-tint text-gold-ink shadow-[inset_0_0_0_1px_rgba(184,130,31,0.30)]",
    dot: "bg-gold",
  },
  seed: {
    cls: "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]",
    dot: "bg-ink-4",
  },
  mock: {
    cls: "bg-paper-2 text-ink-3 shadow-[inset_0_0_0_1px_rgba(20,22,26,0.10)]",
    dot: "bg-ink-4",
  },
  error: {
    cls: "bg-bear-tint text-bear-ink shadow-[inset_0_0_0_1px_rgba(181,48,30,0.30)]",
    dot: "bg-bear",
  },
};

export function PageHeader({
  eyebrow,
  title,
  lede,
  source,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  source?: LiveSnapshotSource;
}) {
  const s = source ? sourcePalette[source] : null;
  return (
    <header className="pt-4 pb-1">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[10px] text-gold-ink/80 tracking-[0.20em] uppercase">
          {eyebrow}
        </span>
        <span aria-hidden className="h-px w-10 bg-rule-strong" />
        {s && source && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${s.cls}`}
          >
            <span className={`w-1 h-1 rounded-full ${s.dot}`} />
            {source}
          </span>
        )}
      </div>
      <h1 className="font-serif text-[42px] leading-none text-ink tracking-tight">
        {title}
      </h1>
      {lede && (
        <p className="mt-3 text-[15px] text-ink-2 max-w-2xl leading-relaxed">
          {lede}
        </p>
      )}
    </header>
  );
}
