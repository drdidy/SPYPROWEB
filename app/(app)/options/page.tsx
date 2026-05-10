import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { CommandStat } from "@/components/ui/CommandStat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import type { AdaptedSnapshot } from "@/lib/snapshot-adapter";

type Chain = NonNullable<AdaptedSnapshot["optionsChain"]>;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const chain = snap.optionsChain;
  const walls = chain ? chainWalls(chain) : null;

  return (
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Execution - 06"
        title="Options Cockpit"
        lede="Strike picker, walls, and dealer flow. The same anchors the dashboard reads."
        source={source}
      />

      {chain && walls && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <CommandStat label="Expiration" value={chain.expiration} note="Active chain" tone="gold" />
          <CommandStat label="ATM strike" value={fmtPrice(chain.atm)} note="Broker-resolved" />
          <CommandStat
            label="Call wall"
            value={fmtPrice(walls.callWall.strike)}
            note={`${fmtInt(walls.callWall.oi)} OI`}
            tone="bull"
          />
          <CommandStat
            label="Put wall"
            value={fmtPrice(walls.putWall.strike)}
            note={`${fmtInt(walls.putWall.oi)} OI`}
            tone="bear"
          />
        </div>
      )}

      <SectionLabel number="01">Strike ladder</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Broker chain"
          title={chain ? `Expiration ${chain.expiration} - ATM ${fmtPrice(chain.atm)}` : "Chain unavailable"}
          meta={chain ? `${chain.calls.length} calls - ${chain.puts.length} puts` : undefined}
        />
        <CardBody className="px-0 pb-0">
          {!chain ? (
            <div className="p-5">
              <CommandEmptyState
                eyebrow="Broker chain standby"
                title="No option chain is loaded."
                body="The broker feed did not return the active expiration for this snapshot. The cockpit will populate the ladder, walls, volume, and open interest as soon as the response is available."
                rows={[
                  { label: "Source", value: "Broker feed" },
                  { label: "Display", value: "No synthetic rows" },
                  { label: "Fallback", value: "Honest empty state" },
                ]}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] tabular-nums">
                  <thead>
                    <tr className="border-y border-rule text-ink-3 eyebrow">
                      <th className="text-right px-3 py-2.5">Call OI</th>
                      <th className="text-right px-3 py-2.5">Call Vol</th>
                      <th className="text-right px-3 py-2.5">Delta</th>
                      <th className="text-right px-3 py-2.5">IV</th>
                      <th className="text-center px-5 py-2.5 bg-paper-2/50">Strike</th>
                      <th className="text-right px-3 py-2.5">IV</th>
                      <th className="text-right px-3 py-2.5">Delta</th>
                      <th className="text-right px-3 py-2.5">Put Vol</th>
                      <th className="text-right px-3 py-2.5">Put OI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {chainRows(chain).map((r) => (
                      <tr key={r.strike} className={r.atm ? "bg-gold-tint/35" : ""}>
                        <td className="text-right px-3 py-2 font-mono text-bull-ink">
                          {fmtInt(r.callOi)}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-ink-2">
                          {fmtInt(r.callVol)}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-ink-2">
                          {fmtNum(r.callDelta, 2)}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-ink-2">
                          {fmtPct(r.callIV)}
                        </td>
                        <td className="text-center px-5 py-2 font-mono font-semibold text-ink">
                          {fmtPrice(r.strike)}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-ink-2">
                          {fmtPct(r.putIV)}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-ink-2">
                          {fmtNum(r.putDelta, 2)}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-ink-2">
                          {fmtInt(r.putVol)}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-bear-ink">
                          {fmtInt(r.putOi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t xl:border-t-0 xl:border-l border-rule bg-[#071116] text-paper p-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">
                  Dealer pressure
                </div>
                <div className="mt-4 space-y-4">
                  <WallMeter label="Call open interest" value={chain.totals.callOi} total={chain.totals.callOi + chain.totals.putOi} tone="bull" />
                  <WallMeter label="Put open interest" value={chain.totals.putOi} total={chain.totals.callOi + chain.totals.putOi} tone="bear" />
                  <WallMeter label="Call volume" value={chain.totals.callVol} total={chain.totals.callVol + chain.totals.putVol} tone="bull" />
                  <WallMeter label="Put volume" value={chain.totals.putVol} total={chain.totals.callVol + chain.totals.putVol} tone="bear" />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <SideStat label="PCR" value={chain.totals.pcr !== null ? chain.totals.pcr.toFixed(2) : "-"} />
                  <SideStat label="Rows" value={`${chainRows(chain).length}`} />
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function chainRows(chain: Chain): RowData[] {
  const byStrike = new Map<number, RowData>();
  for (const c of chain.calls) {
    if (!byStrike.has(c.strike)) byStrike.set(c.strike, blankRow(c.strike));
    const r = byStrike.get(c.strike)!;
    r.callOi = c.oi;
    r.callVol = c.volume;
    r.callDelta = c.delta;
    r.callIV = c.iv;
  }
  for (const p of chain.puts) {
    if (!byStrike.has(p.strike)) byStrike.set(p.strike, blankRow(p.strike));
    const r = byStrike.get(p.strike)!;
    r.putOi = p.oi;
    r.putVol = p.volume;
    r.putDelta = p.delta;
    r.putIV = p.iv;
  }
  const rows = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  for (const r of rows) r.atm = r.strike === chain.atm;
  return rows;
}

interface RowData {
  strike: number;
  callOi: number;
  callVol: number;
  callDelta: number;
  callIV: number;
  putOi: number;
  putVol: number;
  putDelta: number;
  putIV: number;
  atm: boolean;
}

function blankRow(strike: number): RowData {
  return {
    strike,
    callOi: 0,
    callVol: 0,
    callDelta: NaN,
    callIV: NaN,
    putOi: 0,
    putVol: 0,
    putDelta: NaN,
    putIV: NaN,
    atm: false,
  };
}

function chainWalls(chain: Chain) {
  const callWall = [...chain.calls].sort((a, b) => b.oi - a.oi)[0] ?? { strike: chain.atm, oi: 0 };
  const putWall = [...chain.puts].sort((a, b) => b.oi - a.oi)[0] ?? { strike: chain.atm, oi: 0 };
  return { callWall, putWall };
}

function WallMeter({
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
  const fill = tone === "bull" ? "bg-bull" : "bg-bear";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/52">
          {label}
        </span>
        <span className="font-mono text-[11px] text-paper/82">{fmtInt(value)}</span>
      </div>
      <div className="mt-2 h-2 rounded-pill bg-paper/10 overflow-hidden">
        <div className={`${fill} h-full rounded-pill`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SideStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-soft border border-paper/10 bg-paper/[0.04] px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-paper/40">
        {label}
      </div>
      <div className="mt-1 font-mono text-[14px] text-paper">{value}</div>
    </div>
  );
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "-";
  return n.toLocaleString();
}

function fmtNum(n: number, dp: number): string {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(dp);
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(Number.isInteger(n) ? 0 : 2);
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}
