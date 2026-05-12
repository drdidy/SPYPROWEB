"use client";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ContractProjectionCard } from "@/components/options/ContractProjection";
import { StatusPill } from "@/components/ui/StatusPill";
import type { ContractProjection } from "@/lib/contract-projection";
import type { OptionsIntel as Intel, SelectedStrikes } from "@/lib/types";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

const alignmentVariant = {
  ALIGNED: "confirmed",
  MIXED: "watching",
  OPPOSED: "breached",
} as const;

export function OptionsIntelPanel({
  intel,
  strikes,
  spy,
  healthAction,
  projection,
}: {
  intel: Intel | null;
  strikes: SelectedStrikes | null;
  spy: number;
  healthAction?: ReactNode;
  projection?: ContractProjection | null;
}) {
  if (!intel || !strikes) {
    return (
      <Card>
        <CardHeader
          eyebrow="Options Intelligence"
          title="Dealer & flow"
          action={
            <>
              {healthAction}
              <StatusPill variant="stale">CHAIN WAITING</StatusPill>
            </>
          }
        />
        <CardBody className="space-y-3 py-10">
          <div className="font-serif text-headline text-ink-3 italic font-light">
            Options chain not yet loaded.
          </div>
          <p className="text-[13px] text-ink-3 leading-relaxed max-w-md">
            The broker feed returned no chain for the active expiration (likely
            outside market hours, or the connection is still warming up).
            This panel populates once the chain arrives.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={13} strokeWidth={1.75} />
              Retry chain
            </Button>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              Next automatic refresh follows the session clock
            </span>
          </div>
        </CardBody>
      </Card>
    );
  }

  const allStrikes = [
    intel.putWall,
    intel.callWall,
    intel.maxPain,
    spy,
    ...intel.highOI.map((h) => h.strike),
  ];
  const axisMin = Math.min(...allStrikes) - 2;
  const axisMax = Math.max(...allStrikes) + 2;
  const range = axisMax - axisMin;
  const pos = (x: number) => `${((x - axisMin) / range) * 100}%`;
  const maxOI = Math.max(...intel.highOI.map((h) => h.oi));

  return (
    <Card>
      <CardHeader
        eyebrow="Options Intelligence"
        title="Dealer & flow"
        action={
          <>
            {healthAction}
            <StatusPill variant={alignmentVariant[intel.alignment]}>
              {intel.alignment}
            </StatusPill>
          </>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Put / Call" value={intel.putCallRatio.toFixed(2)} />
          <Stat label="Max Pain" value={intel.maxPain.toFixed(0)} highlight />
          <Stat
            label="Underlying"
            value={spy.toFixed(2)}
            tone={spy >= intel.maxPain ? "bull" : "bear"}
          />
        </div>

        <div className="bg-paper-2 rounded-soft shadow-rule p-4">
          {/* Top label rail — walls + max pain */}
          <div className="relative h-5 mb-1">
            <Marker at={pos(intel.putWall)} label={`PUT ${intel.putWall}`} tone="bear" align="top" />
            <Marker at={pos(intel.maxPain)} label={`MP ${intel.maxPain}`} tone="gold" align="top" />
            <Marker at={pos(intel.callWall)} label={`CALL ${intel.callWall}`} tone="bull" align="top" />
          </div>

          {/* OI histogram + baseline */}
          <div className="relative h-14">
            <div className="absolute inset-x-0 bottom-0 h-px bg-rule-strong" />
            {/* spans for walls / MP */}
            <span
              className="absolute top-0 bottom-0 w-px bg-bear/50"
              style={{ left: pos(intel.putWall) }}
            />
            <span
              className="absolute top-0 bottom-0 w-px bg-bull/50"
              style={{ left: pos(intel.callWall) }}
            />
            <span
              className="absolute top-0 bottom-0 w-0.5 bg-gold opacity-70"
              style={{ left: pos(intel.maxPain) }}
            />

            {/* OI bars */}
            {intel.highOI.map((h) => (
              <div
                key={h.strike}
                className="absolute bottom-0 -translate-x-1/2"
                style={{ left: pos(h.strike) }}
                title={`${h.strike} ${h.type}: ${h.oi.toLocaleString()} OI`}
              >
                <div
                  className={`w-2.5 rounded-t-sm ${
                    h.type === "CALL" ? "bg-bull/65" : "bg-bear/65"
                  }`}
                  style={{ height: `${Math.max(6, (h.oi / maxOI) * 44)}px` }}
                />
              </div>
            ))}

            {/* SPY badge */}
            <span
              className="absolute -translate-x-1/2 bg-ink text-paper text-[9.5px] font-mono font-semibold px-1.5 py-[2px] rounded"
              style={{ left: pos(spy), top: "-3px" }}
            >
              SPY {spy.toFixed(2)}
            </span>
          </div>

          {/* Bottom rail — OI strike numbers (only for OI bars) */}
          <div className="relative h-4 mt-1">
            {intel.highOI.map((h) => (
              <span
                key={h.strike}
                className="absolute -translate-x-1/2 font-mono text-[9px] text-ink-3 tabular-nums"
                style={{ left: pos(h.strike) }}
              >
                {h.strike}
              </span>
            ))}
          </div>
        </div>

        <ContractProjectionCard projection={projection ?? null} />

        <p className="text-[12px] text-ink-2 leading-snug">{intel.alignmentNote}</p>

        <div className="hr-rule" />

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Call Strike" value={strikes.callStrike.toFixed(0)} tone="bull" />
          <Stat label="Put Strike" value={strikes.putStrike.toFixed(0)} tone="bear" />
          <Stat label="DTE" value={strikes.dteLabel} />
        </div>
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "ink",
  highlight = false,
}: {
  label: string;
  value: string;
  tone?: "ink" | "bull" | "bear";
  highlight?: boolean;
}) {
  const cls = tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink";
  return (
    <div
      className={`px-2.5 py-2 rounded-soft ${
        highlight ? "bg-gold-tint shadow-rule" : "bg-paper-2"
      }`}
    >
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

function Marker({
  at,
  label,
  tone,
  align,
}: {
  at: string;
  label: string;
  tone: "bull" | "bear" | "gold";
  align: "top" | "bottom";
}) {
  const text =
    tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-gold-ink";
  const bg = tone === "bull" ? "bg-bull-tint" : tone === "bear" ? "bg-bear-tint" : "bg-gold-tint";
  return (
    <span
      className={`absolute -translate-x-1/2 px-1.5 py-[2px] rounded font-mono text-[9px] whitespace-nowrap ${bg} ${text} shadow-rule ${
        align === "top" ? "top-0" : "bottom-0"
      }`}
      style={{ left: at }}
    >
      {label}
    </span>
  );
}
