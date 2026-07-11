"use client";
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { WhyThisStateLink } from "@/components/slate/WhyThisStateLink";
import {
  StructurePathChart,
  type StructureChartData,
  type StructureChartLine,
} from "@/components/decision-slate/StructurePathChart";
import { PHASE_DEFINITIONS } from "@/content/phase-definitions";
import { formatDirectionLabel, formatDisplayLabel, formatSentenceState } from "@/lib/display-labels";
import type { AdaptedSnapshot, AnchorBand, AnchorGroup } from "@/lib/snapshot-adapter";
import type { EngineState } from "@/lib/states";
import type { DynamicLine } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownRight } from "lucide-react";

const stateTone: Record<EngineState, "armed" | "confirmed" | "watching" | "stale"> = {
  PRE_CONFIG: "stale",
  STAND_DOWN: "stale",
  WATCH: "watching",
  WAIT: "watching",
  ARMED: "armed",
  GO: "confirmed",
  COOLDOWN: "stale",
};

const headlineByState: Record<EngineState, string> = {
  PRE_CONFIG: "Awaiting setup window",
  STAND_DOWN: "Standing down today",
  WATCH: "Watching structure",
  WAIT: "Waiting on confirmation",
  ARMED: "Setup armed",
  GO: "Trade active",
  COOLDOWN: "Window complete",
};

const SLOPE_PER_HOUR = 0.2;        // display fallback only; engine projects live values upstream
const SPY_ROOM_HOURS = [8, 9, 10, 11, 12, 13, 14] as const;

interface SpyHourBar {
  hour: number;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
}

function entryBandValue(band: AnchorBand): number | null {
  return band.entryValue ?? band.currentValue ?? null;
}

function entryLineValue(line: DynamicLine): number {
  return line.entryValue ?? line.currentValue;
}

function buildSpyEntryFramework(
  snap: AdaptedSnapshot,
  primary: AnchorGroup | null,
  includePriorRange: boolean,
): Array<{ label: string; value: number | null; emphasized?: boolean }> {
  const findLine = (kind: string) =>
    snap.lines.find((line) => line.kind === kind || line.name.toUpperCase() === kind);
  const pdh = findLine("PDH");
  const pdl = findLine("PDL");
  const rows: Array<{ label: string; value: number | null; emphasized?: boolean }> = [];
  if (includePriorRange) {
    rows.push(
      { label: "PDH ref", value: pdh ? entryLineValue(pdh) : null },
      { label: "PDL ref", value: pdl ? entryLineValue(pdl) : null },
    );
  }
  if (primary) {
    rows.push(
      { label: "North Gate I", value: entryBandValue(primary.bands.upper) },
      { label: "Control Line", value: entryBandValue(primary.bands.main), emphasized: true },
      { label: "South Gate I", value: entryBandValue(primary.bands.lower) },
    );
  }
  return rows;
}

export function SPYChannelHero({ snap }: { snap: AdaptedSnapshot }) {
  const bias = snap.bias.bias;
  const displayedState = snap.currentState;
  const displayedStateLabel =
    PHASE_DEFINITIONS[displayedState]?.label ?? formatDisplayLabel(displayedState);

  const directionTone =
    bias === "BULLISH"
      ? "text-bull-ink"
      : bias === "BEARISH"
        ? "text-bear-ink"
        : "text-ink-3";

  const heroBg =
    displayedState === "WAIT" || displayedState === "ARMED"
      ? "bg-gold-tint/40"
      : "bg-paper";

  const anchor = snap.anchor;
  const primary = anchor?.primary ?? null;
  const hasLivePrice = Number.isFinite(snap.currentPrice) && snap.currentPrice > 0;
  const priorRangeValid = isPriorRangeValid(snap.lines);
  const entryFramework = buildSpyEntryFramework(snap, primary, priorRangeValid);

  // Distance to nearest line (the "first read" the trader looks for).
  // Uses live currentValue per band — already projected to "now" by the
  // engine — and picks the closest of upper / main / lower.
  const distances = primary
    ? [
        { label: "North Gate I", value: entryBandValue(primary.bands.upper) },
        { label: "Control Line", value: entryBandValue(primary.bands.main) },
        { label: "South Gate I", value: entryBandValue(primary.bands.lower) },
      ].filter((b) => b.value !== null)
    : [];
  const nearest = distances.reduce<{ label: string; dist: number; value: number } | null>(
    (best, b) => {
      const d = b.value! - snap.currentPrice;
      if (best === null || Math.abs(d) < Math.abs(best.dist)) {
        return { label: b.label, dist: d, value: b.value! };
      }
      return best;
    },
    null,
  );
  const nearestStructural = snap.lines
    .slice()
    .filter((line) => isActionableSpyReference(line, priorRangeValid))
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];
  const nearestRead = nearestStructural
    ? {
        label: nearestStructural.name,
        value: entryLineValue(nearestStructural),
        dist: entryLineValue(nearestStructural) - snap.currentPrice,
      }
    : nearest;
  const todayLabel = new Date().toISOString().slice(0, 10);
  const controlValue = primary ? entryBandValue(primary.bands.main) : nearestRead?.value ?? null;
  const upperOne = primary ? entryBandValue(primary.bands.upper) : null;
  const lowerOne = primary ? entryBandValue(primary.bands.lower) : null;
  const gateRows = buildSpyControlGates(primary);
  const stateTitle =
    displayedState === "STAND_DOWN"
      ? "Stand down today"
      : displayedState === "GO"
        ? "Trade active"
        : displayedState === "ARMED"
          ? "Setup armed"
          : displayedState === "WAIT" || displayedState === "WATCH"
            ? "Wait for confirmation"
            : "Awaiting setup window";
  const locationCopy = nearestRead
    ? `${formatSigned(nearestRead.dist)} pts from last`
    : "Awaiting structure";

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="Control Map"
        title="Control Room"
        meta={`${stateTitle} - ${nearestRead ? nearestRead.label : "map resolving"}`}
        action={
          <div className="flex items-center gap-2">
            <PanelHeartbeat feedId="anchor-levels" />
            <StatusPill variant={stateTone[displayedState] ?? "stale"} pulse>
              {displayedStateLabel}
            </StatusPill>
          </div>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <SpyControlStat
            label="Zone now"
            value={nearestRead ? nearestRead.label : "Resolving"}
            note={locationCopy}
          />
          <SpyControlStat
            label="Open bias"
            value={formatDirectionLabel(bias)}
            note={snap.decision.windowET || "Awaiting window"}
          />
          <SpyControlStat
            label="Control Line"
            value={controlValue === null ? "Resolving" : controlValue.toFixed(2)}
            note="SPY gate spacing"
          />
          <SpyControlStat
            label="Last"
            value={hasLivePrice ? snap.currentPrice.toFixed(2) : "--"}
            note={stateTitle}
          />
        </div>

        <SPYAnchorRoom snap={snap} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[14px] border border-rule bg-paper-2/55 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-ink-3">Nearest Gates</div>
                <div className="mt-1 font-serif text-[22px] leading-none text-ink">
                  Control Room reference values
                </div>
              </div>
              <WhyThisStateLink
                engine="SPY"
                trace={snap.decisionTrace.map((event) => ({
                  ts: event.ts,
                  event: event.event,
                  weight: event.weight,
                }))}
                flipCondition={snap.flipCondition}
                currentStateLabel={displayedStateLabel}
                className="hidden h-7 items-center gap-1.5 whitespace-nowrap rounded-pill border border-rule bg-paper px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 transition-colors hover:border-rule-strong hover:bg-paper sm:inline-flex"
              />
            </div>
            {gateRows.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {gateRows.map((gate) => (
                  <div
                    key={gate.label}
                    className={`rounded-[10px] border px-3 py-3 ${
                      gate.active
                        ? "border-gold/55 bg-gold-tint shadow-[0_0_0_1px_rgba(184,130,31,0.18)]"
                        : "border-rule bg-paper"
                    }`}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                      {gate.label}
                    </div>
                    <div className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-ink" data-num>
                      {gate.value === null ? "--" : gate.value.toFixed(2)}
                    </div>
                    <div className="mt-1 text-[11px] leading-snug text-ink-3">
                      {gate.note}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[12px] border border-rule bg-paper px-4 py-6 text-center text-[13px] text-ink-3">
                SPY will publish the Control Line and gates once the anchor is available.
              </div>
            )}
          </div>

          <div className="contrast-dark rounded-[14px] border border-rule bg-[#071116] p-4 text-paper shadow-soft">
            <div className="eyebrow text-paper/50">Active read</div>
            <div className="mt-2 font-serif text-[27px] leading-none text-paper">
              {headlineByState[displayedState] ?? displayedStateLabel}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-paper/68">
              {synthesisLine(snap, nearestRead, displayedState)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <RoomStat
                label="North"
                value={upperOne === null ? "--" : upperOne.toFixed(2)}
                note="First gate"
              />
              <RoomStat
                label="South"
                value={lowerOne === null ? "--" : lowerOne.toFixed(2)}
                note="First gate"
              />
            </div>
          </div>
        </div>

        {!priorRangeValid && (
          <div className="rounded-soft border border-gold/30 bg-gold-tint px-3 py-2 font-mono text-[10px] uppercase tracking-[0.10em] text-gold-ink">
            Prior range is being rechecked; the Control Map remains the primary read.
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <Card className={`relative overflow-hidden ${heroBg}`}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold/55" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rule to-transparent" />

      <div className="grid grid-cols-12 gap-0">
        {/* LEFT — verdict + read */}
        <div className="col-span-12 lg:col-span-5 p-5 sm:p-7 lg:pr-6 lg:pl-8 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="eyebrow text-ink-3">SPY Control Map</span>
              {/* v9: slope value hidden — proprietary engine
                  parameter. The SLOPE_PER_HOUR const remains the
                  source of truth for the bands' projection math
                  below; only the display string is suppressed. */}
              <span className="text-[10px] text-ink-4 font-mono">
                Session {todayLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <PanelHeartbeat feedId="anchor-levels" />
              <StatusPill variant={stateTone[displayedState] ?? "stale"} pulse>
                {displayedStateLabel}
              </StatusPill>
              <WhyThisStateLink
                engine="SPY"
                trace={snap.decisionTrace.map((event) => ({
                  ts: event.ts,
                  event: event.event,
                  weight: event.weight,
                }))}
                flipCondition={snap.flipCondition}
                currentStateLabel={displayedStateLabel}
                className="hidden h-7 items-center gap-1.5 whitespace-nowrap rounded-pill border border-rule bg-paper px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 transition-colors hover:border-rule-strong hover:bg-paper-2 sm:inline-flex"
              />
            </div>
          </div>

          <div className="mt-6 flex items-end gap-4">
            <ArrowDownRight className={`${directionTone} -mb-2`} size={36} strokeWidth={1.25} />
            <AnimatePresence mode="wait">
              <motion.h1
                key={displayedState}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                className={`text-display font-serif tracking-tight ${directionTone} leading-[1.02]`}
              >
                {headlineByState[displayedState] ?? displayedStateLabel}
              </motion.h1>
            </AnimatePresence>
          </div>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
            {synthesisLine(snap, nearestRead, displayedState)}
          </p>

          <div className="mt-3 inline-flex items-center gap-2 px-2 py-0.5 rounded-pill bg-paper-2 shadow-rule">
            <span className="font-mono text-[10px] tracking-[0.14em] text-ink-2 font-semibold">
              {bias} | {snap.decision.windowET || "no window"}
            </span>
          </div>

          {/* First read: distance to nearest line */}
          <div className="mt-7 max-w-md">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="eyebrow text-ink-3">Nearest gate</span>
              {nearestRead ? (
                <span className="font-mono text-sm text-ink tabular-nums">
                  <span className="font-semibold">{nearestRead!.label}</span>
                  <span className="text-ink-4 ml-1.5">{nearestRead!.value.toFixed(2)}</span>
                  <span
                    className={`ml-1.5 ${nearestRead!.dist >= 0 ? "text-bear-ink" : "text-bull-ink"}`}
                  >
                    ({nearestRead!.dist >= 0 ? "+" : ""}
                    {nearestRead!.dist.toFixed(2)} pts)
                  </span>
                </span>
              ) : (
                <span className="font-mono text-sm text-ink-3 italic">
                  awaiting structure
                </span>
              )}
            </div>
            {nearestRead ? (
              <div className="relative h-1 bg-paper-2 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.max(2, Math.min(100, 100 - Math.abs(nearestRead!.dist) * 20))}%`,
                  }}
                  transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  className="absolute inset-y-0 left-0 bg-ink rounded-full"
                />
              </div>
            ) : (
              <span className="block mt-2 text-ink-3 text-[13.5px]">
                SPY Control Map is resolving. Gates appear as soon as the
                prior-session pivot is available.
              </span>
            )}
          </div>

          <p className="mt-7 text-[15px] text-ink-2 leading-relaxed max-w-xl">
            {primary ? (
              <span className="block text-ink-3 text-[13.5px]">
                Control anchor <span className="font-mono">{anchorTimeLabel(primary!)}</span> CT.{" "}
                {/* v9: slope value hidden — proprietary engine
                    parameter. The bands themselves still render
                    using the const above. */}
                The Control Line and gates are projected into the active window.
              </span>
            ) : (
              <span className="block mt-2 text-ink-3 text-[13.5px]">
                A fresh Control Map will update this read.
              </span>
            )}
          </p>

        </div>

        <div className="hidden lg:block absolute left-[41.666%] top-7 bottom-7 w-px bg-rule" />

        {/* RIGHT — diagram + stat strip */}
        <div className="col-span-12 lg:col-span-7 p-5 sm:p-7 lg:pl-7 bg-paper-2/40 relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="eyebrow text-ink-3">Control anchor</span>
              <div className="mt-1.5 text-title font-serif text-ink">
                {primary ? formatDisplayLabel(primary!.role) : "None Today"}
              </div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-ink-3 mb-0.5">Last</div>
              <div className="font-mono text-[18px] font-semibold tabular-nums text-ink" data-num>
                {hasLivePrice ? snap.currentPrice.toFixed(2) : "--"}
              </div>
            </div>
          </div>

          <SPYAnchorRoom snap={snap} className="mb-4" />

          {primary ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-3 xl:grid-cols-5">
                {entryFramework.map((item) => (
                  <BandStat
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    price={snap.currentPrice}
                    emphasized={item.emphasized}
                  />
                ))}
              </div>
              {!priorRangeValid && (
                <div className="mb-4 rounded-soft border border-gold/30 bg-gold-tint px-3 py-2 font-mono text-[10px] uppercase tracking-[0.10em] text-gold-ink">
                  Prior-day range failed validation; PDH/PDL are hidden until the feed resolves.
                </div>
              )}
            </>
          ) : (
            <div className="mb-4 rounded-soft bg-paper px-3 py-3 shadow-rule">
              <div className="eyebrow text-ink-3 mb-1">Control Map</div>
              <p className="text-[12px] leading-snug text-ink-3">
                Control Map is resolving. Nearest structural line is{" "}
                {nearestStructural
                  ? `${nearestStructural.name} ${entryLineValue(nearestStructural).toFixed(2)} (${nearestStructural.distanceFromPrice >= 0 ? "+" : ""}${nearestStructural.distanceFromPrice.toFixed(2)} pts from LAST).`
                  : "not available yet."}
              </p>
            </div>
          )}

        </div>
      </div>
    </Card>
  );
}

function SpyControlStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[12px] border border-rule bg-paper-2/65 px-4 py-3">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-1 min-w-0 break-words font-mono text-[15px] font-semibold tabular-nums text-ink" data-num>
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-snug text-ink-3">{note}</div>
    </div>
  );
}

function buildSpyControlGates(primary: AnchorGroup | null): Array<{
  label: string;
  value: number | null;
  note: string;
  active?: boolean;
}> {
  if (!primary) return [];
  return [
    {
      label: "North Gate I",
      value: entryBandValue(primary.bands.upper),
      note: "Upper entry and exit boundary",
    },
    {
      label: "Control Line",
      value: entryBandValue(primary.bands.main),
      note: "Line in the sand",
      active: true,
    },
    {
      label: "South Gate I",
      value: entryBandValue(primary.bands.lower),
      note: "Lower entry and exit boundary",
    },
  ];
}

function synthesisLine(
  snap: AdaptedSnapshot,
  nearestRead: { label: string; dist: number; value: number } | null,
  displayedState: string,
): string {
  const bias = snap.bias.bias.toLowerCase();
  const state = formatSentenceState(displayedState);
  const engineCondition = cleanSpyExplanation(snap.flipCondition, snap.currentPrice);
  if (
    engineCondition &&
    (displayedState === "ARMED" || displayedState === "GO" || displayedState === "COOLDOWN")
  ) {
    return `${capitalize(bias)} lean, engine ${state}. ${engineCondition}`;
  }
  if (nearestRead) {
    const relation = nearestRead.dist >= 0 ? "above LAST" : "below LAST";
    const action =
      displayedState === "WAIT" || displayedState === "WATCH"
        ? "waiting for qualified confirmation"
        : displayedState === "STAND_DOWN"
          ? "standing down until structure reactivates"
          : displayedState === "PRE_CONFIG"
            ? "awaiting the setup window"
            : "tracking the active state";
    return `${capitalize(bias)} lean, engine ${state}; ${nearestRead.label} (${nearestRead.value.toFixed(2)}) sits ${Math.abs(nearestRead.dist).toFixed(2)} pts ${relation}, ${action}.`;
  }
  return `${capitalize(bias)} lean, engine ${state} until SPY structure becomes actionable.`;
}

type ExecutionReadItem = {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "watch" | "go" | "blocked";
};

function buildExecutionRead(
  snap: AdaptedSnapshot,
  nearestRead: { label: string; dist: number; value: number } | null,
  state: EngineState,
  stateLabel: string,
): ExecutionReadItem[] {
  const condition = cleanSpyExplanation(snap.flipCondition, snap.currentPrice);
  const priceText = Number.isFinite(snap.currentPrice) && snap.currentPrice > 0 ? snap.currentPrice.toFixed(2) : "--";
  const keyTrace =
    snap.decisionTrace.find((event) => event.weight === "key") ??
    snap.decisionTrace[0] ??
    null;
  const riskDetail = snap.invalidation
    ? `Invalidation ${snap.invalidation.level.toFixed(2)}; stop offset ${snap.invalidation.stopOffset.toFixed(2)}.`
    : snap.guardrails.chase.detail || "No active invalidation returned by the engine.";

  return [
    {
      label: "Posture",
      value: stateLabel,
      detail: executionPostureCopy(state, condition),
      tone: state === "GO" ? "go" : state === "ARMED" || state === "WAIT" ? "watch" : "neutral",
    },
    {
      label: "Active reference",
      value: nearestRead ? `${nearestRead.label} ${nearestRead.value.toFixed(2)}` : "Awaiting line",
      detail: nearestRead
        ? `${formatSigned(nearestRead.dist)} pts from LAST ${priceText}.`
        : "The engine has not returned a qualified Control Map yet.",
      tone: nearestRead && Math.abs(nearestRead.dist) <= 0.5 ? "watch" : "neutral",
    },
    {
      label: "Risk check",
      value: formatDisplayLabel(snap.guardrails.chase.status),
      detail: riskDetail,
      tone:
        snap.guardrails.chase.status === "BROKEN" ||
        snap.guardrails.chase.status === "MISSED_ENTRY"
          ? "blocked"
          : "neutral",
    },
    {
      label: "Engine evidence",
      value: keyTrace ? shortClock(keyTrace.ts) : "No trace",
      detail: keyTrace?.event ?? "No decision-trace event has been published yet.",
      tone: "neutral",
    },
  ];
}

function executionPostureCopy(state: EngineState, condition: string): string {
  if (condition && (state === "ARMED" || state === "GO" || state === "COOLDOWN")) {
    return condition;
  }
  if (state === "PRE_CONFIG") return "Setup window has not produced actionable lines yet.";
  if (state === "STAND_DOWN") return condition || "The engine is standing down until structure reactivates.";
  if (state === "WATCH") return condition || "Price is near structure, but confirmation is not qualified.";
  if (state === "WAIT") return condition || "Confirmation is pending before the engine can advance.";
  if (state === "ARMED") return condition || "Setup is armed; wait for the next engine transition.";
  if (state === "GO") return condition || "Trade is live; manage from the engine state.";
  return condition || "Trade has resolved; stand down until the next valid setup.";
}

function ExecutionRead({
  items,
  className = "",
}: {
  items: ExecutionReadItem[];
  className?: string;
}) {
  return (
    <div className={`mt-6 rounded-[14px] border border-rule bg-paper/80 p-4 shadow-rule ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-ink-3">Execution read</div>
          <div className="mt-1 font-serif text-[22px] leading-none text-ink">
            What matters now
          </div>
        </div>
        <span className="rounded-pill border border-rule bg-paper-2 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
          Engine trace
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`rounded-soft border px-3 py-2.5 ${executionToneClass(item.tone)}`}
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
              {item.label}
            </div>
            <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-ink" data-num>
              {item.value}
            </div>
            <p className="mt-1 text-[12px] leading-snug text-ink-3">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function executionToneClass(tone: ExecutionReadItem["tone"]): string {
  if (tone === "go") return "border-bull/25 bg-bull-tint/50";
  if (tone === "watch") return "border-gold/30 bg-gold-tint/45";
  if (tone === "blocked") return "border-bear/25 bg-bear-tint/45";
  return "border-rule bg-paper";
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shortClock(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function cleanSpyExplanation(text: string, spot: number): string {
  if (!text || !Number.isFinite(spot) || spot <= 0) return text;
  const gammaFlip = /(?:\s*)dealer gamma (?:positive|negative|flat) with flip near ([0-9]+(?:\.[0-9]+)?)(?:\.|,)?/i;
  const match = text.match(gammaFlip);
  if (!match) return text;
  const cleaned = text.replace(gammaFlip, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || "Extra context is withheld until the session read is clean.";
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function isPriorRangeValid(lines: DynamicLine[]): boolean {
  const pdh = lines.find((line) => line.kind === "PDH");
  const pdl = lines.find((line) => line.kind === "PDL");
  if (!pdh || !pdl) return true;
  return entryLineValue(pdh) >= entryLineValue(pdl);
}

function isActionableSpyReference(line: DynamicLine, priorRangeValid: boolean): boolean {
  if (line.kind === "DAY_OPEN") return false;
  if (/backup/i.test(line.name)) return false;
  if (line.kind === "CONTROL" || line.kind === "NORTH_GATE" || line.kind === "SOUTH_GATE") return true;
  if (!priorRangeValid && (line.kind === "PDH" || line.kind === "PDL")) return false;
  return line.isPrimary || /^Anchor\s/i.test(line.name);
}

function spyRoomLabel(name: string): string {
  if (/Control Line/i.test(name)) return "Control Line";
  if (/North Gate/i.test(name)) return name;
  if (/South Gate/i.test(name)) return name;
  if (/PDH/i.test(name)) return "PDH";
  if (/PDL/i.test(name)) return "PDL";
  if (/UA/i.test(name)) return "Upper asc";
  if (/UD/i.test(name)) return "Upper desc";
  if (/LA/i.test(name)) return "Lower asc";
  if (/LD/i.test(name)) return "Lower desc";
  return name.replace(/^Anchor\s*/i, "Anchor ");
}

function anchorTimeLabel(g: AnchorGroup): string {
  try {
    const d = new Date(g.anchorTime);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

function BandStat({
  label,
  value,
  price,
  emphasized = false,
}: {
  label: string;
  value: number | null;
  price: number;
  emphasized?: boolean;
}) {
  if (value === null) {
    return (
      <div className={`px-2.5 py-1.5 rounded-soft bg-paper shadow-rule ${emphasized ? "ring-1 ring-gold/40" : ""}`}>
        <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
        <span className="font-mono text-sm text-ink-3 italic">—</span>
      </div>
    );
  }
  const dist = value - price;
  const distTone =
    Math.abs(dist) < 0.6
      ? "text-gold-ink"
      : dist >= 0
        ? "text-bear-ink"
        : "text-bull-ink";
  return (
    <div className={`px-2.5 py-1.5 rounded-soft bg-paper shadow-rule ${emphasized ? "ring-1 ring-gold/40" : ""}`}>
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-ink" data-num>
        {value.toFixed(2)}
      </div>
      <div className={`font-mono text-[10px] tabular-nums ${distTone}`}>
        {dist >= 0 ? "+" : ""}
        {dist.toFixed(2)}
      </div>
    </div>
  );
}

function mapSpyRoomHourlyBars(
  candles: Array<{ t: string; o: number; h: number; l: number; c: number }>,
): Map<number, SpyHourBar> {
  const out = new Map<number, SpyHourBar>();
  for (const candle of candles) {
    const hour = chicagoHour(candle.t);
    if (hour === null || !SPY_ROOM_HOURS.includes(hour as (typeof SPY_ROOM_HOURS)[number])) {
      continue;
    }
    if (
      !Number.isFinite(candle.o) ||
      !Number.isFinite(candle.h) ||
      !Number.isFinite(candle.l) ||
      !Number.isFinite(candle.c)
    ) {
      continue;
    }
    const existing = out.get(hour);
    if (!existing) {
      out.set(hour, {
        hour,
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
        count: 1,
      });
    } else {
      existing.high = Math.max(existing.high, candle.h);
      existing.low = Math.min(existing.low, candle.l);
      existing.close = candle.c;
      existing.count += 1;
    }
  }
  return out;
}

function chicagoHour(iso: string): number | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    hour12: false,
  }).format(d);
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return null;
  return hour === 24 ? 0 : hour;
}

function formatSpyRoomHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function spyRoomHourRead(
  hour: number,
  hasBar: boolean,
  hasPrice: boolean,
): { title: string; body: string; badge: string } {
  if (!hasPrice) {
    return {
      title: "Waiting for hourly price",
      body: "SPY will animate into the room once a live price or hourly candle is available.",
      badge: "waiting",
    };
  }
  if (hour === 8) {
    return {
      title: "08:00 setup read",
      body: hasBar
        ? "This shows where the early SPY candle sits inside the Control Room."
        : "The 08:00 setup read is waiting for a completed SPY candle.",
      badge: "setup",
    };
  }
  if (hour === 9) {
    return {
      title: "09:00 institutional read",
      body: hasBar
        ? "This is the primary SPY entry hour. Use it to see whether SPY accepted above a gate, lost a gate, or stayed trapped inside the room."
        : "The 09:00 institutional read will fill in when that SPY candle is available.",
      badge: "primary",
    };
  }
  if (hour >= 10 && hour <= 11) {
    return {
      title: `${formatSpyRoomHour(hour)} confirmation room`,
      body: hasBar
        ? "This hour checks whether the move followed through or failed back inside the same Control Room."
        : "This confirmation hour is waiting for a completed SPY candle.",
      badge: "confirm",
    };
  }
  return {
    title: `${formatSpyRoomHour(hour)} extension room`,
    body: hasBar
      ? "This is a later extension read. It can show continuation or rejection, but the app should treat it as lower quality than the 09:00 primary window."
      : "This later extension hour is waiting for a completed SPY candle.",
    badge: "extension",
  };
}

function SPYAnchorRoom({
  snap,
  className = "",
}: {
  snap: AdaptedSnapshot;
  className?: string;
}) {
  const primary = snap.anchor?.primary ?? null;
  const hourlyBars = useMemo(() => mapSpyRoomHourlyBars(snap.candles ?? []), [snap.candles]);
  const [selectedHour, setSelectedHour] = useState(() => {
    if (hourlyBars.has(9)) return 9;
    const available = SPY_ROOM_HOURS.filter((hour) => hourlyBars.has(hour));
    return available.at(-1) ?? 9;
  });
  const [selectedFocus, setSelectedFocus] = useState<"ceiling" | "price" | "floor">("price");
  const selectedBar = hourlyBars.get(selectedHour) ?? null;
  const selectedPrice = selectedBar?.close ?? snap.currentPrice;
  const hasPrice = Number.isFinite(selectedPrice) && selectedPrice > 0;
  const selectedSource = selectedBar
    ? `${formatSpyRoomHour(selectedHour)} close`
    : hasPrice
      ? "Latest price"
      : "Waiting";
  const selectedRead = spyRoomHourRead(selectedHour, Boolean(selectedBar), hasPrice);
  const bands = primary
    ? [
        { label: "North Gate I", value: entryBandValue(primary.bands.upper) },
        { label: "Control Line", value: entryBandValue(primary.bands.main) },
        { label: "South Gate I", value: entryBandValue(primary.bands.lower) },
      ].filter((band): band is { label: string; value: number } => band.value !== null)
    : snap.lines
        .filter((line) => isActionableSpyReference(line, isPriorRangeValid(snap.lines)))
      .map((line) => ({ label: spyRoomLabel(line.name), value: entryLineValue(line) }));
  const ordered = bands.slice().sort((a, b) => a.value - b.value);
  const lower = hasPrice
    ? (ordered.filter((band) => band.value <= selectedPrice).at(-1) ?? null)
    : null;
  const upper = hasPrice
    ? (ordered.find((band) => band.value > selectedPrice) ?? null)
    : null;
  const hasRoom = Boolean(lower && upper);
  const roomProgress =
    lower && upper
      ? clampNumber(
          (selectedPrice - lower.value) / Math.max(0.01, upper.value - lower.value),
          0,
          1,
        )
      : 0.5;
  const carTop = lower && upper ? 76 - roomProgress * 52 : upper ? 70 : 30;
  const nearCeiling = Math.abs(carTop - 24) < 14;
  const nearFloor = Math.abs(carTop - 76) < 14;
  const priceBadgeTop = nearCeiling ? 44 : nearFloor ? 56 : carTop;
  const priceBadgeOffset = Math.abs(priceBadgeTop - carTop);
  const floorDistance = lower ? selectedPrice - lower.value : null;
  const ceilingDistance = upper ? upper.value - selectedPrice : null;
  const title = hasRoom
    ? `Between ${lower?.label} and ${upper?.label}`
    : hasPrice && upper
      ? `Below ${upper.label}`
      : hasPrice && lower
        ? `Above ${lower.label}`
        : hasPrice
          ? "Awaiting structure"
          : "Awaiting live price";
  const inspectedValue =
    selectedFocus === "ceiling" ? upper?.value ?? null : selectedFocus === "floor" ? lower?.value ?? null : hasPrice ? selectedPrice : null;
  const inspectedLabel =
    selectedFocus === "ceiling" ? upper?.label ?? "Ceiling" : selectedFocus === "floor" ? lower?.label ?? "Floor" : selectedBar ? "SPY close" : "SPY last";
  const inspectedDistance =
    selectedFocus === "ceiling" ? ceilingDistance : selectedFocus === "floor" ? floorDistance : 0;
  const inspectedNote =
    selectedFocus === "price"
      ? `${selectedSource} inside the selected hour room.`
      : inspectedValue === null
        ? "No gate is available on this side of the room."
        : `${Math.abs(inspectedDistance ?? 0).toFixed(2)} pts from the selected price marker.`;
  const moveHour = (delta: number) => {
    const currentIndex = Math.max(0, SPY_ROOM_HOURS.indexOf(selectedHour));
    const nextIndex = clampNumber(currentIndex + delta, 0, SPY_ROOM_HOURS.length - 1);
    setSelectedHour(SPY_ROOM_HOURS[nextIndex]);
  };
  const inspectFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    setSelectedFocus(pct < 38 ? "ceiling" : pct > 62 ? "floor" : "price");
  };
  const onRoomKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveHour(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveHour(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedFocus("ceiling");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedFocus("floor");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedFocus("price");
    }
  };

  return (
    <div className={`overflow-hidden rounded-[14px] border border-rule bg-ink text-paper shadow-card ${className}`}>
      <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative min-h-[280px] p-4">
          <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
                SPY Control Room
              </div>
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className="mt-1 font-serif text-[24px] leading-none text-paper"
              >
                {title}
              </motion.div>
            </div>
            <span className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2.5 py-2 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-paper/60">
              Gate values
              <span className="mt-0.5 block text-gold-soft">
                {formatSpyRoomHour(selectedHour)}
              </span>
            </span>
          </div>

          <div
            role="group"
            tabIndex={0}
            aria-label={`Interactive SPY Control Room, ${formatSpyRoomHour(selectedHour)}, ${title}`}
            onClick={inspectFromPointer}
            onKeyDown={onRoomKeyDown}
            className="relative mt-5 h-[196px] cursor-crosshair overflow-hidden rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(184,130,31,0.16),rgba(255,255,255,0.035)_46%,rgba(0,0,0,0.12)_100%)] outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between">
              <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/58">
                {selectedHour === 9 ? "institutional entry" : selectedRead.badge}
              </span>
              <span className="rounded-[8px] border border-gold/30 bg-gold/12 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-gold-soft">
                Control Room
              </span>
            </div>
            <div className="absolute bottom-4 left-1/2 top-4 w-[84px] -translate-x-1/2 rounded-full border border-white/10 bg-black/20 shadow-[inset_0_0_30px_rgba(0,0,0,0.40)]" />
            <motion.div
              key={`spy-room-${selectedHour}-${title}`}
              className="absolute left-[calc(50%_-_66px)] top-[24%] h-[52%] w-[132px] rounded-[24px] border border-gold/40 bg-gold/12 shadow-[0_0_38px_rgba(184,130,31,0.20)]"
              initial={{ opacity: 0, scaleX: 0.88 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
            />
            <SpyRoomLine
              type="ceiling"
              top="24%"
              label={upper?.label ?? "None"}
              value={upper?.value ?? null}
              distance={ceilingDistance}
              active={selectedFocus === "ceiling"}
              onSelect={() => setSelectedFocus("ceiling")}
            />
            <SpyRoomLine
              type="floor"
              top="76%"
              label={lower?.label ?? "None"}
              value={lower?.value ?? null}
              distance={floorDistance}
              active={selectedFocus === "floor"}
              onSelect={() => setSelectedFocus("floor")}
            />
            <div
              className="absolute left-1/2 z-50 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/70 bg-paper shadow-[0_0_0_5px_rgba(184,130,31,0.15)]"
              style={{ top: `${carTop}%` }}
              aria-hidden
            />
            {priceBadgeOffset > 3 && (
              <div
                className="absolute left-1/2 z-10 w-px -translate-x-1/2 bg-gold/45"
                style={{
                  top: `${Math.min(carTop, priceBadgeTop)}%`,
                  height: `${priceBadgeOffset}%`,
                }}
                aria-hidden
              />
            )}
            <motion.div
              key={`spy-price-${selectedHour}-${selectedPrice}`}
              className="absolute left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ top: `${priceBadgeTop}%` }}
              initial={{ opacity: 0, scale: 0.84, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.38, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <span className="relative flex h-14 w-24 items-center justify-center rounded-[16px] border border-gold/60 bg-ink shadow-[0_18px_46px_-18px_rgba(184,130,31,0.95)]">
                <span className="absolute h-16 w-28 rounded-[20px] bg-gold/12 blur-md" />
                <span className="relative text-center">
                  <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-gold-soft">
                    {selectedBar ? "SPY close" : "SPY last"}
                  </span>
                  <span className="block font-mono text-[13px] font-semibold tabular-nums text-paper">
                    {hasPrice ? selectedPrice.toFixed(2) : "--"}
                  </span>
                </span>
              </span>
            </motion.div>
          </div>
          <div className="relative mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {SPY_ROOM_HOURS.map((hour) => {
              const active = hour === selectedHour;
              const hasBar = hourlyBars.has(hour);
              return (
                <button
                  key={hour}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedHour(hour)}
                  className={`h-9 rounded-[8px] border px-1 font-mono text-[10px] font-semibold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 ${
                    active
                      ? "border-gold bg-gold text-ink shadow-glow"
                      : "border-white/10 bg-white/[0.06] text-paper/78 hover:border-gold/50 hover:bg-white/[0.10]"
                  }`}
                  title={hasBar ? `${formatSpyRoomHour(hour)} SPY candle available` : "Uses latest available price until this candle is available"}
                >
                  {formatSpyRoomHour(hour)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-t border-white/10 bg-paper p-4 text-ink lg:border-l lg:border-t-0">
          <div className="eyebrow text-ink-3">Gate read</div>
          <div className="mt-2 rounded-[10px] border border-rule bg-paper-2/55 p-3">
            <div className="font-serif text-[21px] leading-none text-ink">
              {selectedRead.title}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
              {hasPrice
                ? selectedRead.body
                : "The hourly room activates when SPY candles and the Control Map are available."}
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
            {hasPrice
              ? "Each hour moves the SPY price marker against the same Control Map, so a novice can see whether price is pressing into a gate, holding a gate, or drifting in the middle."
              : "The room activates when SPY price and Control Map values are available. Once live, it turns the gates into a simple position read instead of a raw chart."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <RoomStat
              label="Hour"
              value={hasPrice ? selectedPrice.toFixed(2) : "--"}
              note={selectedSource}
              active={selectedFocus === "price"}
              onSelect={() => setSelectedFocus("price")}
            />
            <RoomStat
              label="Ceiling"
              value={upper ? upper.value.toFixed(2) : "None"}
              note={ceilingDistance === null ? "Above map" : `${ceilingDistance.toFixed(2)} pts above`}
              active={selectedFocus === "ceiling"}
              onSelect={() => setSelectedFocus("ceiling")}
            />
            <RoomStat
              label="Floor"
              value={lower ? lower.value.toFixed(2) : "None"}
              note={floorDistance === null ? "Below map" : `${floorDistance.toFixed(2)} pts below`}
              active={selectedFocus === "floor"}
              onSelect={() => setSelectedFocus("floor")}
            />
          </div>
          <motion.div
            key={`spy-inspect-${selectedHour}-${selectedFocus}`}
            className="mt-3 rounded-[10px] border border-gold/25 bg-gold-tint/55 p-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="eyebrow text-gold-ink">Room inspection</div>
            <div className="mt-1 font-serif text-[20px] leading-none text-ink">
              {inspectedLabel}
            </div>
            <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-ink">
              {inspectedValue === null ? "Waiting" : inspectedValue.toFixed(2)}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
              {inspectedNote}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SpyRoomLine({
  type,
  top,
  label,
  value,
  distance,
  active = false,
  onSelect,
}: {
  type: "floor" | "ceiling";
  top: string;
  label: string;
  value: number | null;
  distance: number | null;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      className={`absolute inset-x-2 z-40 grid grid-cols-[minmax(56px,1fr)_76px_minmax(72px,1fr)] items-center gap-2 rounded-[10px] outline-none transition focus-visible:ring-2 focus-visible:ring-gold/45 sm:inset-x-3 sm:grid-cols-[minmax(0,1fr)_86px_minmax(0,1fr)] ${
        active ? "bg-gold/10" : "hover:bg-white/[0.04]"
      }`}
      style={{ top, transform: "translateY(-50%)" }}
      initial={{ opacity: 0, scaleX: 0.92 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="min-w-0 text-right">
        <div className="truncate font-mono text-[9px] font-semibold uppercase text-paper sm:text-[10px]">
          {label}
        </div>
        <div className="truncate text-[10px] text-paper/50">
          {distance === null ? "" : `${distance.toFixed(2)} pts`}
        </div>
      </div>
      <div className="relative h-[24px]">
        <motion.div
          className="absolute left-0 right-0 top-1/2 h-px bg-gold"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.42 }}
        />
        <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_16px_rgba(184,130,31,0.78)]" />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gold-soft">
          {type === "ceiling" ? "Ceiling" : "Floor"}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-paper">
          {value === null ? "--" : value.toFixed(2)}
        </div>
      </div>
    </motion.button>
  );
}

function RoomStat({
  label,
  value,
  note,
  active = false,
  onSelect,
}: {
  label: string;
  value: string;
  note: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[8px] border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/35 ${
        active ? "border-gold/35 bg-gold-tint/70" : "border-rule bg-paper-2/55 hover:border-gold/30 hover:bg-gold-tint/35"
      }`}
    >
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-ink-3">{note}</div>
    </button>
  );
}

function AnchorCell({
  label,
  group,
}: {
  label: string;
  group: AnchorGroup | null;
}) {
  if (!group) {
    return (
      <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
        <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
        <span className="font-mono text-sm text-ink-3 italic">none</span>
      </div>
    );
  }
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-semibold tabular-nums text-ink" data-num>
          {group.anchorLow.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {anchorTimeLabel(group)} CT
        </span>
      </div>
    </div>
  );
}

function buildSpyChannelChart(snap: AdaptedSnapshot): StructureChartData | null {
  const primary = snap.anchor?.primary ?? null;
  const bars = (snap.candles ?? [])
    .filter(
      (bar) =>
        !!bar.t &&
        Number.isFinite(bar.h) &&
        Number.isFinite(bar.l) &&
        Number.isFinite(bar.c),
    )
    .map((bar) => ({ t: bar.t, h: bar.h, l: bar.l, c: bar.c }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (bars.length > 0 && Number.isFinite(snap.currentPrice)) {
    const last = bars[bars.length - 1];
    bars[bars.length - 1] = {
      ...last,
      h: Math.max(last.h, snap.currentPrice),
      l: Math.min(last.l, snap.currentPrice),
      c: snap.currentPrice,
    };
  }
  if (!primary || bars.length < 2) return null;
  const slopePerHour = -Math.abs(Number(snap.anchor?.slopePerHour ?? SLOPE_PER_HOUR));
  const lines = [
    makeSpyChartLine("North Gate I", primary.bands.upper.anchorPrice, primary.anchorTime, slopePerHour, "upper"),
    makeSpyChartLine("Control Line", primary.bands.main.anchorPrice, primary.anchorTime, slopePerHour, "anchor"),
    makeSpyChartLine("South Gate I", primary.bands.lower.anchorPrice, primary.anchorTime, slopePerHour, "lower"),
  ].filter((line): line is StructureChartLine => line !== null);
  if (lines.length === 0) return null;
  return { label: "SPY", date: new Date().toISOString().slice(0, 10), bars, lines };
}

function makeSpyChartLine(
  label: string,
  anchorPrice: number | null,
  anchorTime: string,
  slopePerHour: number,
  tone: StructureChartLine["tone"],
): StructureChartLine | null {
  if (!Number.isFinite(anchorPrice ?? NaN)) return null;
  return {
    label,
    anchorTime,
    anchorPrice: Number(anchorPrice),
    slopePerHour,
    tone,
  };
}

// ---------- Diagram ----------

function AnchorDiagram({ snap }: { snap: AdaptedSnapshot }) {
  const W = 400;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 22;

  const anchor = snap.anchor;
  const primary = anchor?.primary ?? null;
  const anchor2 = anchor?.anchor2 ?? null;
  const slope = anchor?.slopePerHour ?? SLOPE_PER_HOUR;
  const groups = [primary, anchor2].filter((g): g is AnchorGroup => g !== null);

  // Time axis: from earliest anchor to now + 1 hour.
  const now = Date.now();
  const anchorTimes = groups
    .map((g) => new Date(g.anchorTime).getTime())
    .filter((t) => Number.isFinite(t));
  const t0 = anchorTimes.length ? Math.min(...anchorTimes) : now - 8 * 36e5;
  const tEnd = now + 60 * 60 * 1000;

  // Y range: include current price plus every band's anchor & current value.
  const yPoints: number[] = [snap.currentPrice];
  for (const line of snap.lines.slice(0, 4)) {
    yPoints.push(line.currentValue);
  }
  for (const g of groups) {
    yPoints.push(g.anchorLow);
    yPoints.push(g.anchorLow + 3.4);
    yPoints.push(g.anchorLow - 3.4);
    if (g.bands.upper.currentValue !== null) yPoints.push(g.bands.upper.currentValue);
    if (g.bands.main.currentValue !== null) yPoints.push(g.bands.main.currentValue);
    if (g.bands.lower.currentValue !== null) yPoints.push(g.bands.lower.currentValue);
  }
  let yMin = Math.min(...yPoints);
  let yMax = Math.max(...yPoints);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
    yMin = snap.currentPrice - 4;
    yMax = snap.currentPrice + 4;
  }
  const pad = (yMax - yMin) * 0.2 || 2;
  yMin -= pad;
  yMax += pad;

  const xOf = (t: number) => PAD_L + ((t - t0) / (tEnd - t0)) * (W - PAD_L - PAD_R);
  const yOf = (p: number) => PAD_T + (1 - (p - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

  const xNow = xOf(now);
  const yPrice = yOf(snap.currentPrice);
  const nearestLine = snap.lines
    .slice()
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];

  const renderGroup = (g: AnchorGroup, idx: number, isPrimary: boolean) => {
    const ts0 = new Date(g.anchorTime).getTime();
    const startX = xOf(ts0);
    const endX = xOf(tEnd);
    const dh = (tEnd - ts0) / 36e5;
    const upperEnd = g.anchorLow + 3.4 - slope * dh;
    const mainEnd = g.anchorLow - slope * dh;
    const lowerEnd = g.anchorLow - 3.4 - slope * dh;
    const opacity = isPrimary ? 1 : 0.55;
    const dash = isPrimary ? undefined : "4 4";
    return (
      <g key={g.role + idx}>
        {/* Translucent band fill between upper and lower */}
        <path
          d={`M ${startX},${yOf(g.anchorLow + 3.4)} L ${endX},${yOf(upperEnd)} L ${endX},${yOf(lowerEnd)} L ${startX},${yOf(g.anchorLow - 3.4)} Z`}
          fill="#B8821F"
          opacity={isPrimary ? 0.06 : 0.03}
          className="spy-band"
          style={{ animationDelay: `${800 + idx * 200}ms` }}
        />
        {/* Upper line */}
        <path
          d={`M ${startX},${yOf(g.anchorLow + 3.4)} L ${endX},${yOf(upperEnd)}`}
          stroke="#B5301E"
          strokeWidth={isPrimary ? 1.4 : 1}
          strokeDasharray={dash}
          opacity={opacity}
          fill="none"
          className="spy-rail"
          pathLength={1}
          style={{ animationDelay: `${200 + idx * 110}ms` }}
        />
        {/* Main line — emphasized */}
        <path
          d={`M ${startX},${yOf(g.anchorLow)} L ${endX},${yOf(mainEnd)}`}
          stroke="#B8821F"
          strokeWidth={isPrimary ? 1.8 : 1.2}
          strokeDasharray={dash}
          opacity={opacity}
          fill="none"
          className="spy-rail"
          pathLength={1}
          style={{ animationDelay: `${320 + idx * 110}ms` }}
        />
        {/* Lower line */}
        <path
          d={`M ${startX},${yOf(g.anchorLow - 3.4)} L ${endX},${yOf(lowerEnd)}`}
          stroke="#0E7C50"
          strokeWidth={isPrimary ? 1.4 : 1}
          strokeDasharray={dash}
          opacity={opacity}
          fill="none"
          className="spy-rail"
          pathLength={1}
          style={{ animationDelay: `${440 + idx * 110}ms` }}
        />
        {/* Anchor marker (the bearish candle low) */}
        <g
          className="spy-anchor"
          style={{ animationDelay: `${1000 + idx * 140}ms` }}
        >
          <circle cx={startX} cy={yOf(g.anchorLow)} r={9} fill="#B8821F" opacity={0} className="spy-anchor-pulse" />
          <circle cx={startX} cy={yOf(g.anchorLow)} r={4} fill="#fff" stroke="#B8821F" strokeWidth={1.5} />
          <circle cx={startX} cy={yOf(g.anchorLow)} r={1.6} fill="#B8821F" />
        </g>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full spy-diagram">
      <style>{spyDiagramStyles}</style>

      {/* horizontal price gridlines */}
      {[0.25, 0.5, 0.75].map((f) => {
        const y = PAD_T + f * (H - PAD_T - PAD_B);
        return (
          <line
            key={f}
            x1={PAD_L}
            y1={y}
            x2={W - PAD_R}
            y2={y}
            stroke="#E8E2D2"
            strokeWidth={0.6}
            strokeDasharray="2 4"
          />
        );
      })}

      {/* y-axis price ticks */}
      {[
        yMin + (yMax - yMin) * 0.12,
        (yMin + yMax) / 2,
        yMax - (yMax - yMin) * 0.12,
      ].map((p, i) => (
        <text
          key={i}
          x={PAD_L - 4}
          y={yOf(p) + 3}
          fontSize="8"
          fontFamily="var(--font-geist-mono)"
          fill="#9CA3AF"
          textAnchor="end"
        >
          {p.toFixed(0)}
        </text>
      ))}

      {primary && renderGroup(primary, 0, true)}
      {anchor2 && renderGroup(anchor2, 1, false)}

      {!primary && nearestLine && (
        <g>
          <line
            x1={PAD_L}
            y1={yOf(nearestLine.currentValue)}
            x2={W - PAD_R}
            y2={yOf(nearestLine.currentValue)}
            stroke="#B8821F"
            strokeWidth={1.4}
            strokeDasharray="4 3"
            opacity={0.8}
          />
          <text
            x={W - PAD_R - 4}
            y={yOf(nearestLine.currentValue) - 6}
            fontSize="9"
            fontFamily="var(--font-geist-mono)"
            fill="#8A6117"
            textAnchor="end"
          >
            {nearestLine.name} {nearestLine.currentValue.toFixed(2)}
          </text>
        </g>
      )}

      {/* current price horizontal */}
      <line
        x1={PAD_L}
        y1={yPrice}
        x2={xNow}
        y2={yPrice}
        stroke="#14161A"
        strokeWidth={0.6}
        strokeDasharray="1.5 3"
        opacity={0.45}
        className="spy-price-line"
      />
      <g className="spy-price-marker">
        <circle cx={xNow} cy={yPrice} r={4.5} fill="#14161A" />
        <circle cx={xNow} cy={yPrice} r={8} fill="#14161A" opacity={0.12} className="spy-price-halo" />
      </g>

      {!primary && !nearestLine && (
        <text
          x={W / 2}
          y={H / 2}
          fontSize="11"
          fontFamily="var(--font-geist-mono)"
          fill="#9CA3AF"
          textAnchor="middle"
        >
          Awaiting qualified structure
        </text>
      )}
    </svg>
  );
}

const spyDiagramStyles = `
  @keyframes spy-rail-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes spy-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spy-pop-in {
    0%   { opacity: 0; transform: scale(0.6); }
    70%  { opacity: 1; transform: scale(1.1); }
    100% { transform: scale(1); }
  }
  @keyframes spy-pulse-out {
    0%   { opacity: 0; transform: scale(0.6); }
    50%  { opacity: 0.22; }
    100% { opacity: 0; transform: scale(2.4); }
  }
  @keyframes spy-breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.18; } }
  @keyframes spy-halo-pulse {
    0%   { opacity: 0.12; transform: scale(1); }
    50%  { opacity: 0.04; transform: scale(1.7); }
    100% { opacity: 0.12; transform: scale(1); }
  }
  .spy-diagram .spy-rail {
    stroke-dasharray: 1;
    animation: spy-rail-draw 950ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .spy-diagram .spy-band {
    opacity: 0;
    animation: spy-fade-in 600ms ease-out forwards;
  }
  .spy-diagram .spy-anchor {
    transform-origin: center;
    transform-box: fill-box;
    opacity: 0;
    animation: spy-pop-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .spy-diagram .spy-anchor-pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: spy-pulse-out 2400ms ease-out 2000ms infinite;
  }
  .spy-diagram .spy-price-line { animation: spy-breathe 3200ms ease-in-out infinite; }
  .spy-diagram .spy-price-marker {
    opacity: 0;
    animation: spy-fade-in 360ms ease-out 1300ms forwards;
  }
  .spy-diagram .spy-price-halo {
    transform-origin: center;
    transform-box: fill-box;
    animation: spy-halo-pulse 2800ms ease-in-out 1700ms infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .spy-diagram .spy-rail,
    .spy-diagram .spy-band,
    .spy-diagram .spy-anchor,
    .spy-diagram .spy-price-marker {
      opacity: 1 !important;
      animation: none !important;
      stroke-dashoffset: 0 !important;
      transform: none !important;
    }
    .spy-diagram .spy-anchor-pulse,
    .spy-diagram .spy-price-line,
    .spy-diagram .spy-price-halo {
      animation: none !important;
    }
  }
`;


