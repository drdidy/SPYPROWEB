"use client";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { WhyThisStateLink } from "@/components/slate/WhyThisStateLink";
import {
  StructurePathChart,
  type StructureChartData,
  type StructureChartLine,
} from "@/components/decision-slate/StructurePathChart";
import { PHASE_DEFINITIONS } from "@/content/phase-definitions";
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
  COOLDOWN: "Touch-window complete",
};

const SLOPE_PER_HOUR = 0.2;        // display fallback only; engine projects live values upstream

function entryBandValue(band: AnchorBand): number | null {
  return band.entryValue ?? band.currentValue ?? null;
}

function entryLineValue(line: DynamicLine): number {
  return line.entryValue ?? line.currentValue;
}

function buildSpyEntryFramework(
  snap: AdaptedSnapshot,
  primary: AnchorGroup | null,
): Array<{ label: string; value: number | null; emphasized?: boolean }> {
  const findLine = (kind: string) =>
    snap.lines.find((line) => line.kind === kind || line.name.toUpperCase() === kind);
  const pdh = findLine("PDH");
  const pdl = findLine("PDL");
  const rows: Array<{ label: string; value: number | null; emphasized?: boolean }> = [
    { label: "PDH ref", value: pdh ? entryLineValue(pdh) : null },
    { label: "PDL ref", value: pdl ? entryLineValue(pdl) : null },
  ];
  if (primary) {
    rows.push(
      { label: "Main +", value: entryBandValue(primary.bands.upper) },
      { label: "Main", value: entryBandValue(primary.bands.main), emphasized: true },
      { label: "Main -", value: entryBandValue(primary.bands.lower) },
    );
  }
  return rows;
}

export function SPYChannelHero({ snap }: { snap: AdaptedSnapshot }) {
  const bias = snap.bias.bias;
  const displayedState = snap.currentState;
  const displayedStateLabel =
    PHASE_DEFINITIONS[displayedState]?.label ?? displayedState.replace(/_/g, " ");

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
  const entryFramework = buildSpyEntryFramework(snap, primary);

  // Distance to nearest line (the "first read" the trader looks for).
  // Uses live currentValue per band — already projected to "now" by the
  // engine — and picks the closest of upper / main / lower.
  const distances = primary
    ? [
        { label: "Upper ref", value: entryBandValue(primary.bands.upper) },
        { label: "Main ref", value: entryBandValue(primary.bands.main) },
        { label: "Lower ref", value: entryBandValue(primary.bands.lower) },
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
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))[0];
  const nearestRead = nearestStructural
    ? {
        label: nearestStructural.name,
        value: entryLineValue(nearestStructural),
        dist: entryLineValue(nearestStructural) - snap.currentPrice,
      }
    : nearest;
  const executionRead = buildExecutionRead(snap, nearestRead, displayedState, displayedStateLabel);

  const todayLabel = new Date().toISOString().slice(0, 10);

  return (
    <Card className={`relative overflow-hidden ${heroBg}`}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold/55" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rule to-transparent" />

      <div className="grid grid-cols-12 gap-0">
        {/* LEFT — verdict + read */}
        <div className="col-span-12 lg:col-span-7 p-7 pr-6 pl-8 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="eyebrow text-ink-3">SPY · Anchor Slate</span>
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
                className="hidden h-7 items-center gap-1.5 rounded-pill border border-rule bg-paper px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 transition-colors hover:border-rule-strong hover:bg-paper-2 sm:inline-flex"
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
              {bias} · {snap.decision.windowET || "no window"}
            </span>
          </div>

          {/* First read: distance to nearest line */}
          <div className="mt-7 max-w-md">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="eyebrow text-ink-3">Nearest 09:00 reference</span>
              {nearestRead ? (
                <span className="font-mono text-sm text-ink tabular-nums">
                  <span className="font-semibold">{nearestRead.label}</span>
                  <span className="text-ink-4 ml-1.5">{nearestRead.value.toFixed(2)}</span>
                  <span
                    className={`ml-1.5 ${nearestRead.dist >= 0 ? "text-bear-ink" : "text-bull-ink"}`}
                  >
                    ({nearestRead.dist >= 0 ? "+" : ""}
                    {nearestRead.dist.toFixed(2)} pts)
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
                    width: `${Math.max(2, Math.min(100, 100 - Math.abs(nearestRead.dist) * 20))}%`,
                  }}
                  transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  className="absolute inset-y-0 left-0 bg-ink rounded-full"
                />
              </div>
            ) : (
              <span className="block mt-2 text-ink-3 text-[13.5px]">
                No qualifying anchor is active. The channel is using the
                closest 09:00 structural reference until a qualified line arms.
              </span>
            )}
          </div>

          <p className="mt-7 text-[15px] text-ink-2 leading-relaxed max-w-xl">
            {primary ? (
              <span className="block text-ink-3 text-[13.5px]">
                {primary.role === "ANCHOR_2" ? "Anchor 2" : "Primary anchor"} ·
                low <span className="font-mono">{primary.anchorLow.toFixed(2)}</span> ·
                set <span className="font-mono">{anchorTimeLabel(primary)}</span> CT.{" "}
                {/* v9: slope value hidden — proprietary engine
                    parameter. The bands themselves still render
                    using the const above. */}
                Bands offset above and below the anchor; both decay
                through the session.
              </span>
            ) : (
              <span className="block mt-2 text-ink-3 text-[13.5px]">
                A qualified structural confirmation will update this read.
              </span>
            )}
          </p>

          <ExecutionRead items={executionRead} />
        </div>

        <div className="hidden lg:block absolute left-[58.333%] top-7 bottom-7 w-px bg-rule" />

        {/* RIGHT — diagram + stat strip */}
        <div className="col-span-12 lg:col-span-5 p-7 pl-7 bg-paper-2/40 relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="eyebrow text-ink-3">Anchor</span>
              <div className="mt-1.5 text-title font-serif text-ink">
                {primary ? primary.role.replace(/_/g, " ").toLowerCase() : "none today"}
              </div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-ink-3 mb-0.5">Last</div>
              <div className="font-mono text-[18px] font-semibold tabular-nums text-ink" data-num>
                {snap.currentPrice.toFixed(2)}
              </div>
            </div>
          </div>

          <StructurePathChart
            data={buildSpyChannelChart(snap)}
            variant="paper"
            accent={bias === "BULLISH" ? "bull" : bias === "BEARISH" ? "bear" : "gold"}
            height={380}
            title="SPY price vs 09:00 references"
            className="mb-4"
          />

          {primary ? (
            <div className="grid grid-cols-2 gap-2 mb-4">
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
          ) : (
            <div className="mb-4 rounded-soft bg-paper px-3 py-3 shadow-rule">
              <div className="eyebrow text-ink-3 mb-1">Anchor lines today</div>
              <p className="text-[12px] leading-snug text-ink-3">
                No anchor today. Nearest structural line is{" "}
                {nearestStructural
                  ? `${nearestStructural.name} ${entryLineValue(nearestStructural).toFixed(2)} (${nearestStructural.distanceFromPrice >= 0 ? "+" : ""}${nearestStructural.distanceFromPrice.toFixed(2)} pts from LAST).`
                  : "not available yet."}
              </p>
            </div>
          )}

          {primary && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
              <AnchorCell
                label="Primary"
                group={primary}
              />
              <AnchorCell
                label="Anchor 2"
                group={anchor?.anchor2 ?? null}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function synthesisLine(
  snap: AdaptedSnapshot,
  nearestRead: { label: string; dist: number; value: number } | null,
  displayedState: string,
): string {
  const bias = snap.bias.bias.toLowerCase();
  const state = displayedState.replace(/_/g, " ").toLowerCase();
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
        ? `${formatSigned(nearestRead.dist)} pts from LAST ${snap.currentPrice.toFixed(2)}.`
        : "The engine has not returned a qualified 09:00 reference yet.",
      tone: nearestRead && Math.abs(nearestRead.dist) <= 0.5 ? "watch" : "neutral",
    },
    {
      label: "Risk check",
      value: snap.guardrails.chase.status.replace(/_/g, " "),
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

function ExecutionRead({ items }: { items: ExecutionReadItem[] }) {
  return (
    <div className="mt-6 rounded-[14px] border border-rule bg-paper/80 p-4 shadow-rule">
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
  const flip = Number(match[1]);
  if (!Number.isFinite(flip)) return text;
  if (Math.abs(flip - spot) / spot <= 0.12) return text;
  const cleaned = text.replace(gammaFlip, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || "Options context is withheld until the live chain is inside a realistic SPY range.";
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
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
  if (!primary || bars.length < 2) return null;
  const referenceTime = primary.entryReferenceTime ?? bars[0]?.t ?? primary.anchorTime;
  const lines = [
    makeSpyChartLine("Upper ref", entryBandValue(primary.bands.upper), referenceTime, "upper"),
    makeSpyChartLine("Main", entryBandValue(primary.bands.main), referenceTime, "anchor"),
    makeSpyChartLine("Lower ref", entryBandValue(primary.bands.lower), referenceTime, "lower"),
  ].filter((line): line is StructureChartLine => line !== null);
  if (lines.length === 0) return null;
  return { label: "SPY", date: new Date().toISOString().slice(0, 10), bars, lines };
}

function makeSpyChartLine(
  label: string,
  anchorPrice: number | null,
  anchorTime: string,
  tone: StructureChartLine["tone"],
): StructureChartLine | null {
  if (!Number.isFinite(anchorPrice ?? NaN)) return null;
  return {
    label,
    anchorTime,
    anchorPrice: Number(anchorPrice),
    slopePerHour: 0,
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

