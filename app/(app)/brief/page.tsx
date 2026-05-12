import type { ReactNode } from "react";
import { BrainCircuit, CheckCircle2, Crosshair, Gauge, LineChart, ShieldAlert } from "lucide-react";
import { headers } from "next/headers";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { CommandStat } from "@/components/ui/CommandStat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadSpxSnapshot } from "@/lib/spx-fetch";
import { nearReferencePriceLabel } from "@/lib/market-data-quality";
import { cn } from "@/lib/utils";
import type { SPXSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface BriefResponse {
  brief: string;
  source: "openai" | "engine" | "error";
  asOf?: string;
  dossier?: BriefDossier;
}

interface BriefDossier {
  SPY?: {
    state?: string;
    verdict?: string;
    conviction?: number;
    rationale?: string;
    flipCondition?: string;
    price?: Record<string, number | string | null>;
    context?: Record<string, number | string | null>;
    watchLines?: WatchLine[];
    signals?: SignalRow[];
    invalidation?: Record<string, unknown> | null;
  };
  ES?: {
    available?: boolean;
    state?: string;
    scenario?: string;
    scenarioExplanation?: string;
    price?: { last?: number; change?: number; changePct?: number };
    channel?: { direction?: string; reason?: string; noChannelReason?: string };
    primaryPlay?: Record<string, unknown> | null;
    alternatePlay?: Record<string, unknown> | null;
    invalidation?: Record<string, unknown> | null;
    confluence?: { score?: number; action?: string };
    watchLines?: WatchLine[];
  };
  options?: {
    available?: boolean;
    SPY?: OptionsSymbol;
    SPX?: OptionsSymbol;
  };
}

interface WatchLine {
  line?: string;
  name?: string;
  kind?: string;
  level?: number;
  currentValue?: number;
  distance?: number;
  distanceFromPrice?: number;
  status?: string;
}

interface SignalRow {
  type?: string;
  status?: string;
  entry?: number;
  stop?: number;
  target?: number;
  line?: string;
}

interface OptionsSymbol {
  available?: boolean;
  flow?: { lean?: string; bullishCount?: number; bearishCount?: number; premiumNet?: number } | null;
  gex?: { regime?: string; totalGEX?: number; flipPoint?: number | null } | null;
  darkPool?: { count?: number; totalPremium?: number; totalVolume?: number; avgPrice?: number | null } | null;
  chain?: { expiration?: string | null; totals?: { callVol?: number; putVol?: number; callOi?: number; putOi?: number; pcr?: number | null } } | null;
}

async function loadBrief(): Promise<BriefResponse> {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!host) return { brief: "", source: "error" };
    const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const out: Record<string, string> = {};
    const cookie = h.get("cookie");
    if (cookie) out.cookie = cookie;
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      out["x-vercel-protection-bypass"] = bypass;
      out["x-vercel-set-bypass-cookie"] = "samesitenone";
    }
    const res = await fetch(`${proto}://${host}/api/spy/brief`, {
      cache: "no-store",
      headers: out,
    });
    if (!res.ok) return { brief: "", source: "error" };
    return (await res.json()) as BriefResponse;
  } catch {
    return { brief: "", source: "error" };
  }
}

export default async function Page() {
  const [{ data: snap, source }, brief, esLoaded] = await Promise.all([
    loadLiveSnapshot(),
    loadBrief(),
    loadSpxSnapshot(),
  ]);
  const spy = brief.dossier?.SPY;
  const es = normalizeEsDossier(brief.dossier?.ES, esLoaded.snap);
  const briefText = sanitizeEsBriefText(brief.brief, esLoaded.snap);
  const options = brief.dossier?.options;
  const spyOptions = options?.SPY;
  const spxOptions = options?.SPX;
  const fallbackLines: WatchLine[] = snap.lines.slice(0, 5).map((line) => ({
    name: line.name,
    kind: line.kind,
    currentValue: line.currentValue,
    distanceFromPrice: line.distanceFromPrice,
    status: "WATCHING",
  }));
  const lines = (spy?.watchLines?.length ? spy.watchLines : fallbackLines).slice(0, 6);
  const esLines = (es?.watchLines ?? []).slice(0, 4);

  return (
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence - 10"
        title="Daily Brief"
        lede="Pre-open plan built from market data, options pressure, and the app's own SPY and ES structure."
        source={source}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <CommandStat
          label="SPY state"
          value={spy?.state ?? snap.currentState}
          note={fmtPrice(spy?.price?.last ?? snap.currentPrice)}
          tone={stateTone(spy?.state ?? snap.currentState)}
        />
        <CommandStat
          label="ES channel"
          value={es?.channel?.direction ?? (es?.available === false ? "No read" : "Waiting")}
          note={es?.scenario ? es.scenario.replace(/_/g, " ") : "Overnight structure"}
          tone={directionTone(es?.channel?.direction)}
        />
        <CommandStat
          label="Options flow"
          value={spyOptions?.flow?.lean ?? "Waiting"}
          note={spyOptions?.flow ? `${fmtMoney(spyOptions.flow.premiumNet)} net premium` : "SPY options read"}
          tone={leanTone(spyOptions?.flow?.lean)}
        />
        <CommandStat
          label="Dealer gamma"
          value={spyOptions?.gex?.regime ?? "Waiting"}
          note={spyOptions?.gex ? `Flip ${nearReferencePriceLabel(spyOptions.gex.flipPoint, snap.currentPrice)}` : "GEX not populated"}
          tone={gammaTone(spyOptions?.gex?.regime)}
        />
      </div>

      <SectionLabel number="01">Pre-open read</SectionLabel>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <Card className="bg-[#071116] text-paper border-[#243138]">
          <CardHeader
            eyebrow={<span className="text-gold-soft">{brief.source === "openai" ? "OpenAI synthesis" : "Engine fallback"}</span>}
            title={<span className="text-paper">Morning trading plan</span>}
            meta={<span className="text-paper/45">{brief.asOf ? formatBriefTime(brief.asOf) : "Current session"}</span>}
            action={
              <div className="grid h-10 w-10 place-items-center rounded-[12px] border border-gold/25 bg-paper/5 text-gold-soft">
                <BrainCircuit className="h-4 w-4" />
              </div>
            }
          />
          <CardBody>
            {briefText ? (
              <div className="space-y-5">
                {briefText.split(/\n\s*\n/).map((para, i) => (
                  <BriefParagraph key={i} text={para} />
                ))}
              </div>
            ) : (
              <p className="font-serif text-[22px] leading-[1.5] text-paper/82">
                {snap.decision.finalExplanation || snap.bias.explanation || "Engine is initializing today's read."}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Dossier" title="What the brief read" />
          <CardBody className="space-y-3">
            <DossierRow icon={<LineChart className="h-4 w-4" />} label="SPY structure" value={spy?.verdict ?? snap.decision.verdict} note={spy?.rationale ?? snap.decision.finalExplanation} />
            <DossierRow icon={<Crosshair className="h-4 w-4" />} label="ES structure" value={es?.scenario?.replace(/_/g, " ") ?? "Waiting"} note={es?.scenarioExplanation ?? es?.channel?.reason} />
            <DossierRow icon={<Gauge className="h-4 w-4" />} label="Options pressure" value={options?.available ? "Loaded" : "Waiting"} note={optionsSummary(spyOptions, spxOptions)} />
            <DossierRow icon={<ShieldAlert className="h-4 w-4" />} label="Invalidation" value={spy?.flipCondition ?? "No flip resolved"} note={invalidationNote(spy?.invalidation, es?.invalidation)} />
          </CardBody>
        </Card>
      </div>

      <SectionLabel number="02">Lines and triggers</SectionLabel>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
        <Card>
          <CardHeader eyebrow="SPY" title="First structure to respect" meta="Closest app lines, not hand-drawn levels" />
          <CardBody>
            {lines.length === 0 ? (
              <CommandEmptyState
                eyebrow="Line resolver"
                title="No structural lines are resolved."
                body="The brief will list the closest engine lines once pivots and triggers are available in the snapshot."
                rows={[
                  { label: "Lines", value: "0 loaded" },
                  { label: "Display", value: "Waiting" },
                  { label: "Source", value: source },
                ]}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                {lines.map((line, i) => (
                  <LineTile key={`${lineLabel(line)}-${i}`} line={line} index={i + 1} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="ES" title="Channel context" meta={es?.confluence ? `Confluence ${es.confluence.score ?? "-"} / action ${es.confluence.action ?? "-"}` : undefined} />
          <CardBody className="space-y-3">
            {esLines.length > 0 ? (
              esLines.map((line, i) => <CompactLine key={`${lineLabel(line)}-${i}`} line={line} />)
            ) : (
              <CommandEmptyState
                eyebrow="ES channel"
                title="No ES rail read is available."
                body="The brief will include the ES overnight channel once the data window and channel rails are available."
                rows={[
                  { label: "State", value: es?.available === false ? "Unavailable" : "Waiting" },
                  { label: "Scenario", value: es?.scenario ?? "-" },
                  { label: "Display", value: "No synthetic rails" },
                ]}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <SectionLabel number="03">Options inputs</SectionLabel>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <OptionsPanel symbol="SPY" data={spyOptions} referencePrice={snap.currentPrice} />
        <OptionsPanel symbol="SPX" data={spxOptions} />
      </div>
    </div>
  );
}

function normalizeEsDossier(
  es: BriefDossier["ES"] | undefined,
  snap: SPXSnapshot,
): BriefDossier["ES"] | undefined {
  if (!es) return es;
  return {
    ...es,
    available: true,
    state: snap.currentState ?? es.state,
    scenario: snap.scenario,
    scenarioExplanation: snap.rthBias?.note
      ? `${snap.scenarioExplanation} ${snap.rthBias.note}`
      : snap.scenarioExplanation,
    price: {
      last: snap.price.last,
      change: snap.price.change,
      changePct: snap.price.changePct,
    },
    channel: {
      direction: snap.channel.direction,
      reason: snap.channel.reason,
      noChannelReason: snap.channel.noChannelReason,
    },
    confluence: {
      score: snap.confluence.score,
      action: snap.confluence.action,
    },
    watchLines:
      snap.lines.length > 0
        ? snap.lines.slice(0, 4).map((line) => ({
            name: line.name,
            kind: line.kind,
            currentValue: line.currentValue,
            distanceFromPrice: line.distanceFromPrice,
            status: line.kind.includes("PREV_RTH") ? "REFERENCE" : "WATCHING",
          }))
        : es.watchLines,
  };
}

function sanitizeEsBriefText(text: string, snap: SPXSnapshot): string {
  if (!text) return text;
  const last = snap.price.last;
  if (!Number.isFinite(last) || last <= 0) return text;
  return text.replace(
    /last print(?:\s+of)?\s+\d+(?:\.\d+)?/gi,
    `ES last ${last.toFixed(2)}`,
  );
}

function BriefParagraph({ text }: { text: string }) {
  const match = text.match(/^([^:]{3,34}):\s*(.*)$/s);
  if (!match) {
    return <p className="font-serif text-[20px] leading-[1.55] text-paper/82">{text}</p>;
  }
  return (
    <section>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft">{match[1]}</div>
      <p className="mt-1 font-serif text-[20px] leading-[1.55] text-paper/82">{match[2]}</p>
    </section>
  );
}

function DossierRow({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value?: string | number | null;
  note?: string | null;
}) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-[12px] border border-rule bg-paper-2/60 p-3">
      <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-rule bg-paper text-gold-ink">{icon}</div>
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">{label}</div>
        <div className="mt-1 font-mono text-[13px] font-semibold text-ink truncate">{value ?? "Waiting"}</div>
        {note && <div className="mt-1 text-[12px] leading-snug text-ink-3 line-clamp-2">{note}</div>}
      </div>
    </div>
  );
}

function LineTile({ line, index }: { line: WatchLine; index: number }) {
  const distance = lineDistance(line);
  return (
    <div className="relative min-h-[150px] rounded-[12px] border border-rule bg-paper-2/55 p-4 overflow-hidden">
      <div className="absolute right-3 top-2 font-serif text-[56px] leading-none text-gold-ink/10">
        {String(index).padStart(2, "0")}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{line.status ?? line.kind ?? "Watch line"}</div>
      <div className="mt-2 font-mono text-[13px] text-ink truncate">{lineLabel(line)}</div>
      <div className="mt-6 font-mono text-[24px] font-semibold text-ink" data-num>
        {fmtPrice(lineLevel(line))}
      </div>
      <div className={distance >= 0 ? "text-bull-ink" : "text-bear-ink"}>
        <span className="font-mono text-[12px]" data-num>
          {Number.isFinite(distance) ? `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}` : "-"}
        </span>
      </div>
    </div>
  );
}

function CompactLine({ line }: { line: WatchLine }) {
  const distance = lineDistance(line);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-rule bg-paper-2/60 px-3 py-3">
      <div className="min-w-0">
        <div className="font-mono text-[12px] text-ink truncate">{lineLabel(line)}</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">{line.kind ?? line.status ?? "Rail"}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-[15px] font-semibold text-ink">{fmtPrice(lineLevel(line))}</div>
        <div className={cn("font-mono text-[11px]", distance >= 0 ? "text-bull-ink" : "text-bear-ink")}>
          {Number.isFinite(distance) ? `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}` : "-"}
        </div>
      </div>
    </div>
  );
}

function OptionsPanel({
  symbol,
  data,
  referencePrice,
}: {
  symbol: string;
  data?: OptionsSymbol;
  referencePrice?: number;
}) {
  return (
    <Card>
      <CardHeader
        eyebrow={symbol}
        title="Options pressure"
        meta={data?.chain?.expiration ? `Chain ${data.chain.expiration}` : "Flow, dark pool, GEX, chain"}
        action={
          <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-rule bg-paper-2 text-gold-ink">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        }
      />
      <CardBody>
        {!data?.available ? (
          <CommandEmptyState
            eyebrow={`${symbol} options`}
            title="Options data is waiting."
            body="This panel only displays live provider values. The brief treats missing options data as no-read, not as neutral."
            rows={[
              { label: "Symbol", value: symbol },
              { label: "Synthetic values", value: "None" },
              { label: "Status", value: "Waiting" },
            ]}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniMetric label="Flow" value={data.flow?.lean ?? "-"} tone={leanTone(data.flow?.lean)} />
            <MiniMetric label="Net premium" value={fmtMoney(data.flow?.premiumNet)} />
            <MiniMetric label="GEX" value={data.gex?.regime ?? "-"} tone={gammaTone(data.gex?.regime)} />
            <MiniMetric
              label="Flip"
              value={
                referencePrice
                  ? nearReferencePriceLabel(data.gex?.flipPoint, referencePrice)
                  : fmtPrice(data.gex?.flipPoint)
              }
            />
            <MiniMetric label="Dark premium" value={fmtMoney(data.darkPool?.totalPremium)} />
            <MiniMetric label="Dark prints" value={fmtInt(data.darkPool?.count)} />
            <MiniMetric label="PCR" value={fmtRatio(data.chain?.totals?.pcr)} />
            <MiniMetric label="Call / put vol" value={`${fmtInt(data.chain?.totals?.callVol)} / ${fmtInt(data.chain?.totals?.putVol)}`} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  tone?: "ink" | "bull" | "bear" | "gold" | "teal";
}) {
  const toneCls =
    tone === "bull"
      ? "text-bull-ink"
      : tone === "bear"
        ? "text-bear-ink"
        : tone === "gold"
          ? "text-gold-ink"
          : tone === "teal"
            ? "text-teal"
            : "text-ink";
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/70 px-3 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">{label}</div>
      <div className={cn("mt-1 font-mono text-[15px] font-semibold tabular-nums", toneCls)}>{value}</div>
    </div>
  );
}

function lineLabel(line: WatchLine): string {
  return line.line ?? line.name ?? line.kind ?? "Structure";
}

function lineLevel(line: WatchLine): number | undefined {
  return line.level ?? line.currentValue;
}

function lineDistance(line: WatchLine): number {
  const value = line.distance ?? line.distanceFromPrice;
  return Number.isFinite(value ?? NaN) ? Number(value) : NaN;
}

function optionsSummary(spy?: OptionsSymbol, spx?: OptionsSymbol): string {
  const parts = [];
  if (spy?.flow?.lean) parts.push(`SPY flow ${spy.flow.lean.toLowerCase()}`);
  if (spy?.gex?.regime) parts.push(`SPY GEX ${spy.gex.regime.toLowerCase()}`);
  if (spx?.chain?.expiration) parts.push(`SPX chain ${spx.chain.expiration}`);
  return parts.join(" - ") || "Waiting for options feed";
}

function invalidationNote(spy?: Record<string, unknown> | null, es?: Record<string, unknown> | null): string {
  if (spy || es) return "Defined by active engine structure.";
  return "No active invalidation level returned yet.";
}

function stateTone(state?: string | null): "ink" | "bull" | "bear" | "gold" {
  if (state === "GO" || state === "ARMED") return "bull";
  if (state === "STAND_DOWN" || state === "COOLDOWN") return "bear";
  if (state === "WATCH" || state === "PRE_CONFIG") return "gold";
  return "ink";
}

function directionTone(direction?: string | null): "ink" | "bull" | "bear" | "gold" {
  if (direction === "ASCENDING") return "bull";
  if (direction === "DESCENDING") return "bear";
  if (direction === "NONE") return "gold";
  return "ink";
}

function leanTone(lean?: string | null): "ink" | "bull" | "bear" | "gold" {
  if (lean === "BULLISH") return "bull";
  if (lean === "BEARISH") return "bear";
  if (lean === "BALANCED") return "gold";
  return "ink";
}

function gammaTone(regime?: string | null): "ink" | "bull" | "bear" | "gold" {
  if (regime === "POSITIVE") return "bull";
  if (regime === "NEGATIVE") return "bear";
  if (regime === "FLAT") return "gold";
  return "ink";
}

function fmtPrice(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toFixed(Number.isInteger(v) ? 0 : 2);
}

function fmtInt(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "-";
  return Math.round(v).toLocaleString();
}

function fmtMoney(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtRatio(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toFixed(2);
}

function formatBriefTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Current session";
  return date.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
