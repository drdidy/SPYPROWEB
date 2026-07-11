"use client";

import { BrainCircuit, CalendarDays, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { DailyIntelligenceSnapshot, ReviewedTrade } from "@/lib/intelligence/daily";
import { cn } from "@/lib/utils";

export function ReviewAIClient() {
  const [snapshot, setSnapshot] = useState<DailyIntelligenceSnapshot | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (selected?: string) => {
    setLoading(true);
    setError(false);
    try {
      const query = selected ? `?date=${encodeURIComponent(selected)}` : "";
      const response = await fetch(`/api/intelligence/daily${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Review unavailable");
      const next = await response.json() as DailyIntelligenceSnapshot;
      setSnapshot(next);
      setDate(next.sessionDate);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!snapshot && loading) return <DeskLoading />;
  if (!snapshot || error) return <DeskError retry={() => void load(date)} />;

  return (
    <div className="bg-optic text-carbon">
      <header className="grid border-b border-carbon xl:grid-cols-[minmax(0,1.2fr)_420px]">
        <div className="p-5 py-10 md:p-10 xl:p-14">
          <div className="flex flex-wrap items-center gap-3">
            <span className="microlabel bg-carbon px-2.5 py-1.5 text-lime">Review AI</span>
            <span className="microlabel text-carbon/60">Evidence bound / no silent retuning</span>
          </div>
          <h1 className="mt-8 max-w-[900px] text-[13vw] font-black leading-[0.88] tracking-[-0.01em] sm:text-[52px] md:text-[72px] xl:text-[88px]">
            Review the day.<br /><span className="text-cobalt">Improve the process.</span>
          </h1>
          <p className="mt-7 max-w-[720px] text-[15px] leading-relaxed text-carbon/65 md:text-[17px]">
            The desk joins TradingView alerts, replay bars, option memory, the Daily Brief, and verified news context. It can propose research, but one unusual session can never rewrite production rules.
          </p>
        </div>
        <div className="flex flex-col justify-between border-t border-carbon bg-lime p-5 md:p-8 xl:border-l xl:border-t-0">
          <div>
            <p className="microlabel">Next-session directive</p>
            <h2 className="mt-5 text-[30px] font-black leading-[0.98]">{snapshot.ai.headline}</h2>
            <p className="mt-5 text-[13px] font-semibold leading-relaxed text-carbon/75">{snapshot.ai.nextSessionFocus}</p>
          </div>
          <div className="mt-10 border-t border-carbon pt-4">
            <p className="microlabel">Synthesis / {snapshot.ai.used ? snapshot.ai.source : "deterministic fallback"}</p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.06em]">Memory / {snapshot.persistence}</p>
          </div>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-3 border-b border-carbon bg-white px-5 py-3 md:px-10">
        <label className="flex h-11 items-center gap-3 border border-carbon px-3">
          <CalendarDays size={15} aria-hidden="true" />
          <span className="sr-only">Review date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="num bg-transparent text-[12px] font-bold outline-none" />
        </label>
        <button type="button" onClick={() => void load(date)} disabled={loading} className="inline-flex h-11 items-center gap-2 bg-carbon px-4 text-[11px] font-black uppercase tracking-[0.08em] text-white transition-colors hover:bg-cobalt disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Reviewing" : "Run review"}
        </button>
        <p className="microlabel ml-auto text-carbon/60">As of {formatDateTime(snapshot.asOf)}</p>
      </section>

      <section className="grid border-b border-carbon lg:grid-cols-[0.72fr_1.28fr]">
        <div className="bg-cobalt p-5 text-white md:p-10">
          <p className="microlabel">Session scorecard / {snapshot.sessionDate}</p>
          <div className="mt-9 grid grid-cols-2 border border-white/35">
            <Score label="Wins" value={snapshot.scorecard.wins} />
            <Score label="Losses" value={snapshot.scorecard.losses} alert />
            <Score label="Timeouts" value={snapshot.scorecard.timeouts} />
            <Score label="Average R" value={snapshot.scorecard.averageR === null ? "--" : `${signed(snapshot.scorecard.averageR)}R`} />
          </div>
          <p className="mt-7 text-[13px] leading-relaxed text-white/90">{snapshot.ai.review}</p>
        </div>
        <div className="p-5 py-9 md:p-10">
          <div className="flex items-center justify-between gap-4 border-b border-carbon pb-4">
            <div>
              <p className="microlabel text-cobalt">Completed trade review</p>
              <h2 className="mt-2 text-[26px] font-black">What the evidence actually says</h2>
            </div>
            <BrainCircuit size={24} className="text-cobalt" aria-hidden="true" />
          </div>
          {snapshot.trades.length ? <ol>{snapshot.trades.map((trade, index) => <TradeRow key={trade.id} trade={trade} index={index} />)}</ol> : <EmptyReview />}
        </div>
      </section>

      <section className="border-b border-carbon bg-carbon text-white">
        <div className="grid lg:grid-cols-[0.38fr_0.62fr]">
          <div className="border-b border-white/20 p-5 py-10 md:p-10 lg:border-b-0 lg:border-r">
            <p className="microlabel text-lime">Research queue</p>
            <h2 className="mt-6 text-[36px] font-black leading-[0.95] md:text-[48px]">Improve without overfitting.</h2>
            <p className="mt-6 text-[13px] leading-relaxed text-white/90">Recommendations graduate only when repeated evidence supports them. Until then, they remain visible research questions.</p>
          </div>
          <div>
            {snapshot.improvements.map((item, index) => (
              <article key={`${item.title}-${index}`} className="grid border-b border-white/20 p-5 md:grid-cols-[56px_1fr_130px] md:gap-6 md:p-7">
                <span className="num text-[11px] font-bold text-lime">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-[18px] font-black">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/90">{item.finding}</p>
                  <p className="mt-3 text-[13px] font-bold leading-relaxed text-white">{item.action}</p>
                </div>
                <div className="mt-4 md:mt-0 md:text-right">
                  <p className="microlabel text-lime">{item.confidence}</p>
                  <p className="num mt-2 text-[12px] text-white/60">N = {item.sample}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid border-b border-carbon xl:grid-cols-3">
        <PlanColumn label="Focus" title={snapshot.nextSession.headline} items={snapshot.nextSession.focus} tone="lime" />
        <PlanColumn label="Avoid" title="Protect the process" items={snapshot.nextSession.avoid} tone="coral" />
        <PlanColumn label="News and event watch" title="Context, never permission" items={snapshot.nextSession.newsWatch} tone="cobalt" />
      </section>

      <section className="flex flex-wrap items-center gap-4 bg-white px-5 py-4 md:px-10">
        <ShieldCheck size={17} className="text-go-ink" />
        <p className="text-[12px] font-bold">{snapshot.ai.riskRule}</p>
        <p className="microlabel ml-auto text-carbon/60">{snapshot.evidence.completedTrades} trades / {snapshot.evidence.replayBars} replay bars / {snapshot.evidence.rollingTrades} rolling samples</p>
      </section>
    </div>
  );
}

function TradeRow({ trade, index }: { trade: ReviewedTrade; index: number }) {
  return (
    <li className="grid border-b border-carbon/20 py-5 md:grid-cols-[48px_110px_1fr_120px] md:gap-4">
      <span className="num text-[10px] font-bold text-carbon/45">{String(index + 1).padStart(2, "0")}</span>
      <div>
        <p className={cn("microlabel", trade.outcome === "WIN" ? "text-go-ink" : trade.outcome === "LOSS" ? "text-stop-ink" : "text-cobalt")}>{trade.outcome}</p>
        <p className="num mt-2 text-[11px] font-bold">{time(trade.entryAt)} to {time(trade.exitAt)}</p>
      </div>
      <div>
        <p className="text-[14px] font-black uppercase">{trade.symbol} / {trade.direction}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-carbon/65">{trade.lesson}</p>
      </div>
      <div className="mt-3 md:mt-0 md:text-right">
        <p className="num text-[13px] font-black">{trade.realizedR === null ? "--" : `${signed(trade.realizedR)}R`}</p>
        <p className="microlabel mt-2 text-carbon/55">{trade.durationMinutes} min / {trade.timing}</p>
      </div>
    </li>
  );
}

function Score({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return <div className="border-b border-r border-white/35 p-4"><p className="microlabel text-white">{label}</p><p className={cn("num mt-3 text-[28px] font-black", alert && Number(value) > 0 && "text-coral")}>{value}</p></div>;
}

function PlanColumn({ label, title, items, tone }: { label: string; title: string; items: string[]; tone: "lime" | "coral" | "cobalt" }) {
  return (
    <article className="border-b border-carbon p-5 py-9 last:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0 md:p-9">
      <p className={cn("microlabel", tone === "lime" ? "text-go-ink" : tone === "coral" ? "text-stop-ink" : "text-cobalt")}>{label}</p>
      <h2 className="mt-5 text-[28px] font-black leading-[0.98]">{title}</h2>
      <ul className="mt-7 border-t border-carbon">
        {items.map((item) => <li key={item} className="flex gap-3 border-b border-carbon/20 py-4 text-[12px] font-semibold leading-relaxed"><span className={cn("mt-1 h-2 w-2 shrink-0", tone === "lime" ? "bg-lime" : tone === "coral" ? "bg-coral" : "bg-cobalt")} />{item}</li>)}
      </ul>
    </article>
  );
}

function EmptyReview() {
  return <div className="mt-7 flex gap-3 border border-carbon/25 bg-white p-5"><TriangleAlert size={17} className="mt-0.5 shrink-0 text-cobalt" /><div><p className="text-[14px] font-black">No completed engine trade for this date.</p><p className="mt-2 text-[12px] leading-relaxed text-carbon/60">The desk will not manufacture a lesson. Select another date or wait for the next completed alert sequence.</p></div></div>;
}

function DeskLoading() { return <div className="hatch grid min-h-[680px] place-items-center"><div className="text-center"><BrainCircuit className="mx-auto animate-pulse text-cobalt" size={30} /><p className="mt-5 text-[24px] font-black">Reviewing verified evidence</p></div></div>; }
function DeskError({ retry }: { retry: () => void }) { return <div className="grid min-h-[680px] place-items-center p-8 text-center"><div><TriangleAlert className="mx-auto text-coral" size={30} /><h1 className="mt-5 text-[32px] font-black">Review desk unavailable</h1><button onClick={retry} className="mt-6 h-11 bg-carbon px-5 text-[11px] font-black uppercase text-white">Try again</button></div></div>; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function time(value: string) { return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) + " CT"; }
