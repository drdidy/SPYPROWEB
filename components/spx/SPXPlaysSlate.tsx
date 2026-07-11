"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import type {
  SPXContractSuggestion,
  SPXControlPlanMap,
  SPXControlPlanSetup,
  SPXControlTradePlan,
  SPXLineKind,
  SPXSnapshot,
  SPXTrade,
} from "@/lib/types";
import { ArrowDown, ArrowUp, Clock3, Target } from "lucide-react";

const lineLabel: Record<SPXLineKind, string> = {
  PREV_RTH_HIGH_ASC: "Upper control boundary",
  PREV_RTH_HIGH_DESC: "High-pivot control",
  PREV_RTH_LOW_ASC: "Low-pivot control",
  PREV_RTH_LOW_DESC: "Lower control boundary",
  SWING_HIGH_ASC: "Overnight Higher Pivot",
  SWING_HIGH_DESC: "Swing High - Desc",
  SWING_LOW_ASC: "Swing Low - Asc",
  SWING_LOW_DESC: "Swing Low - Desc",
};
export function SPXPlaysSlate({
  snap,
}: {
  snap: SPXSnapshot;
}) {
  if (snap.controlTradePlan) {
    return <ControlTradePlan plan={snap.controlTradePlan} />;
  }

  return (
    <Card>
      <CardHeader
        eyebrow="Trade Plan"
        title="Control Plan waiting"
        meta="Waiting for a qualified ES map"
      />
      <CardBody>
        <div className="px-2 py-8 text-center">
          <div className="font-serif text-display text-ink-3 italic font-light">
            Waiting
          </div>
          <p className="mt-3 text-[13px] text-ink-3 max-w-sm mx-auto leading-relaxed">
            The ES Control Map has not published a qualified Control Plan yet.
            The clean move is to wait for confirmation.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function ControlTradePlan({ plan }: { plan: SPXControlTradePlan }) {
  const active = plan.activeTrade;
  const buySetup = plan.setups.find((setup) => setup.side === "BUY") ?? null;
  const sellSetup = plan.setups.find((setup) => setup.side === "SELL") ?? null;
  const selectedMap =
    active?.mapId === plan.oppositeMap.id || buySetup?.mapId === plan.oppositeMap.id
      ? plan.oppositeMap
      : plan.primaryMap;

  return (
    <Card>
      <CardHeader
        eyebrow="Trade Plan"
        title={active ? `${active.side} at next hourly open` : plan.label}
        meta={`Half-Gate target ${plan.targetDistance.toFixed(2)} pts | ${formatPlanTime(plan.signalWindowStart)}-${formatPlanTime(plan.signalWindowEnd)} CT`}
        action={<Target size={17} className="text-gold-ink" />}
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-[14px] border border-rule bg-paper/70 p-4 shadow-rule">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                  Selected map
                </div>
                <div className="mt-1 font-serif text-[26px] leading-none text-ink">
                  {selectedMap.direction === "DESCENDING" ? "Descending Control" : "Ascending Control"}
                </div>
              </div>
              <span className="rounded-[8px] border border-gold/30 bg-gold-tint px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-gold-ink">
                {selectedMap.status}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-2">
              {plan.guidance}
            </p>
            {active && (
              <div className="mt-4 rounded-[12px] border border-gold/35 bg-gold-tint px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gold-ink">
                  <Clock3 size={13} />
                  Confirmed at {formatPlanTime(active.signalTime)} CT
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                  {active.note}
                </p>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <ControlMapStat map={plan.primaryMap} label="Primary" />
            <ControlMapStat map={plan.oppositeMap} label="Backup" />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ControlSetupPanel
            title="Buy support"
            setup={active?.side === "BUY" ? active : buySetup}
            active={active?.side === "BUY"}
          />
          <ControlSetupPanel
            title="Sell resistance"
            setup={active?.side === "SELL" ? active : sellSetup}
            active={active?.side === "SELL"}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function ControlMapStat({ map, label }: { map: SPXControlPlanMap; label: string }) {
  const distance = map.distanceFromOpen === null ? "--" : signed(map.distanceFromOpen);
  return (
    <div className="rounded-[12px] border border-rule bg-paper-2/60 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
          {label}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-4">
          {map.direction}
        </span>
      </div>
      <div className="mt-2 font-serif text-[24px] leading-none text-ink" data-num>
        {map.controlValue.toFixed(2)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-4">Open gap</span>
        <span className="font-mono text-ink-3" data-num>{distance}</span>
      </div>
    </div>
  );
}

function ControlSetupPanel({
  title,
  setup,
  active,
}: {
  title: string;
  setup: SPXControlPlanSetup | null;
  active: boolean;
}) {
  if (!setup) {
    return (
      <div className="rounded-[14px] border border-rule bg-paper/60 p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          {title}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          Waiting for the Control Map to publish a qualified line.
        </p>
      </div>
    );
  }
  const isBuy = setup.side === "BUY";
  const Icon = isBuy ? ArrowUp : ArrowDown;
  const sideTone = isBuy ? "text-bull-ink" : "text-bear-ink";
  const sideBg = isBuy ? "bg-bull-tint" : "bg-bear-tint";
  const move = setup.targetPrice - setup.entryPrice;
  const moveAbs = Math.abs(move);

  return (
    <div
      className={`rounded-[14px] border bg-paper/70 p-4 shadow-rule ${
        active ? "border-gold/55 ring-1 ring-gold/35" : "border-rule"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {title}
          </div>
          <div className="mt-1 text-[12px] leading-snug text-ink-4">{setup.thesis}</div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${sideBg} ${sideTone}`}
        >
          <Icon size={10} strokeWidth={2.5} />
          {setup.contractType}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cell label="Entry" line={setup.entryLineLabel} price={setup.entryPrice} />
        <Cell
          label="Half-Gate"
          line="First target"
          price={setup.targetPrice}
          tone={isBuy ? "bull" : "bear"}
        />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-[10px] border border-rule bg-paper-2/60 px-3 py-2 text-[12px]">
        <span className="text-ink-3">{active ? "Active read" : setup.status}</span>
        <span
          className={`font-mono font-semibold tabular-nums ${move >= 0 ? "text-bull-ink" : "text-bear-ink"}`}
          data-num
        >
          {move >= 0 ? "+" : "-"}
          {moveAbs.toFixed(2)} pts
        </span>
      </div>
    </div>
  );
}

function PlayPanel({
  kind,
  snap,
  trade,
  contract,
}: {
  kind: "primary" | "alternate";
  snap: SPXSnapshot;
  trade: SPXTrade;
  contract: SPXContractSuggestion | null;
}) {
  void snap;
  const isBuy = trade.side === "BUY";
  const Icon = isBuy ? ArrowUp : ArrowDown;
  const sideTone = isBuy ? "text-bull-ink" : "text-bear-ink";
  const sideBg = isBuy ? "bg-bull-tint" : "bg-bear-tint";
  const move = trade.exitPrice - trade.entryPrice;
  const moveAbs = Math.abs(move);

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
    </div>
  );
}

function controlLineLabel(label: string): string {
  return label
    .replace(/\bMain\b/g, "Control Line")
    .replace(/\+34\b/g, "North Gate I")
    .replace(/\+68\b/g, "North Gate II")
    .replace(/\+102\b/g, "North Gate III")
    .replace(/-34\b/g, "South Gate I")
    .replace(/-68\b/g, "South Gate II")
    .replace(/-102\b/g, "South Gate III");
}

function formatPlanTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pts`;
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
