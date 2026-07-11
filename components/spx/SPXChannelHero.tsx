"use client";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { SPXSnapshot, SPXScenario, SPXAction, SPXLine } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useState, type KeyboardEvent, type PointerEvent } from "react";

const scenarioLabel: Record<SPXScenario, string> = {
  ABOVE_ASCENDING: "Above both fan ceilings",
  INSIDE_ASCENDING: "Between fan ceilings",
  BELOW_ASCENDING: "Below active structure",
  ABOVE_DESCENDING: "Below both ceilings",
  INSIDE_DESCENDING: "Between fan references",
  BELOW_DESCENDING: "Below deviation floor",
  OUTSIDE_PLAY: "Outside the planned play",
};

const scenarioShort: Record<SPXScenario, string> = {
  ABOVE_ASCENDING: "ABOVE CEILINGS",
  INSIDE_ASCENDING: "BETWEEN CEILINGS",
  BELOW_ASCENDING: "BELOW STRUCTURE",
  ABOVE_DESCENDING: "BELOW CEILINGS",
  INSIDE_DESCENDING: "FAN RANGE",
  BELOW_DESCENDING: "BELOW HIGH FLOOR",
  OUTSIDE_PLAY: "OUTSIDE",
};

const actionToVariant: Record<SPXAction, "confirmed" | "watching" | "stale"> = {
  TAKE: "confirmed",
  SELECTIVE: "watching",
  STAND_DOWN: "stale",
};

const actionLabel: Record<SPXAction, string> = {
  TAKE: "Take",
  SELECTIVE: "Selective",
  STAND_DOWN: "Stand Down",
};

function entryLineValue(line: SPXLine): number {
  return line.entryValue ?? line.currentValue;
}

export function SPXChannelHero({
  snap,
  bars,
}: {
  snap: SPXSnapshot;
  bars?: Array<{ t: string; h: number; l: number; c: number }> | null;
}) {
  const directionTone =
    snap.channel.direction === "ASCENDING"
      ? "text-bull-ink"
      : snap.channel.direction === "DESCENDING"
        ? "text-bear-ink"
        : "text-ink-3";

  // SELECTIVE = gold-tinted hero (mirrors SPY's gold-WAIT semantic).
  const selective = snap.confluence.action === "SELECTIVE";
  const heroBg = selective ? "bg-gold-tint/40" : "bg-paper";

  // Compose right-rail stat strip values
  const majorHighDesc =
    snap.lines.find((l) => l.kind === "PREV_RTH_HIGH_DESC") ??
    snap.lines.find((l) => l.kind === "SWING_HIGH_DESC");
  const lowDesc = snap.lines.find((l) => l.kind === "PREV_RTH_LOW_DESC");
  const activePair = [majorHighDesc, lowDesc]
    .filter((line): line is NonNullable<typeof line> => Boolean(line))
    .sort((a, b) => entryLineValue(a) - entryLineValue(b));
  const lowerLine = activePair[0] ?? null;
  const upperLine = activePair[1] ?? null;
  const activeGap =
    lowerLine && upperLine ? entryLineValue(upperLine) - entryLineValue(lowerLine) : null;
  const distToUpper = upperLine ? entryLineValue(upperLine) - snap.price.last : null;
  const distToLower = lowerLine ? snap.price.last - entryLineValue(lowerLine) : null;
  const deviationFan = snap.descendingDeviationFan ?? null;
  const zoneLower = deviationFan?.zone.lowerLine
    ? deviationFan.lines.find((line) => line.label === deviationFan.zone.lowerLine)
    : null;
  const zoneUpper = deviationFan?.zone.upperLine
    ? deviationFan.lines.find((line) => line.label === deviationFan.zone.upperLine)
    : null;
  const zoneWidth =
    zoneLower && zoneUpper
      ? Math.abs(zoneUpper.value - zoneLower.value)
      : deviationFan?.spacing ?? null;
  const distanceToZoneCeiling = zoneUpper ? zoneUpper.value - snap.price.last : null;
  const distanceToZoneFloor = zoneLower ? snap.price.last - zoneLower.value : null;
  const heroTitle = deviationFan ? deviationFan.zone.label : scenarioLabel[snap.scenario];
  const heroChip = deviationFan ? "CONTROL ROOM" : scenarioShort[snap.scenario];

  return (
    <Card
      className={`relative overflow-hidden ${heroBg}`}
    >
      {/* SPX violet signature - left edge */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet/55" />
      {/* hairline top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rule to-transparent" />

      <div className="grid grid-cols-12 gap-0">
        {/* LEFT - scenario + action */}
        <div className="col-span-12 lg:col-span-5 p-5 sm:p-7 lg:pr-6 lg:pl-8 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="eyebrow text-ink-3">ES Control Room</span>
              {/* v9: slope value hidden - proprietary engine
                  parameter, not for surface display. */}
              <span className="text-[10px] text-ink-4 font-mono">
                Session {snap.sessionDateCT}
              </span>
            </div>
            <StatusPill variant={actionToVariant[snap.confluence.action]} pulse>
              {actionLabel[snap.confluence.action]}
            </StatusPill>
          </div>

          {/* Headline: human label promoted, short tag demoted to chip */}
          <div className="mt-6 flex items-end gap-4">
            <DirectionGlyph direction={snap.channel.direction} tone={directionTone} />
            <AnimatePresence mode="wait">
              <motion.h1
                key={heroTitle}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                className={`text-display font-serif tracking-tight ${directionTone} leading-[1.02]`}
              >
                {heroTitle}
              </motion.h1>
            </AnimatePresence>
          </div>

          <div className="mt-3 inline-flex items-center gap-2 px-2 py-0.5 rounded-pill bg-paper-2 shadow-rule">
            <span className="font-mono text-[10px] tracking-[0.14em] text-ink-2 font-semibold">
              {heroChip}
            </span>
          </div>

          {/* confluence score bar */}
          <div className="mt-7 max-w-md">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="eyebrow text-ink-3">Confluence</span>
              <span className="font-mono text-sm text-ink tabular-nums">
                <span className="font-semibold">{snap.confluence.score}</span>
                <span className="text-ink-4">/100</span>
              </span>
            </div>
            <div className="relative h-1 bg-paper-2 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${snap.confluence.score}%` }}
                transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                className="absolute inset-y-0 left-0 bg-ink rounded-full"
              />
              {[50, 70].map((t) => (
                <span
                  key={t}
                  className="absolute top-0 h-full w-px bg-paper"
                  style={{ left: `${t}%` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] text-ink-4 tabular-nums">
              <span>0 STAND</span>
              <span>50 SELECTIVE</span>
              <span>70 TAKE</span>
              <span>100</span>
            </div>
          </div>

          {/* Single combined paragraph - fan explanation followed by the
              pivot context as a leader sentence. The previous
              version stacked two italic blocks which read as sentimental. */}
          <p className="mt-7 text-[15px] text-ink-2 leading-relaxed max-w-xl">
            {deviationFan
              ? `The Control Line is projected from the prior RTH high anchor into the entry read, then the ${deviationFan.spacing.toFixed(0)}-point gates define the working edges. Direction comes from opening position and confirmed touch-and-close behavior.`
              : snap.fanRead?.summary ?? snap.scenarioExplanation}
            {!deviationFan && <span className="text-ink-3 ml-1.5">{snap.channel.reason}</span>}
          </p>
          {(deviationFan || snap.rthBias) && (
            <div className="mt-4 rounded-[12px] border border-rule bg-paper-2/65 px-3 py-3">
              <div className="eyebrow text-ink-3">RTH posture</div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                {deviationFan?.openBias.note ?? snap.rthBias?.note}
              </p>
            </div>
          )}
        </div>

        {/* vertical rule */}
        <div className="hidden lg:block absolute left-[41.666%] top-7 bottom-7 w-px bg-rule" />

        {/* RIGHT - diagram + stat strip (rebalanced) */}
        <div className="col-span-12 lg:col-span-7 p-5 sm:p-7 lg:pl-7 bg-paper-2/40 relative">
          <div className="flex items-start justify-between mb-4">
            <div>
            <span className="eyebrow text-ink-3">Control Room read</span>
              <div className="mt-1.5 text-title font-serif text-ink">
                {deviationFan?.zone.label ?? snap.fanRead?.label ?? (snap.channel.direction === "NONE" ? "Resolving" : "Mapped")}
              </div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-ink-3 mb-0.5">Last</div>
              <div
                className="font-mono text-[18px] font-semibold tabular-nums text-ink"
                data-num
              >
                {snap.price.last.toFixed(2)}
              </div>
              <div
                className={`font-mono text-[11px] tabular-nums ${snap.price.change >= 0 ? "text-bull-ink" : "text-bear-ink"}`}
                data-num
              >
                {snap.price.change >= 0 ? "+" : ""}
                {snap.price.change.toFixed(2)} ({snap.price.changePct.toFixed(2)}
                %)
              </div>
            </div>
          </div>

          {/* 3-stat band - gives the right rail visual gravity */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <RailStat
              label="Zone width"
              value={zoneWidth !== null ? `${zoneWidth.toFixed(2)}` : activeGap !== null ? `${activeGap.toFixed(2)}` : "-"}
              suffix="pts"
            />
            <RailStat
              label="To ceiling"
              value={distanceToZoneCeiling !== null ? distanceToZoneCeiling.toFixed(2) : distToUpper !== null ? distToUpper.toFixed(2) : "-"}
              tone={
                (distanceToZoneCeiling ?? distToUpper) !== null && (distanceToZoneCeiling ?? distToUpper)! >= 0 ? "bear" : "bull"
              }
              suffix="pts"
            />
            <RailStat
              label="To floor"
              value={distanceToZoneFloor !== null ? distanceToZoneFloor.toFixed(2) : distToLower !== null ? distToLower.toFixed(2) : "-"}
              tone={(distanceToZoneFloor ?? distToLower) !== null && (distanceToZoneFloor ?? distToLower)! >= 0 ? "bull" : "bear"}
              suffix="pts"
            />
          </div>

          <FanDiagram snap={snap} bars={bars ?? null} />

          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <Anchor
              label="Overnight High"
              value={snap.overnight.high.price}
              time={snap.overnight.high.time}
            />
            <Anchor
              label="Overnight Low"
              value={snap.overnight.low.price}
              time={snap.overnight.low.time}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function DirectionGlyph({
  direction,
  tone,
}: {
  direction: "ASCENDING" | "DESCENDING" | "NONE";
  tone: string;
}) {
  const Icon =
    direction === "ASCENDING"
      ? ArrowUpRight
      : direction === "DESCENDING"
        ? ArrowDownRight
        : Minus;
  return <Icon className={`${tone} -mb-2`} size={36} strokeWidth={1.25} />;
}

function RailStat({
  label,
  value,
  suffix,
  tone = "ink",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const cls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : "text-ink";
  const isBlank = value === "-";
  return (
    <div
      className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule"
      title={
        isBlank
          ? "These populate once the overnight swing closes and previous RTH references are available."
          : undefined
      }
    >
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${cls}`}
          data-num
        >
          {value}
        </span>
        {suffix && (
          <span className="font-mono text-[9px] text-ink-4">{suffix}</span>
        )}
      </div>
      {isBlank && (
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-4">
          Pending
        </div>
      )}
    </div>
  );
}

function Anchor({
  label,
  value,
  time,
}: {
  label: string;
  value: number;
  time: string;
}) {
  const t = new Date(time);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return (
    <div className="px-2.5 py-1.5 rounded-soft bg-paper shadow-rule">
      <div className="eyebrow text-ink-3 mb-0.5">{label}</div>
      <div className="flex items-baseline justify-between">
        <span
          className="font-mono text-sm font-semibold tabular-nums text-ink"
          data-num
        >
          {value.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {hh}:{mm} CT
        </span>
      </div>
    </div>
  );
}

// ---------- Diagram ----------

function FanDiagram({
  snap,
  bars,
}: {
  snap: SPXSnapshot;
  bars: Array<{ t: string; h: number; l: number; c: number }> | null;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedDeviationHour, setSelectedDeviationHour] = useState(9);
  const W = 760;
  const H = 460;
  const PAD_L = 54;
  const PAD_R = 170;
  const PAD_T = 30;
  const PAD_B = 44;

  const cleanBars = (bars ?? [])
    .filter(
      (bar) =>
        !!bar.t &&
        Number.isFinite(bar.h) &&
        Number.isFinite(bar.l) &&
        Number.isFinite(bar.c),
    )
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (cleanBars.length > 0 && Number.isFinite(snap.price.last)) {
    const last = cleanBars[cleanBars.length - 1];
    cleanBars[cleanBars.length - 1] = {
      ...last,
      h: Math.max(last.h, snap.price.last),
      l: Math.min(last.l, snap.price.last),
      c: snap.price.last,
    };
  }
  const t0 = cleanBars[0]?.t
    ? new Date(cleanBars[0].t).getTime()
    : new Date(snap.overnight.window.start).getTime();
  const tNow = new Date(snap.asOf).getTime();
  const baseEnd = cleanBars.at(-1)?.t
    ? new Date(cleanBars.at(-1)!.t).getTime()
    : tNow + 60 * 60 * 1000;
  const deviationFan = snap.descendingDeviationFan ?? null;
  const deviationEnd = deviationFan ? Date.parse(deviationFan.extensionEnd) : Number.NaN;
  const tEnd = Number.isFinite(deviationEnd) ? Math.max(baseEnd, deviationEnd) : baseEnd;

  const ceiling =
    snap.lines.find((l) => l.kind === "PREV_RTH_HIGH_DESC") ??
    snap.lines.find((l) => l.kind === "SWING_HIGH_DESC");
  const floor =
    snap.lines.find((l) => l.kind === "PREV_RTH_LOW_DESC") ??
    snap.lines.find((l) => l.kind === "SWING_LOW_ASC");

  const deviationOverlayLines = deviationFan
    ? deviationFan.lines
        .slice()
        .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))
        .slice(0, 7)
        .sort((a, b) => b.currentValue - a.currentValue)
    : [];
  const deviationValueAtHour = (
    line: (typeof deviationOverlayLines)[number],
    hour: number,
  ) => line.value + (deviationFan?.slopePerHour ?? -1.00) * (hour - 9);

  const yPoints: number[] = [snap.price.last];
  for (const bar of cleanBars) yPoints.push(bar.h, bar.l, bar.c);
  if (!deviationFan) {
    for (const line of snap.lines) yPoints.push(entryLineValue(line), line.currentValue, line.anchorPrice);
  }
  for (const line of deviationOverlayLines) {
    yPoints.push(
      deviationValueAtHour(line, 8),
      line.value,
      deviationValueAtHour(line, selectedDeviationHour),
      deviationValueAtHour(line, 14),
    );
  }
  if (deviationFan) yPoints.push(deviationFan.anchor.price);
  let yMin = Math.min(...yPoints);
  let yMax = Math.max(...yPoints);
  const pad = (yMax - yMin) * 0.12 || 4;
  yMin -= pad;
  yMax += pad;

  const xOf = (t: number) =>
    PAD_L + ((t - t0) / (tEnd - t0)) * (W - PAD_L - PAD_R);
  const yOf = (p: number) =>
    PAD_T + (1 - (p - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);
  const pricePath = cleanBars
    .map((bar, index) => {
      const ms = Date.parse(bar.t);
      return `${index === 0 ? "M" : "L"} ${xOf(ms).toFixed(1)},${yOf(bar.c).toFixed(1)}`;
    })
    .join(" ");
  const selectedIndex = activeIndex ?? Math.max(0, cleanBars.length - 1);
  const selected = cleanBars[Math.max(0, Math.min(cleanBars.length - 1, selectedIndex))] ?? null;

  const projectAt = (
    anchorPrice: number,
    anchorTime: string,
    slope: number,
    t: number,
  ) => {
    const dh = (t - new Date(anchorTime).getTime()) / 3_600_000;
    return anchorPrice + slope * dh;
  };

  const ascending = snap.channel.direction === "ASCENDING";
  const railColor = ascending ? "#0E7C50" : "#B5301E";
  const railFill = ascending ? "rgba(14,124,80,0.09)" : "rgba(181,48,30,0.09)";
  let bandPath = "";
  if (ceiling && floor && snap.channel.direction !== "NONE") {
    const tCeilStart = new Date(ceiling.anchorTime).getTime();
    const tFloorStart = new Date(floor.anchorTime).getTime();
    const tBandStart = Math.max(tCeilStart, tFloorStart);
    const cStart = projectAt(
      ceiling.anchorPrice,
      ceiling.anchorTime,
      ceiling.slopePerHour,
      tBandStart,
    );
    const fStart = projectAt(
      floor.anchorPrice,
      floor.anchorTime,
      floor.slopePerHour,
      tBandStart,
    );
    const cEnd = projectAt(
      ceiling.anchorPrice,
      ceiling.anchorTime,
      ceiling.slopePerHour,
      tEnd,
    );
    const fEnd = projectAt(
      floor.anchorPrice,
      floor.anchorTime,
      floor.slopePerHour,
      tEnd,
    );
    bandPath =
      `M ${xOf(tBandStart)},${yOf(cStart)} ` +
      `L ${xOf(tEnd)},${yOf(cEnd)} ` +
      `L ${xOf(tEnd)},${yOf(fEnd)} ` +
      `L ${xOf(tBandStart)},${yOf(fStart)} Z`;
  }

  const xNow = Math.max(PAD_L, Math.min(W - PAD_R, xOf(Math.min(Math.max(tNow, t0), tEnd))));
  const yPrice = yOf(snap.price.last);
  const selectedMs = selected ? Date.parse(selected.t) : tNow;
  const selectedX = Math.max(PAD_L, Math.min(W - PAD_R, xOf(selectedMs)));
  const selectedPrice = selected?.c ?? snap.price.last;
  const selectedY = yOf(selectedPrice);
  const selectedLine = deviationFan
    ? null
    : snap.lines
        .slice()
        .sort(
          (a, b) =>
            Math.abs(projectAt(a.anchorPrice, a.anchorTime, a.slopePerHour, selectedMs) - selectedPrice) -
            Math.abs(projectAt(b.anchorPrice, b.anchorTime, b.slopePerHour, selectedMs) - selectedPrice),
        )[0];
  const selectedLineValue = selectedLine
    ? projectAt(selectedLine.anchorPrice, selectedLine.anchorTime, selectedLine.slopePerHour, selectedMs)
    : null;
  const tooltipX = Math.min(W - PAD_R - 118, Math.max(PAD_L + 4, selectedX + 10));
  const tooltipY = Math.min(H - PAD_B - 56, Math.max(PAD_T + 4, selectedY - 32));

  const rthOpen = new Date(snap.sessionDateCT + "T08:30:00-05:00").getTime();
  const xRTH = xOf(rthOpen);
  const deviationWindow =
    deviationFan &&
    Number.isFinite(Date.parse(deviationFan.windowStart)) &&
    Number.isFinite(Date.parse(deviationFan.windowEnd)) &&
    Number.isFinite(Date.parse(deviationFan.extensionEnd))
      ? {
          start: Date.parse(deviationFan.windowStart),
          entry: Date.parse(deviationFan.entryReferenceTime),
          primaryEnd: Date.parse(deviationFan.windowEnd),
          extensionEnd: Date.parse(deviationFan.extensionEnd),
        }
      : null;
  const deviationHours = deviationWindow ? [8, 9, 10, 11, 12, 13, 14] : [];
  const selectedDeviationTime = deviationWindow
    ? deviationWindow.entry + (selectedDeviationHour - 9) * 3_600_000
    : null;
  const selectedDeviationPriceRead = deviationHourPrice(
    selectedDeviationHour,
    snap.sessionDateCT,
    deviationFan,
    cleanBars,
  );
  const selectedDeviationPrice = selectedDeviationPriceRead?.value ?? snap.price.last;
  const selectedDeviationX =
    selectedDeviationTime !== null
      ? Math.max(PAD_L, Math.min(W - PAD_R, xOf(selectedDeviationTime)))
      : null;
  const deviationLensLines = deviationOverlayLines
    .map((line) => {
      const selectedValue = deviationValueAtHour(line, selectedDeviationHour);
      return {
        ...line,
        selectedValue,
        selectedDistance: selectedValue - selectedDeviationPrice,
      };
    })
    .sort((a, b) => b.selectedValue - a.selectedValue);
  const deviationLensNearest = deviationLensLines
    .slice()
    .sort((a, b) => Math.abs(a.selectedDistance) - Math.abs(b.selectedDistance))
    .slice(0, 3);
  const selectedDeviationZone = describeDeviationLensZone(
    deviationLensLines,
    selectedDeviationPrice,
  );
  const activeZoneLower = deviationFan?.zone.lowerLine
    ? deviationOverlayLines.find((line) => line.label === deviationFan.zone.lowerLine) ?? null
    : null;
  const activeZoneUpper = deviationFan?.zone.upperLine
    ? deviationOverlayLines.find((line) => line.label === deviationFan.zone.upperLine) ?? null
    : null;
  const selectedDeviationWindowLabel = deviationHourWindowLabel(selectedDeviationHour);
  const lineLabels = distributeEsChartLabels(
    snap.lines.map((line) => {
      const endValue = projectAt(line.anchorPrice, line.anchorTime, line.slopePerHour, tEnd);
      return {
        key: line.kind,
        code: lineCode(line.kind),
        value: entryLineValue(line),
        endValue,
        y: yOf(endValue),
        color: lineStroke(line.kind),
      };
    }),
    PAD_T + 16,
    H - PAD_B - 16,
  );
  const currentPriceLabelY = avoidEsPriceLabelY(
    yPrice - 14,
    [
      ...lineLabels.map((label) => label.labelY - 12),
      ...deviationLensNearest.map((line) => yOf(line.selectedValue) - 10),
    ],
    PAD_T + 2,
    H - PAD_B - 24,
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full spx-diagram"
        tabIndex={0}
        role="img"
        aria-label="ES Control Room chart showing the session Control Line, gate map, and current price"
        onPointerMove={(event) => {
          setActiveIndex(nearestEsBarIndexFromPointer(event, cleanBars, W, PAD_L, W - PAD_R, xOf));
        }}
        onPointerLeave={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex((value) => value ?? Math.max(0, cleanBars.length - 1))}
        onKeyDown={(event) => {
          setActiveIndex((value) => stepEsIndex(event, value ?? Math.max(0, cleanBars.length - 1), cleanBars.length));
        }}
      >
      <style>{spxDiagramStyles}</style>
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

      {/* RTH open vertical marker */}
      {xRTH > PAD_L && xRTH < W - PAD_R && (
        <>
          <line
            x1={xRTH}
            y1={PAD_T}
            x2={xRTH}
            y2={H - PAD_B}
            stroke="#D4CBB6"
            strokeWidth={0.8}
            strokeDasharray="3 3"
          />
          <text
            x={xRTH + 3}
            y={PAD_T + 8}
            fontSize="7.5"
            fontFamily="var(--font-geist-mono)"
            fill="#9CA3AF"
            letterSpacing="0.08em"
          >
            RTH
          </text>
        </>
      )}

      {/* fan fill */}
      {snap.channel.direction === "NONE" && (
        <g className="spx-ghost-channel">
          <path
            d={`M ${PAD_L},${PAD_T + 58} L ${W - PAD_R},${PAD_T + 42} L ${W - PAD_R},${H - PAD_B - 42} L ${PAD_L},${H - PAD_B - 58} Z`}
            fill="rgba(20,22,26,0.045)"
            stroke="#D4CBB6"
            strokeWidth={0.8}
            strokeDasharray="4 4"
          />
          <line
            x1={PAD_L}
            y1={H / 2}
            x2={W - PAD_R}
            y2={H / 2}
            stroke="#D4CBB6"
            strokeWidth={0.7}
            strokeDasharray="2 5"
          />
          <text
            x={PAD_L + 6}
            y={PAD_T + 20}
            fontSize="8.5"
            fontFamily="var(--font-geist-mono)"
            fill="#5A5A5A"
            letterSpacing="0.08em"
          >
            CONTROL MAP AWAITS RTH ANCHOR
          </text>
        </g>
      )}
      {!deviationFan && bandPath && <path d={bandPath} fill={railFill} className="spx-band" />}

      {/* ES gate map: sloped levels with a selectable hour lens. */}
      {deviationWindow && (
        <g className="spx-deviation-ladder" aria-label="ES Control Map gates">
          <rect
            x={Math.max(PAD_L, xOf(deviationWindow.start))}
            y={PAD_T}
            width={Math.max(0, Math.min(W - PAD_R, xOf(deviationWindow.primaryEnd)) - Math.max(PAD_L, xOf(deviationWindow.start)))}
            height={H - PAD_T - PAD_B}
            fill="rgba(184,134,11,0.035)"
          />
          <rect
            x={Math.max(PAD_L, xOf(deviationWindow.primaryEnd))}
            y={PAD_T}
            width={Math.max(0, Math.min(W - PAD_R, xOf(deviationWindow.extensionEnd)) - Math.max(PAD_L, xOf(deviationWindow.primaryEnd)))}
            height={H - PAD_T - PAD_B}
            fill="rgba(184,134,11,0.018)"
          />
          {activeZoneLower && activeZoneUpper && (
            <motion.path
              d={[
                `M ${Math.max(PAD_L, xOf(deviationWindow.start))},${yOf(deviationValueAtHour(activeZoneUpper, 8))}`,
                `L ${Math.min(W - PAD_R, xOf(deviationWindow.extensionEnd))},${yOf(deviationValueAtHour(activeZoneUpper, 14))}`,
                `L ${Math.min(W - PAD_R, xOf(deviationWindow.extensionEnd))},${yOf(deviationValueAtHour(activeZoneLower, 14))}`,
                `L ${Math.max(PAD_L, xOf(deviationWindow.start))},${yOf(deviationValueAtHour(activeZoneLower, 8))}`,
                "Z",
              ].join(" ")}
              fill="rgba(184,130,31,0.105)"
              stroke="#B8860B"
              strokeOpacity={0.18}
              strokeWidth={0.8}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.36 }}
            />
          )}
          <g aria-label="Control Room entry marker">
            <line
              x1={xOf(deviationWindow.entry)}
              y1={PAD_T}
              x2={xOf(deviationWindow.entry)}
              y2={H - PAD_B}
              stroke="#14161A"
              strokeWidth={0.9}
              strokeDasharray="5 4"
              opacity={0.44}
            />
            <rect
              x={Math.max(PAD_L + 4, Math.min(W - PAD_R - 98, xOf(deviationWindow.entry) - 48))}
              y={PAD_T + 30}
              width="96"
              height="18"
              rx="7"
              fill="#FFFDF7"
              stroke="#14161A"
              strokeOpacity={0.16}
            />
            <text
              x={Math.max(PAD_L + 52, Math.min(W - PAD_R - 50, xOf(deviationWindow.entry)))}
              y={PAD_T + 42.5}
              fontSize="7.5"
              fontFamily="var(--font-geist-mono)"
              fontWeight="800"
              fill="#14161A"
              textAnchor="middle"
              letterSpacing="0.06em"
            >
              CONTROL ROOM
            </text>
          </g>
          {deviationOverlayLines.map((line) => {
            const color = line.isMain ? "#14161A" : "#B8860B";
            const strokeWidth = line.isMain ? 2.15 : 1.25;
            const anchorMs = deviationFan ? Date.parse(deviationFan.anchor.time) : Number.NaN;
            const startsAtAnchor = line.isMain && Number.isFinite(anchorMs);
            const xStart = startsAtAnchor
              ? Math.max(PAD_L, xOf(anchorMs))
              : Math.max(PAD_L, xOf(deviationWindow.start));
            const xPrimaryEnd = Math.min(W - PAD_R, xOf(deviationWindow.primaryEnd));
            const xExtensionEnd = Math.min(W - PAD_R, xOf(deviationWindow.extensionEnd));
            const yStart = startsAtAnchor && deviationFan
              ? yOf(deviationFan.anchor.price)
              : yOf(deviationValueAtHour(line, 8));
            const yPrimaryEnd = yOf(deviationValueAtHour(line, 12));
            const yExtensionEnd = yOf(deviationValueAtHour(line, 14));
            return (
              <g key={`dev-${line.index}`}>
                {startsAtAnchor && deviationFan && (
                  <g className="spx-anchor">
                    <circle
                      cx={xStart}
                      cy={yStart}
                      r={9}
                      fill={color}
                      opacity={0}
                      className="spx-anchor-pulse"
                    />
                    <circle
                      cx={xStart}
                      cy={yStart}
                      r={3.8}
                      fill="#FFFDF7"
                      stroke={color}
                      strokeWidth={1.5}
                    />
                  </g>
                )}
                <line
                  x1={xStart}
                  x2={xPrimaryEnd}
                  y1={yStart}
                  y2={yPrimaryEnd}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  opacity={line.isMain ? 0.92 : 0.64}
                  className="spx-ref-line"
                />
                <line
                  x1={xPrimaryEnd}
                  x2={xExtensionEnd}
                  y1={yPrimaryEnd}
                  y2={yExtensionEnd}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray="3 5"
                  opacity={line.isMain ? 0.58 : 0.38}
                />
              </g>
            );
          })}
          {selectedDeviationX !== null && (
            <motion.g
              key={`lens-${selectedDeviationHour}`}
              initial={{ opacity: 0.64 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <motion.line
                x1={selectedDeviationX}
                y1={PAD_T}
                x2={selectedDeviationX}
                y2={H - PAD_B}
                stroke="#B8860B"
                strokeWidth={1.1}
                strokeDasharray="4 4"
                opacity={0.86}
                initial={false}
                animate={{ x1: selectedDeviationX, x2: selectedDeviationX }}
                transition={{ duration: 0.46, ease: [0.2, 0.8, 0.2, 1] }}
              />
              <rect
                x={Math.max(PAD_L + 4, Math.min(W - PAD_R - 58, selectedDeviationX - 27))}
                y={PAD_T + 8}
                width="54"
                height="18"
                rx="7"
                fill="#14161A"
              />
              <text
                x={Math.max(PAD_L + 31, Math.min(W - PAD_R - 31, selectedDeviationX))}
                y={PAD_T + 20.5}
                fontSize="8"
                fontFamily="var(--font-geist-mono)"
                fontWeight="800"
                fill="#FFFDF7"
                textAnchor="middle"
              >
                {formatHourLabel(selectedDeviationHour)}
              </text>
              {deviationLensNearest.map((line, index) => {
                const y = yOf(line.selectedValue);
                const color = line.isMain ? "#14161A" : "#B8860B";
                const labelX = Math.min(W - PAD_R - 5, selectedDeviationX + 12 + index * 9);
                return (
                  <motion.g
                    key={`dev-lens-${line.index}`}
                    initial={{ opacity: 0, scale: 0.72 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.32, delay: index * 0.04 }}
                  >
                    <circle
                      cx={selectedDeviationX}
                      cy={y}
                      r={line.isMain ? 8.5 : 7}
                      fill={color}
                      opacity={0.08}
                    />
                    <circle
                      cx={selectedDeviationX}
                      cy={y}
                      r={line.isMain ? 4.1 : 3.5}
                      fill="#FFFDF7"
                      stroke={color}
                      strokeWidth={1.4}
                    />
                    <path
                      d={`M ${selectedDeviationX + 5},${y} L ${labelX},${y}`}
                      stroke={color}
                      strokeOpacity={0.38}
                      strokeWidth={0.7}
                    />
                    <rect
                      x={labelX}
                      y={y - 10}
                      width="74"
                      height="20"
                      rx="6"
                      fill="#FFFDF7"
                      stroke={color}
                      strokeOpacity={0.24}
                    />
                    <text
                      x={labelX + 7}
                      y={y + 3}
                      fontSize="7.6"
                      fontFamily="var(--font-geist-mono)"
                      fontWeight="800"
                      fill={color}
                    >
                      {line.label} {line.selectedValue.toFixed(0)}
                    </text>
                  </motion.g>
                );
              })}
              <text
                x={Math.max(PAD_L + 6, Math.min(W - PAD_R - 72, selectedDeviationX + 4))}
                y={H - PAD_B - 6}
                fontSize="7.5"
                fontFamily="var(--font-geist-mono)"
                fontWeight="800"
                fill="#8A6117"
                letterSpacing="0.08em"
              >
                {selectedDeviationWindowLabel.toUpperCase()}
              </text>
            </motion.g>
          )}
          {deviationFan && (
            <g aria-label="Opening bias read">
              <rect
                x={PAD_L + 8}
                y={PAD_T + 8}
                width="176"
                height="28"
                rx="8"
                fill="#FFFDF7"
                stroke={deviationFan.openBias.direction === "BULLISH" ? "#0E7C50" : deviationFan.openBias.direction === "BEARISH" ? "#B5301E" : "#B8860B"}
                strokeOpacity={0.26}
              />
              <text
                x={PAD_L + 18}
                y={PAD_T + 20}
                fontSize="7"
                fontFamily="var(--font-geist-mono)"
                fontWeight="800"
                fill="#5A5A5A"
                letterSpacing="0.08em"
              >
                OPEN BIAS
              </text>
              <text
                x={PAD_L + 18}
                y={PAD_T + 31}
                fontSize="9"
                fontFamily="var(--font-geist-mono)"
                fontWeight="800"
                fill={deviationFan.openBias.direction === "BULLISH" ? "#0E7C50" : deviationFan.openBias.direction === "BEARISH" ? "#B5301E" : "#8A6117"}
              >
                {deviationFan.openBias.direction === "PENDING"
                  ? "WAITING FOR 8:30 OPEN"
                  : `${deviationFan.openBias.direction} UNTIL MAIN FLIP`}
              </text>
            </g>
          )}
        </g>
      )}

      {/* ES Pivot Fan lines with exact projected values */}
      {!deviationFan && snap.lines.map((line, index) => {
        const start = new Date(line.anchorTime).getTime();
        const endValue = projectAt(line.anchorPrice, line.anchorTime, line.slopePerHour, tEnd);
        const entryValue = entryLineValue(line);
        const entryTime = line.entryReferenceTime ? new Date(line.entryReferenceTime).getTime() : null;
        const color = lineStroke(line.kind);
        const label = lineLabels.find((item) => item.key === line.kind);
        return (
          <g key={line.kind}>
            <path
              d={`M ${xOf(start)},${yOf(line.anchorPrice)} L ${xOf(tEnd)},${yOf(endValue)}`}
              stroke={color}
              strokeWidth={line.kind === "PREV_RTH_HIGH_DESC" || line.kind === "PREV_RTH_LOW_DESC" ? 1.7 : 1.05}
              strokeDasharray={line.kind.startsWith("PREV_RTH") ? "5 5" : line.slopePerHour > 0 ? "2 4" : undefined}
              fill="none"
              opacity={line.kind.startsWith("PREV_RTH") ? 0.82 : 0.9}
              className={index % 2 === 0 ? "spx-rail" : "spx-rail spx-rail-delayed"}
              pathLength={1}
            />
            {label && (
              <g className="spx-line-label">
                <path
                  d={`M ${W - PAD_R},${yOf(endValue)} L ${W - PAD_R + 10},${label.labelY}`}
                  stroke={color}
                  strokeWidth={0.7}
                  strokeOpacity={0.44}
                  fill="none"
                />
                <rect
                  x={W - PAD_R + 12}
                  y={label.labelY - 12}
                  width="132"
                  height="24"
                  rx="6"
                  fill="#FFFDF7"
                  stroke={color}
                  strokeOpacity="0.28"
                />
                <text
                  x={W - PAD_R + 20}
                  y={label.labelY - 2}
                  fontSize="8"
                  fontFamily="var(--font-geist-mono)"
                  fontWeight="800"
                  fill={color}
                  letterSpacing="0.05em"
                >
                  {label.code}
                </text>
                <text
                  x={W - PAD_R + 20}
                  y={label.labelY + 9}
                  fontSize="9.5"
                  fontFamily="var(--font-geist-mono)"
                  fontWeight="700"
                  fill="#14161A"
                >
                  08 {label.value.toFixed(2)}
                </text>
              </g>
            )}
            {entryTime !== null && entryTime >= t0 && entryTime <= tEnd && (
              <g>
                <circle
                  cx={xOf(entryTime)}
                  cy={yOf(entryValue)}
                  r={3.2}
                  fill="#FFFDF7"
                  stroke={color}
                  strokeWidth={1.2}
                />
              </g>
            )}
          </g>
        );
      })}

      {pricePath && (
        <path
          d={pricePath}
          stroke="#14161A"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="spx-price-path"
          pathLength={1}
        />
      )}
      {selected && (
        <g className="spx-hover">
          <line
            x1={selectedX}
            x2={selectedX}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="#14161A"
            strokeWidth={0.7}
            strokeDasharray="3 4"
            opacity={0.5}
          />
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={selectedY}
            y2={selectedY}
            stroke="#14161A"
            strokeWidth={0.55}
            strokeDasharray="2 5"
            opacity={0.35}
          />
          <circle
            cx={selectedX}
            cy={selectedY}
            r={4.1}
            fill="#14161A"
            stroke="#FFFDF7"
            strokeWidth={1.2}
          />
          <g transform={`translate(${tooltipX},${tooltipY})`}>
            <rect
              width="116"
              height="52"
              rx="7"
              fill="#FFFDF7"
              stroke="#D6CCB7"
              filter="drop-shadow(0 8px 16px rgba(20,22,26,0.12))"
            />
            <text x="8" y="12" fontSize="7" fontFamily="var(--font-geist-mono)" fontWeight="700" fill="#5A5A5A">
              {formatChartTime(selected.t)}
            </text>
            <text x="8" y="28" fontSize="12" fontFamily="var(--font-geist-mono)" fontWeight="800" fill="#14161A">
              {selectedPrice.toFixed(2)}
            </text>
            {selectedLine && selectedLineValue !== null && (
              <text x="8" y="44" fontSize="7.4" fontFamily="var(--font-geist-mono)" fill={lineStroke(selectedLine.kind)}>
                {lineCode(selectedLine.kind)} {selectedLineValue.toFixed(2)}
              </text>
            )}
          </g>
        </g>
      )}

      {/* anchor dots */}
      {!deviationFan && ceiling && snap.channel.direction !== "NONE" && (
        <g className="spx-anchor">
          <circle
            cx={xOf(new Date(ceiling.anchorTime).getTime())}
            cy={yOf(ceiling.anchorPrice)}
            r={9}
            fill={railColor}
            opacity={0}
            className="spx-anchor-pulse"
          />
          <circle
            cx={xOf(new Date(ceiling.anchorTime).getTime())}
            cy={yOf(ceiling.anchorPrice)}
            r={3}
            fill="#fff"
            stroke={railColor}
            strokeWidth={1.5}
          />
        </g>
      )}
      {!deviationFan && floor && snap.channel.direction !== "NONE" && (
        <g className="spx-anchor spx-anchor-delayed">
          <circle
            cx={xOf(new Date(floor.anchorTime).getTime())}
            cy={yOf(floor.anchorPrice)}
            r={9}
            fill={railColor}
            opacity={0}
            className="spx-anchor-pulse"
          />
          <circle
            cx={xOf(new Date(floor.anchorTime).getTime())}
            cy={yOf(floor.anchorPrice)}
            r={3}
            fill="#fff"
            stroke={railColor}
            strokeWidth={1.5}
          />
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
        className="spx-price-line"
      />
      <g className="spx-price-marker">
        <circle cx={xNow} cy={yPrice} r={4.5} fill="#14161A" />
        <circle cx={xNow} cy={yPrice} r={8} fill="#14161A" opacity={0.12} className="spx-price-halo" />
        <rect
          x={Math.min(W - PAD_R - 96, xNow + 8)}
          y={currentPriceLabelY}
          width="88"
          height="22"
          rx="6"
          fill="#FFFDF7"
          stroke="#D6CCB7"
        />
        <text
          x={Math.min(W - PAD_R - 52, xNow + 52)}
          y={currentPriceLabelY + 15}
          fontSize="9.5"
          fontFamily="var(--font-geist-mono)"
          fill="#14161A"
          textAnchor="middle"
        >
          LAST {snap.price.last.toFixed(2)}
        </text>
      </g>

      </svg>

      {deviationWindow && (
        <div className="mt-3 rounded-[10px] border border-rule bg-paper/82 px-3 py-3 shadow-rule">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow text-ink-3">Control Room time lens</div>
              <div className="mt-1 font-serif text-[18px] leading-tight text-ink">
                {selectedDeviationZone.label}
              </div>
            </div>
            <div className="rounded-[8px] border border-rule bg-paper-2 px-2.5 py-1.5 text-right">
              <div className="font-mono text-[10px] uppercase text-ink-3">
                {selectedDeviationWindowLabel}
              </div>
              <div className="font-mono text-[13px] font-semibold tabular-nums text-ink">
                {formatHourLabel(selectedDeviationHour)}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 sm:grid-cols-7">
            {deviationHours.map((hour) => {
              const active = hour === selectedDeviationHour;
              return (
                <button
                  key={hour}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedDeviationHour(hour)}
                  className={`h-8 rounded-[8px] border px-1 font-mono text-[10px] font-semibold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/30 ${
                    active
                      ? "border-gold bg-ink text-paper shadow-glow"
                      : "border-rule bg-paper-2 text-ink-2 hover:border-gold/60 hover:bg-gold-tint"
                  }`}
                >
                  {formatHourLabel(hour)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[8px] border border-gold/35 bg-gold-tint/70 px-2.5 py-2">
              <span className="h-5 w-1 rounded-full bg-gold" aria-hidden />
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase text-ink">
                  ES close
                </div>
                <div className="font-mono text-[12px] tabular-nums text-ink-2">
                  {selectedDeviationPrice.toFixed(2)}
                </div>
              </div>
              <div className="font-mono text-[10px] uppercase text-gold-ink">
                {selectedDeviationPriceRead?.label ?? "Latest"}
              </div>
            </div>
            {deviationLensNearest.map((line) => (
              <div
                key={`read-${line.index}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[8px] border border-rule bg-paper-2/55 px-2.5 py-2"
              >
                <span
                  className={`h-5 w-1 rounded-full ${line.isMain ? "bg-ink" : "bg-gold/70"}`}
                  aria-hidden
                />
                <div>
                  <div className="font-mono text-[10px] font-semibold uppercase text-ink">
                    {line.label}
                  </div>
                  <div className="font-mono text-[12px] tabular-nums text-ink-2">
                    {line.selectedValue.toFixed(2)}
                  </div>
                </div>
                <div
                  className={`font-mono text-[11px] tabular-nums ${
                    line.selectedDistance >= 0 ? "text-bull-ink" : "text-bear-ink"
                  }`}
                >
                  {line.selectedDistance >= 0 ? "+" : ""}
                  {line.selectedDistance.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function nearestEsBarIndexFromPointer(
  event: PointerEvent<SVGSVGElement>,
  bars: Array<{ t: string; h: number; l: number; c: number }>,
  width: number,
  minX: number,
  maxX: number,
  xOf: (ms: number) => number,
): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const viewX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
  const clamped = Math.max(minX, Math.min(maxX, viewX));
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  bars.forEach((bar, index) => {
    const distance = Math.abs(xOf(Date.parse(bar.t)) - clamped);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function stepEsIndex(
  event: KeyboardEvent<SVGSVGElement>,
  current: number,
  length: number,
): number {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
    return current;
  }
  event.preventDefault();
  if (event.key === "Home") return 0;
  if (event.key === "End") return Math.max(0, length - 1);
  const delta = event.key === "ArrowLeft" ? -1 : 1;
  return Math.max(0, Math.min(length - 1, current + delta));
}

type DeviationLensReadableLine = {
  label: string;
  selectedValue: number;
  selectedDistance: number;
  isMain: boolean;
};

function describeDeviationLensZone(
  lines: DeviationLensReadableLine[],
  price: number,
): { label: string } {
  const ordered = lines
    .filter((line) => Number.isFinite(line.selectedValue))
    .slice()
    .sort((a, b) => a.selectedValue - b.selectedValue);
  if (ordered.length === 0) return { label: "Deviation zone unavailable" };

  let lower: DeviationLensReadableLine | null = null;
  let upper: DeviationLensReadableLine | null = null;
  for (const line of ordered) {
    if (line.selectedValue <= price) lower = line;
    if (line.selectedValue > price && upper === null) upper = line;
  }

  if (lower && upper) return { label: `Between ${lower.label} and ${upper.label}` };
  if (upper) return { label: `Below ${upper.label}` };
  if (lower) return { label: `Above ${lower.label}` };
  return { label: "Deviation zone unavailable" };
}

function deviationHourWindowLabel(hour: number): string {
  if (hour < 9) return "Setup read";
  if (hour < 12) return "Primary window";
  if (hour < 14) return "Extension window";
  return "Extension close";
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function deviationHourPrice(
  hour: number,
  sessionDateCT: string,
  fan: SPXSnapshot["descendingDeviationFan"] | null,
  bars: Array<{ t: string; c: number }>,
): { value: number; label: string } | null {
  const engineClose = fan?.hourlyCloses?.find(
    (item) => item.hour === hour && Number.isFinite(item.close),
  );
  if (engineClose) {
    return { value: engineClose.close, label: "Close" };
  }

  const bar = bars
    .filter(
      (item) =>
        Number.isFinite(item.c) &&
        ctDateKey(item.t) === sessionDateCT &&
        ctHour(item.t) === hour,
    )
    .at(-1);
  if (bar) {
    return { value: bar.c, label: "Bar" };
  }

  return null;
}

function ctHour(iso: string): number | null {
  const value = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
  return Number.isFinite(value) ? value : null;
}

function ctDateKey(iso: string): string | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function formatChartTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "--:-- CT";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms))} CT`;
}

type EsChartLabel = {
  key: string;
  code: string;
  value: number;
  endValue: number;
  y: number;
  color: string;
  labelY: number;
};

function distributeEsChartLabels(
  labels: Array<Omit<EsChartLabel, "labelY">>,
  minY: number,
  maxY: number,
): EsChartLabel[] {
  const minGap = 30;
  const sorted = labels
    .filter(
      (label) =>
        Number.isFinite(label.value) &&
        Number.isFinite(label.endValue) &&
        Number.isFinite(label.y),
    )
    .sort((a, b) => a.y - b.y);
  const placed = sorted.map((label, index) => {
    const previous = index === 0 ? minY : sorted[index - 1].y + minGap;
    return {
      ...label,
      labelY: Math.max(minY, Math.min(maxY, Math.max(label.y, previous))),
    };
  });
  for (let index = placed.length - 2; index >= 0; index -= 1) {
    placed[index].labelY = Math.min(
      placed[index].labelY,
      placed[index + 1].labelY - minGap,
    );
  }
  return placed.map((label) => ({
    ...label,
    labelY: Math.max(minY, Math.min(maxY, label.labelY)),
  }));
}

function avoidEsPriceLabelY(
  preferredY: number,
  occupiedY: number[],
  minY: number,
  maxY: number,
): number {
  const labelHeight = 22;
  const gap = 6;
  const collides = (candidate: number) =>
    occupiedY.some((y) => Math.abs(candidate - y) < labelHeight + gap);
  const clamped = Math.max(minY, Math.min(maxY, preferredY));
  if (!collides(clamped)) return clamped;

  for (let step = 1; step <= 8; step += 1) {
    const down = Math.min(maxY, clamped + step * (labelHeight + gap));
    if (!collides(down)) return down;
    const up = Math.max(minY, clamped - step * (labelHeight + gap));
    if (!collides(up)) return up;
  }

  return clamped < (minY + maxY) / 2 ? maxY : minY;
}

function lineCode(kind: string): string {
  const labels: Record<string, string> = {
    PREV_RTH_HIGH_ASC: "HF-C",
    PREV_RTH_HIGH_DESC: "HF-F",
    PREV_RTH_LOW_ASC: "LF-C",
    PREV_RTH_LOW_DESC: "LF-F",
    SWING_HIGH_ASC: "OH-C",
    SWING_HIGH_DESC: "SH-D",
    SWING_LOW_ASC: "SL-A",
    SWING_LOW_DESC: "SL-D",
  };
  return labels[kind] ?? "ES-L";
}

function lineStroke(kind: string): string {
  if (kind === "PREV_RTH_HIGH_DESC") return "#B5301E";
  if (kind === "PREV_RTH_LOW_ASC") return "#0E7C50";
  if (kind === "SWING_HIGH_DESC") return "#B5301E";
  if (kind === "SWING_LOW_ASC") return "#0E7C50";
  if (kind.startsWith("PREV_RTH")) return "#5B3FB1";
  if (kind.includes("HIGH")) return "#B8860B";
  return "#8A6117";
}

const spxDiagramStyles = `
  @keyframes spx-rail-draw {
    from { stroke-dashoffset: 1; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes spx-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes spx-pop-in {
    0%   { opacity: 0; transform: scale(0.6); }
    70%  { opacity: 1; transform: scale(1.1); }
    100% { transform: scale(1); }
  }
  @keyframes spx-pulse-out {
    0%   { opacity: 0; transform: scale(0.6); }
    50%  { opacity: 0.22; }
    100% { opacity: 0; transform: scale(2.4); }
  }
  @keyframes spx-breathe {
    0%, 100% { opacity: 0.45; }
    50%      { opacity: 0.18; }
  }
  @keyframes spx-halo-pulse {
    0%   { opacity: 0.12; transform: scale(1); }
    50%  { opacity: 0.04; transform: scale(1.7); }
    100% { opacity: 0.12; transform: scale(1); }
  }
  @keyframes spx-path-draw {
    from { stroke-dashoffset: 1; }
    to { stroke-dashoffset: 0; }
  }
  .spx-diagram .spx-rail {
    stroke-dasharray: 1;
    animation: spx-rail-draw 950ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
  }
  .spx-diagram .spx-rail-delayed { animation-delay: 380ms; }
  .spx-diagram .spx-band {
    opacity: 0;
    animation: spx-fade-in 600ms ease-out 800ms forwards;
  }
  .spx-diagram .spx-ref-line {
    stroke-dasharray: 4 4, 1;
    stroke-dashoffset: 1;
    animation: spx-rail-draw 1100ms cubic-bezier(0.22, 1, 0.36, 1) 600ms both;
  }
  .spx-diagram .spx-anchor {
    transform-origin: center;
    transform-box: fill-box;
    opacity: 0;
    animation: spx-pop-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1) 1000ms forwards;
  }
  .spx-diagram .spx-anchor-delayed { animation-delay: 1140ms; }
  .spx-diagram .spx-anchor-pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: spx-pulse-out 2400ms ease-out 2000ms infinite;
  }
  .spx-diagram .spx-price-line {
    animation: spx-breathe 3200ms ease-in-out infinite;
  }
  .spx-diagram .spx-price-path {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: spx-path-draw 1300ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .spx-diagram .spx-price-marker {
    opacity: 0;
    animation: spx-fade-in 360ms ease-out 1300ms forwards;
  }
  .spx-diagram .spx-price-halo {
    transform-origin: center;
    transform-box: fill-box;
    animation: spx-halo-pulse 2800ms ease-in-out 1700ms infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .spx-diagram .spx-rail,
    .spx-diagram .spx-band,
    .spx-diagram .spx-ref-line,
    .spx-diagram .spx-anchor,
    .spx-diagram .spx-price-marker {
      opacity: 1 !important;
      animation: none !important;
      stroke-dashoffset: 0 !important;
      transform: none !important;
    }
    .spx-diagram .spx-anchor-pulse,
    .spx-diagram .spx-price-path,
    .spx-diagram .spx-price-line,
    .spx-diagram .spx-price-halo {
      animation: none !important;
      stroke-dashoffset: 0 !important;
    }
  }
`;

