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
    <div className="w-full max-w-[1440px] space-y-8 pb-16">
      <header className="relative overflow-hidden rounded-[18px] border border-[#D6BC75]/45 bg-[#071116] px-5 py-5 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-7 md:py-6">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
        />
        <div
          aria-hidden
          className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-gold/20"
        />
        <div className="relative">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[10px] text-gold-soft/82 tracking-[0.20em] uppercase">
            Replay · backtest
          </span>
          <span className="h-px w-10 bg-gold/45" />
          <span className="font-mono text-[10px] text-paper/48 tracking-[0.20em] uppercase">
            Historical bars · 5-minute resolution
          </span>
        </div>
        <h1 className="mt-3 text-[36px] font-serif leading-none tracking-tight text-paper md:text-[46px]">
          The day,{" "}
          <span className="text-gold-soft/72 italic font-light">replayed.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-paper/68">
          Pick a past trading day. We'll rebuild the ES channel and the
          SPY anchor framework as they stood that morning, then play the
          day's tape forward against them — every line touch, every
          verdict outcome.
        </p>
        </div>
      </header>

      <ReplayWorkspace initialDate={initialDate} />
    </div>
  );
}
