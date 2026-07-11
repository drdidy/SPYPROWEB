"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Clock3, Crosshair, Route } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { SPXControlPlanMap, SPXControlPlanSetup, SPXControlTradePlan, SPXDescendingDeviationFan } from "@/lib/types";

type EsBar = { t: string; h: number; l: number; c: number };

const biasVariant: Record<
  SPXDescendingDeviationFan["openBias"]["direction"],
  "confirmed" | "watching" | "stale"
> = {
  BULLISH: "confirmed",
  BEARISH: "stale",
  NEUTRAL: "watching",
  PENDING: "watching",
};

export function SPXDeviationFanPanel({
  plan,
  fan,
  bars,
}: {
  plan?: SPXControlTradePlan | null;
  fan?: SPXDescendingDeviationFan | null;
  bars?: EsBar[] | null;
}) {
  if (!plan) {
    return (
      <Card>
        <CardHeader
          eyebrow="Control Map"
          title="ES Control Map"
          meta="Waiting for the Control Plan"
        />
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink-3">
            This layer appears once ES has a qualified Control Line.
          </p>
        </CardBody>
      </Card>
    );
  }

  const active = plan.activeTrade;
  const buySetup = plan.setups.find((setup) => setup.side === "BUY") ?? null;
  const sellSetup = plan.setups.find((setup) => setup.side === "SELL") ?? null;
  const selectedMap = selectedControlMap(plan);
  const Icon = selectedMap.direction === "DESCENDING" ? ArrowDownRight : ArrowUpRight;
  const halfGate = plan.targetDistance;
  const levels = [
    { label: "Half-Gate +", value: selectedMap.controlValue + halfGate, tone: "text-bear-ink" },
    { label: "Control Line", value: selectedMap.controlValue, tone: "text-ink" },
    { label: "Half-Gate -", value: selectedMap.controlValue - halfGate, tone: "text-bull-ink" },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="Control Map"
        title="Control Room"
        meta={`${selectedMap.direction === "DESCENDING" ? "Descending" : "Ascending"} map - ${formatHM(plan.entryReferenceTime)} CT reference`}
        action={
          <StatusPill variant={windowVariant(plan.status)} pulse={plan.status === "ARMED" || plan.status === "TRIGGERED"}>
            {plan.status}
          </StatusPill>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <DeviationStat
            label="Selected map"
            value={selectedMap.direction === "DESCENDING" ? "Descending" : "Ascending"}
            note={selectedMap.status === "ARMED" ? "Inside the working distance" : "Waiting for price to qualify"}
            icon={<Route size={15} />}
          />
          <DeviationStat
            label="Control Line"
            value={selectedMap.controlValue.toFixed(2)}
            note={
              selectedMap.distanceFromOpen === null
                ? "Pending"
                : `${signed(selectedMap.distanceFromOpen)} pts from open`
            }
            icon={<Icon size={15} />}
          />
          <DeviationStat
            label="Half-Gate"
            value={halfGate.toFixed(2)}
            note="First target distance"
            icon={<Crosshair size={15} />}
          />
          <DeviationStat
            label="Signal window"
            value={`${formatHM(plan.signalWindowStart)}-${formatHM(plan.signalWindowEnd)}`}
            note="Entry is next hourly open after confirmation"
            icon={<Clock3 size={15} />}
          />
        </div>

        <ControlPlanRail map={selectedMap} targetDistance={halfGate} />

        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow text-ink-3">Control levels</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
                Half-Gate objective
              </span>
            </div>
            <ul className="divide-y divide-rule rounded-[12px] border border-rule bg-paper-2/45">
              {levels.map((line) => (
                <li
                  key={line.label}
                  className="grid grid-cols-[88px_1fr_auto] items-center gap-3 px-3 py-2.5"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={line.label === "Control Line" ? "h-5 w-1 rounded-full bg-ink" : "h-5 w-1 rounded-full bg-gold/65"}
                      aria-hidden
                    />
                    <span className={`font-mono text-[12px] font-semibold uppercase tracking-[0.08em] ${line.tone}`}>
                      {line.label}
                    </span>
                  </span>
                  <span className="font-mono text-[13px] tabular-nums text-ink-2">
                    {line.value.toFixed(2)}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-ink-4">
                    {signed(line.value - selectedMap.controlValue)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[12px] border border-rule bg-paper-2/55 p-4">
            <div className="flex items-center gap-2">
              <Clock3 size={14} className="text-ink-3" />
              <span className="eyebrow text-ink-3">Latest confirmation</span>
            </div>
            {active ? (
              <div className="mt-3">
                <div className="mb-2">
                  <StatusPill variant="confirmed">
                    Confirmed
                  </StatusPill>
                </div>
                <div
                  className={`font-serif text-[26px] leading-none ${
                    active.side === "BUY" ? "text-bull-ink" : "text-bear-ink"
                  }`}
                >
                  {active.contractType} next hourly open
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                  {active.note}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <MiniRead label="Entry" value={active.entryPrice.toFixed(2)} />
                  <MiniRead label="Target" value={active.targetPrice.toFixed(2)} />
                  <MiniRead label="Signal" value={formatHM(active.signalTime)} />
                  <MiniRead label="Action" value={active.side === "BUY" ? "Calls" : "Puts"} />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
                No completed hourly candle has confirmed yet. Wait for the first
                clean touch and close before using the next hourly open.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ControlSetupMini setup={buySetup} title="Buy support" />
          <ControlSetupMini setup={sellSetup} title="Sell resistance" />
        </div>

        <p className="max-w-4xl text-[13px] leading-relaxed text-ink-3">
          {plan.guidance}
        </p>
      </CardBody>
    </Card>
  );
}

function selectedControlMap(plan: SPXControlTradePlan): SPXControlPlanMap {
  if (plan.activeTrade?.mapId === plan.oppositeMap.id) return plan.oppositeMap;
  const activeSetupMap = plan.setups[0]?.mapId;
  if (activeSetupMap === plan.oppositeMap.id) return plan.oppositeMap;
  if (plan.primaryMap.status === "ARMED") return plan.primaryMap;
  return plan.oppositeMap;
}

function ControlPlanRail({
  map,
  targetDistance,
}: {
  map: SPXControlPlanMap;
  targetDistance: number;
}) {
  const values = [
    { label: "Half-Gate -", value: map.controlValue - targetDistance, pct: 18 },
    { label: "Control", value: map.controlValue, pct: 50 },
    { label: "Half-Gate +", value: map.controlValue + targetDistance, pct: 82 },
  ];
  return (
    <div className="relative overflow-hidden rounded-[16px] border border-rule bg-paper-2/60 px-4 py-5">
      <div className="absolute inset-x-8 top-1/2 h-px bg-rule" />
      <motion.div
        aria-hidden
        className="absolute top-1/2 h-[3px] rounded-full bg-gold"
        style={{ left: "18%", width: "64%" }}
        initial={{ scaleX: 0.35, opacity: 0.45 }}
        animate={{ scaleX: 1, opacity: 0.9 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      />
      <div className="relative h-28">
        {values.map((item) => (
          <div
            key={item.label}
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
            style={{ left: `${item.pct}%` }}
          >
            <span className={item.label === "Control" ? "h-4 w-4 rounded-full border-2 border-ink bg-paper shadow-rule" : "h-3 w-3 rounded-full border border-gold bg-paper"} />
            <span className="rounded-[8px] border border-rule bg-paper px-2 py-1 text-center shadow-rule">
              <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
                {item.label}
              </span>
              <span className="block font-mono text-[12px] font-semibold tabular-nums text-ink">
                {item.value.toFixed(2)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlSetupMini({
  title,
  setup,
}: {
  title: string;
  setup: SPXControlPlanSetup | null;
}) {
  if (!setup) {
    return (
      <div className="rounded-[12px] border border-rule bg-paper-2/55 p-4">
        <div className="eyebrow text-ink-3">{title}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          Waiting for a qualified Control Plan setup.
        </p>
      </div>
    );
  }
  const tone = setup.side === "BUY" ? "text-bull-ink" : "text-bear-ink";
  return (
    <div className="rounded-[12px] border border-rule bg-paper-2/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow text-ink-3">{title}</div>
        <StatusPill variant={setup.status === "TRIGGERED" ? "confirmed" : "watching"}>
          {setup.status}
        </StatusPill>
      </div>
      <div className={`mt-2 font-serif text-[24px] leading-none ${tone}`}>
        {setup.contractType}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <MiniRead label="Entry" value={setup.entryPrice.toFixed(2)} />
        <MiniRead label="Half-Gate" value={setup.targetPrice.toFixed(2)} />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{setup.thesis}</p>
    </div>
  );
}

function ZoneActionRead({
  label,
  gate,
  value,
  fallback,
}: {
  label: string;
  gate?: string | null;
  value?: number | null;
  fallback: string;
}) {
  return (
    <div className="rounded-[9px] border border-rule bg-paper px-3 py-2.5">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-1 min-w-0 truncate font-mono text-[12px] font-semibold text-ink">
        {gate ? displayLineLabel(gate) : fallback}
      </div>
      <div className="mt-1 font-mono text-[12px] tabular-nums text-ink-4">
        {Number.isFinite(value ?? NaN) ? Number(value).toFixed(2) : "--"}
      </div>
    </div>
  );
}

function DeviationStat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-rule bg-paper-2/55 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow text-ink-3">{label}</span>
        {icon && <span className="text-ink-3">{icon}</span>}
      </div>
      <div className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-snug text-ink-3">{note}</div>
    </div>
  );
}

function DeviationHourReplay({
  fan,
  bars,
}: {
  fan: SPXDescendingDeviationFan;
  bars: EsBar[] | null;
}) {
  const [selectedHour, setSelectedHour] = useState(() => {
    const latestCloseHour = fan.hourlyCloses?.at(-1)?.hour;
    return Number.isFinite(latestCloseHour)
      ? Math.max(8, Math.min(14, Number(latestCloseHour)))
      : 9;
  });
  const [selectedFocus, setSelectedFocus] = useState<"ceiling" | "price" | "floor">("price");
  const hours = [8, 9, 10, 11, 12, 13, 14];
  const hourlyBars = useMemo(() => mapBarsByHour(bars), [bars]);
  const engineCloses = useMemo(() => mapFanClosesByHour(fan), [fan]);
  const fallbackPrice =
    fan.nearestLine.currentValue - fan.nearestLine.distanceFromPrice;
  const selectedBar = hourlyBars.get(selectedHour) ?? null;
  const selectedEngineClose = engineCloses.get(selectedHour) ?? null;
  const selectedPrice = selectedEngineClose?.close ?? selectedBar?.c ?? fallbackPrice;
  const selectedSource = selectedEngineClose
    ? "Confirmed close"
    : selectedBar
      ? "Hourly close"
      : "Latest price";
  const lineReads = fan.lines
    .map((line) => {
      const value = deviationValueAtHour(fan, line.value, selectedHour);
      return {
        ...line,
        hourValue: value,
        distance: value - selectedPrice,
      };
    })
    .sort((a, b) => b.hourValue - a.hourValue);
  const zone = zoneForHour(lineReads, selectedPrice);
  const nearest = lineReads
    .slice()
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
    .slice(0, 5);
  const closest = nearest[0] ?? null;
  const hourRead = noviceHourRead(zone, selectedPrice, closest);
  const hasRoom = Boolean(zone.lower && zone.upper);
  const roomProgress =
    zone.lower && zone.upper
      ? clamp(
          (selectedPrice - zone.lower.hourValue) /
            Math.max(0.01, zone.upper.hourValue - zone.lower.hourValue),
          0,
          1,
        )
      : 0.5;
  const carTop = zone.lower && zone.upper
    ? 76 - roomProgress * 52
    : zone.upper
      ? 70
      : 30;
  const nearCeiling = Math.abs(carTop - 24) < 14;
  const nearFloor = Math.abs(carTop - 76) < 14;
  const priceBadgeTop = nearCeiling ? 44 : nearFloor ? 56 : carTop;
  const priceBadgeOffset = Math.abs(priceBadgeTop - carTop);
  const floorDistance = zone.lower ? selectedPrice - zone.lower.hourValue : null;
  const ceilingDistance = zone.upper ? zone.upper.hourValue - selectedPrice : null;
  const guideLines = nearest
    .filter((line) => line.label !== zone.lower?.label && line.label !== zone.upper?.label)
    .slice(0, 2);
  const inspectedLine =
    selectedFocus === "ceiling" ? zone.upper : selectedFocus === "floor" ? zone.lower : null;
  const inspectedLabel =
    selectedFocus === "price"
      ? "ES close"
      : inspectedLine
        ? displayLineLabel(inspectedLine.label)
        : selectedFocus === "ceiling"
          ? "Ceiling"
          : "Floor";
  const inspectedValue =
    selectedFocus === "price" ? selectedPrice : inspectedLine ? inspectedLine.hourValue : null;
  const inspectedDistance =
    selectedFocus === "ceiling" ? ceilingDistance : selectedFocus === "floor" ? floorDistance : 0;
  const inspectedNote =
    selectedFocus === "price"
      ? `Using ${selectedSource.toLowerCase()} for ${formatHourButton(selectedHour)}.`
      : inspectedValue === null
        ? "No gate is inside the visible control room."
        : `${Math.abs(inspectedDistance ?? 0).toFixed(2)} pts from the selected price marker.`;
  const moveHour = (delta: number) => {
    const currentIndex = Math.max(0, hours.indexOf(selectedHour));
    const nextIndex = clamp(currentIndex + delta, 0, hours.length - 1);
    setSelectedHour(hours[nextIndex]);
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
    <div className="overflow-hidden rounded-[12px] border border-rule bg-ink text-paper shadow-card">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[440px] border-b border-white/10 p-4 xl:border-b-0 xl:border-r">
          <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:30px_30px]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
                Control Room
              </div>
              <motion.div
                key={zone.label}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className="mt-1 font-serif text-[26px] leading-none text-paper"
              >
                ES is {displayZoneLabel(zone.label)}
              </motion.div>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2.5 py-2 text-right">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/55">
                {hourWindowLabel(selectedHour)}
              </div>
              <div className="mt-0.5 font-mono text-[16px] font-semibold text-paper">
                {formatHourButton(selectedHour)}
              </div>
            </div>
          </div>

          <div
            role="group"
            tabIndex={0}
            aria-label={`Interactive ES Control Room, ${formatHourButton(selectedHour)}, ${displayZoneLabel(zone.label)}`}
            onClick={inspectFromPointer}
            onKeyDown={onRoomKeyDown}
            className="relative mt-5 h-[292px] cursor-crosshair overflow-hidden rounded-[16px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(184,130,31,0.16),rgba(255,255,255,0.035)_45%,rgba(0,0,0,0.12)_100%)] outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-3">
              <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/62">
                {hasRoom ? "active control room" : "edge of map"}
              </span>
              <span className="rounded-[8px] border border-gold/30 bg-gold/12 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-gold-soft">
                {fan.spacing.toFixed(0)} pt gates
              </span>
            </div>
            <div className="absolute bottom-5 left-1/2 top-11 w-[92px] -translate-x-1/2 rounded-full border border-white/10 bg-black/20 shadow-[inset_0_0_34px_rgba(0,0,0,0.40)]" />
            <motion.div
              key={`room-${selectedHour}-${zone.label}`}
              className="absolute left-[calc(50%_-_74px)] top-[24%] h-[52%] w-[148px] rounded-[26px] border border-gold/40 bg-gold/12 shadow-[0_0_42px_rgba(184,130,31,0.20)]"
              initial={{ opacity: 0, scaleX: 0.88 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
            />
            {guideLines.map((line, index) => (
              <motion.div
                key={`${selectedHour}-ghost-${line.index}`}
                className={`absolute left-8 right-8 grid grid-cols-[1fr_84px_1fr] items-center gap-2 opacity-35 ${
                  index === 0 ? "top-[12%]" : "bottom-[8%]"
                }`}
                initial={{ opacity: 0, scaleX: 0.92 }}
                animate={{ opacity: 0.35, scaleX: 1 }}
                transition={{ duration: 0.34, delay: index * 0.05 }}
              >
                <span className="h-px bg-white/20" />
                <span className="text-center font-mono text-[9px] uppercase tracking-[0.08em] text-paper/52">
                  {displayLineLabel(line.label)}
                </span>
                <span className="h-px bg-white/20" />
              </motion.div>
            ))}
            <RoomLine
              type="ceiling"
              top="24%"
              line={zone.upper}
              distance={ceilingDistance}
              active={selectedFocus === "ceiling"}
              onSelect={() => setSelectedFocus("ceiling")}
            />
            <RoomLine
              type="floor"
              top="76%"
              line={zone.lower}
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
              key={`marker-${selectedHour}-${selectedPrice}`}
              className="absolute left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ top: `${priceBadgeTop}%` }}
              initial={{ opacity: 0, scale: 0.82, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.38, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <span className="relative flex h-16 w-28 items-center justify-center rounded-[18px] border border-gold/60 bg-ink shadow-[0_18px_46px_-18px_rgba(184,130,31,0.95)]">
                <span className="absolute h-20 w-32 rounded-[22px] bg-gold/12 blur-md" />
                <span className="relative text-center">
                  <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-gold-soft">
                    ES close
                  </span>
                  <span className="block font-mono text-[14px] font-semibold tabular-nums text-paper">
                    {selectedPrice.toFixed(2)}
                  </span>
                </span>
              </span>
            </motion.div>
          </div>

          <div className="relative mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {hours.map((hour) => {
              const active = hour === selectedHour;
              const hasBar = engineCloses.has(hour) || hourlyBars.has(hour);
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
                  title={hasBar ? "Hourly ES close available" : "Using latest available ES price"}
                >
                  {formatHourButton(hour)}
                </button>
              );
            })}
          </div>
          <div className="relative mt-3 grid gap-2 sm:grid-cols-3">
            <HourDistanceCard
              label="Ceiling"
              value={zone.upper ? zone.upper.hourValue.toFixed(2) : "None"}
              note={ceilingDistance === null ? "Above visible map" : `${ceilingDistance.toFixed(2)} pts above`}
              active={selectedFocus === "ceiling"}
              onSelect={() => setSelectedFocus("ceiling")}
            />
            <HourDistanceCard
              label="This hour"
              value={selectedPrice.toFixed(2)}
              note={selectedSource}
              active={selectedFocus === "price"}
              onSelect={() => setSelectedFocus("price")}
            />
            <HourDistanceCard
              label="Floor"
              value={zone.lower ? zone.lower.hourValue.toFixed(2) : "None"}
              note={floorDistance === null ? "Below visible map" : `${floorDistance.toFixed(2)} pts below`}
              active={selectedFocus === "floor"}
              onSelect={() => setSelectedFocus("floor")}
            />
          </div>
        </div>

        <div className="bg-paper text-ink">
          <div className="grid grid-cols-2 border-b border-rule">
            <ReplayRead label="Hour price" value={selectedPrice.toFixed(2)} tone="ink" />
            <ReplayRead
              label="Read basis"
              value={selectedSource}
              tone={selectedEngineClose || selectedBar ? "bull" : "gold"}
            />
          </div>
          <div className="p-4">
            <div className="eyebrow text-ink-3">Operator read</div>
            <div className="mt-3 rounded-[10px] border border-rule bg-paper-2/55 p-3">
              <div className="font-serif text-[22px] leading-none text-ink">
                {hourRead.title}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
                {hourRead.body}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ReplayReadMini label="Floor below" value={zone.lower ? `${displayLineLabel(zone.lower.label)} ${zone.lower.hourValue.toFixed(2)}` : "None"} />
              <ReplayReadMini label="Ceiling above" value={zone.upper ? `${displayLineLabel(zone.upper.label)} ${zone.upper.hourValue.toFixed(2)}` : "None"} />
            </div>
            <motion.div
              key={`inspect-${selectedHour}-${selectedFocus}`}
              className="mt-4 rounded-[10px] border border-gold/25 bg-gold-tint/55 p-3"
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
            <div className="mt-4 eyebrow text-ink-3">Closest gates</div>
            <div className="mt-3 space-y-2">
              {nearest.slice(0, 3).map((line) => (
                <motion.button
                  key={`${selectedHour}-nearest-${line.index}`}
                  type="button"
                  onClick={() => setSelectedFocus(line.distance >= 0 ? "ceiling" : "floor")}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[8px] border border-rule bg-paper-2/55 px-2.5 py-2 text-left transition hover:border-gold/40 hover:bg-gold-tint/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/35"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24 }}
                >
                  <span className={`h-5 w-1 rounded-full ${line.isMain ? "bg-ink" : "bg-gold/70"}`} />
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase text-ink">
                      {displayLineLabel(line.label)}
                    </div>
                    <div className="font-mono text-[12px] tabular-nums text-ink-2">
                      {line.hourValue.toFixed(2)}
                    </div>
                  </div>
                  <div className={`font-mono text-[11px] tabular-nums ${line.distance >= 0 ? "text-bull-ink" : "text-bear-ink"}`}>
                    {signed(line.distance)}
                  </div>
                </motion.button>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
              Pick an hour to replay the Control Room. The glowing marker is
              that hour's ES close; the gold room is the zone between the
              active floor and ceiling.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplayRead({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ink" | "bull" | "gold";
}) {
  const toneClass =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "gold"
        ? "text-gold-ink"
        : "text-ink";
  return (
    <div className="px-4 py-3">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className={`mt-1 font-mono text-[13px] font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function ReplayReadMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-rule bg-paper px-2.5 py-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-1 font-mono text-[11px] font-semibold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function HourDistanceCard({
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
      className={`rounded-[10px] border px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/45 ${
        active
          ? "border-gold/45 bg-gold/12 text-paper"
          : "border-white/10 bg-white/[0.055] text-paper/82 hover:border-gold/35 hover:bg-white/[0.08]"
      }`}
    >
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-paper/55">
        {label}
      </div>
      <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-paper">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-paper/58">{note}</div>
    </button>
  );
}

function RoomLine({
  type,
  top,
  line,
  distance,
  active = false,
  onSelect,
}: {
  type: "floor" | "ceiling";
  top: string;
  line: HourLine | null;
  distance: number | null;
  active?: boolean;
  onSelect?: () => void;
}) {
  const label = type === "ceiling" ? "Ceiling above" : "Floor below";
  const fallback = type === "ceiling" ? "No ceiling" : "No floor";
  const distanceText =
    distance === null
      ? type === "ceiling"
        ? "above map"
        : "below map"
      : `${distance.toFixed(2)} pts`;

  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      className={`absolute inset-x-3 z-40 grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-center gap-2 rounded-[10px] outline-none transition focus-visible:ring-2 focus-visible:ring-gold/45 ${
        active ? "bg-gold/10" : "hover:bg-white/[0.04]"
      }`}
      style={{ top, transform: "translateY(-50%)" }}
      initial={{ opacity: 0, scaleX: 0.92 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="flex min-w-0 items-center justify-end gap-2">
        <span className="hidden rounded-[7px] border border-white/10 bg-white/[0.08] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-paper/70 sm:inline">
          {type}
        </span>
        <div className="min-w-0 text-right">
          <div className="truncate font-mono text-[10px] font-semibold uppercase text-paper">
            {line?.label ?? fallback}
          </div>
          <div className="truncate text-[10px] text-paper/50">{distanceText}</div>
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
          {label}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-paper">
          {line ? line.hourValue.toFixed(2) : "--"}
        </div>
      </div>
    </motion.button>
  );
}

function MiniRead({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-rule bg-paper px-2.5 py-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-1 font-mono text-[11px] tabular-nums text-ink">{value}</div>
    </div>
  );
}

function windowVariant(status: string): "confirmed" | "watching" | "stale" {
  if (status === "ACTIVE") return "confirmed";
  if (status === "UPCOMING") return "watching";
  return "stale";
}

function windowDot(status: string): string {
  if (status === "ACTIVE") return "bg-bull-ink";
  if (status === "UPCOMING") return "bg-gold";
  return "bg-ink-4";
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function displayLineLabel(label: string): string {
  if (label === "Main") return "Control Line";
  if (label === "+34") return "North Gate I";
  if (label === "+68") return "North Gate II";
  if (label === "+102") return "North Gate III";
  if (label === "-34") return "South Gate I";
  if (label === "-68") return "South Gate II";
  if (label === "-102") return "South Gate III";
  return label;
}

function displayZoneLabel(label: string): string {
  return label
    .replace(/\bMain\b/g, "Control Line")
    .replace(/\+34\b/g, "North Gate I")
    .replace(/\+68\b/g, "North Gate II")
    .replace(/\+102\b/g, "North Gate III")
    .replace(/-34\b/g, "South Gate I")
    .replace(/-68\b/g, "South Gate II")
    .replace(/-102\b/g, "South Gate III");
}

function displayControlCopy(text: string): string {
  return displayZoneLabel(text)
    .replace(/descending main line/gi, "Control Line")
    .replace(/main-line zone/gi, "Control Line room")
    .replace(/main line/gi, "Control Line")
    .replace(/deviation zone/gi, "gate room")
    .replace(/deviation reclaim/gi, "gate reclaim")
    .replace(/deviation fan/gi, "Control Map")
    .replace(/deviation ladder/gi, "Control Map")
    .replace(/deviation reference/gi, "gate")
    .replace(/parallel reference/gi, "gate");
}

function windowLabel(label: string): string {
  return label
    .replace("8-9 setup", "8-9 setup")
    .replace("9-12 primary entries", "9-12 primary")
    .replace("12-2 extension/rejection", "12-2 extension");
}

function mapBarsByHour(bars: EsBar[] | null): Map<number, EsBar> {
  const result = new Map<number, EsBar>();
  for (const bar of bars ?? []) {
    const hour = Number(
      new Date(bar.t).toLocaleTimeString("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: "America/Chicago",
      }),
    );
    if (Number.isFinite(hour) && hour >= 8 && hour <= 14) {
      result.set(hour, bar);
    }
  }
  return result;
}

function mapFanClosesByHour(
  fan: SPXDescendingDeviationFan,
): Map<number, { close: number; time: string; label: string }> {
  const result = new Map<number, { close: number; time: string; label: string }>();
  for (const close of fan.hourlyCloses ?? []) {
    if (Number.isFinite(close.hour) && Number.isFinite(close.close)) {
      result.set(close.hour, {
        close: close.close,
        time: close.time,
        label: close.label,
      });
    }
  }
  return result;
}

function deviationValueAtHour(
  fan: SPXDescendingDeviationFan,
  valueAtNine: number,
  hour: number,
): number {
  return valueAtNine + fan.slopePerHour * (hour - 9);
}

type HourLine = SPXDescendingDeviationFan["lines"][number] & {
  hourValue: number;
  distance: number;
};

function zoneForHour(
  lines: HourLine[],
  price: number,
): { label: string; lower: HourLine | null; upper: HourLine | null } {
  const ordered = lines.slice().sort((a, b) => a.hourValue - b.hourValue);
  let lower: HourLine | null = null;
  let upper: HourLine | null = null;
  for (const line of ordered) {
    if (line.hourValue <= price) lower = line;
    if (line.hourValue > price && upper === null) upper = line;
  }
  if (lower && upper) {
    return { label: `Between ${displayLineLabel(lower.label)} and ${displayLineLabel(upper.label)}`, lower, upper };
  }
  if (upper) return { label: `Below ${displayLineLabel(upper.label)}`, lower, upper };
  if (lower) return { label: `Above ${displayLineLabel(lower.label)}`, lower, upper };
  return { label: "Control room unavailable", lower, upper };
}

function noviceHourRead(
  zone: { label: string; lower: HourLine | null; upper: HourLine | null },
  price: number,
  closest: HourLine | null,
): { title: string; body: string } {
  if (zone.lower && zone.upper) {
    const lowerGap = price - zone.lower.hourValue;
    const upperGap = zone.upper.hourValue - price;
    const closer =
      Math.abs(lowerGap) <= Math.abs(upperGap)
        ? `${Math.abs(lowerGap).toFixed(2)} pts above ${displayLineLabel(zone.lower.label)}`
        : `${Math.abs(upperGap).toFixed(2)} pts below ${displayLineLabel(zone.upper.label)}`;
    return {
      title: `Inside the ${displayLineLabel(zone.lower.label)} to ${displayLineLabel(zone.upper.label)} room`,
      body: `At this hour ES is between a floor and a ceiling. It is closest to ${closer}. A close through the ceiling favors reclaim; losing the floor favors continuation lower.`,
    };
  }
  if (zone.upper) {
    return {
      title: `Below ${displayLineLabel(zone.upper.label)}`,
      body: `At this hour ES is below the nearest gate. First watch is whether price can reclaim ${displayLineLabel(zone.upper.label)}; until then, the read is defensive.`,
    };
  }
  if (zone.lower) {
    return {
      title: `Above ${displayLineLabel(zone.lower.label)}`,
      body: `At this hour ES is above the visible map. The next useful read is whether price can hold above ${displayLineLabel(zone.lower.label)} or rotate back into the map.`,
    };
  }
  return {
    title: "Waiting for a clean room",
    body: closest
      ? `Closest gate is ${displayLineLabel(closest.label)}.`
      : "The Control Map is not available for this hour.",
  };
}

function hourWindowLabel(hour: number): string {
  if (hour < 9) return "Setup read";
  if (hour < 12) return "Primary window";
  if (hour < 14) return "Extension window";
  return "Extension close";
}

function formatHourButton(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatHM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Chicago",
  });
}
