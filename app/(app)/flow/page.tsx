import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { CommandStat } from "@/components/ui/CommandStat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusPill } from "@/components/ui/StatusPill";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { nearReferencePriceLabel } from "@/lib/market-data-quality";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const leanTone: Record<string, "confirmed" | "watching" | "breached" | "stale"> = {
  BULLISH: "confirmed",
  BEARISH: "breached",
  BALANCED: "watching",
  POSITIVE: "confirmed",
  NEGATIVE: "breached",
  FLAT: "stale",
};

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const flow = snap.flow;
  const gex = snap.gex;

  return (
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence - 09"
        title="Order Flow"
        lede="Unusual Whales options flow and dealer gamma exposure."
        source={source}
      />

      {!flow && !gex ? (
        <CommandEmptyState
          eyebrow="Flow feed standby"
          title="No flow or GEX feed is available."
          body="The app is not receiving Unusual Whales flow or dealer gamma in this snapshot. No substitute prints, premiums, or flip points are rendered until the upstream provides them."
          rows={[
            { label: "Flow", value: "Waiting" },
            { label: "GEX", value: "Waiting" },
            { label: "Policy", value: "No fake tape" },
          ]}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <CommandStat
              label="Flow lean"
              value={flow?.lean ?? "-"}
              note={flow ? `${flow.bullishCount} bull / ${flow.bearishCount} bear` : "Unavailable"}
              tone={flow?.lean === "BULLISH" ? "bull" : flow?.lean === "BEARISH" ? "bear" : "gold"}
            />
            <CommandStat
              label="Net premium"
              value={flow ? premium(flow.premiumNet) : "-"}
              note="Recent prints"
              tone={flow && flow.premiumNet >= 0 ? "bull" : "bear"}
            />
            <CommandStat
              label="GEX regime"
              value={gex?.regime ?? "-"}
              note={gex ? "Dealer gamma" : "Unavailable"}
              tone={gex?.regime === "POSITIVE" ? "bull" : gex?.regime === "NEGATIVE" ? "bear" : "ink"}
            />
            <CommandStat
              label="Flip point"
              value={nearReferencePriceLabel(gex?.flipPoint, snap.currentPrice)}
              note={gex ? "Checked against SPY spot" : "If supplied by feed"}
              tone="teal"
            />
          </div>

          <SectionLabel number="01">Net flow</SectionLabel>
          <Card>
            <CardHeader
              eyebrow="SPY - recent prints"
              title={flow ? `${flow.lean.toLowerCase()} lean` : "Flow unavailable"}
              action={flow ? <StatusPill variant={leanTone[flow.lean] ?? "stale"}>{flow.lean}</StatusPill> : undefined}
            />
            <CardBody>
              {!flow ? (
                <CommandEmptyState
                  eyebrow="Print tape"
                  title="Flow has not returned yet."
                  body="Unusual Whales returned no flow data for this snapshot. The premium bars and top prints appear only when the upstream response carries real prints."
                  rows={[
                    { label: "Ticker", value: "SPY" },
                    { label: "Premium", value: "Unavailable" },
                    { label: "Top prints", value: "Unavailable" },
                  ]}
                />
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-5">
                  <div className="rounded-card bg-[#071116] text-paper border border-[#243138] p-5">
                    <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">
                      Premium balance
                    </div>
                    <div className="mt-5 space-y-5">
                      <PremiumBar label="Bullish prints" value={flow.bullishCount} total={flow.bullishCount + flow.bearishCount} tone="bull" />
                      <PremiumBar label="Bearish prints" value={flow.bearishCount} total={flow.bullishCount + flow.bearishCount} tone="bear" />
                    </div>
                    <div className="mt-6 font-mono text-[32px] leading-none text-paper" data-num>
                      {premium(flow.premiumNet)}
                    </div>
                    <div className="mt-2 text-[12px] text-paper/45">Net premium from upstream prints</div>
                  </div>
                  <div>
                    <div className="eyebrow text-ink-3 mb-3">Top prints</div>
                    {flow.topPrints.length === 0 ? (
                      <div className="rounded-card bg-paper-2/50 border border-rule p-8 text-[13px] text-ink-3">
                        The feed returned a flow summary without top prints.
                      </div>
                    ) : (
                      <ul className="divide-y divide-rule rounded-card border border-rule overflow-hidden">
                        {flow.topPrints.map((p, i) => (
                          <li key={`${p.ts ?? "print"}-${i}`} className="grid grid-cols-12 gap-3 px-4 py-3 items-center bg-paper">
                            <span className="col-span-2 font-mono text-[10px] text-ink-3 tabular-nums">{p.ts ? shortTime(p.ts) : "-"}</span>
                            <span className={`col-span-2 font-mono text-[11px] font-semibold ${p.side.toUpperCase().includes("CALL") ? "text-bull-ink" : "text-bear-ink"}`}>
                              {p.side}
                            </span>
                            <span className="col-span-3 font-mono text-[12px] text-ink-2">Strike {p.strike ?? "-"}</span>
                            <span className="col-span-5 text-right font-mono text-[13px] text-ink" data-num>
                              {premium(p.premium)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <SectionLabel number="02">Dealer gamma</SectionLabel>
          <Card>
            <CardHeader
              eyebrow="GEX regime"
              title={gex ? `${gex.regime.toLowerCase()} regime` : "GEX unavailable"}
              action={gex ? <StatusPill variant={leanTone[gex.regime] ?? "stale"}>{gex.regime}</StatusPill> : undefined}
            />
            <CardBody>
              {!gex ? (
                <div className="py-6 text-[13px] text-ink-3">GEX has not returned from Unusual Whales.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CommandStat
                    label="Total GEX"
                    value={`${gex.totalGEX >= 0 ? "+" : ""}${gex.totalGEX.toLocaleString()}`}
                    tone={gex.totalGEX >= 0 ? "bull" : "bear"}
                  />
                  <CommandStat
                    label="Flip point"
                    value={nearReferencePriceLabel(gex.flipPoint, snap.currentPrice)}
                    tone="teal"
                  />
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function PremiumBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "bull" | "bear";
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">{label}</span>
        <span className="font-mono text-[12px] text-paper">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-pill bg-paper/10 overflow-hidden">
        <div className={`h-full rounded-pill ${tone === "bull" ? "bg-bull" : "bg-bear"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function premium(n: number): string {
  if (!Number.isFinite(n)) return "-";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n / 1000).toFixed(0)}k`;
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}
