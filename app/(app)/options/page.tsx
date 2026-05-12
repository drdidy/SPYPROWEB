import type { ReactNode } from "react";
import { Layers3, Radar, Waves } from "lucide-react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { CommandStat } from "@/components/ui/CommandStat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadOptionsIntelBundle, type UwOptionChain, type UwSymbolIntel } from "@/lib/options-intel-fetch";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { nearReferencePriceLabel } from "@/lib/market-data-quality";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYMBOLS = ["SPY", "SPX"];
const DISPLAY_STRIKE_WINGS = 5;

export default async function Page() {
  const [{ data: snap, source }, options] = await Promise.all([
    loadLiveSnapshot(),
    loadOptionsIntelBundle(SYMBOLS),
  ]);
  const spy = options.data.symbols.SPY;
  const spx = options.data.symbols.SPX;
  const spyChain = spy?.chain;
  const spxChain = spx?.chain;
  const spyCenter = activeCenter(spyChain, snap.currentPrice);

  return (
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Execution - 06"
        title="Options Intelligence"
        lede="Flow, dark pools, dealer gamma, forward option chains, and Greeks for SPY and SPX."
        source={source}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <CommandStat
          label="Flow session"
          value={options.data.sessionDate ?? "Waiting"}
          note={options.data.isHistoricalSession ? "Most recent completed session" : "Current flow session"}
          tone="gold"
        />
        <CommandStat
          label="Chain expiry"
          value={spyChain?.expiration ?? spxChain?.expiration ?? options.data.chainDate ?? "Waiting"}
          note="Next tradable chain"
          tone="gold"
        />
        <CommandStat
          label="SPY flow"
          value={spy?.flow?.lean ?? "Waiting"}
          note={spy?.flow ? `${fmtCompact(spy.flow.premiumNet)} net premium` : "Flow feed not populated"}
          tone={leanTone(spy?.flow?.lean)}
        />
        <CommandStat
          label="SPY dark pool"
          value={spy?.darkPool ? fmtCompact(spy.darkPool.totalPremium) : "Waiting"}
          note={spy?.darkPool ? `${fmtInt(spy.darkPool.count)} prints tracked` : "No dark-pool response yet"}
          tone="teal"
        />
        <CommandStat
          label="SPY GEX"
          value={spy?.gex?.regime ?? "Waiting"}
          note={spy?.gex ? `Flip ${nearFlipLabel(spy.gex.flipPoint, spyCenter)}` : "Gamma feed not populated"}
          tone={gexTone(spy?.gex?.regime)}
        />
      </div>

      {!options.data.available && (
        <Card tone="sunken">
          <CardBody>
            <CommandEmptyState
              eyebrow="Options provider unavailable"
              title="Options intelligence is waiting for upstream data."
              body="This page is configured for SPY and SPX flow alerts, dark-pool prints, dealer gamma, full option chains, and contract Greeks. It will render live sections as soon as the provider responds; no synthetic rows are displayed."
              rows={[
                { label: "Symbols", value: "SPY + SPX" },
                { label: "Sections", value: "Flow, dark pool, GEX, chain, Greeks" },
                { label: "Display rule", value: "No synthetic rows" },
              ]}
            />
          </CardBody>
        </Card>
      )}

      <SectionLabel number="01">Flow and dark pools</SectionLabel>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {SYMBOLS.map((symbol) => (
          <FlowDarkPoolPanel key={symbol} intel={options.data.symbols[symbol]} />
        ))}
      </div>

      <SectionLabel number="02">Dealer gamma</SectionLabel>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GammaPanel intel={spy} chain={spyChain} spot={snap.currentPrice} />
        <GammaPanel intel={spx} chain={spxChain} />
      </div>

      <SectionLabel number="03">Option chains and Greeks</SectionLabel>
      <div className="space-y-4">
        <ChainPanel symbol="SPY" chain={spyChain} spot={snap.currentPrice} />
        <ChainPanel symbol="SPX" chain={spxChain} />
      </div>
    </div>
  );
}

function FlowDarkPoolPanel({ intel }: { intel?: UwSymbolIntel }) {
  const flow = intel?.flow;
  const dark = intel?.darkPool;
  const alerts = intel?.flowAlerts ?? [];
  return (
    <Card className="min-h-[430px]">
      <CardHeader
        eyebrow={intel?.ticker ?? "Symbol"}
        title="Tape pressure"
        meta="Flow alerts and dark-pool prints"
        action={<IconBadge icon={<Waves className="h-4 w-4" />} />}
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <MiniMetric label="Flow lean" value={flow?.lean ?? "Waiting"} tone={leanTone(flow?.lean)} />
          <MiniMetric label="Net premium" value={flow ? fmtCompact(flow.premiumNet) : "-"} />
          <MiniMetric label="Bullish prints" value={flow ? fmtInt(flow.bullishCount) : "-"} tone="bull" />
          <MiniMetric label="Bearish prints" value={flow ? fmtInt(flow.bearishCount) : "-"} tone="bear" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <SideStat label="Dark premium" value={dark ? fmtCompact(dark.totalPremium) : "-"} />
          <SideStat label="Dark volume" value={dark ? fmtCompactNumber(dark.totalVolume) : "-"} />
          <SideStat label="Avg price" value={dark ? fmtPrice(dark.avgPrice) : "-"} />
        </div>

        <DataStrip
          title="Largest flow"
          rows={(flow?.topPrints ?? []).map((r) => ({
            left: r.side ?? "Contract",
            mid: fmtPrice(r.strike),
            right: fmtCompact(r.premium),
          }))}
          empty="No flow prints returned."
        />

        <div className="overflow-x-auto rounded-[10px] border border-rule bg-paper-2/70">
          <table className="w-full min-w-[560px] text-[12px] tabular-nums">
            <thead>
              <tr className="border-b border-rule text-ink-3 eyebrow">
                <th className="text-left px-3 py-2.5">Alert</th>
                <th className="text-right px-3 py-2.5">Strike</th>
                <th className="text-right px-3 py-2.5">Premium</th>
                <th className="text-right px-3 py-2.5">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {alerts.slice(0, 6).map((alert, idx) => (
                <tr key={`${alert.optionSymbol ?? alert.ts ?? "alert"}-${idx}`}>
                  <td className="px-3 py-2">
                    <div className="font-mono text-[11px] text-ink">{alert.side}</div>
                    <div className="mt-0.5 text-[11px] text-ink-3">{alert.sentiment ?? alert.expiration ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-2">{fmtPrice(alert.strike)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-2">{fmtCompact(alert.premium)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-2">{fmtCompactNumber(alert.volume)}</td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr>
                  <td className="px-3 py-5 text-center text-ink-3" colSpan={4}>
                    Flow alerts have not populated for this symbol.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function GammaPanel({
  intel,
  chain,
  spot,
}: {
  intel?: UwSymbolIntel;
  chain?: UwOptionChain | null;
  spot?: number;
}) {
  const gex = intel?.gex;
  const center = activeCenter(chain, spot);
  const greeks = filterGreekRows(intel?.greeks ?? [], center);
  const exposureRows = filterExposureRows(gex?.strikeLevels ?? [], center);
  const rows =
    greeks.length > 0
      ? greeks.map((r) => ({
          left: `${r.side} ${fmtPrice(r.strike)}`,
          mid: `Delta ${fmtGreek(r.delta)}`,
          right: `Gamma ${fmtGreek(r.gamma)}`,
        }))
      : exposureRows.map((r) => ({
          left: `Strike ${fmtPrice(r.strike)}`,
          mid: `Call ${fmtCompactNumber(r.callGEX)}`,
          right: `Net ${fmtCompactNumber(r.netGEX)}`,
        }));
  return (
    <Card className="min-h-[340px]">
      <CardHeader
        eyebrow={intel?.ticker ?? "Symbol"}
        title="Dealer gamma map"
        meta="Exposure regime and contract Greeks"
        action={<IconBadge icon={<Radar className="h-4 w-4" />} />}
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniMetric label="Regime" value={gex?.regime ?? "Waiting"} tone={gexTone(gex?.regime)} />
          <MiniMetric label="Total GEX" value={gex ? fmtCompactNumber(gex.totalGEX) : "-"} />
          <MiniMetric label="Flip point" value={nearFlipLabel(gex?.flipPoint, center)} tone="gold" />
        </div>
        <div className="h-3 rounded-pill bg-paper-2 border border-rule overflow-hidden">
          <div
            className={cn(
              "h-full rounded-pill transition-all",
              gex?.regime === "NEGATIVE" ? "bg-bear" : gex?.regime === "POSITIVE" ? "bg-bull" : "bg-gold",
            )}
            style={{ width: gex ? `${Math.min(92, Math.max(18, Math.abs(gex.totalGEX) % 100))}%` : "18%" }}
          />
        </div>
        <DataStrip
          title={greeks.length > 0 ? "Contract Greeks" : "Strike exposure"}
          rows={rows}
          empty="No GEX or contract-level Greeks returned."
        />
      </CardBody>
    </Card>
  );
}

function ChainPanel({ symbol, chain, spot }: { symbol: string; chain?: UwOptionChain | null; spot?: number }) {
  const rows = chain ? chainRows(chain, spot) : [];
  return (
    <Card>
      <CardHeader
        eyebrow={symbol}
        title={chain ? `Expiration ${chain.expiration ?? "active"}` : "Chain waiting"}
        meta={chain ? `ATM ±${DISPLAY_STRIKE_WINGS} strikes shown - PCR ${fmtRatio(chain.totals.pcr)}` : undefined}
        action={<IconBadge icon={<Layers3 className="h-4 w-4" />} />}
      />
      <CardBody className="px-0 pb-0">
        {!chain ? (
          <div className="p-5">
            <CommandEmptyState
              eyebrow={`${symbol} chain`}
              title="No option chain is loaded."
              body="The chain table will show real strikes, volume, open interest, IV, and Greeks as soon as the upstream chain response is available."
              rows={[
                { label: "Symbol", value: symbol },
                { label: "Rows", value: "No synthetic contracts" },
                { label: "Greeks", value: "Delta, gamma, theta, vega, IV" },
              ]}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-[12px] tabular-nums">
                <thead>
                  <tr className="border-y border-rule text-ink-3 eyebrow">
                    <th className="text-right px-3 py-2.5">Call Vol</th>
                    <th className="text-right px-3 py-2.5">Call OI</th>
                    <th className="text-right px-3 py-2.5">Call IV</th>
                    <th className="text-right px-3 py-2.5">Call Delta</th>
                    <th className="text-right px-3 py-2.5">Call Gamma</th>
                    <th className="text-center px-5 py-2.5 bg-paper-2/70">Strike</th>
                    <th className="text-right px-3 py-2.5">Put Gamma</th>
                    <th className="text-right px-3 py-2.5">Put Delta</th>
                    <th className="text-right px-3 py-2.5">Put IV</th>
                    <th className="text-right px-3 py-2.5">Put OI</th>
                    <th className="text-right px-3 py-2.5">Put Vol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {rows.map((r) => (
                    <tr key={r.strike} className={r.atm ? "bg-gold-tint/45" : ""}>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtInt(r.callVol)}</td>
                      <td className="text-right px-3 py-2 font-mono text-bull-ink">{fmtInt(r.callOi)}</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtPct(r.callIV)}</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtGreek(r.callDelta)}</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtGreek(r.callGamma)}</td>
                      <td className="text-center px-5 py-2 font-mono font-semibold text-ink">{fmtPrice(r.strike)}</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtGreek(r.putGamma)}</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtGreek(r.putDelta)}</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtPct(r.putIV)}</td>
                      <td className="text-right px-3 py-2 font-mono text-bear-ink">{fmtInt(r.putOi)}</td>
                      <td className="text-right px-3 py-2 font-mono text-ink-2">{fmtInt(r.putVol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t 2xl:border-t-0 2xl:border-l border-rule bg-[#071116] text-paper p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft">
                Chain pressure
              </div>
              <div className="mt-4 space-y-4">
                <WallMeter label="Call open interest" value={chain.totals.callOi} total={chain.totals.callOi + chain.totals.putOi} tone="bull" />
                <WallMeter label="Put open interest" value={chain.totals.putOi} total={chain.totals.callOi + chain.totals.putOi} tone="bear" />
                <WallMeter label="Call volume" value={chain.totals.callVol} total={chain.totals.callVol + chain.totals.putVol} tone="bull" />
                <WallMeter label="Put volume" value={chain.totals.putVol} total={chain.totals.callVol + chain.totals.putVol} tone="bear" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <SideStat label="PCR" value={fmtRatio(chain.totals.pcr)} />
                <SideStat label="Shown" value={`${rows.length}`} />
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function IconBadge({ icon }: { icon: ReactNode }) {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-rule bg-paper-2 text-gold-ink">
      {icon}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  tone?: "ink" | "bull" | "bear" | "gold" | "teal";
}) {
  const toneCls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : tone === "gold"
          ? "text-gold-ink"
          : tone === "teal"
            ? "text-teal"
            : "text-ink";
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/75 px-3 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">{label}</div>
      <div className={cn("mt-1 font-mono text-[18px] font-semibold tabular-nums", toneCls)}>{value}</div>
    </div>
  );
}

function SideStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/75 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">{label}</div>
      <div className="mt-1 font-mono text-[14px] text-ink tabular-nums">{value}</div>
    </div>
  );
}

function DataStrip({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ left: string; mid: string; right: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/70 p-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">{title}</div>
      <div className="mt-2 space-y-1.5">
        {rows.length > 0 ? (
          rows.map((r, idx) => (
            <div key={`${r.left}-${idx}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-[12px]">
              <span className="font-mono text-ink">{r.left}</span>
              <span className="font-mono text-ink-3">{r.mid}</span>
              <span className="font-mono text-gold-ink">{r.right}</span>
            </div>
          ))
        ) : (
          <div className="py-3 text-[12px] text-ink-3">{empty}</div>
        )}
      </div>
    </div>
  );
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
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/52">{label}</span>
        <span className="font-mono text-[11px] text-paper/82">{fmtInt(value)}</span>
      </div>
      <div className="mt-2 h-2 rounded-pill bg-paper/10 overflow-hidden">
        <div className={`${fill} h-full rounded-pill`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface RowData {
  strike: number;
  callOi: number;
  callVol: number;
  callDelta: number | null;
  callGamma: number | null;
  callIV: number | null;
  putOi: number;
  putVol: number;
  putDelta: number | null;
  putGamma: number | null;
  putIV: number | null;
  atm: boolean;
}

function chainRows(chain: UwOptionChain, spot?: number): RowData[] {
  const byStrike = new Map<number, RowData>();
  for (const c of chain.calls) {
    if (c.strike === null) continue;
    if (!byStrike.has(c.strike)) byStrike.set(c.strike, blankRow(c.strike));
    const r = byStrike.get(c.strike)!;
    r.callOi = c.oi;
    r.callVol = c.volume;
    r.callDelta = c.delta;
    r.callGamma = c.gamma;
    r.callIV = c.iv;
  }
  for (const p of chain.puts) {
    if (p.strike === null) continue;
    if (!byStrike.has(p.strike)) byStrike.set(p.strike, blankRow(p.strike));
    const r = byStrike.get(p.strike)!;
    r.putOi = p.oi;
    r.putVol = p.volume;
    r.putDelta = p.delta;
    r.putGamma = p.gamma;
    r.putIV = p.iv;
  }
  const rows = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  const atm = nearestStrike(rows, spot);
  for (const r of rows) r.atm = atm !== null && r.strike === atm;
  const center = atm ?? rows[Math.floor(rows.length / 2)]?.strike ?? null;
  if (center === null) return rows;
  const centerIdx = rows.findIndex((x) => x.strike === center);
  return rows.filter((_, idx) => Math.abs(idx - centerIdx) <= DISPLAY_STRIKE_WINGS);
}

function blankRow(strike: number): RowData {
  return {
    strike,
    callOi: 0,
    callVol: 0,
    callDelta: null,
    callGamma: null,
    callIV: null,
    putOi: 0,
    putVol: 0,
    putDelta: null,
    putGamma: null,
    putIV: null,
    atm: false,
  };
}

function nearestStrike(rows: RowData[], spot?: number): number | null {
  if (!Number.isFinite(spot) || !spot || rows.length === 0) return null;
  return rows.reduce((best, row) => (Math.abs(row.strike - spot) < Math.abs(best - spot) ? row.strike : best), rows[0].strike);
}

function activeCenter(chain?: UwOptionChain | null, spot?: number): number | null {
  if (Number.isFinite(spot) && spot) return spot;
  if (Number.isFinite(chain?.atm ?? NaN) && chain?.atm) return chain.atm;
  const rows = chain ? chainRows(chain, spot) : [];
  if (rows.length === 0) return null;
  const atm = rows.find((r) => r.atm);
  if (atm) return atm.strike;
  return rows[Math.floor(rows.length / 2)]?.strike ?? null;
}

function filterGreekRows(rows: UwSymbolIntel["greeks"], center: number | null) {
  const useful = rows.filter(
    (r) =>
      r.strike !== null &&
      r.side !== "UNKNOWN" &&
      (r.delta !== null || r.gamma !== null || r.iv !== null),
  );
  if (center === null) return useful.slice(0, DISPLAY_STRIKE_WINGS * 2 + 1);
  const selected = strikeWindow(
    Array.from(new Set(useful.map((r) => r.strike).filter((s): s is number => s !== null))),
    center,
  );
  const selectedSet = new Set(selected);
  const near = useful
    .filter((r) => r.strike !== null && selectedSet.has(r.strike))
    .sort((a, b) => {
      const strikeDiff = (a.strike ?? 0) - (b.strike ?? 0);
      if (strikeDiff !== 0) return strikeDiff;
      return String(a.side).localeCompare(String(b.side));
    });
  return near.length > 0 ? near : useful.slice(0, DISPLAY_STRIKE_WINGS * 2 + 1);
}

function filterExposureRows(rows: NonNullable<UwSymbolIntel["gex"]>["strikeLevels"] = [], center: number | null) {
  const useful = rows.filter((r) => Number.isFinite(r.strike) && Number.isFinite(r.netGEX));
  if (center === null) return useful.slice(0, DISPLAY_STRIKE_WINGS * 2 + 1);
  const selectedSet = new Set(strikeWindow(useful.map((r) => r.strike), center));
  const near = useful
    .filter((r) => selectedSet.has(r.strike))
    .sort((a, b) => a.strike - b.strike);
  return near.length > 0 ? near : useful.slice(0, DISPLAY_STRIKE_WINGS * 2 + 1);
}

function strikeWindow(strikes: number[], center: number): number[] {
  const sorted = Array.from(new Set(strikes.filter((s) => Number.isFinite(s)))).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const centerStrike = sorted.reduce(
    (best, strike) => (Math.abs(strike - center) < Math.abs(best - center) ? strike : best),
    sorted[0],
  );
  const centerIdx = sorted.indexOf(centerStrike);
  return sorted.filter((_, idx) => Math.abs(idx - centerIdx) <= DISPLAY_STRIKE_WINGS);
}

function nearFlipLabel(flip: number | null | undefined, center: number | null): string {
  return nearReferencePriceLabel(flip, center, { farLabel: "No near flip" });
}

function leanTone(lean?: string | null): "ink" | "bull" | "bear" | "gold" {
  if (lean === "BULLISH") return "bull";
  if (lean === "BEARISH") return "bear";
  if (lean === "BALANCED") return "gold";
  return "ink";
}

function gexTone(regime?: string | null): "ink" | "bull" | "bear" | "gold" {
  if (regime === "POSITIVE") return "bull";
  if (regime === "NEGATIVE") return "bear";
  if (regime === "FLAT") return "gold";
  return "ink";
}

function fmtInt(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === 0 || n === null || n === undefined) return "-";
  return Math.round(n).toLocaleString();
}

function fmtCompact(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "-";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtCompactNumber(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "-";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtPrice(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "-";
  return n.toFixed(Number.isInteger(n) ? 0 : 2);
}

function fmtPct(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtGreek(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "-";
  return n.toFixed(3);
}

function fmtRatio(n: number | null | undefined): string {
  if (!Number.isFinite(n ?? NaN) || n === null || n === undefined) return "-";
  return n.toFixed(2);
}
