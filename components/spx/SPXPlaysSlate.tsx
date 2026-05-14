"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ContractProjectionCard } from "@/components/options/ContractProjection";
import {
  buildSpxContractProjection,
  type SpxProjectionChainInput,
} from "@/lib/spx-contract-projection";
import type {
  SPXContractSuggestion,
  SPXLineKind,
  SPXSnapshot,
  SPXTrade,
} from "@/lib/types";
import { ArrowDown, ArrowUp } from "lucide-react";

const lineLabel: Record<SPXLineKind, string> = {
  PREV_RTH_HIGH_ASC: "High Fan Ceiling",
  PREV_RTH_HIGH_DESC: "High Fan Floor",
  PREV_RTH_LOW_ASC: "Low Fan Ceiling",
  PREV_RTH_LOW_DESC: "Low Fan Floor",
  SWING_HIGH_ASC: "Swing High - Asc",
  SWING_HIGH_DESC: "Swing High - Desc",
  SWING_LOW_ASC: "Swing Low - Asc",
  SWING_LOW_DESC: "Swing Low - Desc",
};
export function SPXPlaysSlate({
  snap,
  optionsChain,
}: {
  snap: SPXSnapshot;
  optionsChain?: SpxProjectionChainInput | null;
}) {
  const standDown = snap.scenario === "OUTSIDE_PLAY" || !snap.plays.primary;

  return (
    <Card>
      <CardHeader
        eyebrow="Plays"
        title={standDown ? "Stand down today" : "Primary & alternate"}
        meta={
          standDown
            ? "Price is outside the planned play envelope. No trade."
            : "Each play names its entry and its exit at construction."
        }
      />
      {standDown ? (
        <CardBody>
          <div className="px-2 py-8 text-center">
            <div className="font-serif text-display text-ink-3 italic font-light">
              No play
            </div>
            <p className="mt-3 text-[13px] text-ink-3 max-w-sm mx-auto leading-relaxed">
              The Pivot Fan does not have a clean read here. The discipline is
              to wait for price to return to a qualified fan reference.
            </p>
          </div>
        </CardBody>
      ) : (
        <CardBody className="px-0 pb-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-rule">
            <PlayPanel
              kind="primary"
              snap={snap}
              trade={snap.plays.primary!}
              contract={snap.contracts.forPrimary}
              optionsChain={optionsChain}
            />
            <PlayPanel
              kind="alternate"
              snap={snap}
              trade={snap.plays.alternate!}
              contract={snap.contracts.forAlternate}
              optionsChain={optionsChain}
            />
          </div>
        </CardBody>
      )}
    </Card>
  );
}

function PlayPanel({
  kind,
  snap,
  trade,
  contract,
  optionsChain,
}: {
  kind: "primary" | "alternate";
  snap: SPXSnapshot;
  trade: SPXTrade;
  contract: SPXContractSuggestion | null;
  optionsChain?: SpxProjectionChainInput | null;
}) {
  const isBuy = trade.side === "BUY";
  const Icon = isBuy ? ArrowUp : ArrowDown;
  const sideTone = isBuy ? "text-bull-ink" : "text-bear-ink";
  const sideBg = isBuy ? "bg-bull-tint" : "bg-bear-tint";
  const move = trade.exitPrice - trade.entryPrice;
  const moveAbs = Math.abs(move);
  const projection = buildSpxContractProjection({
    snap,
    chain: optionsChain,
    trade,
    contract,
  });

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="eyebrow text-ink-3">
            {kind === "primary" ? "Primary" : "Alternate"}
          </span>
          <span className="font-mono text-[10px] text-ink-4">
            {kind === "primary" ? "first read" : "second read"}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-semibold uppercase tracking-[0.12em] ${sideBg} ${sideTone}`}
        >
          <Icon size={10} strokeWidth={2.5} />
          {trade.side}
        </span>
      </div>

      {/* Entry → Exit visual */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-3">
          <Cell
            label="Entry"
            line={lineLabel[trade.entryLine]}
            price={trade.entryPrice}
          />
          <Cell
            label="Exit"
            line={lineLabel[trade.exitLine]}
            price={trade.exitPrice}
            tone={isBuy ? "bull" : "bear"}
          />
        </div>
        {/* connector line */}
        <div className="absolute left-[calc(50%-0.5px)] top-1/2 w-px h-8 -translate-y-1/2 bg-rule pointer-events-none" />
      </div>

      <div className="mt-5 hr-rule" />
      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className="text-ink-3">Expected move</span>
        <span
          className={`font-mono font-semibold tabular-nums ${move >= 0 ? "text-bull-ink" : "text-bear-ink"}`}
          data-num
        >
          {move >= 0 ? "+" : "−"}
          {moveAbs.toFixed(2)} pts
        </span>
      </div>

      {/* contract */}
      {contract && (
        <div className="mt-4 px-3 py-3 rounded-soft bg-paper-2/60 shadow-rule">
          <div className="flex items-center justify-between mb-1.5">
            <span className="eyebrow text-ink-3">Suggested contract</span>
            <span className="font-mono text-[10px] text-ink-3">
              {contract.dteLabel} · {contract.expiration}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span
              className={`font-serif text-title ${contract.type === "CALL" ? "text-bull-ink" : "text-bear-ink"}`}
            >
              {contract.type} {contract.strike}
            </span>
            <span
              className="font-mono text-[12px] tabular-nums text-ink-3"
              data-num
            >
              {contract.distanceFromSpot >= 0 ? "+" : ""}
              {contract.distanceFromSpot.toFixed(2)} OTM
            </span>
          </div>
        </div>
      )}
      <ContractProjectionCard projection={projection} className="mt-3" />
    </div>
  );
}

function Cell({
  label,
  line,
  price,
  tone = "ink",
}: {
  label: string;
  line: string;
  price: number;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : "text-ink";
  return (
    <div>
      <div className="eyebrow text-ink-3 mb-1">{label}</div>
      <div className={`font-serif text-headline tabular-nums ${cls}`} data-num>
        {price.toFixed(2)}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-3 font-mono">{line}</div>
    </div>
  );
}
