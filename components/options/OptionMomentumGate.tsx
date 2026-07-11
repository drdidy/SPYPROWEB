"use client";

import { Activity, Database, LineChart, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { ContractProjection } from "@/lib/contract-projection";
import {
  OPTION_MEMORY_KEY,
  OPTION_TAPE_REGISTRY_KEY,
  appendOptionTick,
  buildOptionMomentumRead,
  tapeStorageKey,
  type OptionMomentumRead,
  type OptionReplayEvent,
  type OptionTapeTick,
} from "@/lib/options/momentum";
import { cn } from "@/lib/utils";

interface Props {
  projection: ContractProjection | null;
  engine: "SPY" | "ES" | "SPX";
}

interface ChainResponse {
  symbols?: Record<string, {
    chain?: {
      calls?: ChainRow[];
      puts?: ChainRow[];
    } | null;
  }>;
}

interface ChainRow {
  strike?: number | null;
  side?: "CALL" | "PUT" | string | null;
  bid?: number | null;
  ask?: number | null;
  mark?: number | null;
  expiration?: string | null;
}

export function OptionMomentumGate({ projection, engine }: Props) {
  const [ticks, setTicks] = useState<OptionTapeTick[]>([]);
  const [lastSampleAt, setLastSampleAt] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<"sma" | "ema" | "ready">("sma");
  const projectionRef = useRef<ContractProjection | null>(projection);
  const contractKey = projection?.contractLabel ?? null;

  const read = useMemo(() => buildOptionMomentumRead(ticks), [ticks]);
  const metricDetail = {
    sma: "The five-minute baseline shows whether the selected contract is holding its bigger intraday support area.",
    ema: "The one-minute EMA pair is the faster confirmation read for timing the option entry.",
    ready: "Readiness tracks how much contract tape has been collected for this exact ticket.",
  }[selectedMetric];

  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  useEffect(() => {
    const current = projectionRef.current;
    if (!current || !contractKey) {
      setTicks([]);
      setLastSampleAt(null);
      return;
    }
    const key = tapeStorageKey(current.contractLabel);
    const initialTick = tickFromProjection(current);
    const stored = readTape(key);
    const next = appendOptionTick(stored, initialTick);
    writeTape(key, current.contractLabel, next);
    setTicks(next);
    setLastSampleAt(initialTick.ts);
  }, [contractKey]);

  useEffect(() => {
    if (!contractKey) return;
    let cancelled = false;
    const sample = async () => {
      const current = projectionRef.current;
      if (!current) return;
      const tick = await fetchLatestTick(current);
      if (!tick || cancelled) return;
      const key = tapeStorageKey(current.contractLabel);
      const next = appendOptionTick(readTape(key), tick);
      writeTape(key, current.contractLabel, next);
      const nextRead = buildOptionMomentumRead(next);
      if (nextRead.verdict === "confirmed") writeReplayEvent(tick, nextRead);
      setTicks(next);
      setLastSampleAt(tick.ts);
    };
    const id = window.setInterval(sample, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [contractKey]);

  if (!projection || (engine !== "ES" && engine !== "SPX")) return null;
  const progress = Math.min(100, Math.round((read.fiveMinuteCount / 200) * 100));
  const sampleLabel =
    read.fiveMinuteCount >= 200
      ? "Baseline ready"
      : read.oneMinuteCount < 21
        ? "Collecting premium tape"
        : "Historical baseline unavailable";
  const smaStatus = smaStatusLabel(read);
  const emaStatus = emaStatusLabel(read);
  const entryStatus = entryStatusLabel(read);

  return (
    <div className="overflow-hidden rounded-soft border border-rule bg-paper-2/70 shadow-rule">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-4 py-3">
        <div>
          <div className="eyebrow text-ink-3">SPX momentum confirmation</div>
          <div className="mt-1 font-serif text-[24px] leading-none text-ink">
            {read.label}
          </div>
        </div>
        <span
          className={cn(
            "rounded-[7px] border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em]",
            read.verdict === "confirmed"
              ? "border-bull/35 bg-bull-soft/10 text-bull-ink"
              : read.verdict === "failed"
                ? "border-bear/35 bg-bear-soft/10 text-bear-ink"
                : read.verdict === "watch"
                  ? "border-gold/35 bg-gold/10 text-gold-ink"
                  : "border-rule bg-paper text-ink-3",
          )}
        >
          {read.verdict === "confirmed" ? "Confirmed" : read.verdict}
        </span>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-ink-3">
            This is the SPX options entry filter. The ticket needs premium
            strength before it becomes actionable. If the full five-minute
            baseline is unavailable, the card stays in watch mode instead of
            pretending the confirmation is complete.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <GateStat
              icon={<LineChart size={14} />}
              label="5m 200 SMA"
              value={smaStatus}
              tone={statusTone(smaStatus)}
              selected={selectedMetric === "sma"}
              onSelect={() => setSelectedMetric("sma")}
            />
            <GateStat
              icon={<TrendingUp size={14} />}
              label="1m EMA 8/21"
              value={emaStatus}
              tone={statusTone(emaStatus)}
              selected={selectedMetric === "ema"}
              onSelect={() => setSelectedMetric("ema")}
            />
            <GateStat
              icon={<Database size={14} />}
              label="Entry"
              value={entryStatus}
              tone={statusTone(entryStatus)}
              selected={selectedMetric === "ready"}
              onSelect={() => setSelectedMetric("ready")}
            />
          </div>
          <div className="rounded-[10px] border border-rule bg-paper px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
              <span>{sampleLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-2">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              {metricDetail} {metricValueDetail(selectedMetric, read)}
            </p>
          </div>
          <PremiumMiniChart ticks={ticks} read={read} />
        </div>
        <div className="rounded-[12px] border border-rule bg-paper px-3 py-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            <Activity size={13} />
            Confirmation read
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink">
            {read.detail}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
            <span>{sampleLabel}</span>
            <span>{lastSampleAt ? `Updated ${formatTime(lastSampleAt)}` : "Awaiting tape"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PremiumMiniChart({
  ticks,
  read,
}: {
  ticks: OptionTapeTick[];
  read: OptionMomentumRead;
}) {
  const clean = ticks
    .filter((tick) => Number.isFinite(tick.mark) && tick.mark > 0)
    .slice(-80);
  const values = clean.map((tick) => tick.mark);
  if (values.length < 2) {
    return (
      <div className="grid h-[150px] place-items-center rounded-[12px] border border-dashed border-rule bg-paper text-center">
        <div>
          <div className="font-serif text-[20px] leading-none text-ink">Premium tape waiting</div>
          <p className="mt-2 max-w-[260px] text-[11px] leading-relaxed text-ink-3">
            The chart appears once this exact contract has more than one live
            premium sample.
          </p>
        </div>
      </div>
    );
  }
  const min = Math.min(...values, read.sma200 ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...values, read.sma200 ?? Number.NEGATIVE_INFINITY);
  const pad = Math.max(0.05, (max - min) * 0.16);
  const lo = min - pad;
  const hi = max + pad;
  const width = 420;
  const height = 150;
  const xFor = (index: number) => (index / Math.max(1, values.length - 1)) * width;
  const yFor = (value: number) => height - ((value - lo) / Math.max(0.01, hi - lo)) * height;
  const path = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`)
    .join(" ");
  const smaY = read.sma200 === null ? null : yFor(read.sma200);

  return (
    <div className="contrast-dark overflow-hidden rounded-[12px] border border-rule bg-[#071116] p-3 text-paper">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/62">
          Premium path
        </div>
        <div className="font-mono text-[10px] tabular-nums text-gold-soft">
          {money(values.at(-1) ?? null)}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[150px] w-full" aria-hidden>
        <defs>
          <linearGradient id="premiumGlow" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#F4E4C0" stopOpacity="0.35" />
            <stop offset="1" stopColor="#29A970" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#premiumGlow)" strokeWidth="3" strokeLinecap="round" />
        {smaY !== null && (
          <line
            x1="0"
            x2={width}
            y1={smaY}
            y2={smaY}
            stroke="#C9A227"
            strokeDasharray="6 6"
            strokeWidth="1.5"
          />
        )}
        {values.map((value, index) => (
          <circle
            key={`${index}-${value}`}
            cx={xFor(index)}
            cy={yFor(value)}
            r={index === values.length - 1 ? 4 : 1.8}
            fill={index === values.length - 1 ? "#F4E4C0" : "#29A970"}
            opacity={index === values.length - 1 ? 1 : 0.55}
          />
        ))}
      </svg>
    </div>
  );
}

function GateStat({
  icon,
  label,
  value,
  tone = "ink",
  selected,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "bull" | "gold" | "bear" | "ink";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-[10px] border px-2.5 py-2 text-left outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-gold/40",
        selected ? "border-gold bg-gold-tint" : "border-rule bg-paper hover:bg-paper-2",
      )}
    >
      <div className="flex items-center gap-1.5 text-ink-3">
        {icon}
        <span className="font-mono text-[8px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-[12px] font-semibold tabular-nums",
          tone === "bull" && "text-bull-ink",
          tone === "gold" && "text-gold-ink",
          tone === "bear" && "text-bear-ink",
          tone === "ink" && "text-ink",
        )}
      >
        {value}
      </div>
    </button>
  );
}

function tickFromProjection(projection: ContractProjection): OptionTapeTick {
  return {
    ts: new Date().toISOString(),
    contractLabel: projection.contractLabel,
    symbol: projection.symbol,
    side: projection.side,
    strike: projection.strike,
    expiration: projection.expiration,
    bid: projection.currentBid,
    ask: projection.currentAsk,
    mark: projection.currentMark,
    entryUnderlying: projection.entryUnderlying,
    projectedEntryMark: projection.projectedEntry.mark,
  };
}

async function fetchLatestTick(projection: ContractProjection): Promise<OptionTapeTick | null> {
  try {
    const res = await fetch(`/api/options/intel?symbols=${encodeURIComponent(projection.symbol)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ChainResponse;
    const chain = data.symbols?.[projection.symbol]?.chain;
    const rows = projection.side === "CALL" ? chain?.calls : chain?.puts;
    const row = rows?.find(
      (item) =>
        item.side === projection.side &&
        typeof item.strike === "number" &&
        Math.abs(item.strike - projection.strike) < 0.001,
    );
    const mark = cleanNumber(row?.mark) ?? mid(row?.bid, row?.ask);
    if (mark === null) return null;
    return {
      ts: new Date().toISOString(),
      contractLabel: projection.contractLabel,
      symbol: projection.symbol,
      side: projection.side,
      strike: projection.strike,
      expiration: projection.expiration,
      bid: cleanNumber(row?.bid),
      ask: cleanNumber(row?.ask),
      mark,
      entryUnderlying: projection.entryUnderlying,
      projectedEntryMark: projection.projectedEntry.mark,
    };
  } catch {
    return null;
  }
}

function readTape(key: string): OptionTapeTick[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isTick) : [];
  } catch {
    return [];
  }
}

function writeTape(key: string, contractLabel: string, ticks: OptionTapeTick[]) {
  window.localStorage.setItem(key, JSON.stringify(ticks));
  const registry = readRegistry();
  if (!registry.includes(contractLabel)) {
    window.localStorage.setItem(
      OPTION_TAPE_REGISTRY_KEY,
      JSON.stringify([contractLabel, ...registry].slice(0, 24)),
    );
  }
}

function readRegistry(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OPTION_TAPE_REGISTRY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeReplayEvent(tick: OptionTapeTick, read: OptionMomentumRead) {
  const event: OptionReplayEvent = {
    id: `${tick.contractLabel}-${tick.ts.slice(0, 16)}-${read.verdict}`,
    ts: tick.ts,
    contractLabel: tick.contractLabel,
    side: tick.side,
    strike: tick.strike,
    expiration: tick.expiration,
    mark: tick.mark,
    verdict: read.verdict,
    detail: read.detail,
  };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OPTION_MEMORY_KEY) ?? "[]");
    const existing = Array.isArray(parsed) ? parsed : [];
    const next = [event, ...existing.filter((item: OptionReplayEvent) => item?.id !== event.id)].slice(0, 80);
    window.localStorage.setItem(OPTION_MEMORY_KEY, JSON.stringify(next));
  } catch {
    window.localStorage.setItem(OPTION_MEMORY_KEY, JSON.stringify([event]));
  }
}

function isTick(value: unknown): value is OptionTapeTick {
  return Boolean(
    value &&
      typeof value === "object" &&
      "ts" in value &&
      "contractLabel" in value &&
      "mark" in value &&
      Number.isFinite((value as OptionTapeTick).mark),
  );
}

function cleanNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 900 ? value : null;
}

function mid(bid: number | null | undefined, ask: number | null | undefined): number | null {
  const b = cleanNumber(bid);
  const a = cleanNumber(ask);
  if (b !== null && a !== null && a >= b) return Math.round(((b + a) / 2) * 100) / 100;
  return b ?? a;
}

function money(value: number | null): string {
  return value === null ? "Building" : `$${value.toFixed(2)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
}

function smaStatusLabel(read: OptionMomentumRead): "Above" | "Below" | "Testing" | "Building" {
  if (read.sma200 === null) return "Building";
  if (read.touchedFiveMinuteSma) return "Testing";
  return read.aboveFiveMinuteSma ? "Above" : "Below";
}

function emaStatusLabel(read: OptionMomentumRead): "Confirmed" | "Not Yet" | "Building" {
  if (read.ema8 === null || read.ema21 === null) return "Building";
  return read.emaCrossUp ? "Confirmed" : "Not Yet";
}

function entryStatusLabel(read: OptionMomentumRead): "Confirmed" | "Waiting" {
  return read.verdict === "confirmed" ? "Confirmed" : "Waiting";
}

function statusTone(value: string): "bull" | "gold" | "bear" | "ink" {
  if (value === "Confirmed" || value === "Above") return "bull";
  if (value === "Testing" || value === "Waiting" || value === "Not Yet") return "gold";
  if (value === "Below") return "bear";
  return "ink";
}

function metricValueDetail(metric: "sma" | "ema" | "ready", read: OptionMomentumRead): string {
  if (metric === "sma") return `Current 5m 200 SMA: ${money(read.sma200)}.`;
  if (metric === "ema") {
    if (read.ema8 === null || read.ema21 === null) return "EMA pair is still building.";
    return `EMA 8 ${read.ema8.toFixed(2)} vs EMA 21 ${read.ema21.toFixed(2)}.`;
  }
  return `Tape readiness ${read.fiveMinuteCount}/200 five-minute bars and ${read.oneMinuteCount} one-minute samples.`;
}
