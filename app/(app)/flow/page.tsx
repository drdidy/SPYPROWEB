import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusPill } from "@/components/ui/StatusPill";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

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
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence · 09"
        title="Order Flow"
        lede="Unusual Whales options flow and dealer gamma exposure."
        source={source}
      />

      <SectionLabel number="01">Net flow</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="SPY · recent prints"
          title={flow ? `${flow.lean.toLowerCase()} lean` : "Flow unavailable"}
          action={
            flow ? (
              <StatusPill variant={leanTone[flow.lean] ?? "stale"}>
                {flow.lean}
              </StatusPill>
            ) : undefined
          }
        />
        <CardBody>
          {!flow ? (
            <div className="py-6 text-[13px] text-ink-3">
              Unusual Whales returned no flow data. Either the API key is not
              set, the upstream is rate-limited, or the market is quiet right
              now.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Bullish prints" value={`${flow.bullishCount}`} tone="bull" />
                <Stat label="Bearish prints" value={`${flow.bearishCount}`} tone="bear" />
                <Stat
                  label="Net premium"
                  value={`${flow.premiumNet >= 0 ? "+" : "−"}$${Math.abs(flow.premiumNet / 1000).toFixed(0)}k`}
                  tone={flow.premiumNet >= 0 ? "bull" : "bear"}
                />
              </div>
              {flow.topPrints.length > 0 && (
                <div className="mt-5">
                  <div className="eyebrow text-ink-3 mb-2">Top prints</div>
                  <ul className="divide-y divide-rule">
                    {flow.topPrints.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between py-2 text-[12px]"
                      >
                        <span className="font-mono text-ink-2">
                          {p.side} · strike {p.strike ?? "—"}
                        </span>
                        <span className="font-mono tabular-nums text-ink-2">
                          ${(p.premium / 1000).toFixed(0)}k
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <SectionLabel number="02">Dealer gamma</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="GEX regime"
          title={gex ? `${gex.regime.toLowerCase()} regime` : "GEX unavailable"}
          action={
            gex ? (
              <StatusPill variant={leanTone[gex.regime] ?? "stale"}>
                {gex.regime}
              </StatusPill>
            ) : undefined
          }
        />
        <CardBody>
          {!gex ? (
            <div className="py-6 text-[13px] text-ink-3">
              GEX not yet returned by Unusual Whales.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Total GEX"
                value={`${gex.totalGEX >= 0 ? "+" : ""}${gex.totalGEX.toLocaleString()}`}
                tone={gex.totalGEX >= 0 ? "bull" : "bear"}
              />
              <Stat
                label="Flip point"
                value={gex.flipPoint !== null ? gex.flipPoint.toFixed(2) : "—"}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls = tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink";
  return (
    <div className="px-2.5 py-2 rounded-soft bg-paper-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div
        className={`font-mono text-base font-semibold tabular-nums mt-0.5 ${cls}`}
        data-num
      >
        {value}
      </div>
    </div>
  );
}
