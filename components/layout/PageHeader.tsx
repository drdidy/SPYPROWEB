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
    <header className="relative overflow-hidden rounded-[16px] border border-[#D6BC75]/38 bg-[#071116] px-5 py-4 text-paper shadow-[0_22px_56px_-42px_rgba(7,17,22,0.95)] md:px-6 md:py-5">
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] text-gold-soft/82 tracking-[0.20em] uppercase">
              {eyebrow}
            </span>
            <span aria-hidden className="h-px w-8 bg-gold/42" />
            {s && source && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${s.cls}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {source}
              </span>
            )}
          </div>
          <h1 className="font-serif text-[32px] leading-none text-paper tracking-tight md:text-[40px]">
            {title}
          </h1>
          {lede && (
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-paper/68">
              {lede}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
