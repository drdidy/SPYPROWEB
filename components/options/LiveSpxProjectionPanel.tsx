"use client";

import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContractProjectionCard } from "@/components/options/ContractProjection";
import { OptionMomentumGate } from "@/components/options/OptionMomentumGate";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { ContractProjection } from "@/lib/contract-projection";
import type {
  LiveReplayLearningSummary,
  LiveSpxProjectionSnapshot,
} from "@/lib/options/spx-live-projection";
import type { UwOptionChain, UwOptionContract } from "@/lib/options-intel-fetch";
import { cn } from "@/lib/utils";

type ChainDisplayRow = UwOptionContract & { strike: number };

export function LiveSpxProjectionPanel({
  initialSnapshot,
}: {
  initialSnapshot: LiveSpxProjectionSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState<string | null>(null);
  const activeLabelRef = useRef(snapshot.activeProjection?.contractLabel ?? null);
  const activeEntryRef = useRef(snapshot.activeProjection?.projectedEntry.mark ?? null);

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/options/spx-projection?maxDebit=${snapshot.debitLimit}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Projection returned HTTP ${res.status}.`);
      const next = (await res.json()) as LiveSpxProjectionSnapshot;
      const nextLabel = next.activeProjection?.contractLabel ?? null;
      const nextEntry = next.activeProjection?.projectedEntry.mark ?? null;
      if (activeLabelRef.current && nextLabel && activeLabelRef.current !== nextLabel) {
        setChangeNote(`Contract switched from ${activeLabelRef.current} to ${nextLabel}.`);
      } else if (
        activeEntryRef.current !== null &&
        nextEntry !== null &&
        Math.abs(nextEntry - activeEntryRef.current) >= 0.25
      ) {
        setChangeNote(
          `Projected entry moved from ${money(activeEntryRef.current)} to ${money(nextEntry)}.`,
        );
      }
      activeLabelRef.current = nextLabel;
      activeEntryRef.current = nextEntry;
      setSnapshot(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projection refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }, [snapshot.debitLimit]);

  useEffect(() => {
    const id = window.setInterval(refresh, 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const liveTone = snapshot.activeProjection ? "bull" : snapshot.chain ? "gold" : "ink";
  const activeProjection = snapshot.activeProjection;

  return (
    <div className="space-y-8">
      <LiveProjectionStatus
        snapshot={snapshot}
        refreshing={refreshing}
        error={error}
        changeNote={changeNote}
        onRefresh={refresh}
      />
      <SelfLearningStatus learning={snapshot.learning} debitLimit={snapshot.debitLimit} />

      <SectionLabel number="01">SPX execution ticket</SectionLabel>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <Card>
          <CardHeader
            eyebrow="ES to SPX"
            title={
              snapshot.controlPlan
                ? "Control tickets live"
                : "Control tickets waiting"
            }
            meta={
              snapshot.controlPlan
                ? `${snapshot.controlPlan.label} | Half-Gate ${snapshot.controlPlan.targetDistance.toFixed(2)} pts`
                : snapshot.chainExpiration
                  ? `${snapshot.chainExpiration} expiry | Waiting for setup`
                  : "Waiting for Control Plan"
            }
            action={<Gauge size={17} className={liveTone === "bull" ? "text-bull-ink" : "text-gold-ink"} />}
          />
          <CardBody className="space-y-4">
            {snapshot.controlPlan ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <ZoneProjectionSlot
                  title="Buy support"
                  subtitle="Control Line hold, Half-Gate target"
                  projection={snapshot.controlPlan.buySupport}
                  active={activeProjection?.contractLabel === snapshot.controlPlan.buySupport?.contractLabel}
                  debitLimit={snapshot.debitLimit}
                  replayLearning={snapshot.learning}
                />
                <ZoneProjectionSlot
                  title="Sell resistance"
                  subtitle="Control Line rejection, Half-Gate target"
                  projection={snapshot.controlPlan.sellResistance}
                  active={activeProjection?.contractLabel === snapshot.controlPlan.sellResistance?.contractLabel}
                  debitLimit={snapshot.debitLimit}
                  replayLearning={snapshot.learning}
                />
              </div>
            ) : (
              <div className="rounded-[14px] border border-rule bg-paper-2/65 p-5">
                <div className="font-serif text-[26px] leading-none text-ink">
                  Waiting for Control Plan
                </div>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-3">
                  Once the Control Plan qualifies a buy-support or sell-resistance read, the SPX ticket appears here.
                </p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-4">
              <MiniStat label="Fair SPX" value={snapshot.fairSpx !== null ? formatPrice(snapshot.fairSpx) : "--"} />
              <MiniStat label="Chain ATM" value={snapshot.chainAtm !== null ? formatPrice(snapshot.chainAtm) : "--"} />
              <MiniStat label="Volume" value={snapshot.chainVolume !== null ? formatInt(snapshot.chainVolume) : "--"} />
              <MiniStat label="Updated" value={formatTime(snapshot.asOf)} />
            </div>
          </CardBody>
        </Card>

        <Card className="bg-ink text-paper">
          <CardHeader
            eyebrow="Protocol"
            title={<span className="text-paper">Entry checklist</span>}
            meta={<span className="text-paper/58">SPX only</span>}
            action={<CheckCircle2 size={17} className="text-gold-soft" />}
          />
          <CardBody className="space-y-3">
            <ProtocolStep
              n="01"
              title="Control Map first"
              body="Use the ES Control Line to define the next valid support or resistance attempt."
            />
            <ProtocolStep
              n="02"
              title="Half-Gate target"
              body="The first projection prices the move from entry to Half-Gate before considering anything larger."
            />
            <ProtocolStep
              n="03"
              title="Momentum confirms"
              body="Premium strength must confirm on the selected contract before the ticket becomes actionable."
            />
            <Link
              href="/es"
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-[7px] bg-paper px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:bg-gold-soft"
            >
              Open ES Control Map
              <ArrowRight size={14} />
            </Link>
          </CardBody>
        </Card>
      </div>

      <SectionLabel number="02">Momentum confirmation</SectionLabel>
      {snapshot.activeProjection ? (
        <OptionMomentumGate projection={snapshot.activeProjection} engine="SPX" />
      ) : (
        <MomentumWaitingCard />
      )}

      <SectionLabel number="03">SPX chain context</SectionLabel>
      <ChainCard title="SPX tradable chain" chain={snapshot.chain} status={snapshot.chainStatus} />
    </div>
  );
}

function LiveProjectionStatus({
  snapshot,
  refreshing,
  error,
  changeNote,
  onRefresh,
}: {
  snapshot: LiveSpxProjectionSnapshot;
  refreshing: boolean;
  error: string | null;
  changeNote: string | null;
  onRefresh: () => void;
}) {
  const active = snapshot.activeProjection;
  return (
    <Card>
      <CardBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                Live projection loop
              </span>
              <span
                className={cn(
                  "rounded-[7px] border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em]",
                  error
                    ? "border-bear/35 bg-bear-soft/10 text-bear-ink"
                    : refreshing
                      ? "border-gold/35 bg-gold-tint text-gold-ink"
                      : "border-bull/35 bg-bull-soft/10 text-bull-ink",
                )}
              >
                {error ? "Review" : refreshing ? "Refreshing" : "Live every 30s"}
              </span>
              <span className="rounded-[7px] border border-rule bg-paper-2 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-ink-3">
                {snapshot.chainStatus}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-2">
              {active
                ? `${active.contractLabel} is the current ticket. Projected entry is ${money(active.projectedEntry.mark)} and projected target is ${active.projectedTarget ? money(active.projectedTarget.mark) : "--"}.`
                : "Waiting for a valid Control Plan ticket before the live loop can select a contract."}
            </p>
            {changeNote && (
              <p className="mt-2 rounded-[10px] border border-gold/30 bg-gold-tint px-3 py-2 text-[12px] leading-relaxed text-gold-ink">
                {changeNote}
              </p>
            )}
            {error && (
              <p className="mt-2 rounded-[10px] border border-bear/30 bg-bear-soft/10 px-3 py-2 text-[12px] leading-relaxed text-bear-ink">
                {error}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[9px] border border-rule bg-paper px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 transition hover:border-gold/45 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh now
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

function ZoneProjectionSlot({
  title,
  subtitle,
  projection,
  active,
  debitLimit,
  replayLearning,
}: {
  title: string;
  subtitle: string;
  projection: ContractProjection | null;
  active: boolean;
  debitLimit: number;
  replayLearning: LiveReplayLearningSummary | null;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border bg-paper/70 p-3 shadow-rule",
        active ? "border-gold/55 ring-1 ring-gold/35" : "border-rule",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">{title}</div>
          <div className="mt-1 text-[12px] text-ink-4">{subtitle}</div>
        </div>
        <span
          className={cn(
            "rounded-[7px] border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em]",
            active
              ? "border-gold/35 bg-gold-tint text-gold-ink"
              : projection
                ? "border-bull/35 bg-bull-soft/10 text-bull-ink"
                : "border-rule bg-paper-2 text-ink-4",
          )}
        >
          {active ? "Active" : projection ? `Inside ${money(debitLimit)}` : "Waiting"}
        </span>
      </div>
      <ContractProjectionCard projection={projection} replayLearning={replayLearning} compact />
    </div>
  );
}

function SelfLearningStatus({
  learning,
  debitLimit,
}: {
  learning: LiveReplayLearningSummary | null;
  debitLimit: number;
}) {
  const confidence = learning?.confidence ?? "learning";
  const tone =
    confidence === "high"
      ? "text-bull-ink border-bull/25 bg-bull-soft/10"
      : confidence === "medium"
        ? "text-gold-ink border-gold/30 bg-gold-tint"
        : "text-ink-3 border-rule bg-paper-2";
  return (
    <Card>
      <CardBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                Learning profile
              </span>
              <span className={cn("rounded-[7px] border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em]", tone)}>
                {confidence}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-2">
              {learningRead(learning)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[430px]">
            <MiniStat
              label="Evidence"
              value={learning ? `${learning.qualified}/${learning.reviewed}` : "--"}
            />
            <MiniStat
              label="Entry fit"
              value={learning?.averageEntryErrorPct == null ? "Learning" : signedPct(learning.averageEntryErrorPct)}
            />
            <MiniStat
              label="Budget"
              value={money(debitLimit)}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ProtocolStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-paper/10 bg-paper/[0.045] p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-gold/30 bg-gold/10 font-mono text-[10px] text-gold-soft">
          {n}
        </span>
        <div className="font-serif text-[18px] leading-none text-paper">{title}</div>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-paper/66">{body}</p>
    </div>
  );
}

function MomentumWaitingCard() {
  return (
    <Card>
      <CardHeader
        eyebrow="SPX momentum confirmation"
        title="Waiting for contract ticket"
        meta="5m 200 SMA + 1m EMA 8/21"
        action={<Gauge size={17} className="text-gold-ink" />}
      />
      <CardBody className="space-y-4">
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink-3">
          The momentum gate activates after the SPX contract ticket is selected
          from the ES Control Map.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <MomentumStatus
            label="5m baseline"
            value="Waiting"
            note="Reports Above, Below, or Testing once enough premium history is available."
          />
          <MomentumStatus
            label="Fast trigger"
            value="Waiting"
            note="Confirms when fast premium momentum turns up on the selected contract."
          />
          <MomentumStatus
            label="Entry confirmation"
            value="Waiting"
            note="Turns Confirmed only when structure, contract, and momentum agree."
          />
        </div>
      </CardBody>
    </Card>
  );
}

function MomentumStatus({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[12px] border border-rule bg-paper-2/55 p-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-3">
        {label}
      </div>
      <div className="mt-2 font-serif text-[24px] leading-none text-ink">{value}</div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-4">{note}</p>
    </div>
  );
}

function ChainCard({
  title,
  chain,
  status,
}: {
  title: string;
  chain: UwOptionChain | null;
  status: string;
}) {
  const rows = useMemo(() => (chain ? selectChainRows(chain) : []), [chain]);
  return (
    <Card>
      <CardHeader
        eyebrow="Tradable chain"
        title={title}
        meta={chain ? `${chain.expiration ?? "nearest"} expiry - ${status}` : "Waiting for contracts"}
        action={<Calculator size={17} className="text-gold-ink" />}
      />
      <CardBody>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-3">
                  <th className="border-b border-rule py-2 pr-2">Side</th>
                  <th className="border-b border-rule py-2 pr-2">Strike</th>
                  <th className="border-b border-rule py-2 pr-2">Bid</th>
                  <th className="border-b border-rule py-2 pr-2">Ask</th>
                  <th className="border-b border-rule py-2 pr-2">Mark</th>
                  <th className="border-b border-rule py-2 pr-2">Delta</th>
                  <th className="border-b border-rule py-2 pr-2">Gamma</th>
                  <th className="border-b border-rule py-2 pr-2">IV</th>
                  <th className="border-b border-rule py-2 pr-2">OI</th>
                  <th className="border-b border-rule py-2">Vol</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.side}-${row.strike}`} className="font-mono text-[10px] text-ink">
                    <td className={`border-b border-rule py-2 pr-2 font-semibold ${row.side === "CALL" ? "text-bull-ink" : "text-bear-ink"}`}>
                      {row.side}
                    </td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatPrice(row.strike)}</td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatNullable(row.bid)}</td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatNullable(row.ask)}</td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatNullable(row.mark)}</td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatGreek(row.delta)}</td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatGreek(row.gamma)}</td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatIv(row.iv)}</td>
                    <td className="border-b border-rule py-2 pr-2 tabular-nums">{formatInt(row.oi)}</td>
                    <td className="border-b border-rule py-2 tabular-nums">{formatInt(row.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[12px] border border-rule bg-paper-2/55 p-5">
            <p className="font-serif text-[24px] leading-tight text-ink">Chain waiting</p>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-3">
              SPX contracts will appear when the tradable chain is available.
              The page does not fill this table with estimated rows.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/55 px-3 py-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function selectChainRows(chain: UwOptionChain): ChainDisplayRow[] {
  const atm = chain.atm ?? inferAtm([...(chain.calls ?? []), ...(chain.puts ?? [])]);
  const rows = [...(chain.calls ?? []), ...(chain.puts ?? [])].filter(
    (row): row is ChainDisplayRow => typeof row.strike === "number",
  );
  return rows
    .sort((a, b) => {
      const dist = Math.abs(a.strike - atm) - Math.abs(b.strike - atm);
      if (dist !== 0) return dist;
      if (a.side !== b.side) return a.side === "CALL" ? -1 : 1;
      return a.strike - b.strike;
    })
    .slice(0, 16);
}

function inferAtm(rows: UwOptionContract[]): number {
  const strikes = rows
    .map((row) => row.strike)
    .filter((strike): strike is number => typeof strike === "number" && Number.isFinite(strike))
    .sort((a, b) => a - b);
  return strikes[Math.floor(strikes.length / 2)] ?? 0;
}

function learningRead(learning: LiveReplayLearningSummary | null): string {
  if (!learning) {
    return "The analyzer is building a replay-backed price profile for the selected debit limit.";
  }
  if (learning.confidence === "high") {
    return "Recent replay and live premium behavior are aligned enough to guide the debit range and target estimate.";
  }
  if (learning.confidence === "medium") {
    return "The price guide is improving. Treat it as useful context and require momentum confirmation before action.";
  }
  return "The analyzer is still collecting completed examples before it tightens the price guide.";
}

function formatPrice(value: number): string {
  return value.toFixed(value >= 1000 ? 0 : 2);
}

function money(value: number): string {
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function formatNullable(value: number | null | undefined): string {
  return isDisplayNumber(value) ? value.toFixed(2) : "--";
}

function formatGreek(value: number | null | undefined): string {
  return isDisplayNumber(value) ? value.toFixed(3) : "--";
}

function formatIv(value: number | null | undefined): string {
  return isDisplayNumber(value) ? `${value.toFixed(1)}%` : "--";
}

function formatInt(value: number | null | undefined): string {
  return isDisplayNumber(value) ? Math.round(value).toLocaleString("en-US") : "--";
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "--";
  }
}

function signedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function isDisplayNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
