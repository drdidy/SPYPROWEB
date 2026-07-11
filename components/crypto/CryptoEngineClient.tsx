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
  LockKeyhole,
  RadioTower,
  RotateCcw,
  Shield,
  Target,
} from "lucide-react";

import { CryptoLogo } from "@/components/crypto/CryptoLogo";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusPill } from "@/components/ui/StatusPill";
import type {
  CryptoAssetKey,
  CryptoLineKey,
  CryptoPivot,
  CryptoProjection,
  PublicCryptoEngineSnapshot,
} from "@/lib/crypto/types";
import { cn } from "@/lib/utils";

type SnapshotState =
  | { status: "ready"; snapshot: PublicCryptoEngineSnapshot }
  | { status: "loading"; snapshot: PublicCryptoEngineSnapshot | null }
  | { status: "error"; snapshot: PublicCryptoEngineSnapshot | null; message: string };

export function CryptoEngineClient({
  assets,
  initialSnapshot,
  initialError,
}: {
  assets: CryptoAssetKey[];
  initialSnapshot: PublicCryptoEngineSnapshot | null;
  initialError: string | null;
}) {
  const defaultAsset = initialSnapshot?.asset ?? assets[0] ?? "BTC";
  const [mounted, setMounted] = useState(false);
  const [asset, setAsset] = useState<CryptoAssetKey>(defaultAsset);
  const [state, setState] = useState<SnapshotState>(
    initialSnapshot
      ? { status: "ready", snapshot: initialSnapshot }
      : initialError
        ? { status: "error", snapshot: null, message: initialError }
        : { status: "loading", snapshot: null },
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !initialSnapshot && !initialError) {
      void loadSnapshot(defaultAsset);
    }
    // initialSnapshot is only used to seed the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  async function loadSnapshot(nextAsset: CryptoAssetKey) {
    setAsset(nextAsset);
    setState((current) => ({ status: "loading", snapshot: current.snapshot }));
    try {
      const params = new URLSearchParams({ asset: nextAsset });
      const res = await fetch(`/api/crypto/snapshot?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as unknown;
      if (!res.ok || !isPublicCryptoSnapshot(body)) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Crypto snapshot failed.";
        throw new Error(message);
      }
      setState({ status: "ready", snapshot: body });
    } catch (error) {
      setState((current) => ({
        status: "error",
        snapshot: current.snapshot,
        message: error instanceof Error ? error.message : "Crypto snapshot failed.",
      }));
    }
  }

  const snapshot = state.snapshot;

  if (!mounted) {
    return (
      <div className="w-full min-w-0 max-w-[1440px] space-y-10 overflow-hidden pb-16 xl:overflow-visible">
        <CryptoHeader
          asset={asset}
          assets={assets}
          loading
          error={initialError}
          snapshot={null}
          onAssetChange={() => {}}
        />
        <Card>
          <CardHeader
            eyebrow="Crypto Engine"
            title="Preparing crypto read"
            meta="Measured structure initializing"
          />
          <CardBody>
            <p className="max-w-2xl text-[13px] leading-relaxed text-ink-3">
              The premium crypto workspace is initializing the session read,
              active gates, and decision slate.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-[1440px] space-y-10 overflow-hidden pb-16 xl:overflow-visible">
      <CryptoHeader
        asset={asset}
        assets={assets}
        loading={state.status === "loading"}
        error={state.status === "error" ? state.message : null}
        snapshot={snapshot}
        onAssetChange={(next) => void loadSnapshot(next)}
      />

      {snapshot ? (
        <>
          {snapshot.session.bias_flipped && (
            <div className="rounded-card border border-gold/45 bg-gold-tint px-4 py-3 text-[13px] text-gold-ink shadow-card">
              Bias flipped to {snapshot.session.current_bias}. Now hunting{" "}
              {snapshot.session.current_bias === "bullish" ? "long setups" : "short setups"}.
            </div>
          )}

          <section className="space-y-5">
            <SectionLabel number="01">Control Map</SectionLabel>
            <CryptoStructureTheater snapshot={snapshot} />
          </section>

          <section className="space-y-5">
            <SectionLabel number="02">Trade Plan</SectionLabel>
            <CryptoDecisionSlate snapshot={snapshot} />
          </section>

          <section className="space-y-5">
            <SectionLabel number="03">Session Timing</SectionLabel>
            <CryptoSessionTimingCard snapshot={snapshot} />
          </section>

          <details className="group rounded-card border border-rule bg-paper shadow-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              Advanced review
              <span className="text-ink-4 transition group-open:rotate-45">+</span>
            </summary>
            <div className="space-y-5 border-t border-rule p-5">
              <CryptoBriefBand snapshot={snapshot} />
              <PremiumSignalStrip snapshot={snapshot} loading={state.status === "loading"} />
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 xl:col-span-5">
                  <CryptoAnchorPanel
                    snapshot={snapshot}
                    loading={state.status === "loading"}
                    onRefresh={() => void loadSnapshot(asset)}
                  />
                </div>
                <div className="col-span-12 xl:col-span-7">
                  <CryptoSessionTape snapshot={snapshot} />
                </div>
              </div>
              <CryptoPremiumBoundary snapshot={snapshot} />
            </div>
          </details>
        </>
      ) : (
        <Card>
          <CardHeader
            eyebrow="Crypto Engine"
            title="Read temporarily unavailable"
            meta="Measured structure required"
          />
          <CardBody>
            <p className="max-w-2xl text-[13px] leading-relaxed text-ink-3">
              The Crypto Engine could not load the selected asset. The page
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
              onClick={() => void loadSnapshot(asset)}
            >
              <RotateCcw size={13} />
              Retry crypto read
            </Button>
          </CardBody>
        </Card>
      )}

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        <span>Not financial advice. Use the read with your own risk process.</span>
        <span className="flex flex-wrap items-center gap-3">
          <Link href="/methodology/crypto" className="hover:text-ink">
            Crypto methodology
          </Link>
          <Link href="/risk" className="hover:text-ink">
            Risk
          </Link>
        </span>
      </footer>
    </div>
  );
}

function CryptoHeader({
  asset,
  assets,
  loading,
  error,
  snapshot,
  onAssetChange,
}: {
  asset: CryptoAssetKey;
  assets: CryptoAssetKey[];
  loading: boolean;
  error: string | null;
  snapshot: PublicCryptoEngineSnapshot | null;
  onAssetChange: (asset: CryptoAssetKey) => void;
}) {
  return (
    <header className="contrast-dark relative overflow-hidden rounded-[18px] border border-[#C9A227]/55 bg-[#071116] px-5 py-4 text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] md:px-6 md:py-5">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(rgba(244,228,192,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(244,228,192,0.10)_1px,transparent_1px)] bg-[size:42px_42px]"
      />
      <div className="relative grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-gold-soft/82">
              Crypto Engine
            </span>
            <span className="hidden h-px w-10 bg-gold/45 sm:block" />
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.20em] text-paper/48 sm:inline">
              Premium desk
            </span>
            <span
              className={cn(
                "rounded-pill border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]",
                snapshot?.dataMode === "coinbase_live"
                  ? "border-bull/35 bg-bull/10 text-bull-soft"
                  : "border-gold/35 bg-gold-soft/10 text-gold-soft",
              )}
            >
              {snapshot ? (snapshot.dataMode === "coinbase_live" ? "Live read" : "Planning read") : "Resolving read"}
            </span>
          </div>
          <h1 className="mt-2 max-w-full text-[34px] font-serif leading-none tracking-tight text-paper md:text-[42px]">
            Today&apos;s {asset}{" "}
            <span className="block text-gold-soft/72 italic font-light sm:inline">
              Control Map.
            </span>
          </h1>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-paper/72">
            {snapshot
              ? cryptoHeroSynthesis(snapshot)
              : "BTC and ETH use the same Control Map discipline as the rest of the workspace."}
          </p>
          <p
            className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/46 tabular-nums"
            aria-live="polite"
          >
            {snapshot
              ? `Updated ${formatDateTime(snapshot.dataAsOf)}`
              : error
                ? "Crypto read unavailable"
                : "Resolving crypto read"}
          </p>
        </div>
        <div className="min-w-0 rounded-[14px] border border-paper/12 bg-paper/[0.055] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-3">
            <CryptoLogo asset={asset} size="lg" dark />
            <div className="min-w-0">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/52">
                Crypto selector
              </label>
              <div className="mt-1 truncate font-serif text-[24px] leading-none text-paper">
                {asset}
              </div>
            </div>
            {loading && (
              <span className="ml-auto h-2.5 w-2.5 rounded-full bg-gold-soft shadow-[0_0_18px_rgba(244,228,192,0.72)] animate-pulse" />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {assets.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onAssetChange(item)}
                disabled={loading}
                className={cn(
                  "flex h-9 items-center justify-center gap-2 rounded-[8px] border font-mono text-[12px] font-semibold transition",
                  item === asset
                    ? "border-gold-soft/55 bg-gold-soft/16 text-gold-soft"
                    : "border-paper/10 bg-paper/[0.045] text-paper/62 hover:border-paper/22 hover:text-paper",
                  loading && "cursor-wait opacity-70",
                )}
              >
                <CryptoLogo asset={item} size="xs" dark />
                {item}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <HeroStat label="Last" value={snapshot ? money(snapshot.session.current_price) : "Resolving"} />
            <HeroStat label="Mode" value="Apex" />
            <HeroStat label="Session" value={snapshot ? shortDate(snapshot.session.session_date) : "--"} />
          </div>
          {snapshot && snapshot.asset !== asset && (
            <p className="mt-3 rounded-[8px] border border-gold/25 bg-gold-soft/10 px-3 py-2 text-[12px] leading-relaxed text-gold-soft">
              Showing the last loaded read for {snapshot.asset} while {asset} refreshes.
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

function cryptoHeroSynthesis(snapshot: PublicCryptoEngineSnapshot): string {
  return `${snapshot.asset} is ${relationToMain(snapshot)} the Control Line. Active gate: ${title(snapshot.currentProjection.active_line)} ${money(lineValue(snapshot.currentProjection, snapshot.currentProjection.active_line))}.`;
}

function CryptoBriefBand({ snapshot }: { snapshot: PublicCryptoEngineSnapshot }) {
  const biasTone =
    snapshot.session.current_bias === "bullish"
      ? "text-bull-ink"
      : snapshot.session.current_bias === "bearish"
        ? "text-bear-ink"
        : "text-ink";
  return (
    <div className="grid gap-3 rounded-card border border-rule bg-paper p-3 shadow-card md:grid-cols-5">
      <BriefTile
        label="Asset"
        value={snapshot.asset}
        support={snapshot.modelLabel}
        icon={<CryptoLogo asset={snapshot.asset} size="sm" />}
      />
      <BriefTile
        label="Bias"
        value={title(snapshot.session.current_bias ?? "neutral")}
        valueClassName={biasTone}
        support={
          snapshot.session.open_price
            ? `NY open ${money(snapshot.session.open_price)}`
            : "NY open pending"
        }
      />
      <BriefTile
        label="Active ref"
        value={title(snapshot.currentProjection.active_line)}
        support={money(lineValue(snapshot.currentProjection, snapshot.currentProjection.active_line))}
      />
      <BriefTile
        label="Decision"
        value={snapshot.decision}
        valueClassName={snapshot.decision === "Trade Allowed" ? "text-bull-ink" : "text-gold-ink"}
        support={`${snapshot.conviction}% conviction`}
      />
      <BriefTile
        label="Status"
        value={snapshot.dataMode === "coinbase_live" ? "Live" : "Planning"}
        support={formatDateTime(snapshot.dataAsOf)}
      />
    </div>
  );
}

function PremiumSignalStrip({
  snapshot,
  loading,
}: {
  snapshot: PublicCryptoEngineSnapshot;
  loading: boolean;
}) {
  const activePrice = lineValue(snapshot.currentProjection, snapshot.currentProjection.active_line);
  const steps = [
    {
      icon: <Database size={15} />,
      label: "Read",
      value: `${snapshot.asset} reference ${money(snapshot.primaryPivot.pivot_close)}`,
    },
    {
      icon: <Activity size={15} />,
      label: "Project",
      value: `${title(snapshot.currentProjection.active_line)} reference ${money(activePrice)}`,
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

function CryptoStructureTheater({ snapshot }: { snapshot: PublicCryptoEngineSnapshot }) {
  const active = snapshot.currentProjection.active_line;
  const activePrice = lineValue(snapshot.currentProjection, active);
  const railPercent = railPositionPercent(snapshot);
  const room = cryptoRoomRead(snapshot);
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
              <span className="eyebrow text-ink-3">Crypto Control Map</span>
              <span className="font-mono text-[10px] text-ink-4">
                Session {snapshot.session.anchor_session_date}
              </span>
            </div>
            <StatusPill variant={snapshot.decision === "Trade Allowed" ? "confirmed" : "watching"} pulse>
              {snapshot.decision}
            </StatusPill>
          </div>

          <div className="mt-6 flex items-end gap-4">
            <CryptoLogo asset={snapshot.asset} size="md" />
            <Icon className={cn(tone, "-mb-2")} size={36} strokeWidth={1.25} />
            <h2 className={cn("text-display font-serif leading-[1.02] tracking-tight", tone)}>
              {headlineFor(snapshot)}
            </h2>
          </div>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
            {snapshot.asset} is trading {relationToMain(snapshot)} the Control Line.
            The active gate is{" "}
            <span className="font-semibold text-ink">
              {title(active)} {money(activePrice)}
            </span>
            , with the current session read active.
          </p>

          {room.lower && room.upper && (
            <div className="mt-4 grid gap-2 rounded-[12px] border border-rule bg-paper-2/55 p-3 sm:grid-cols-2 lg:grid-cols-1">
              <CryptoRoomAction label="Long watch" gate={room.lower.label} value={room.lower.value} />
              <CryptoRoomAction label="Short watch" gate={room.upper.label} value={room.upper.value} />
            </div>
          )}

          <div className="mt-7 max-w-md">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="eyebrow text-ink-3">Gate position</span>
              <span className="font-mono text-sm tabular-nums text-ink">
                {title(active)} <span className="text-ink-4">{money(activePrice)}</span>
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
              <span>Lower</span>
              <span>Current price position</span>
              <span>Upper</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <CryptoGateStat
              label="North Gate I"
              value={snapshot.currentProjection.upper_line}
              active={active === "upper"}
            />
            <CryptoGateStat
              label="Control Line"
              value={snapshot.currentProjection.main_line}
              active={active === "main"}
            />
            <CryptoGateStat
              label="South Gate I"
              value={snapshot.currentProjection.lower_line}
              active={active === "lower"}
            />
          </div>
        </div>

        <div className="hidden lg:block absolute left-[41.666%] top-7 bottom-7 w-px bg-rule" />

        <div className="col-span-12 bg-paper-2/40 p-5 sm:p-7 lg:col-span-7 lg:pl-7">
          <CryptoControlRoom snapshot={snapshot} />

          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <AnchorCell label="Primary" pivot={snapshot.primaryPivot} />
            <AnchorCell label="Secondary" pivot={snapshot.secondaryPivot} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function CryptoRoomAction({
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

function CryptoGateStat({
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

function CryptoControlRoom({ snapshot }: { snapshot: PublicCryptoEngineSnapshot }) {
  const projections = snapshot.projections.length > 0 ? snapshot.projections : [snapshot.currentProjection];
  const defaultIndex = Math.max(
    0,
    projections.findIndex((projection) => projection.timestamp === snapshot.currentProjection.timestamp),
  );
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const [selectedFocus, setSelectedFocus] = useState<"ceiling" | "price" | "floor">("price");

  useEffect(() => {
    setSelectedIndex(defaultIndex);
  }, [defaultIndex, snapshot.asset, snapshot.session.session_date]);

  const selectedProjection = projections[selectedIndex] ?? snapshot.currentProjection;
  const selectedCandle = cryptoCandleForProjection(snapshot, selectedProjection);
  const selectedPrice = selectedCandle?.close ?? snapshot.session.current_price;
  const hasPrice = Number.isFinite(selectedPrice) && selectedPrice > 0;
  const gates = cryptoRoomGates(selectedProjection);
  const ordered = gates.slice().sort((a, b) => a.value - b.value);
  const lower = hasPrice
    ? (ordered.filter((gate) => gate.value <= selectedPrice).at(-1) ?? null)
    : null;
  const upper = hasPrice
    ? (ordered.find((gate) => gate.value > selectedPrice) ?? null)
    : null;
  const progress =
    lower && upper
      ? Math.max(0, Math.min(1, (selectedPrice - lower.value) / Math.max(0.01, upper.value - lower.value)))
      : 0.5;
  const carTop = lower && upper ? 76 - progress * 52 : upper ? 70 : 30;
  const nearCeiling = Math.abs(carTop - 24) < 14;
  const nearFloor = Math.abs(carTop - 76) < 14;
  const priceBadgeTop = nearCeiling ? 44 : nearFloor ? 56 : carTop;
  const priceBadgeOffset = Math.abs(priceBadgeTop - carTop);
  const titleText = cryptoRoomTitle(lower, upper, hasPrice);
  const bias = snapshot.session.current_bias ?? "neutral";
  const inspectedValue =
    selectedFocus === "ceiling" ? upper?.value ?? null : selectedFocus === "floor" ? lower?.value ?? null : hasPrice ? selectedPrice : null;
  const inspectedLabel =
    selectedFocus === "ceiling" ? upper?.label ?? "Ceiling" : selectedFocus === "floor" ? lower?.label ?? "Floor" : selectedCandle ? "Latest Close" : "Live Price";
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
      ? `${snapshot.asset} price marker for ${shortClock(selectedProjection.timestamp)} ET.`
      : inspectedValue === null
        ? "No gate is available on this side of the room."
        : `${Math.abs(inspectedDistance ?? 0).toLocaleString("en-US", {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          })} pts from the selected price marker.`;
  const moveProjection = (delta: number) => {
    setSelectedIndex((current) => Math.max(0, Math.min(projections.length - 1, current + delta)));
  };
  const inspectFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    setSelectedFocus(pct < 38 ? "ceiling" : pct > 62 ? "floor" : "price");
  };
  const onRoomKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveProjection(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveProjection(1);
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
            <CryptoLogo asset={snapshot.asset} size="md" dark />
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
                {snapshot.asset} Control Room
              </div>
              <motion.div
                key={`${snapshot.asset}-${titleText}-${selectedProjection.timestamp}`}
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
              {shortClock(selectedProjection.timestamp)} ET
            </span>
          </span>
        </div>

        <div
          role="group"
          tabIndex={0}
          aria-label={`Interactive ${snapshot.asset} Control Room, ${shortClock(selectedProjection.timestamp)} ET, ${titleText}`}
          onClick={inspectFromPointer}
          onKeyDown={onRoomKeyDown}
          className="relative mt-5 h-[250px] cursor-crosshair overflow-hidden rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(184,130,31,0.16),rgba(255,255,255,0.035)_46%,rgba(0,0,0,0.12)_100%)] outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
            <span className="rounded-[8px] border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/58">
              NY control map
            </span>
            <span
              className={cn(
                "rounded-[8px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]",
                bias === "bullish"
                  ? "border-bull/30 bg-bull/12 text-bull-soft"
                  : bias === "bearish"
                    ? "border-bear/30 bg-bear/12 text-bear-soft"
                    : "border-gold/30 bg-gold/12 text-gold-soft",
              )}
            >
              {title(bias)}
            </span>
          </div>
          <div className="absolute bottom-4 left-1/2 top-4 w-[84px] -translate-x-1/2 rounded-full border border-white/10 bg-black/20 shadow-[inset_0_0_30px_rgba(0,0,0,0.40)]" />
          <motion.div
            key={`crypto-room-${snapshot.asset}-${selectedProjection.timestamp}-${titleText}`}
            className="absolute left-[calc(50%_-_70px)] top-[24%] h-[52%] w-[140px] rounded-[24px] border border-gold/40 bg-gold/12 shadow-[0_0_38px_rgba(184,130,31,0.20)]"
            initial={{ opacity: 0, scaleX: 0.88 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <CryptoRoomLine
            type="ceiling"
            top="24%"
            label={upper?.label ?? "None"}
            value={upper?.value ?? null}
            distance={upper ? upper.value - selectedPrice : null}
            active={selectedFocus === "ceiling"}
            onSelect={() => setSelectedFocus("ceiling")}
          />
          <CryptoRoomLine
            type="floor"
            top="76%"
            label={lower?.label ?? "None"}
            value={lower?.value ?? null}
            distance={lower ? selectedPrice - lower.value : null}
            active={selectedFocus === "floor"}
            onSelect={() => setSelectedFocus("floor")}
          />
          {gates.map((gate) => {
            if (gate.value === upper?.value || gate.value === lower?.value) return null;
            const top = cryptoGateTop(gate.value, ordered);
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
            key={`crypto-price-${snapshot.asset}-${selectedProjection.timestamp}-${selectedPrice}`}
            className="absolute left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ top: `${priceBadgeTop}%` }}
            initial={{ opacity: 0, scale: 0.84, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="relative flex h-14 w-28 items-center justify-center rounded-[16px] border border-gold/60 bg-ink shadow-[0_18px_46px_-18px_rgba(184,130,31,0.95)]">
              <span className="absolute h-16 w-32 rounded-[20px] bg-gold/12 blur-md" />
              <span className="relative text-center">
                <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-gold-soft">
                  {selectedCandle ? "Latest Close" : "Live Price"}
                </span>
                <span className="block font-mono text-[13px] font-semibold tabular-nums text-paper">
                  {hasPrice ? money(selectedPrice) : "Waiting"}
                </span>
              </span>
            </span>
          </motion.div>
        </div>

        <motion.div
          key={`crypto-inspect-${snapshot.asset}-${selectedProjection.timestamp}-${selectedFocus}`}
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

        <div className="relative mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {projections.slice(0, 12).map((projection, index) => {
            const activeSlot = index === selectedIndex;
            const hasCandle = Boolean(cryptoCandleForProjection(snapshot, projection));
            return (
              <button
                key={`${projection.timestamp}-${index}`}
                type="button"
                aria-pressed={activeSlot}
                onClick={() => setSelectedIndex(index)}
                className={cn(
                  "h-9 rounded-[8px] border px-1 font-mono text-[10px] font-semibold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
                  activeSlot
                    ? "border-gold bg-gold text-ink shadow-glow"
                    : "border-white/10 bg-white/[0.06] text-paper/78 hover:border-gold/50 hover:bg-white/[0.10]",
                  !hasCandle && "text-paper/48",
                )}
                title={hasCandle ? "Crypto candle available" : "Planning projection"}
              >
                {shortClock(projection.timestamp)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CryptoRoomLine({
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
          {distance.toLocaleString("en-US", {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          })}{" "}
          pts
        </div>
      )}
    </button>
  );
}

function CryptoAnchorPanel({
  snapshot,
  loading,
  onRefresh,
}: {
  snapshot: PublicCryptoEngineSnapshot;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader
        eyebrow="Session setup"
        title="Reference check"
        meta="Apex crypto read"
        action={<Database size={16} className="text-gold-ink" />}
      />
      <CardBody>
        <PivotBlock label="Primary reference" pivot={snapshot.primaryPivot} prominent />
        <div className="mt-4">
          {snapshot.secondaryPivot ? (
            <PivotBlock label="Secondary reference" pivot={snapshot.secondaryPivot} />
          ) : (
            <div className="rounded-[10px] border border-rule bg-paper-2/40 px-3 py-3 text-[13px] text-ink-3">
              No secondary pivot is far enough from the primary for context.
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onRefresh} disabled={loading}>
            <RotateCcw size={13} />
            Refresh read
          </Button>
        </div>
        {snapshot.dataWarning && (
          <p className="mt-3 rounded-[8px] border border-rule bg-paper-2/55 px-3 py-2 text-[12px] leading-relaxed text-ink-3">
            {snapshot.dataWarning}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function CryptoDecisionSlate({ snapshot }: { snapshot: PublicCryptoEngineSnapshot }) {
  const setup = snapshot.setup;
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
        eyebrow="Crypto Decision Slate"
        title={
          <span className="flex items-center gap-3">
            <Icon className={tone} size={28} strokeWidth={1.5} />
            <span className={cn("font-serif text-[34px] leading-none", tone)}>
              {snapshot.verdict}
            </span>
          </span>
        }
        meta={`${snapshot.decision} - ${snapshot.asset} - ${snapshot.conviction}% conviction`}
      />
      <CardBody>
        <p className="text-[14px] leading-relaxed text-ink-2">
              {setup
            ? `${snapshot.asset} confirmed at the ${title(snapshot.currentProjection.active_line)} gate. Entry, target, stop, breakeven, and chase guard are mapped for the next action.`
            : `${snapshot.asset} is waiting for qualified confirmation at the active gate.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SlateMetric label="Entry" value={setup ? money(setup.entry_price) : "Waiting"} />
          <SlateMetric
            label="Target"
            value={setup ? money(setup.target_price) : "Waiting"}
            support={setup ? title(setup.target_line) : "No target yet"}
            tone="bull"
          />
          <SlateMetric
            label="Stop"
            value={setup ? money(setup.stop_price) : "Waiting"}
            support="Invalidation area"
            tone="bear"
          />
          <SlateMetric
            label="Breakeven"
            value={setup ? money(setup.breakeven_trigger_price) : "Waiting"}
            support="Midpoint to target"
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
            icon={<RadioTower size={15} />}
            label="Session"
            value={sessionStatus(snapshot.session.status)}
          />
          <Guardrail
            icon={<CheckCircle2 size={15} />}
            label="Premium state"
            value="Unlocked"
            tone="bull"
          />
        </div>
      </CardBody>
    </Card>
  );
}

function CryptoSessionTimingCard({ snapshot }: { snapshot: PublicCryptoEngineSnapshot }) {
  const rows = [
    {
      label: "Active session",
      time: "New York",
      detail: "Use the session open versus the Control Line to frame the initial read.",
    },
    {
      label: "Control Map",
      time: "Live",
      detail: `${snapshot.asset} gates update against the current active-session structure.`,
    },
    {
      label: "Decision window",
      time: "Confirmation",
      detail: "Touch and close at a gate sets the next qualified candle read.",
    },
  ];

  return (
    <div className="rounded-[18px] border border-rule bg-paper p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-ink-3">Session Timing</div>
          <h2 className="mt-2 font-serif text-[28px] leading-none text-ink md:text-[34px]">
            Wait for the map to confirm.
          </h2>
        </div>
        <div className="rounded-[14px] border border-rule bg-paper-2 px-4 py-3 text-right">
          <div className="eyebrow text-ink-3">Session</div>
          <div className="mt-1 font-mono text-[15px] font-semibold text-ink tabular-nums">
            {shortDate(snapshot.session.session_date)}
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

function CryptoSessionTape({ snapshot }: { snapshot: PublicCryptoEngineSnapshot }) {
  const candidate = snapshot.latestCandidate;
  const rows = [
    {
      time: "Session",
      label: "Setup prepared",
      detail: `${snapshot.asset} primary reference ${money(snapshot.primaryPivot.pivot_close)}`,
      tone: "neutral",
    },
    {
      time: snapshot.session.open_price ? "NY open" : "Pending",
      label: "Bias set",
      detail: snapshot.session.initial_bias
        ? `${title(snapshot.session.initial_bias)} bias from the active-session open`
        : "Waiting for the active-session open",
      tone: snapshot.session.initial_bias === "bullish" ? "bull" : "bear",
    },
    candidate
      ? {
          time: formatHour(candidate.candle_timestamp),
          label: candidate.pattern_matched === "short_rejection" ? "Bearish confirm" : "Bullish confirm",
          detail: `${title(candidate.line_tested)} held at ${money(candidate.line_price_at_candle)}`,
          tone: candidate.pattern_matched === "short_rejection" ? "bear" : "bull",
        }
      : {
          time: "Now",
          label: "Not confirmed",
          detail: "The active crypto reference is still being watched.",
          tone: "neutral",
        },
  ];

  return (
    <Card>
      <CardHeader
        eyebrow="Session tape"
        title="Recent rule events"
        meta="New York active session"
        action={<Activity size={16} className="text-gold-ink" />}
      />
      <CardBody className="px-0 pb-0">
        <ol className="divide-y divide-rule">
          {rows.map((row) => (
            <li
              key={`${row.time}-${row.label}`}
              className="grid gap-2 px-5 py-3 text-[13px] sm:grid-cols-[82px_130px_minmax(0,1fr)] sm:gap-3"
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

function CryptoPremiumBoundary({ snapshot }: { snapshot: PublicCryptoEngineSnapshot }) {
  return (
    <Card>
      <CardHeader
        eyebrow="Apex scope"
        title="BTC and ETH, cleanly."
        meta="Crypto Engine"
      />
      <CardBody>
        <p className="max-w-3xl text-[13px] leading-relaxed text-ink-3">
          Crypto uses the same operating language as the rest of Prophet:
          current read, active gate, candidate, and decision. BTC and ETH
          are the first assets enabled for the premium release.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MiniRead label="Asset" value={snapshot.asset} icon={<CryptoLogo asset={snapshot.asset} size="sm" />} />
          <MiniRead label="Coverage" value={snapshot.modelLabel} icon={<Shield size={14} />} />
          <MiniRead label="State" value={snapshot.dataMode === "coinbase_live" ? "Live read" : "Planning read"} icon={<CheckCircle2 size={14} />} />
        </div>
      </CardBody>
    </Card>
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

function PivotBlock({
  label,
  pivot,
  prominent = false,
}: {
  label: string;
  pivot: CryptoPivot;
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
          Confirmed
        </span>
      </div>
      <div className="mt-2 font-mono text-[20px] font-semibold text-ink tabular-nums">
        {money(pivot.pivot_close)}
      </div>
      <div className="mt-1 text-[12px] text-ink-3">
        {formatDateTime(pivot.pivot_timestamp)}
      </div>
    </div>
  );
}

function AnchorCell({
  label,
  pivot,
}: {
  label: string;
  pivot: CryptoPivot | null;
}) {
  return (
    <div className="rounded-soft bg-paper px-2.5 py-1.5 shadow-rule">
      <div className="eyebrow mb-0.5 text-ink-3">{label}</div>
      {pivot ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums text-ink">
            {money(pivot.pivot_close)}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink-3">
            {shortClock(pivot.pivot_timestamp)} ET
          </span>
        </div>
      ) : (
        <span className="font-mono text-[11px] text-ink-4">None</span>
      )}
    </div>
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

function cryptoRoomGates(projection: CryptoProjection): Array<{
  key: CryptoLineKey;
  label: string;
  value: number;
}> {
  const gates: Array<{ key: CryptoLineKey; label: string; value: number }> = [
    { key: "upper", label: "North Gate I", value: projection.upper_line },
    { key: "main", label: "Control Line", value: projection.main_line },
    { key: "lower", label: "South Gate I", value: projection.lower_line },
  ];
  return gates.filter((gate) => Number.isFinite(gate.value));
}

function cryptoCandleForProjection(
  snapshot: PublicCryptoEngineSnapshot,
  projection: CryptoProjection,
): PublicCryptoEngineSnapshot["candles"][number] | null {
  const dateKey = nyDateKey(projection.timestamp);
  const hour = nyHour(projection.timestamp);
  return (
    snapshot.candles
      .filter(
        (candle) =>
          nyDateKey(candle.timestamp) === dateKey &&
          nyHour(candle.timestamp) === hour &&
          Number.isFinite(candle.close),
      )
      .at(-1) ?? null
  );
}

function cryptoRoomTitle(
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

function cryptoGateTop(
  value: number,
  ordered: Array<{ value: number }>,
): number {
  const min = ordered[0]?.value ?? value;
  const max = ordered.at(-1)?.value ?? value;
  const span = Math.max(0.01, max - min);
  return 86 - ((value - min) / span) * 72;
}

function lineValue(projection: CryptoProjection, line: CryptoLineKey): number {
  if (line === "upper") return projection.upper_line;
  if (line === "lower") return projection.lower_line;
  return projection.main_line;
}

function cryptoRoomRead(snapshot: PublicCryptoEngineSnapshot): {
  lower: { label: string; value: number } | null;
  upper: { label: string; value: number } | null;
} {
  const ordered = cryptoRoomGates(snapshot.currentProjection).sort((a, b) => a.value - b.value);
  let lower: { label: string; value: number } | null = null;
  let upper: { label: string; value: number } | null = null;
  for (const gate of ordered) {
    if (gate.value <= snapshot.session.current_price) lower = gate;
    if (gate.value > snapshot.session.current_price && upper === null) upper = gate;
  }
  return { lower, upper };
}

function headlineFor(snapshot: PublicCryptoEngineSnapshot): string {
  if (snapshot.decision === "Trade Allowed") return "Setup allowed";
  if (snapshot.decision === "Chase Guard") return "Chase guard active";
  if (snapshot.session.current_bias === "bullish") return "Bullish structure";
  if (snapshot.session.current_bias === "bearish") return "Bearish structure";
  return "Watching references";
}

function relationToMain(snapshot: PublicCryptoEngineSnapshot): string {
  const delta = snapshot.session.current_price - snapshot.currentProjection.main_line;
  if (Math.abs(delta) < 0.01) return "at";
  return delta > 0 ? "above" : "below";
}

function railPositionPercent(snapshot: PublicCryptoEngineSnapshot): number {
  const lower = snapshot.currentProjection.lower_line;
  const upper = snapshot.currentProjection.upper_line;
  const spread = upper - lower;
  if (!Number.isFinite(spread) || spread <= 0) return 50;
  const raw = ((snapshot.session.current_price - lower) / spread) * 100;
  return Math.max(0, Math.min(100, raw));
}

function money(value: number): string {
  if (!Number.isFinite(value)) return "Waiting";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(" AM", " AM ET")
    .replace(" PM", " PM ET");
}

function shortClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(" AM", " AM ET")
    .replace(" PM", " PM ET");
}

function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function nyHour(iso: string): number | null {
  const value = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
  return Number.isFinite(value) ? value : null;
}

function nyDateKey(iso: string): string | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function sessionStatus(value: string): string {
  if (value === "ny_active") return "NY Primary";
  if (value === "ny_extension") return "NY Extension";
  if (value === "pre_session") return "Pre-session";
  return "Off Hours";
}

function isPublicCryptoSnapshot(value: unknown): value is PublicCryptoEngineSnapshot {
  return (
    !!value &&
    typeof value === "object" &&
    "asset" in value &&
    "session" in value &&
    "currentProjection" in value &&
    "primaryPivot" in value
  );
}
