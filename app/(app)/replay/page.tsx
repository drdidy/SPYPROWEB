import { ReplayWorkspace } from "@/components/replay/ReplayWorkspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams?: { date?: string };
}

// /replay is the dedicated backtest surface. It hosts the calendar,
// fetches SPY + SPX historical snapshots in parallel, and drives a
// synced playback animation through the chosen day's RTH session.

export default function Page({ searchParams }: PageProps) {
  const initialDate =
    searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : null;

  return (
    <div className="max-w-[1440px] mx-auto space-y-8 pb-16">
      <header className="pt-2 pb-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
            Replay · backtest
          </span>
          <span className="h-px w-10 bg-rule-strong" />
          <span className="font-mono text-[10px] text-ink-3 tracking-[0.20em] uppercase">
            yfinance · 5-minute resolution
          </span>
        </div>
        <h1 className="mt-3 text-display font-serif tracking-tight text-ink">
          The day,{" "}
          <span className="text-ink-3 italic font-light">replayed.</span>
        </h1>
        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed max-w-xl">
          Pick a past trading day. We'll rebuild the ES channel and the
          SPY anchor framework as they stood that morning, then play the
          day's tape forward against them — every line touch, every
          verdict outcome.
        </p>
      </header>

      <ReplayWorkspace initialDate={initialDate} />
    </div>
  );
}
