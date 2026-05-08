import { Card, CardBody, CardHeader } from "@/components/ui/Card";
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

  return (
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Execution · 06"
        title="Options Cockpit"
        lede="Strike picker, walls, and dealer flow. The same anchors the dashboard reads."
        source={source}
      />

      <SectionLabel number="01">Strike ladder</SectionLabel>
      <Card>
        <CardHeader
          eyebrow="Tastytrade chain"
          title={chain ? `Expiration ${chain.expiration} · ATM ${chain.atm}` : "Chain unavailable"}
          meta={chain ? `${chain.calls.length} calls · ${chain.puts.length} puts` : undefined}
        />
        <CardBody className="px-0 pb-0">
          {!chain ? (
            <div className="px-5 py-10 text-[13px] text-ink-3">
              Chain not loaded. Tastytrade returns no data for the active
              expiration outside market hours, or auth is still warming up.
              This populates as soon as the broker responds.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr className="border-y border-rule text-ink-3 eyebrow">
                    <th className="text-right px-3 py-2.5">Call OI</th>
                    <th className="text-right px-3 py-2.5">Call Vol</th>
                    <th className="text-right px-3 py-2.5">Δ</th>
                    <th className="text-right px-3 py-2.5">IV</th>
                    <th className="text-center px-5 py-2.5 bg-paper-2/50">Strike</th>
                    <th className="text-right px-3 py-2.5">IV</th>
                    <th className="text-right px-3 py-2.5">Δ</th>
                    <th className="text-right px-3 py-2.5">Put Vol</th>
                    <th className="text-right px-3 py-2.5">Put OI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {chainRows(chain).map((r) => (
                    <tr key={r.strike} className={r.atm ? "bg-gold-tint/30" : ""}>
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
                        {r.strike}
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
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function chainRows(chain: Chain): RowData[] {
  // Merge calls + puts on strike. Rows where neither side has data drop.
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

function fmtInt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString();
}
function fmtNum(n: number, dp: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(dp);
}
function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
