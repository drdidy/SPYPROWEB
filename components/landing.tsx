// Landing-style hero from 81ed613d* in the design bundle: bias chip, last
// price, OHLC + context (VIX/DXY/VVIX), intraday sparkline.
import type { Snapshot } from "@/lib/types";
import { Sparkline } from "./sparkline";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function biasTone(score: number) {
  if (score <= -25) return { ring: "ring-accent-amber/40", chip: "pill pill-amber" };
  if (score >= 25) return { ring: "ring-accent-green/40", chip: "pill pill-green" };
  return { ring: "ring-border-emph", chip: "pill pill-outline" };
}

export function LandingHero({ snap }: { snap: Snapshot }) {
  const { bias, quote, context, spark } = snap;
  const tone = biasTone(bias.score);
  const chgColor = quote.chg >= 0 ? "text-accent-green" : "text-accent-amber";

  return (
    <section className="px-10 pt-10 pb-8 border-b border-border">
      <div className="flex items-start justify-between gap-10">
        <div className="space-y-4 max-w-xl">
          <div className="flex items-center gap-3">
            <span className={tone.chip}>● {bias.label}</span>
            <span className="tabular text-text-muted text-[12px]">
              BIAS&nbsp;{bias.score > 0 ? "+" : ""}{bias.score}
            </span>
          </div>
          <h1 className="text-[44px] leading-[1.05] font-semibold tracking-tight">
            <span className="tabular">{fmt(quote.last)}</span>
            <span className={`ml-3 text-[18px] tabular align-middle ${chgColor}`}>
              {quote.chg >= 0 ? "+" : ""}{fmt(quote.chg)}
              <span className="ml-1 text-text-muted">
                ({quote.chgPct >= 0 ? "+" : ""}{fmt(quote.chgPct, 3)}%)
              </span>
            </span>
          </h1>
          <p className="text-[11px] tracking-[0.14em] uppercase text-text-muted">
            {bias.note}
          </p>
        </div>
        <div className="flex-1 h-24 max-w-[640px]">
          <Sparkline values={spark} />
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-7 gap-x-10 gap-y-2 text-[11px] tracking-[0.12em] uppercase text-text-dim">
        {[
          ["Open", quote.open],
          ["High", quote.high],
          ["Low", quote.low],
          ["Prev Close", quote.prevClose],
          ["VIX", context.vix],
          ["DXY", context.dxy],
          ["VVIX", context.vvix],
        ].map(([k, v]) => (
          <div key={k as string} className="flex flex-col gap-0.5">
            <dt>{k}</dt>
            <dd className="text-text-primary text-[14px] tabular tracking-normal normal-case font-medium">
              {fmt(v as number)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
