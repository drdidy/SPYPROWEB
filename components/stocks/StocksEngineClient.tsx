"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  Layers3,
  RotateCcw,
  Search,
  Shield,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusPill } from "@/components/ui/StatusPill";
import { StockLogo } from "@/components/stocks/StockLogo";
import { getStockIdentity } from "@/lib/stocks/logos";
import { cn } from "@/lib/utils";
import type {
  LineProjection,
  PublicStockEngineSnapshot,
  PublicStockPivot,
  StockLineKey,
} from "@/lib/stocks/types";

type ManualOverride = {
  primaryHigh: number;
  primaryTimestamp: string;
} | null;

type SnapshotState =
  | { status: "ready"; snapshot: PublicStockEngineSnapshot }
  | { status: "loading"; snapshot: PublicStockEngineSnapshot | null }
  | { status: "error"; snapshot: PublicStockEngineSnapshot | null; message: string };

export function StocksEngineClient({
  tickers,
  initialSnapshot,
  initialError,
}: {
  tickers: string[];
  initialSnapshot: PublicStockEngineSnapshot | null;
  initialError: string | null;
}) {
  const defaultTicker = initialSnapshot?.ticker ?? tickers[0] ?? "AAPL";
  const featuredTickers = useMemo(() => buildFeaturedTickers(tickers), [tickers]);
  const [ticker, setTicker] = useState(defaultTicker);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, setState] = useState<SnapshotState>(
    initialSnapshot
      ? { status: "ready", snapshot: initialSnapshot }
      : initialError
        ? { status: "error", snapshot: null, message: initialError }
        : { status: "loading", snapshot: null },
  );

  useEffect(() => {
    if (!initialSnapshot && !initialError) {
      void loadSnapshot(defaultTicker);
    }
    // initialSnapshot is intentionally only used to seed the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSnapshot(nextTicker: string, override: ManualOverride = null) {
    setTicker(nextTicker);
    setState((current) => ({ status: "loading", snapshot: current.snapshot }));
    const params = new URLSearchParams({ ticker: nextTicker });
    if (override) {
      params.set("overrideHigh", String(override.primaryHigh));
      params.set("overrideTimestamp", override.primaryTimestamp);
    }
    try {
      const res = await fetch(`/api/stocks/snapshot?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as unknown;
      if (!res.ok || !isPublicStockSnapshot(body)) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Stocks snapshot failed.";
        throw new Error(message);
      }
      setState({ status: "ready", snapshot: body });
    } catch (error) {
      setState((current) => ({
        status: "error",
        snapshot: current.snapshot,
        message: error instanceof Error ? error.message : "Stocks snapshot failed.",
      }));
    }
  }

  const snapshot = state.snapshot;

  return (
    <div className="w-full min-w-0 max-w-[1440px] space-y-10 overflow-hidden pb-16 xl:overflow-visible">
      <StocksHeader
        ticker={ticker}
        tickers={tickers}
        featuredTickers={featuredTickers}
        loading={state.status === "loading"}
        error={state.status === "error" ? state.message : null}
        snapshot={snapshot}
        onTickerChange={(nextTicker) => {
          setNotice(null);
          void loadSnapshot(nextTicker);
        }}
      />

      {snapshot ? (
        <>
          {snapshot.session.bias_flipped && (
            <div className="rounded-card border border-gold/45 bg-gold-tint px-4 py-3 text-[13px] text-gold-ink shadow-card">
              Control read flipped to {snapshot.session.current_bias}. Now hunting{" "}
              {snapshot.session.current_bias === "bullish" ? "calls" : "puts"}.
            </div>
          )}

          <section className="space-y-5">
            <SectionLabel number="01">Control Map</SectionLabel>
            <StockStructureMap snapshot={snapshot} />
          </section>

          <section className="space-y-5">
            <SectionLabel number="02">Trade Plan</SectionLabel>
            <StocksDecisionSlate snapshot={snapshot} />
          </section>

          <section className="space-y-5">
            <SectionLabel number="03">Session Timing</SectionLabel>
            <StockSessionTimingCard snapshot={snapshot} />
          </section>

          <details className="group rounded-card border border-rule bg-paper shadow-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              Advanced review
              <span className="text-ink-4 transition group-open:rotate-45">+</span>
            </summary>
            <div className="space-y-5 border-t border-rule p-5">
              <BriefBand snapshot={snapshot} />
              <StockWorkflowRibbon snapshot={snapshot} loading={state.status === "loading"} />
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 xl:col-span-5">
                  <SessionTape snapshot={snapshot} />
                </div>
                <div className="col-span-12 xl:col-span-7">
                  <CoverageGuard snapshot={snapshot} />
                </div>
              </div>
              <div className="max-w-xl">
                <PivotStatusPanel
                  snapshot={snapshot}
                  notice={notice}
                  loading={state.status === "loading"}
                  onRedetect={() => {
                    setNotice("Refreshing the current session setup.");
                    void loadSnapshot(ticker);
                  }}
                  onOverride={(next) => {
                    setNotice("Manual anchor override applied to the current read.");
                    void loadSnapshot(ticker, next);
                  }}
                />
              </div>
            </div>
          </details>
        </>
      ) : (
        <Card>
          <CardHeader
            eyebrow="Stocks Control Map"
            title="Read temporarily unavailable"
            meta="Measured structure required"
          />
          <CardBody>
            <p className="max-w-2xl text-[13px] leading-relaxed text-ink-3">
              The stock Control Map could not load the selected ticker. The page
              waits for confirmed structure before publishing a trade read.
            </p>
            {state.status === "error" && (
              <p className="mt-3 rounded-[8px] border border-bear/25 bg-bear-tint px-3 py-2 text-[12px] text-bear-ink">
                {state.message}
              </p>
            )}
            <Button
              className="mt-4"
              size="sm"
              variant="secondary"
              onClick={() => void loadSnapshot(ticker)}
            >
              <RotateCcw size={13} />
              Retry Control Map
            </Button>
          </CardBody>
        </Card>
      )}

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        <span>Not financial advice. Use the read with your own risk process.</span>
        <span className="flex flex-wrap items-center gap-3">
          <Link href="/methodology/stocks" className="hover:text-ink">
            Stocks methodology
          </Link>
          <Link href="/risk" className="hover:text-ink">
            Risk
          </Link>
        </span>
      </footer>
    </div>
  );
}

function StocksHeader({
  ticker,
  tickers,
  featuredTickers,
  loading,
  error,
  snapshot,
  onTickerChange,
}: {
  ticker: string;
  tickers: string[];
  featuredTickers: string[];
  loading: boolean;
  error: string | null;
  snapshot: PublicStockEngineSnapshot | null;
  onTickerChange: (ticker: string) => void;
}) {
  const identity = getStockIdentity(ticker);
  const [query, setQuery] = useState("");
  const filteredTickers = tickers.filter((item) => {
    const stock = getStockIdentity(item);
    const q = query.trim().toLowerCase();
    return item === ticker || !q || item.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q);
  });

  return (
    <header className="contrast-dark relative overflow-hidden rounded-[18px] border border-[#C9A227]/55 bg-[#071116] px-5 py-4 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-6 md:py-5">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
      />
      <div className="relative grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft/82">
              Stocks Channel
            </span>
            <span className="hidden h-px w-10 bg-gold/45 sm:block" />
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.20em] text-paper/48 sm:inline">
              Tracked equities
            </span>
            <span
              className={cn(
                "rounded-pill border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]",
                snapshot?.dataMode === "live"
                  ? "border-bull/35 bg-bull/10 text-bull-soft"
                  : "border-gold/35 bg-gold-soft/10 text-gold-soft",
              )}
            >
              {snapshot ? feedBadgeLabel(snapshot) : "Resolving read"}
            </span>
          </div>
          <h1 className="mt-2 max-w-full text-[34px] font-serif leading-none tracking-tight text-paper md:text-[42px]">
            Today&apos;s {ticker}{" "}
            <span className="block text-gold-soft/72 italic font-light sm:inline">
              Control Map.
            </span>
          </h1>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-paper/72">
            {snapshot
              ? stockHeroSynthesis(snapshot)
              : "Select a tracked stock to load its Control Line, gates, and trade plan."}
          </p>
          <p
            className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/46 tabular-nums"
            aria-live="polite"
          >
            {snapshot
              ? `Updated ${formatDateTime(snapshot.dataAsOf)}`
              : error
                ? "Stock read unavailable"
                : "Resolving stock read"}
          </p>
        </div>
        <div className="min-w-0 rounded-[14px] border border-paper/12 bg-paper/[0.055] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-3">
            <StockLogo ticker={ticker} size="lg" dark />
            <div className="min-w-0">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/52">
                Stock selector
              </label>
              <div className="mt-1 truncate font-serif text-[24px] leading-none text-paper">
                {ticker}
              </div>
              <div className="mt-1 truncate text-[11px] text-paper/50">
                {identity.name}
              </div>
            </div>
            {loading && (
              <span className="ml-auto h-2.5 w-2.5 rounded-full bg-gold-soft shadow-[0_0_18px_rgba(244,228,192,0.72)] animate-pulse" />
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
            <label className="contrast-dark flex h-9 items-center gap-2 rounded-[8px] border border-paper/12 bg-[#050D12] px-3 text-paper/70 focus-within:ring-2 focus-within:ring-gold/45">
              <Search size={14} className="text-paper/40" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-paper outline-none placeholder:text-paper/35"
              />
            </label>
            <select
              value={ticker}
              onChange={(event) => onTickerChange(event.target.value)}
              disabled={loading}
              className="contrast-dark h-9 w-full rounded-[8px] border border-paper/12 bg-[#050D12] px-3 font-mono text-[13px] font-semibold text-paper outline-none transition focus:ring-2 focus:ring-gold/45 disabled:cursor-wait disabled:opacity-70"
              aria-label="Select a tracked stock"
            >
              {filteredTickers.map((item) => (
                <option key={item} value={item}>
                  {item} - {getStockIdentity(item).name}
                </option>
              ))}
            </select>
          </div>
          <TickerQuickRail
            tickers={featuredTickers}
            activeTicker={ticker}
            loading={loading}
            onSelect={onTickerChange}
          />
          {snapshot && snapshot.ticker !== ticker && (
            <p className="mt-3 rounded-[8px] border border-gold/25 bg-gold-soft/10 px-3 py-2 text-[12px] leading-relaxed text-gold-soft">
              Showing the last loaded read for {snapshot.ticker} while {ticker} refreshes.
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-[8px] border border-bear/30 bg-bear/10 px-3 py-2 text-[12px] leading-relaxed text-bear-soft">
              {error}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

function BriefBand({ snapshot }: { snapshot: PublicStockEngineSnapshot }) {
  const displayBias = stockBiasDisplay(snapshot);
  const biasTone =
    displayBias.direction === "bullish"
      ? "text-bull-ink"
      : displayBias.direction === "bearish"
        ? "text-bear-ink"
        : "text-ink";
  return (
    <div className="grid gap-3 rounded-card border border-rule bg-paper p-3 shadow-card md:grid-cols-5">
      <BriefTile
        label="Ticker"
        value={snapshot.ticker}
        support={getStockIdentity(snapshot.ticker).name}
        icon={<StockLogo ticker={snapshot.ticker} size="sm" />}
      />
      <BriefTile
        label="Location"
        value={displayBias.label}
        valueClassName={biasTone}
        support={locationLabel(snapshot)}
      />
      <BriefTile
        label="Control Line"
        value={money(snapshot.currentProjection.main_line)}
        support={biasSupport(snapshot)}
      />
      <BriefTile
        label="Nearest Gate"
        value={gateLabel(snapshot.currentProjection.active_line)}
        support={money(lineValue(snapshot.currentProjection, snapshot.currentProjection.active_line))}
      />
      <BriefTile
        label="Trade Plan"
        value={snapshot.decision}
        valueClassName={snapshot.decision === "Trade Allowed" ? "text-bull-ink" : "text-gold-ink"}
        support={`${snapshot.conviction}% conviction`}
      />
    </div>
  );
}

function BriefTile({
  label,
  value,
  support,
  valueClassName,
  icon,
}: {
  label: string;
  value: string;
  support: string;
  valueClassName?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/40 px-3 py-3">
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {label}
          </div>
          <div className={cn("mt-1 truncate font-serif text-[22px] leading-none text-ink", valueClassName)}>
            {value}
          </div>
        </div>
      </div>
      <div className="mt-2 font-mono text-[11px] text-ink-3 tabular-nums">
        {support}
      </div>
    </div>
  );
}

function StockWorkflowRibbon({
  snapshot,
  loading,
}: {
  snapshot: PublicStockEngineSnapshot;
  loading: boolean;
}) {
  const activePrice = lineValue(
    snapshot.currentProjection,
    snapshot.currentProjection.active_line,
  );
  const steps = [
    {
      icon: <Database size={15} />,
      label: "Read",
      value: `${snapshot.ticker} Control Line prepared`,
    },
    {
      icon: <Activity size={15} />,
      label: "Project",
      value: `${gateLabel(snapshot.currentProjection.active_line)} ${money(activePrice)}`,
    },
    {
      icon: <Target size={15} />,
      label: "Decide",
      value: snapshot.decision,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {steps.map((step, index) => (
        <div
          key={step.label}
          className="group relative overflow-hidden rounded-[12px] border border-rule bg-paper px-4 py-3 shadow-card"
        >
          <div
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-1 bg-gold/55 transition-all duration-500",
              loading && "animate-pulse",
            )}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px translate-x-[-100%] bg-gradient-to-r from-transparent via-gold/60 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]"
          />
          <div className="relative flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-rule bg-paper-2 text-gold-ink">
              {step.icon}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                {String(index + 1).padStart(2, "0")} {step.label}
              </div>
              <div className="mt-1 truncate text-[13px] font-semibold text-ink">
                {step.value}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StockStructureMap({ snapshot }: { snapshot: PublicStockEngineSnapshot }) {
  const active = snapshot.currentProjection.active_line;
  const activePrice = lineValue(snapshot.currentProjection, active);
  const railPercent = railPositionPercent(snapshot);
  const room = equityRoomRead(snapshot);
  const Icon =
    snapshot.session.current_bias === "bullish"
      ? ArrowUpRight
      : snapshot.session.current_bias === "bearish"
        ? ArrowDownRight
        : Clock3;
  const tone =
    snapshot.session.current_bias === "bullish"
      ? "text-bull-ink"
      : snapshot.session.current_bias === "bearish"
        ? "text-bear-ink"
        : "text-gold-ink";

  return (
    <Card className="relative overflow-hidden bg-paper">
      <div className="absolute bottom-0 left-0 top-0 w-[3px] bg-gold/55" />
      <div className="grid grid-cols-12 gap-0">
        <div className="col-span-12 p-5 sm:p-7 lg:col-span-5 lg:pl-8 lg:pr-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="eyebrow text-ink-3">Stock Control Map</span>
              <span className="font-mono text-[10px] text-ink-4">
                Session {snapshot.session.session_date}
              </span>
            </div>
            <StatusPill variant={snapshot.decision === "Trade Allowed" ? "confirmed" : "watching"} pulse>
              {snapshot.decision}
            </StatusPill>
          </div>

          <div className="mt-6 flex items-end gap-4">
            <StockLogo ticker={snapshot.ticker} size="md" />
            <Icon className={cn(tone, "-mb-2")} size={36} strokeWidth={1.25} />
            <h2 className={cn("text-display font-serif leading-[1.02] tracking-tight", tone)}>
              {headlineFor(snapshot)}
            </h2>
          </div>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
            {referenceRelationCopy(snapshot)} The active gate is{" "}
            <span className="font-semibold text-ink">
              {gateLabel(active)} {money(activePrice)}
            </span>
            . {structureFeedCopy(snapshot)}
          </p>

          {room.lower && room.upper && (
            <div className="mt-4 grid gap-2 rounded-[12px] border border-rule bg-paper-2/55 p-3 sm:grid-cols-2">
              <RoomAction label="Call watch" gate={room.lower.label} value={room.lower.value} />
              <RoomAction label="Put watch" gate={room.upper.label} value={room.upper.value} />
            </div>
          )}

          <div className="mt-7 max-w-md">
            <div
              data-equity-active-reference
              className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
            >
              <span className="eyebrow text-ink-3">Active gate</span>
              <span className="min-w-0 max-w-full text-right font-mono text-[12px] font-semibold leading-tight tabular-nums text-ink sm:text-[13px]">
                <span className="mr-1.5">{gateLabel(active)} </span>
                <span className="inline-block max-w-full overflow-hidden text-ellipsis align-bottom text-ink-4">
                  {money(activePrice)}
                </span>
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-paper-2">
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink/25" />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-ink transition-[width] duration-700"
                style={{ width: `${railPercent}%` }}
              />
              <div
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-gold shadow-[0_0_0_4px_rgba(184,130,31,0.16)] transition-[left] duration-700"
                style={{ left: `${railPercent}%` }}
                aria-hidden
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
              <span>South Gate II</span>
              <span>Current price position</span>
              <span>North Gate II</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <RailStat label="North Gate II" value={snapshot.currentProjection.upper_2_line} active={active === "upper_2"} />
            <RailStat label="North Gate I" value={snapshot.currentProjection.upper_line} active={active === "upper"} />
            <RailStat label="Control Line" value={snapshot.currentProjection.main_line} active={active === "main"} />
            <RailStat label="South Gate I" value={snapshot.currentProjection.lower_line} active={active === "lower"} />
            <RailStat label="South Gate II" value={snapshot.currentProjection.lower_2_line} active={active === "lower_2"} />
          </div>
        </div>

        <div className="hidden lg:block absolute left-[41.666%] top-7 bottom-7 w-px bg-rule" />

        <div className="col-span-12 bg-paper-2/40 p-5 sm:p-7 lg:col-span-7 lg:pl-7">
          <StockControlRoom snapshot={snapshot} />

          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <AnchorCell label="Control anchor" pivot={snapshot.primaryPivot} />
            <AnchorCell label="Backup context" pivot={snapshot.secondaryPivot} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function RoomAction({
  label,
  gate,
  value,
}: {
  label: string;
  gate: string;
  value: number;
}) {
  return (
    <div className="rounded-[9px] border border-rule bg-paper px-3 py-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="mt-1 min-w-0 truncate font-mono text-[12px] font-semibold text-ink">
        {gate} <span className="text-ink-4">{money(value)}</span>
      </div>
    </div>
  );
}

function StockControlRoom({ snapshot }: { snapshot: PublicStockEngineSnapshot }) {
  const availableHours = useMemo(() => {
    const hours = Array.from(
      new Set(
        snapshot.projections
          .map((projection) => ctHour(projection.timestamp))
          .filter((hour) => Number.isFinite(hour) && hour >= 3 && hour <= 15),
      ),
    ).sort((a, b) => a - b);
    return hours.length > 0 ? hours : [9];
  }, [snapshot.projections]);
  const hoursKey = availableHours.join(",");
  const [selectedHour, setSelectedHour] = useState(() =>
    availableHours.includes(9) ? 9 : availableHours[0] ?? 9,
  );
  const [selectedFocus, setSelectedFocus] = useState<"ceiling" | "price" | "floor">("price");

  useEffect(() => {
    if (!availableHours.includes(selectedHour)) {
      setSelectedHour(availableHours.includes(9) ? 9 : availableHours[0] ?? 9);
    }
  }, [availableHours, selectedHour]);

  const selectedProjection =
    snapshot.projections.find((projection) => ctHour(projection.timestamp) === selectedHour) ??
    snapshot.currentProjection;
  const selectedCandle = stockCandleForHour(snapshot, selectedHour);
  const selectedPrice = selectedCandle?.close ?? snapshot.session.current_price;
  const hasPrice = Number.isFinite(selectedPrice) && selectedPrice > 0;
  const gateRows = stockRoomGates(selectedProjection);
  const ordered = gateRows.slice().sort((a, b) => a.value - b.value);
  const lower = hasPrice
    ? (ordered.filter((gate) => gate.value <= selectedPrice).at(-1) ?? null)
    : null;
  const upper = hasPrice
    ? (ordered.find((gate) => gate.value > selectedPrice) ?? null)
    : null;
  const progress =
    lower && upper
      ? Math.max(
          0,
          Math.min(1, (selectedPrice - lower.value) / Math.max(0.01, upper.value - lower.value)),
        )
      : 0.5;
  const carTop = lower && upper ? 76 - progress * 52 : upper ? 70 : 30;
  const nearCeiling = Math.abs(carTop - 24) < 14;
  const nearFloor = Math.abs(carTop - 76) < 14;
  const priceBadgeTop = nearCeiling ? 44 : nearFloor ? 56 : carTop;
  const priceBadgeOffset = Math.abs(priceBadgeTop - carTop);
  const titleText = stockRoomTitle(lower, upper, hasPrice);
  const bias = stockBiasDisplay(snapshot);
  const selectedSource = selectedCandle ? `${stockRoomHourLabel(selectedHour)} Close` : "Latest Price";
  const selectedHourIndex = Math.max(0, availableHours.indexOf(selectedHour));
  const inspectedValue =
    selectedFocus === "ceiling" ? upper?.value ?? null : selectedFocus === "floor" ? lower?.value ?? null : hasPrice ? selectedPrice : null;
  const inspectedLabel =
    selectedFocus === "ceiling" ? upper?.label ?? "Ceiling" : selectedFocus === "floor" ? lower?.label ?? "Floor" : selectedSource;
  const inspectedDistance =
    selectedFocus === "ceiling"
      ? upper
        ? upper.value - selectedPrice
        : null
      : selectedFocus === "floor"
        ? lower
          ? selectedPrice - lower.value
          : null
        : 0;
  const inspectedNote =
    selectedFocus === "price"
      ? `${snapshot.ticker} price marker for ${stockRoomHourLabel(selectedHour)}.`
      : inspectedValue === null
        ? "No gate is available on this side of the room."
        : `${Math.abs(inspectedDistance ?? 0).toFixed(2)} pts from the selected price marker.`;
  const moveHour = (delta: number) => {
    const nextIndex = Math.max(0, Math.min(availableHours.length - 1, selectedHourIndex + delta));
    setSelectedHour(availableHours[nextIndex]);
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
    <div className="overflow-hidden rounded-[14px] border border-rule bg-ink text-paper shadow-card">
      <div className="relative min-h-[420px] p-4 sm:p-5">
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <StockLogo ticker={snapshot.ticker} size="md" dark />
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
                {snapshot.ticker} Control Room
              </div>
              <motion.div
                key={`${snapshot.ticker}-${titleText}-${hoursKey}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className="mt-1 font-serif text-[24px] leading-none text-paper"
              >
                {titleText}
              </motion.div>
            </div>
          </div>
          <span className="shrink-0 rounded-[8px] border border-white/10 bg-white/[0.06] px-2.5 py-2 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-paper/60">
            Gate values
            <span className="mt-0.5 block text-gold-soft">
              {stockRoomHourLabel(selectedHour)}
            </span>
          </span>
        </div>

        <div
          role="group"
          tabIndex={0}
          aria-label={`Interactive ${snapshot.ticker} Control Room, ${stockRoomHourLabel(selectedHour)}, ${titleText}`}
          onClick={inspectFromPointer}
          onKeyDown={onRoomKeyDown}
          className="relative mt-5 h-[250px] cursor-crosshair overflow-hidden rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(184,130,31,0.16),rgba(255,255,255,0.035)_46%,rgba(0,0,0,0.12)_100%)] outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
            <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/58">
              {selectedHour === 9 ? "Control Room" : "planning hour"}
            </span>
            <span
              className={cn(
                "rounded-[8px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]",
                bias.direction === "bullish"
                  ? "border-bull/30 bg-bull/12 text-bull-soft"
                  : bias.direction === "bearish"
                    ? "border-bear/30 bg-bear/12 text-bear-soft"
                    : "border-gold/30 bg-gold/12 text-gold-soft",
              )}
            >
              {bias.label}
            </span>
          </div>
          <div className="absolute bottom-4 left-1/2 top-4 w-[84px] -translate-x-1/2 rounded-full border border-white/10 bg-black/20 shadow-[inset_0_0_30px_rgba(0,0,0,0.40)]" />
          <motion.div
            key={`stock-room-${snapshot.ticker}-${selectedHour}-${titleText}`}
            className="absolute left-[calc(50%_-_70px)] top-[24%] h-[52%] w-[140px] rounded-[24px] border border-gold/40 bg-gold/12 shadow-[0_0_38px_rgba(184,130,31,0.20)]"
            initial={{ opacity: 0, scaleX: 0.88 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <StockRoomLine
            type="ceiling"
            top="24%"
            label={upper?.label ?? "None"}
            value={upper?.value ?? null}
            distance={upper ? upper.value - selectedPrice : null}
            active={selectedFocus === "ceiling"}
            onSelect={() => setSelectedFocus("ceiling")}
          />
          <StockRoomLine
            type="floor"
            top="76%"
            label={lower?.label ?? "None"}
            value={lower?.value ?? null}
            distance={lower ? selectedPrice - lower.value : null}
            active={selectedFocus === "floor"}
            onSelect={() => setSelectedFocus("floor")}
          />
          {gateRows.map((gate) => {
            if (gate.value === upper?.value || gate.value === lower?.value) return null;
            const top = stockGateTop(gate.value, ordered);
            return (
              <div
                key={`${gate.key}-${gate.value}`}
                className="absolute left-[calc(50%_-_54px)] right-[calc(50%_-_54px)] h-px bg-white/13"
                style={{ top: `${top}%` }}
                aria-hidden
              />
            );
          })}
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
            key={`stock-price-${snapshot.ticker}-${selectedHour}-${selectedPrice}`}
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
                  {selectedSource}
                </span>
                <span className="block font-mono text-[13px] font-semibold tabular-nums text-paper">
                  {hasPrice ? money(selectedPrice) : "Waiting"}
                </span>
              </span>
            </span>
          </motion.div>
        </div>

        <motion.div
          key={`stock-inspect-${snapshot.ticker}-${selectedHour}-${selectedFocus}`}
          className="relative mt-3 rounded-[10px] border border-gold/25 bg-gold/12 p-3"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-soft">
            Room inspection
          </div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div className="font-serif text-[20px] leading-none text-paper">{inspectedLabel}</div>
            <div className="font-mono text-[13px] font-semibold tabular-nums text-paper">
              {inspectedValue === null ? "Waiting" : money(inspectedValue)}
            </div>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-paper/68">{inspectedNote}</p>
        </motion.div>

        <div className="relative mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {availableHours.map((hour) => {
            const activeHour = hour === selectedHour;
            const hasCandle = Boolean(stockCandleForHour(snapshot, hour));
            return (
              <button
                key={hour}
                type="button"
                aria-pressed={activeHour}
                onClick={() => setSelectedHour(hour)}
                className={cn(
                  "h-9 rounded-[8px] border px-1 font-mono text-[10px] font-semibold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
                  activeHour
                    ? "border-gold bg-gold text-ink shadow-glow"
                    : "border-white/10 bg-white/[0.06] text-paper/78 hover:border-gold/50 hover:bg-white/[0.10]",
                  !hasCandle && "text-paper/48",
                )}
                title={hasCandle ? `${stockRoomHourLabel(hour)} candle available` : "Planning projection"}
              >
                {stockRoomHourLabel(hour)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StockRoomLine({
  type,
  top,
  label,
  value,
  distance,
  active = false,
  onSelect,
}: {
  type: "ceiling" | "floor";
  top: string;
  label: string;
  value: number | null;
  distance: number | null;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      className={cn(
        "absolute inset-x-4 z-40 rounded-[10px] px-1 py-1 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-gold/45",
        active ? "bg-gold/10" : "hover:bg-white/[0.04]",
      )}
      style={{ top }}
    >
      <div className="h-px bg-gold/70 shadow-[0_0_22px_rgba(184,130,31,0.45)]" />
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-gold-soft">
        <span className="max-w-[42%] truncate">{label}</span>
        <span className="rounded-[7px] border border-gold/25 bg-ink/80 px-2 py-1 tabular-nums">
          {value !== null ? money(value) : "Waiting"}
        </span>
      </div>
      {distance !== null && (
        <div
          className={cn(
            "absolute right-1 rounded-[7px] border border-white/10 bg-black/25 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-paper/62",
            type === "ceiling" ? "top-7" : "-top-8",
          )}
        >
          {distance.toFixed(2)} pts
        </div>
      )}
    </button>
  );
}

function RailStat({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active: boolean;
}) {
  return (
    <div
      data-equity-rail-stat
      className={cn(
        "min-w-0 overflow-hidden rounded-soft px-2.5 py-2 shadow-rule",
        active ? "bg-gold-tint ring-1 ring-gold/30" : "bg-paper",
      )}
    >
      <div className="eyebrow mb-0.5 truncate text-ink-3">{label}</div>
      <div className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold leading-tight tabular-nums text-ink">
        {money(value)}
      </div>
    </div>
  );
}

function StocksDecisionSlate({ snapshot }: { snapshot: PublicStockEngineSnapshot }) {
  const setup = snapshot.setup;
  const testedLine = snapshot.latestCandidate?.line_tested ?? snapshot.currentProjection.active_line;
  const retestLevel =
    snapshot.latestCandidate?.line_price_at_candle ??
    lineValue(snapshot.currentProjection, snapshot.currentProjection.active_line);
  const entryKnown = setup
    ? snapshot.candles.some((candle) => candle.timestamp === setup.entry_timestamp)
    : false;
  const entryLabel = setup
    ? entryKnown
      ? money(setup.entry_price)
      : "Next hourly open"
    : "Waiting";
  const Icon =
    snapshot.verdict === "LONG"
      ? ArrowUpRight
      : snapshot.verdict === "SHORT"
        ? ArrowDownRight
        : Clock3;
  const tone =
    snapshot.verdict === "LONG"
      ? "text-bull-ink"
      : snapshot.verdict === "SHORT"
        ? "text-bear-ink"
        : "text-gold-ink";

  return (
    <Card>
      <CardHeader
        eyebrow="Trade Plan"
        title={
          <span className="flex items-center gap-3">
            <Icon className={tone} size={28} strokeWidth={1.5} />
            <span className={cn("font-serif text-[34px] leading-none", tone)}>
              {snapshot.verdict}
            </span>
          </span>
        }
        meta={`${snapshot.decision} - ${snapshot.ticker} - ${snapshot.conviction}% conviction`}
      />
      <CardBody>
        <p className="text-[14px] leading-relaxed text-ink-2">
          {setup
            ? `${snapshot.ticker} confirmed at ${gateLabel(testedLine)}. Entry is evaluated at the next hourly open with target, stop, breakeven, and chase guard already mapped.`
            : `${snapshot.ticker} is still in watch mode. Wait for a clean touch and close through the active gate.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SlateMetric
            label="Entry"
            value={entryLabel}
            support={setup ? formatHour(setup.entry_timestamp) : "No trigger yet"}
          />
          <SlateMetric
            label="Target"
            value={setup ? money(setup.target_price) : "Waiting"}
            support={setup ? gateLabel(setup.target_line) : "No target yet"}
            tone="bull"
          />
          <SlateMetric
            label="Stop"
            value={setup ? money(setup.stop_price) : "Waiting"}
            support="Wick plus buffer"
            tone="bear"
          />
          <SlateMetric
            label="Breakeven"
            value={setup ? money(setup.breakeven_trigger_price) : "Waiting"}
            support="50% to target"
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Guardrail
            icon={<Shield size={15} />}
            label="Chase guard"
            value={setup?.chase_guard_active ? "Active" : "Clear"}
            tone={setup?.chase_guard_active ? "bear" : "bull"}
          />
          <Guardrail
            icon={<RotateCcw size={15} />}
            label="Retest level"
            value={money(retestLevel)}
          />
          <Guardrail
            icon={<CheckCircle2 size={15} />}
            label="Daily stop"
            value="0 of 2 losses"
            tone="bull"
          />
        </div>
      </CardBody>
    </Card>
  );
}

function SlateMetric({
  label,
  value,
  support,
  tone = "ink",
}: {
  label: string;
  value: string;
  support?: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const toneClass =
    tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink";
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/40 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-[16px] font-semibold tabular-nums", toneClass)}>
        {value}
      </div>
      {support && <div className="mt-1 text-[11px] text-ink-3">{support}</div>}
    </div>
  );
}

function Guardrail({
  icon,
  label,
  value,
  tone = "ink",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "ink" | "bull" | "bear";
}) {
  const toneClass =
    tone === "bull" ? "text-bull-ink" : tone === "bear" ? "text-bear-ink" : "text-ink";
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-rule bg-paper px-3 py-3">
      <span className="grid h-8 w-8 place-items-center rounded-[8px] border border-rule bg-paper-2 text-gold-ink">
        {icon}
      </span>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {label}
        </div>
        <div className={cn("text-[13px] font-semibold", toneClass)}>{value}</div>
      </div>
    </div>
  );
}

function StockSessionTimingCard({ snapshot }: { snapshot: PublicStockEngineSnapshot }) {
  const rows = [
    {
      label: "Premarket read",
      time: "03:00-09:00 CT",
      detail: "Location is monitored into the Control Room before a directional read earns attention.",
    },
    {
      label: "Control Map",
      time: "09:00 CT",
      detail: `${snapshot.ticker} uses the Control Line and gates as the operating map for the trade day.`,
    },
    {
      label: "Decision window",
      time: "09:00-12:00 CT",
      detail: "A clean touch and close through an active gate sets the next qualified hourly read.",
    },
  ];

  return (
    <div className="rounded-[18px] border border-rule bg-paper p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-ink-3">Session Timing</div>
          <h2 className="mt-2 font-serif text-[28px] leading-none text-ink md:text-[34px]">
            Let the trade-day map form first.
          </h2>
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-2 px-4 py-3 text-right">
          <div className="eyebrow text-ink-3">Session</div>
          <div className="mt-1 font-mono text-[15px] font-semibold text-ink tabular-nums">
            {snapshot.session.session_date}
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-[14px] border border-rule bg-paper-2/70 px-4 py-3">
            <div className="eyebrow text-ink-3">{row.label}</div>
            <div className="mt-1 font-mono text-[16px] font-semibold text-ink tabular-nums">
              {row.time}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{row.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PivotStatusPanel({
  snapshot,
  notice,
  loading,
  onRedetect,
  onOverride,
}: {
  snapshot: PublicStockEngineSnapshot;
  notice: string | null;
  loading: boolean;
  onRedetect: () => void;
  onOverride: (override: NonNullable<ManualOverride>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manualHigh, setManualHigh] = useState(
    snapshot.primaryPivot.pivot_high.toFixed(2),
  );
  const [manualHour, setManualHour] = useState(
    String(ctHour(snapshot.primaryPivot.pivot_timestamp)),
  );

  useEffect(() => {
    setManualHigh(snapshot.primaryPivot.pivot_high.toFixed(2));
    setManualHour(String(ctHour(snapshot.primaryPivot.pivot_timestamp)));
  }, [snapshot.primaryPivot.pivot_high, snapshot.primaryPivot.pivot_timestamp]);

  return (
    <Card>
      <CardHeader
        eyebrow="Control setup"
        title="Anchor check"
        meta="Ready for the trade day"
        action={<Database size={16} className="text-gold-ink" />}
      />
      <CardBody>
        <PivotBlock label="Control anchor" pivot={snapshot.primaryPivot} prominent />
        <div className="mt-4">
          {snapshot.secondaryPivot ? (
            <PivotBlock label="Backup context" pivot={snapshot.secondaryPivot} />
          ) : (
            <div className="rounded-[10px] border border-rule bg-paper-2/40 px-3 py-3 text-[13px] text-ink-3">
              No backup context is needed for this read.
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onRedetect} disabled={loading}>
            <RotateCcw size={13} />
            Refresh setup
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((next) => !next)}>
            Manual override
          </Button>
        </div>
        {notice && (
          <p className="mt-3 rounded-[8px] border border-gold/35 bg-gold-tint px-3 py-2 text-[12px] text-gold-ink">
            {notice}
          </p>
        )}
        {snapshot.dataWarning && (
          <p className="mt-3 rounded-[8px] border border-rule bg-paper-2/55 px-3 py-2 text-[12px] leading-relaxed text-ink-3">
            {snapshot.dataWarning}
          </p>
        )}
        {open && (
          <form
            className="mt-4 space-y-3 rounded-[10px] border border-rule bg-paper-2/50 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const high = Number(manualHigh);
              const hour = Number(manualHour);
              if (!Number.isFinite(high) || !Number.isFinite(hour)) return;
              if (hour < 3 || hour > 18) return;
              const date = ctDateKey(snapshot.primaryPivot.pivot_timestamp);
              const nextTimestamp = ctLocalDateHourToIso(date, hour);
              onOverride({ primaryHigh: high, primaryTimestamp: nextTimestamp });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] text-ink-3">
                Reference price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualHigh}
                  onChange={(event) => setManualHigh(event.target.value)}
                  className="mt-1 h-9 w-full rounded-[7px] border border-rule bg-paper px-2 font-mono text-[13px] text-ink outline-none focus:ring-2 focus:ring-gold/35"
                />
              </label>
              <label className="text-[12px] text-ink-3">
                Anchor hour CT
                <input
                  type="number"
                  min="3"
                  max="18"
                  step="1"
                  value={manualHour}
                  onChange={(event) => setManualHour(event.target.value)}
                  className="mt-1 h-9 w-full rounded-[7px] border border-rule bg-paper px-2 font-mono text-[13px] text-ink outline-none focus:ring-2 focus:ring-gold/35"
                />
              </label>
            </div>
            <Button type="submit" size="sm" variant="primary" disabled={loading}>
              Apply override
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

function PivotBlock({
  label,
  pivot,
  prominent = false,
}: {
  label: string;
  pivot: PublicStockPivot;
  prominent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border px-3 py-3",
        prominent ? "border-gold/45 bg-gold-tint" : "border-rule bg-paper-2/40 opacity-75",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          {label}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bull-ink">
          {pivot.source === "user" ? "Override" : "Confirmed"}
        </span>
      </div>
      <div className="mt-2 font-mono text-[20px] font-semibold text-ink tabular-nums">
        {money(pivot.pivot_high)}
      </div>
      <div className="mt-1 text-[12px] text-ink-3">
        {formatDateTime(pivot.pivot_timestamp)}
      </div>
    </div>
  );
}

function SessionTape({ snapshot }: { snapshot: PublicStockEngineSnapshot }) {
  const candidate = snapshot.latestCandidate;
  const rows = [
    {
      time: "7:00 CT",
      label: "Setup prepared",
      detail: `${snapshot.ticker} Control Map prepared`,
      tone: "neutral",
    },
    {
      time: biasReferenceTime(snapshot),
      label: snapshot.session.initial_bias ? "Watch read" : "Read pending",
      detail: biasReferenceDetail(snapshot),
      tone:
        snapshot.session.initial_bias === "bullish"
          ? "bull"
          : snapshot.session.initial_bias === "bearish"
            ? "bear"
            : "neutral",
    },
    candidate
      ? {
          time: formatHour(candidate.candle_timestamp),
          label: candidate.pattern_matched === "short_rejection" ? "Put setup" : "Call setup",
          detail: `${gateLabel(candidate.line_tested)} held at ${money(candidate.line_price_at_candle)}`,
          tone: candidate.pattern_matched === "short_rejection" ? "bear" : "bull",
        }
        : {
          time: "Now",
          label: "Not confirmed",
          detail: "Waiting for confirmation at the active gate.",
          tone: "neutral",
        },
  ];

  return (
    <Card>
      <CardHeader
        eyebrow="Session tape"
        title="Recent control events"
        meta="Hourly read"
        action={<Layers3 size={16} className="text-gold-ink" />}
      />
      <CardBody className="px-0 pb-0">
        <ol className="divide-y divide-rule">
          {rows.map((row) => (
            <li
              key={`${row.time}-${row.label}`}
              className="grid gap-2 px-5 py-3 text-[13px] sm:grid-cols-[72px_120px_minmax(0,1fr)] sm:gap-3"
            >
              <time className="font-mono text-[11px] tabular-nums text-ink-3">
                {row.time}
              </time>
              <span
                className={cn(
                  "w-fit rounded-pill border px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.12em]",
                  row.tone === "bull"
                    ? "border-bull/30 bg-bull-tint text-bull-ink"
                    : row.tone === "bear"
                      ? "border-bear/30 bg-bear-tint text-bear-ink"
                      : "border-rule bg-paper-2 text-ink-3",
                )}
              >
                {row.label}
              </span>
              <span className="min-w-0 text-ink-2">{row.detail}</span>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function CoverageGuard({ snapshot }: { snapshot: PublicStockEngineSnapshot }) {
  return (
    <Card>
      <CardHeader
        eyebrow="Coverage"
        title="Focused on tracked names."
        meta="Stock Control Maps"
      />
      <CardBody>
        <p className="max-w-3xl text-[13px] leading-relaxed text-ink-3">
          Stock Control Maps stay intentionally narrow for this release:
          tracked ticker, active gate, candidate, and trade plan. The
          private tuning stays behind the product surface.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MiniRead label="Ticker" value={snapshot.ticker} icon={<StockLogo ticker={snapshot.ticker} size="sm" />} />
          <MiniRead label="Coverage" value={snapshot.modelLabel} icon={<Shield size={14} />} />
          <MiniRead label="State" value={feedBadgeLabel(snapshot)} icon={<CheckCircle2 size={14} />} />
        </div>
      </CardBody>
    </Card>
  );
}

function MiniRead({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[9px] border border-rule bg-paper-2/45 px-3 py-2">
      {icon && (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-rule bg-paper text-gold-ink">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
          {label}
        </div>
        <div className="mt-1 truncate font-mono text-[13px] font-semibold text-ink">
          {value}
        </div>
      </div>
    </div>
  );
}

function AnchorCell({
  label,
  pivot,
}: {
  label: string;
  pivot: PublicStockPivot | null;
}) {
  return (
    <div className="rounded-soft bg-paper px-2.5 py-1.5 shadow-rule">
      <div className="eyebrow mb-0.5 text-ink-3">{label}</div>
      {pivot ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums text-ink">
            {money(pivot.pivot_high)}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink-3">
            {shortClock(pivot.pivot_timestamp)} CT
          </span>
        </div>
      ) : (
        <span className="font-mono text-[11px] text-ink-4">None</span>
      )}
    </div>
  );
}

function TickerQuickRail({
  tickers,
  activeTicker,
  loading,
  onSelect,
}: {
  tickers: string[];
  activeTicker: string;
  loading: boolean;
  onSelect: (ticker: string) => void;
}) {
  if (tickers.length === 0) return null;
  return (
    <div className="mt-3 flex max-w-full gap-1.5 overflow-x-auto pb-1" aria-label="Featured stock shortcuts">
      {tickers.map((item) => {
        const active = item === activeTicker;
        return (
          <button
            key={item}
            type="button"
            disabled={loading}
            onClick={() => onSelect(item)}
            aria-label={`Load ${item} Control Map`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-[0.08em] transition",
              active
                ? "border-gold-soft/55 bg-gold-soft/16 text-gold-soft"
                : "border-paper/10 bg-paper/[0.045] text-paper/62 hover:border-paper/22 hover:text-paper",
              loading && "cursor-wait opacity-70",
            )}
          >
            <StockLogo ticker={item} size="xs" dark />
            {item}
          </button>
        );
      })}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-paper/10 bg-paper/[0.055] px-2 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-paper/42">
        {label}
      </div>
      <div className="mt-1 font-mono text-[11px] font-semibold text-paper tabular-nums">
        {value}
      </div>
    </div>
  );
}

function stockRoomGates(projection: LineProjection): Array<{
  key: StockLineKey;
  label: string;
  value: number;
}> {
  const gates: Array<{ key: StockLineKey; label: string; value: number }> = [
    { key: "upper_2", label: "North Gate II", value: projection.upper_2_line },
    { key: "upper", label: "North Gate I", value: projection.upper_line },
    { key: "main", label: "Control Line", value: projection.main_line },
    { key: "lower", label: "South Gate I", value: projection.lower_line },
    { key: "lower_2", label: "South Gate II", value: projection.lower_2_line },
  ];
  return gates.filter((gate) => Number.isFinite(gate.value));
}

function stockCandleForHour(
  snapshot: PublicStockEngineSnapshot,
  hour: number,
): PublicStockEngineSnapshot["candles"][number] | null {
  return (
    snapshot.candles
      .filter(
        (candle) =>
          ctDateKey(candle.timestamp) === snapshot.session.session_date &&
          ctHour(candle.timestamp) === hour &&
          Number.isFinite(candle.close),
      )
      .at(-1) ?? null
  );
}

function stockRoomHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function stockRoomTitle(
  lower: { label: string; value: number } | null,
  upper: { label: string; value: number } | null,
  hasPrice: boolean,
): string {
  if (!hasPrice) return "Awaiting Live Price";
  if (lower && upper) return `Between ${lower.label} and ${upper.label}`;
  if (upper) return `Below ${upper.label}`;
  if (lower) return `Above ${lower.label}`;
  return "Awaiting Structure";
}

function stockGateTop(
  value: number,
  ordered: Array<{ value: number }>,
): number {
  const min = ordered[0]?.value ?? value;
  const max = ordered.at(-1)?.value ?? value;
  const span = Math.max(0.01, max - min);
  return 86 - ((value - min) / span) * 72;
}

function lineValue(projection: LineProjection, line: StockLineKey): number {
  if (line === "upper_2") return projection.upper_2_line;
  if (line === "upper") return projection.upper_line;
  if (line === "lower") return projection.lower_line;
  if (line === "lower_2") return projection.lower_2_line;
  return projection.main_line;
}

function gateLabel(line: StockLineKey): string {
  if (line === "upper_2") return "North Gate II";
  if (line === "upper") return "North Gate I";
  if (line === "lower") return "South Gate I";
  if (line === "lower_2") return "South Gate II";
  return "Control Line";
}

function equityRoomRead(snapshot: PublicStockEngineSnapshot): {
  lower: { label: string; value: number } | null;
  upper: { label: string; value: number } | null;
} {
  const price = snapshot.session.current_price;
  const ordered = [
    { label: "South Gate II", value: snapshot.currentProjection.lower_2_line },
    { label: "South Gate I", value: snapshot.currentProjection.lower_line },
    { label: "Control Line", value: snapshot.currentProjection.main_line },
    { label: "North Gate I", value: snapshot.currentProjection.upper_line },
    { label: "North Gate II", value: snapshot.currentProjection.upper_2_line },
  ].sort((a, b) => a.value - b.value);
  let lower: { label: string; value: number } | null = null;
  let upper: { label: string; value: number } | null = null;
  for (const gate of ordered) {
    if (gate.value <= price) lower = gate;
    if (gate.value > price && upper === null) upper = gate;
  }
  return { lower, upper };
}

function locationLabel(snapshot: PublicStockEngineSnapshot): string {
  const price = snapshot.session.current_price;
  const projection = snapshot.currentProjection;
  if (!Number.isFinite(price)) return "Resolving";
  if (price >= projection.upper_2_line) return "Above North Gate II";
  if (price >= projection.upper_line) return "Between North Gates";
  if (price >= projection.main_line) return "Above the Control Line";
  if (price >= projection.lower_line) return "Below the Control Line";
  if (price >= projection.lower_2_line) return "Between South Gates";
  return "Below South Gate II";
}

function stockHeroSynthesis(snapshot: PublicStockEngineSnapshot): string {
  const displayBias = stockBiasDisplay(snapshot);
  const active = snapshot.currentProjection.active_line;
  const activePrice = lineValue(snapshot.currentProjection, active);
  const location = lowerInitial(locationLabel(snapshot));
  const direction =
    displayBias.direction === "neutral"
      ? "is waiting for the trade-day read"
      : `is on ${displayBias.direction} watch`;
  return `${snapshot.ticker} ${direction}; price is ${location}. Active gate: ${gateLabel(active)} ${money(activePrice)}.`;
}

function lowerInitial(value: string): string {
  return value.slice(0, 1).toLowerCase() + value.slice(1);
}

function headlineFor(snapshot: PublicStockEngineSnapshot): string {
  if (snapshot.latestCandidate?.pattern_matched === "short_rejection") return "Put setup confirmed";
  if (snapshot.latestCandidate?.pattern_matched === "long_rejection") return "Call bounce confirmed";
  if (snapshot.decision === "Trade Allowed") return "Setup allowed";
  if (snapshot.decision === "Chase Guard") return "Chase guard active";
  if (snapshot.session.current_bias === "bullish") return "Bullish watch";
  if (snapshot.session.current_bias === "bearish") return "Bearish watch";
  if (snapshot.dataMode === "setup_required") return "Trade-day read pending";
  return "Waiting on 9 AM read";
}

function stockBiasDisplay(snapshot: PublicStockEngineSnapshot): {
  label: string;
  direction: "bullish" | "bearish" | "neutral";
} {
  if (snapshot.latestCandidate?.pattern_matched === "short_rejection") {
    return { label: "Put Setup", direction: "bearish" };
  }
  if (snapshot.latestCandidate?.pattern_matched === "long_rejection") {
    return { label: "Call Bounce", direction: "bullish" };
  }
  if (snapshot.session.current_bias === "bullish") {
    return { label: "Bullish Watch", direction: "bullish" };
  }
  if (snapshot.session.current_bias === "bearish") {
    return { label: "Bearish Watch", direction: "bearish" };
  }
  return { label: "Pending", direction: "neutral" };
}

function biasSupport(snapshot: PublicStockEngineSnapshot): string {
  const price = snapshot.session.bias_reference_price;
  const timestamp = snapshot.session.bias_reference_timestamp;
  if (!timestamp || price === null) return "9 AM read pending";
  return `${biasReferenceLabel(snapshot)} ${money(price)}`;
}

function biasReferenceTime(snapshot: PublicStockEngineSnapshot): string {
  const timestamp = snapshot.session.bias_reference_timestamp;
  if (!timestamp) return "Pre-open";
  if (snapshot.session.bias_reference_kind === "cash_open") return "8:30 CT";
  return formatHour(timestamp);
}

function biasReferenceDetail(snapshot: PublicStockEngineSnapshot): string {
  if (!snapshot.session.initial_bias) {
    return "Waiting for the 9 AM planning read.";
  }
  if (snapshot.session.bias_flipped && snapshot.session.current_bias) {
    return `Flipped to ${title(snapshot.session.current_bias)} watch after the cash-open candle closed through the Control Line.`;
  }
  return `${title(snapshot.session.initial_bias)} watch from the latest pre-open position versus the Control Line.`;
}

function biasReferenceLabel(snapshot: PublicStockEngineSnapshot): string {
  const timestamp = snapshot.session.bias_reference_timestamp;
  if (timestamp) return `${formatHour(timestamp)} planning close`;
  return "9 AM read";
}

function relationToMain(snapshot: PublicStockEngineSnapshot): string {
  const delta = snapshot.session.current_price - snapshot.currentProjection.main_line;
  if (Math.abs(delta) < 0.01) return "at";
  return delta > 0 ? "above" : "below";
}

function referenceRelationCopy(snapshot: PublicStockEngineSnapshot): string {
  const referencePrice = snapshot.session.bias_reference_price;
  const referenceMain = snapshot.session.bias_reference_main_line;
  if (referencePrice !== null && referenceMain !== null) {
    const delta = referencePrice - referenceMain;
    const relation = Math.abs(delta) < 0.01 ? "at" : delta > 0 ? "above" : "below";
    return `${snapshot.ticker}'s latest planning close is ${relation} the Control Line.`;
  }
  return `${snapshot.ticker} is trading ${relationToMain(snapshot)} the Control Line.`;
}

function feedModeLabel(snapshot: PublicStockEngineSnapshot): string {
  if (snapshot.dataMode === "live") return "Live";
  if (snapshot.dataMode === "setup_required") return "Setup";
  if (snapshot.dataMode === "validation") return "Planning";
  return "Planning";
}

function feedBadgeLabel(snapshot: PublicStockEngineSnapshot): string {
  if (snapshot.dataMode === "live") return "Live read";
  if (snapshot.dataMode === "setup_required") return "Setup required";
  if (snapshot.dataMode === "validation") return "Planning read";
  return "Structure read";
}

function feedProviderLabel(snapshot: PublicStockEngineSnapshot): string {
  if (snapshot.dataMode === "live") return "Live";
  if (snapshot.dataMode === "setup_required") return "Required";
  if (snapshot.dataMode === "validation") return "Planning";
  return "Planning";
}

function structureFeedCopy(snapshot: PublicStockEngineSnapshot): string {
  if (snapshot.dataMode === "live") {
    return "The current session read is active.";
  }
  if (snapshot.dataMode === "validation") {
    return "Planning mode is active until the session opens.";
  }
  if (snapshot.dataMode === "setup_required") {
    return "Next-session structure is prepared, but live decisions are still gated.";
  }
  return "Planning structure is prepared, but live decisions are still gated.";
}

function money(value: number): string {
  if (!Number.isFinite(value)) return "Waiting";
  return `$${value.toFixed(2)}`;
}

function title(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatHour(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(" AM", " AM CT")
    .replace(" PM", " PM CT");
}

function shortClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(" AM", " AM CT")
    .replace(" PM", " PM CT");
}

function compactDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function buildFeaturedTickers(tickers: string[]): string[] {
  const preferred = ["AAPL", "NVDA", "MSFT", "AMZN", "JPM", "SPY"];
  const featured = preferred.filter((item) => tickers.includes(item));
  return [...featured, ...tickers.filter((item) => !featured.includes(item))].slice(0, 9);
}

function railPositionPercent(snapshot: PublicStockEngineSnapshot): number {
  const lower = snapshot.currentProjection.lower_2_line;
  const upper = snapshot.currentProjection.upper_2_line;
  const spread = upper - lower;
  if (!Number.isFinite(spread) || spread <= 0) return 50;
  const raw = ((snapshot.session.current_price - lower) / spread) * 100;
  return Math.max(0, Math.min(100, raw));
}

function ctDateKey(iso: string): string {
  const parts = ctParts(new Date(iso));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function ctHour(iso: string): number {
  return ctParts(new Date(iso)).hour;
}

function ctLocalDateHourToIso(dateKey: string, hour: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = ctOffsetMs(new Date(utcMs));
    utcMs = Date.UTC(year, month - 1, day, hour, 0, 0) - offset;
  }
  return new Date(utcMs).toISOString();
}

function ctOffsetMs(date: Date): number {
  const parts = ctParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

const ctPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function ctParts(date: Date) {
  const bag: Record<string, string> = {};
  for (const part of ctPartsFormatter.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

function isPublicStockSnapshot(value: unknown): value is PublicStockEngineSnapshot {
  return (
    !!value &&
    typeof value === "object" &&
    "ticker" in value &&
    "session" in value &&
    "currentProjection" in value &&
    "primaryPivot" in value
  );
}
