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
    <header className="relative overflow-hidden rounded-[18px] border border-[#D6BC75]/45 bg-[#071116] px-5 py-5 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-7 md:py-6">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
      />
      <div
        aria-hidden
        className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-gold/20"
      />
      <div
        aria-hidden
        className="absolute right-10 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full border border-gold/10 hidden md:block"
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <span className="font-mono text-[10px] text-gold-soft/82 tracking-[0.20em] uppercase">
              {eyebrow}
            </span>
            <span aria-hidden className="h-px w-10 bg-gold/45" />
            {s && source && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[9px] font-mono font-semibold uppercase tracking-[0.12em] ${s.cls}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {source}
              </span>
            )}
          </div>
          <h1 className="font-serif text-[36px] leading-none text-paper tracking-tight md:text-[46px]">
            {title}
          </h1>
          {lede && (
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-paper/68 md:text-[15px]">
              {lede}
            </p>
          )}
        </div>
        <div className="hidden shrink-0 grid-cols-3 gap-1.5 md:grid" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="h-8 w-8 rounded-[6px] border border-paper/10 bg-paper/[0.045]"
            />
          ))}
        </div>
      </div>
    </header>
  );
}
