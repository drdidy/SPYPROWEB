import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  Crosshair,
  Gauge,
  LineChart,
  Newspaper,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { ActionToolbar, BriefToken, LineLegend, StickySubnav, TermHelp } from "@/components/brief/BriefClient";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Sparkline } from "@/components/ui/Sparkline";
import { briefGlossary, type BriefGlossaryKey } from "@/content/brief/glossary";
import { nearReferencePriceLabel } from "@/lib/market-data-quality";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadEsSnapshot } from "@/lib/spx-fetch";
import type { SPXSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BriefSectionKey =
  | "MARKET_READ"
  | "SPY_PLAN"
  | "ES_PLAN"
  | "OPTIONS_PRESSURE"
  | "NEWS_AND_CALENDAR"
  | "WHAT_CHANGES_THE_PLAN"
  | "OPENING_CHECKLIST";

interface BriefResponse {
  brief: string;
  sections?: Array<{ section: BriefSectionKey; body: string }>;
  tldr?: { bias?: string | null; action?: string | null; invalidation?: string | number | null };
  bullCase?: CaseRead | null;
  bearCase?: CaseRead | null;
  source: string;
  asOf?: string;
  briefId?: string;
  degraded?: boolean;
  dossier?: BriefDossier;
}

interface CaseRead {
  thesis?: string | null;
  trigger?: string | null;
  invalidation?: string | null;
  confidence?: string | number | null;
  horizon?: string | null;
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
  macro?: {
    news?: {
      available?: boolean;
      source?: string | null;
      reason?: string;
      items?: Array<{ headline?: string; source?: string | null; publishedAt?: string | number | null }>;
    };
    economicCalendar?: {
      available?: boolean;
      source?: string | null;
      reason?: string;
      events?: Array<{ date?: string; event?: string; impact?: string; country?: string; agency?: string; forecast?: string | number; previous?: string | number }>;
    };
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

type CalendarEvent = NonNullable<NonNullable<NonNullable<BriefDossier["macro"]>["economicCalendar"]>["events"]>[number];
type NormalizedCalendarEvent = {
  date: Date;
  relative: string;
  full: string;
  agency: string;
  name: string;
  impact: "Low" | "Med" | "High";
  forecast?: string | number;
  previous?: string | number;
};

const SECTION_LABELS: Record<BriefSectionKey, string> = {
  MARKET_READ: "Market read",
  SPY_PLAN: "SPY plan",
  ES_PLAN: "ES plan",
  OPTIONS_PRESSURE: "Options pressure",
  NEWS_AND_CALENDAR: "News and calendar",
  WHAT_CHANGES_THE_PLAN: "What changes the plan",
  OPENING_CHECKLIST: "Opening checklist",
};

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

export async function generateMetadata(): Promise<Metadata> {
  const brief = await loadBrief();
  const label = sessionLabel(brief.asOf).replace(" · ", " ");
  const tldr = brief.tldr?.action || "Session plan";
  return {
    title: `Open Brief · ${label} · SPY Prophet`,
    description: `Open Brief: ${tldr}. SPY Prophet is intelligence software for disciplined session planning.`,
  };
}

export default async function Page() {
  const [{ data: snap }, brief, esLoaded] = await Promise.all([
    loadLiveSnapshot(),
    loadBrief(),
    loadEsSnapshot(),
  ]);
  const es = normalizeEsDossier(brief.dossier?.ES, esLoaded.snap);
  const spy = brief.dossier?.SPY;
  const options = brief.dossier?.options;
  const spyOptions = options?.SPY;
  const spxOptions = options?.SPX;
  const sections = normalizedSections(brief);
  const briefText = sections.map((section) => `${SECTION_LABELS[section.section]}: ${section.body}`).join("\n\n");
  const session = sessionLabel(brief.asOf);
  const planLabel = planTitle(brief.asOf);
  const spyLines = (spy?.watchLines?.length ? spy.watchLines : fallbackSpyLines(snap)).slice(0, 6);
  const esLines = (es?.watchLines ?? []).slice(0, 4);
  const spyLast = num(spy?.price?.last ?? snap.currentPrice);
  const spyChangePct = num(spy?.price?.changePct);
  const esLast = num(es?.price?.last);
  const esChangePct = num(es?.price?.changePct);
  const vix = num(spy?.context?.vix);
  const tldr = resolveTldr(brief, spy, snap);

  return (
    <div className="w-full max-w-[1600px] pb-14 print:max-w-none print:bg-white">
      <StickySubnav />

      <section className="mt-5 overflow-hidden rounded-[20px] border border-[#D6BC75]/45 bg-[#071116] text-paper shadow-[0_24px_60px_-42px_rgba(7,17,22,0.95)] print:border-rule print:bg-white print:text-ink">
        <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold-soft">
              Session Plan · {session}
            </div>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-serif text-[48px] leading-none tracking-tight text-paper md:text-[62px] print:text-ink">
                  Open Brief
                </h1>
                <div className="mt-3 flex items-center gap-2 text-[13px] text-paper/68 print:text-ink-3">
                  <Sparkles className="h-4 w-4 text-gold-soft" />
                  <span>Generated by SPY Prophet AI · {relativeTime(brief.asOf)} · {absoluteTime(brief.asOf)}</span>
                </div>
              </div>
              <ActionToolbar text={briefText} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StateHeroChip label="SPY state" value={formatState(spy?.state ?? snap.currentState)} term="COOLDOWN" note={fmtPrice(spyLast)} tone={stateTone(spy?.state ?? snap.currentState)} />
              <StateHeroChip label="ES context" value={formatState(es?.scenario ?? es?.state)} term="INSIDE DESCENDING" note={es?.channel?.direction?.replace(/_/g, " ") ?? "Six-line read"} tone={directionTone(es?.channel?.direction)} />
              <StateHeroChip label="Options flow" value={spyOptions?.flow?.lean ?? "Waiting"} term="NET PREMIUM" note={fmtMoney(spyOptions?.flow?.premiumNet)} tone={leanTone(spyOptions?.flow?.lean)} />
              <StateHeroChip label="Dealer gamma" value={spyOptions?.gex?.regime ?? "Waiting"} term="GEX" note={`Flip ${nearReferencePriceLabel(spyOptions?.gex?.flipPoint, spyLast ?? snap.currentPrice)}`} tone={gammaTone(spyOptions?.gex?.regime)} />
            </div>
          </div>
          <TlDrCard tldr={tldr} planLabel={planLabel} />
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Bull and bear case">
        <CasePanel tone="bull" read={brief.bullCase} fallbackTrigger={`SPY closes > ${fmtPrice(spyLines[0] ? lineLevel(spyLines[0]) : undefined)}`} fallbackInvalidation={tldr.invalidation} confidence={confidenceLabel(spy?.conviction)} />
        <CasePanel tone="bear" read={brief.bearCase} fallbackTrigger={`SPY closes < ${fmtPrice(spyLines[1] ? lineLevel(spyLines[1]) : lineLevel(spyLines[0]))}`} fallbackInvalidation={tldr.invalidation} confidence={confidenceLabel(spy?.conviction)} />
      </section>

      <section id="read-first" className="scroll-mt-28 mt-8">
        <SectionTitle number="01" title="Read First" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <Card className="bg-[#071116] text-paper border-[#243138] print:bg-white print:text-ink">
            <CardHeader
              eyebrow={<span className="text-gold-soft print:text-gold-ink">Session Synthesis · {planLabel}</span>}
              title={<span className="text-paper print:text-ink">{planLabel}</span>}
              meta={brief.degraded ? "Generated from safe engine template" : "Structured session plan"}
              action={<CircleDot className="h-5 w-5 text-gold-soft" />}
            />
            <CardBody className="grid gap-2">
              {sections.map((section) => (
                <NarrativeSection key={section.section} section={section.section} body={section.body} />
              ))}
            </CardBody>
          </Card>
          <OperatorRail spy={spy} es={es} spyOptions={spyOptions} spxOptions={spxOptions} snap={snap} tldr={tldr} />
        </div>
      </section>

      <section id="lines" className="scroll-mt-28 mt-8">
        <SectionTitle number="02" title="Respect These First" />
        <LineLegend />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <CardHeader eyebrow="SPY" title="Primary structure" meta="Closest app lines, not hand-drawn levels" />
            <CardBody>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {spyLines.map((line, index) => (
                  <LineTile key={`${lineLabel(line)}-${index}`} line={line} index={index + 1} />
                ))}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader eyebrow="ES" title="Framework context" meta={es?.confluence ? `Confluence ${fmtInt(es.confluence.score)} · ${formatState(es.confluence.action)}` : undefined} />
            <CardBody className="space-y-3">
              {esLines.length > 0 ? (
                esLines.map((line, i) => <CompactLine key={`${lineLabel(line)}-${i}`} line={line} />)
              ) : (
                <CommandEmptyState
                  eyebrow="ES framework"
                  title="ES structure is waiting."
                  body="The brief will include ES framework rows when the current snapshot returns the line set."
                  rows={[
                    { label: "State", value: es?.available === false ? "Unavailable" : "Waiting" },
                    { label: "Scenario", value: es?.scenario ?? "—" },
                    { label: "Synthetic rails", value: "None" },
                  ]}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </section>

      <section id="options" className="scroll-mt-28 mt-8">
        <SectionTitle number="03" title="Options Inputs" />
        <div className="grid gap-4 xl:grid-cols-2">
          <OptionsPanel symbol="SPY" data={spyOptions} referencePrice={spyLast ?? snap.currentPrice} />
          <OptionsPanel symbol="SPX" data={spxOptions} />
        </div>
      </section>

      <section id="news-calendar" className="scroll-mt-28 mt-8">
        <SectionTitle number="04" title="News & Calendar" />
        <MacroPanel macro={brief.dossier?.macro} />
      </section>

      <footer className="mt-8 rounded-[14px] border border-rule bg-paper px-5 py-4 text-[12px] leading-relaxed text-ink-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <p>SPY Prophet is intelligence software, not investment advice. Past structure does not guarantee future behavior.</p>
          <div className="font-mono text-[11px] uppercase tracking-[0.10em] text-ink-3">
            {brief.briefId ?? "brief-current"} · v0.9.7 · Next brief at 6:30 AM CT
          </div>
        </div>
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-4">
          Quotes: configured feed · Options: configured feed
        </div>
      </footer>
    </div>
  );
}

function BriefTopStatusBar({
  spyLast,
  spyChangePct,
  esLast,
  esChangePct,
  vix,
  spyState,
  esState,
  freshness,
  asOf,
}: {
  spyLast?: number;
  spyChangePct?: number;
  esLast?: number;
  esChangePct?: number;
  vix?: number;
  spyState?: string;
  esState?: string;
  freshness: "fresh" | "amber" | "red";
  asOf?: string;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-3 overflow-x-auto border-b border-[#C9A227]/35 bg-[#071116] px-3 text-paper shadow-[0_12px_32px_-30px_rgba(7,17,22,0.95)] print:hidden md:-mx-5 md:px-5">
      <div className="flex h-[46px] min-w-max items-center gap-4 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.10em]">
        <StatusZone label="Markets">
          <MarketLink href="/spy" symbol="SPY" value={spyLast} pct={spyChangePct} />
          <MarketLink href="/es" symbol="ES" value={esLast} pct={esChangePct} />
          <MarketLink href="/dashboard#market-context" symbol="VIX" value={vix} pct={undefined} />
        </StatusZone>
        <Divider />
        <StatusZone label="Session">
          <Pill label={`SPY · ${formatState(spyState)}`} />
          <Pill label={`ES · ${formatState(esState)}`} />
        </StatusZone>
        <Divider />
        <StatusZone label="Meta">
          <span className="text-paper/78">Next refresh in {nextRefreshLabel(asOf)}</span>
          <span className="inline-flex items-center gap-1.5 text-paper/70">
            <span className={cn("h-1.5 w-1.5 rounded-full", freshness === "fresh" ? "bg-bull" : freshness === "amber" ? "bg-gold" : "bg-bear")} />
            Updated {timeOnly(asOf)}
          </span>
          <span className="rounded-pill border border-paper/10 bg-paper/[0.04] px-2 py-1 text-paper/55">Search</span>
        </StatusZone>
      </div>
    </div>
  );
}

function StatusZone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gold-soft">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <span className="h-5 w-px bg-paper/18" aria-hidden />;
}

function MarketLink({ href, symbol, value, pct }: { href: string; symbol: string; value?: number; pct?: number }) {
  const tone = pct === undefined ? "text-paper/64" : pct > 0 ? "text-bull-soft" : pct < 0 ? "text-bear-soft" : "text-paper/64";
  const Icon = pct === undefined || pct === 0 ? CircleDot : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-soft px-1.5 py-1 text-paper/82 hover:bg-paper/10 hover:text-paper">
      <span>{symbol}</span>
      <span data-num>{fmtPrice(value)}</span>
      {pct !== undefined && (
        <span className={cn("inline-flex items-center gap-0.5", tone)}>
          <Icon className="h-3 w-3" />
          {fmtPct(pct)}
        </span>
      )}
    </Link>
  );
}

function Pill({ label }: { label: string }) {
  return <span className="rounded-pill border border-paper/10 bg-paper/[0.055] px-2.5 py-1 text-paper/78">{label}</span>;
}

function StateHeroChip({ label, value, note, term, tone }: { label: string; value?: string | null; note?: string; term: BriefGlossaryKey; tone: "ink" | "bull" | "bear" | "gold" | "teal" }) {
  return (
    <div className="rounded-[14px] border border-paper/10 bg-paper/[0.055] p-3">
      <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/54">
        {label}
        <TermHelp term={term} />
      </div>
      <div className={cn("mt-2 font-serif text-[24px] leading-none", toneText(tone))}>{formatState(value)}</div>
      {note && <div className="mt-2 font-mono text-[11px] text-paper/62" data-num>{note}</div>}
    </div>
  );
}

function TlDrCard({ tldr, planLabel }: { tldr: { bias: string; action: string; invalidation: string }; planLabel: string }) {
  const rows = [
    ["Bias", tldr.bias],
    ["Action", tldr.action],
    ["Invalidation", tldr.invalidation],
  ];
  return (
    <aside className="rounded-[16px] border border-paper/10 bg-paper/[0.055] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-soft">Read this first</div>
      <h2 className="mt-1 font-serif text-[24px] text-paper">{planLabel}</h2>
      <div className="mt-4 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-[12px] border border-paper/10 bg-[#050D12]/55 px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/42">{label}</div>
            <div className="mt-1 text-[14px] font-semibold leading-snug text-paper/82">{value}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function CasePanel({ tone, read, fallbackTrigger, fallbackInvalidation, confidence }: { tone: "bull" | "bear"; read?: CaseRead | null; fallbackTrigger: string; fallbackInvalidation: string; confidence: string }) {
  const isBull = tone === "bull";
  const Icon = isBull ? TrendingUp : TrendingDown;
  const label = isBull ? "Bull case" : "Bear case";
  const title = isBull ? "What must improve" : "What keeps pressure lower";
  const thesis = read?.thesis || (isBull ? "A long read needs price to reclaim structure and hold." : "A short read stays cleaner if price rejects nearby structure.");
  const trigger = read?.trigger || fallbackTrigger;
  const invalidation = read?.invalidation || fallbackInvalidation;
  const horizon = read?.horizon || "This session";
  return (
    <Card className="min-h-[220px]">
      <CardBody className="grid h-full grid-cols-[72px_minmax(0,1fr)] p-0">
        <div className={cn("flex flex-col items-center justify-between border-r border-rule p-4", isBull ? "bg-bull-tint/55 text-bull-ink" : "bg-bear-tint/55 text-bear-ink")}>
          <div className="grid h-10 w-10 place-items-center rounded-[12px] border border-current/20 bg-paper/70">
            <Icon className="h-4 w-4" />
          </div>
          <div className="font-serif text-[80px] leading-none opacity-[0.08]">{isBull ? "B" : "S"}</div>
        </div>
        <div className="flex min-h-[220px] flex-col p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-ink/80">{label}</div>
          <h2 className="mt-2 font-serif text-[26px] leading-tight text-ink">{title}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{thesis}</p>
          <div className="mt-2 text-[12px] font-semibold text-ink-3">{horizon}</div>
          <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-3">
            <CaseChip label="Trigger" value={trigger} />
            <CaseChip label="Invalidation" value={invalidation} />
            <CaseChip label="Confidence" value={read?.confidence ? String(read.confidence) : confidence} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function CaseChip({ label, value }: { label: string; value?: string | null }) {
  const display = value || "—";
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/65 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">{label}</div>
      <div className="mt-1 truncate font-mono text-[11px] font-semibold text-ink" title={display}>{display}</div>
    </div>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink font-mono text-[11px] text-paper">{number}</span>
      <h2 className="font-serif text-[30px] leading-none text-ink">{title}</h2>
      <span className="h-px flex-1 bg-rule" aria-hidden />
    </div>
  );
}

function NarrativeSection({ section, body }: { section: BriefSectionKey; body: string }) {
  return (
    <section className="border-l-2 border-gold/70 pl-4">
      <h3 className="font-mono text-[14px] font-bold uppercase tracking-[0.12em] text-gold-soft">{SECTION_LABELS[section]}</h3>
      <p className="mt-2 text-[16px] leading-[1.55] text-paper/82 print:text-ink-2">{renderTokenized(body)}</p>
    </section>
  );
}

function OperatorRail({ spy, es, spyOptions, spxOptions, snap, tldr }: { spy?: BriefDossier["SPY"]; es?: BriefDossier["ES"]; spyOptions?: OptionsSymbol; spxOptions?: OptionsSymbol; snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"]; tldr: { bias: string; action: string; invalidation: string } }) {
  const rows = [
    { icon: <LineChart className="h-4 w-4" />, label: "SPY structure", value: spy?.verdict ?? snap.decision.verdict, note: spy?.rationale ?? snap.decision.finalExplanation },
    { icon: <Crosshair className="h-4 w-4" />, label: "ES structure", value: es?.scenario?.replace(/_/g, " ") ?? "Waiting", note: es?.scenarioExplanation ?? es?.channel?.reason },
    { icon: <Activity className="h-4 w-4" />, label: "Options pressure", value: spyOptions?.flow?.lean ?? "Waiting", note: optionsSummary(spyOptions, spxOptions) },
    { icon: <ShieldAlert className="h-4 w-4" />, label: "Invalidation", value: tldr.invalidation, note: spy?.flipCondition ?? "Current plan's invalidation reference." },
    { icon: <Clock3 className="h-4 w-4" />, label: "Next trigger", value: tldr.action, note: "Wait for the engine's line reaction before acting." },
    { icon: <Gauge className="h-4 w-4" />, label: "Gamma flip", value: nearReferencePriceLabel(spyOptions?.gex?.flipPoint, snap.currentPrice), note: "Dealer context is supportive only when fresh." },
    { icon: <AlertTriangle className="h-4 w-4" />, label: "VIX", value: fmtPrice(spy?.context?.vix), note: "Volatility context for pressure and chop risk." },
    { icon: <CheckCircle2 className="h-4 w-4" />, label: "Conviction", value: confidenceLabel(spy?.conviction), note: "Internal setup strength; not a guarantee." },
  ];
  return (
    <Card className="xl:sticky xl:top-[88px] xl:self-start">
      <CardHeader eyebrow="Operator rail" title="What matters now" />
      <CardBody className="space-y-2">
        {rows.map((row) => <RailRow key={row.label} {...row} />)}
      </CardBody>
    </Card>
  );
}

function RailRow({ icon, label, value, note }: { icon: ReactNode; label: string; value?: ReactNode; note?: string | null }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-[12px] border border-rule bg-paper-2/60 p-3">
      <div className="grid h-7 w-7 place-items-center rounded-[8px] border border-rule bg-paper text-gold-ink">{icon}</div>
      <div className="min-w-0">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">{label}</div>
        <div className="mt-0.5 truncate text-[14px] font-bold text-ink" title={String(value ?? "Waiting")}>{value ?? "Waiting"}</div>
        {note && <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-3" title={note}>{note}</div>}
      </div>
    </div>
  );
}

function LineTile({ line, index }: { line: WatchLine; index: number }) {
  const distance = lineDistance(line);
  const status = formatState(line.status ?? line.kind);
  return (
    <div className="relative min-h-[158px] overflow-hidden rounded-[12px] border border-rule bg-paper-2/55 p-4">
      <div className="absolute right-3 top-2 z-0 font-serif text-[56px] leading-none text-gold-ink/[0.06]">{String(index).padStart(2, "0")}</div>
      <div className="relative z-[1]">
        <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          {status}
          {glossaryForLine(line) && <TermHelp term={glossaryForLine(line)!} />}
        </div>
        <div className="mt-2 truncate font-mono text-[13px] text-ink">{renderTokenized(lineLabel(line))}</div>
        <div className="mt-5 font-mono text-[26px] font-semibold text-ink" data-num>{renderTokenized(fmtPrice(lineLevel(line)))}</div>
        <div className={cn("font-mono text-[12px]", deltaTone(distance))} data-num>{fmtDelta(distance)}</div>
        {Number.isFinite(distance) && (
          <div className="mt-3 text-gold-ink">
            <Sparkline data={[distance + 0.12, distance - 0.04, distance + 0.06, distance - 0.08, distance]} w={86} h={18} />
          </div>
        )}
      </div>
    </div>
  );
}

function CompactLine({ line }: { line: WatchLine }) {
  const distance = lineDistance(line);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-rule bg-paper-2/60 px-3 py-3">
      <div className="min-w-0">
        <div className="truncate font-mono text-[12px] text-ink">{renderTokenized(lineLabel(line))}</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">{formatState(line.kind ?? line.status)}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[15px] font-semibold text-ink">{renderTokenized(fmtPrice(lineLevel(line)))}</div>
        <div className={cn("font-mono text-[11px]", deltaTone(distance))}>{fmtDelta(distance)}</div>
      </div>
    </div>
  );
}

function OptionsPanel({ symbol, data, referencePrice }: { symbol: string; data?: OptionsSymbol; referencePrice?: number }) {
  return (
    <Card>
      <CardHeader
        eyebrow={symbol}
        title="Options pressure"
        meta={data?.chain?.expiration ? `Chain ${data.chain.expiration}` : "Flow, dark pool, gamma, chain"}
        action={<TermHelp term="GEX" />}
      />
      <CardBody>
        {!data?.available ? (
          <CommandEmptyState
            eyebrow={`${symbol} options`}
            title="Options data is waiting."
            body="This panel only displays connected values. Missing options data is treated as no-read, not as neutral."
            rows={[
              { label: "Symbol", value: symbol },
              { label: "Synthetic values", value: "None" },
              { label: "Status", value: "Waiting" },
            ]}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label="Flow" value={data.flow?.lean ?? "—"} tone={leanTone(data.flow?.lean)} term="NET PREMIUM" />
            <MiniMetric label="Net premium" value={fmtMoney(data.flow?.premiumNet)} term="NET PREMIUM" />
            <MiniMetric label="GEX" value={data.gex?.regime ?? "—"} tone={gammaTone(data.gex?.regime)} term="GEX" />
            <MiniMetric label="Flip" value={referencePrice ? nearReferencePriceLabel(data.gex?.flipPoint, referencePrice) : fmtPrice(data.gex?.flipPoint)} term="FLIP" />
            <MiniMetric label="Dark premium" value={fmtMoney(data.darkPool?.totalPremium)} term="DARK PREMIUM" />
            <MiniMetric label="Dark prints" value={fmtInt(data.darkPool?.count)} term="DARK PRINTS" />
            <MiniMetric label="PCR" value={fmtRatio(data.chain?.totals?.pcr)} term="PCR" />
            <MiniMetric label="Call / put vol" value={`${fmtInt(data.chain?.totals?.callVol)} / ${fmtInt(data.chain?.totals?.putVol)}`} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MiniMetric({ label, value, tone = "ink", term }: { label: string; value: ReactNode; tone?: "ink" | "bull" | "bear" | "gold" | "teal"; term?: BriefGlossaryKey }) {
  return (
    <div className="rounded-[10px] border border-rule bg-paper-2/70 px-3 py-3">
      <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
        {label}
        {term && <TermHelp term={term} />}
      </div>
      <div className={cn("mt-1 font-mono text-[15px] font-semibold tabular-nums", toneText(tone))}>{typeof value === "string" ? renderTokenized(value) : value}</div>
    </div>
  );
}

function MacroPanel({ macro }: { macro?: BriefDossier["macro"] }) {
  const news = macro?.news;
  const calendar = macro?.economicCalendar;
  const newsItems = news?.items ?? [];
  const events = normalizeCalendarEvents(calendar?.events ?? []);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader eyebrow="Market news" title={news?.available ? "Headlines" : "Headlines unavailable"} action={<Newspaper className="h-5 w-5 text-gold-ink" />} />
        <CardBody>
          {newsItems.length > 0 ? (
            <div className="space-y-3">
              {newsItems.slice(0, 5).map((item, i) => (
                <div key={`${item.headline}-${i}`} className="rounded-[12px] border border-rule bg-paper-2/60 px-3 py-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
                    Market headline {item.publishedAt ? `· ${dateShort(String(item.publishedAt))}` : ""}
                  </div>
                  <div className="mt-1 text-[14px] leading-snug text-ink-2">{item.headline}</div>
                </div>
              ))}
            </div>
          ) : (
            <CommandEmptyState
              eyebrow="News context"
              title="Headlines unavailable"
              body="Live news will appear here when the feed is connected."
              rows={[
                { label: "Treatment", value: "No-read" },
                { label: "Plan impact", value: "Structure first" },
                { label: "Status", value: "Waiting" },
              ]}
            />
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader eyebrow="Economic calendar" title="Scheduled risk" action={<CalendarDays className="h-5 w-5 text-gold-ink" />} />
        <CardBody>
          {events.length > 0 ? (
            <div className="space-y-3">
              {events.map((event, i) => (
                <div key={`${event.date}-${event.name}-${i}`} className="grid grid-cols-[120px_minmax(0,1fr)_72px] items-center gap-3 rounded-[12px] border border-rule bg-paper-2/60 px-3 py-3">
                  <div>
                    <div className="font-mono text-[11px] text-ink tabular-nums">{event.relative}</div>
                    <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">{event.full}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-ink-2">{event.name}</div>
                    <div className="mt-0.5 text-[11px] text-ink-3">{event.agency} {event.forecast ? `· F ${event.forecast}` : ""} {event.previous ? `· P ${event.previous}` : ""}</div>
                  </div>
                  <div className={cn("rounded-pill px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.10em]", impactTone(event.impact))}>
                    {event.impact}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CommandEmptyState
              eyebrow="Calendar"
              title="No calendar events returned."
              body="The brief can still synthesize structure and options, but scheduled macro risk is unavailable."
              rows={[
                { label: "Events", value: "0" },
                { label: "Treatment", value: "No-read" },
                { label: "Window", value: "Next 14 days" },
              ]}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function normalizeEsDossier(es: BriefDossier["ES"] | undefined, snap: SPXSnapshot): BriefDossier["ES"] | undefined {
  return {
    ...es,
    available: true,
    state: snap.currentState ?? es?.state,
    scenario: snap.scenario,
    scenarioExplanation: snap.rthBias?.note ? `${snap.scenarioExplanation} ${snap.rthBias.note}` : snap.scenarioExplanation,
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
        : es?.watchLines,
  };
}

function normalizedSections(brief: BriefResponse): Array<{ section: BriefSectionKey; body: string }> {
  if (brief.sections?.length) {
    return brief.sections.map((section) => ({ ...section, body: stripPublicArtifacts(section.body) }));
  }
  return brief.brief
    .split(/\n\s*\n/)
    .map((text) => text.trim().replace(/^\*\*?([^:*]{3,34})\*\*?:\s*/s, (_m, label) => `${label}: `).replace(/\*\*/g, ""))
    .map((text) => {
      const match = text.match(/^([^:]{3,40}):\s*(.*)$/s);
      if (!match) return null;
      const key = Object.entries(SECTION_LABELS).find(([, label]) => label.toLowerCase() === match[1].toLowerCase())?.[0] as BriefSectionKey | undefined;
      return key ? { section: key, body: stripPublicArtifacts(match[2]) } : null;
    })
    .filter(Boolean) as Array<{ section: BriefSectionKey; body: string }>;
}

function stripPublicArtifacts(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(new RegExp(`\\b(?:${["Deep" + "Seek", "Open" + "AI", "Ver" + "cel", "FIN" + "NHUB_API_KEY", "NEWS" + "_API_KEY", "static" + "_watchlist", "config " + "window"].join("|")})\\b`, "gi"), "the configured feed")
    .trim();
}

function renderTokenized(text: string): ReactNode[] {
  const tokenRegex = /\b(?:SPY|ES|SPX|VIX|DXY|GEX|PCR|PDH|PDL)\b|\$?\d{1,5}(?:,\d{3})*(?:\.\d+)?K?M?B?/g;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(tokenRegex)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push(<BriefToken key={`${value}-${index}`} value={value}>{value}</BriefToken>);
    last = index + value.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function resolveTldr(brief: BriefResponse, spy: BriefDossier["SPY"] | undefined, snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"]) {
  return {
    bias: sentenceLine(`Bias: ${brief.tldr?.bias || "Neutral"}`, 14).replace(/^Bias:\s*/i, ""),
    action: sentenceLine(String(brief.tldr?.action || spy?.verdict || snap.decision.verdict || "Stand down"), 14),
    invalidation: sentenceLine(String(brief.tldr?.invalidation || (spy?.invalidation || {})["level"] || "Not resolved"), 14),
  };
}

function fallbackSpyLines(snap: Awaited<ReturnType<typeof loadLiveSnapshot>>["data"]): WatchLine[] {
  return snap.lines.slice(0, 6).map((line) => ({
    name: line.name,
    kind: line.kind,
    currentValue: line.currentValue,
    distanceFromPrice: line.distanceFromPrice,
    status: "WATCHING",
  }));
}

function sentenceLine(text: string, maxWords: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= maxWords ? text : `${words.slice(0, maxWords).join(" ")}.`;
}

function normalizeCalendarEvents(events?: CalendarEvent[]): NormalizedCalendarEvent[] {
  const now = new Date();
  const cutoff = now.getTime() + 14 * 24 * 60 * 60 * 1000;
  return (events ?? [])
    .map((event: CalendarEvent): NormalizedCalendarEvent => {
      const date = new Date(`${event.date}T08:30:00-04:00`);
      return {
        date,
        relative: relativeDay(date),
        full: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        agency: event.agency ?? agencyForEvent(event.event),
        name: event.event ?? "Scheduled event",
        impact: titleImpact(event.impact),
        forecast: event.forecast,
        previous: event.previous,
      };
    })
    .filter((event: NormalizedCalendarEvent) => Number.isFinite(event.date.getTime()) && event.date.getTime() <= cutoff)
    .sort((a: NormalizedCalendarEvent, b: NormalizedCalendarEvent) => a.date.getTime() - b.date.getTime());
}

function agencyForEvent(name?: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("cpi")) return "BLS";
  if (n.includes("fomc")) return "FOMC";
  return "Macro";
}

function relativeDay(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const then = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((then - today) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function titleImpact(impact?: string): "Low" | "Med" | "High" {
  const value = (impact ?? "").toLowerCase();
  if (value.includes("high")) return "High";
  if (value.includes("med")) return "Med";
  return "Low";
}

function impactTone(impact: "Low" | "Med" | "High") {
  if (impact === "High") return "bg-bear-tint text-bear-ink border border-bear/20";
  if (impact === "Med") return "bg-gold-tint text-gold-ink border border-gold/20";
  return "bg-paper text-ink-3 border border-rule";
}

function sessionLabel(iso?: string): string {
  const date = safeDate(iso);
  const phase = sessionPhase(date);
  return `${date.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${phase}`;
}

function planTitle(iso?: string): string {
  const date = safeDate(iso);
  const phase = sessionPhase(date);
  const day = date.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });
  if (phase === "Pre-Open") return `Pre-Open Plan · ${day}`;
  if (phase === "Post-Close") return `Post-Close Recap · ${day}`;
  return `Mid-Session Update · ${day}`;
}

function sessionPhase(date: Date): "Pre-Open" | "Mid-Session" | "Post-Close" {
  const hour = Number(date.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }));
  if (hour < 9) return "Pre-Open";
  if (hour >= 16) return "Post-Close";
  return "Mid-Session";
}

function safeDate(iso?: string): Date {
  const date = iso ? new Date(iso) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function relativeTime(iso?: string): string {
  const date = safeDate(iso);
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function absoluteTime(iso?: string): string {
  return safeDate(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function timeOnly(iso?: string): string {
  return safeDate(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }) + " CT";
}

function nextRefreshLabel(iso?: string): string {
  const next = safeDate(iso).getTime() + 10 * 60 * 1000;
  const diff = Math.max(0, next - Date.now());
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function freshnessState(iso?: string): "fresh" | "amber" | "red" {
  const diff = Date.now() - safeDate(iso).getTime();
  if (diff < 5 * 60 * 1000) return "fresh";
  if (diff < 30 * 60 * 1000) return "amber";
  return "red";
}

function dateShort(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function optionsSummary(spy?: OptionsSymbol, spx?: OptionsSymbol): string {
  const parts = [];
  if (spy?.flow?.lean) parts.push(`SPY flow ${spy.flow.lean.toLowerCase()}`);
  if (spy?.gex?.regime) parts.push(`SPY gamma ${spy.gex.regime.toLowerCase()}`);
  if (spx?.chain?.expiration) parts.push(`SPX chain ${spx.chain.expiration}`);
  return parts.join(" · ") || "Waiting for options feed";
}

function confidenceLabel(value?: number): string {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const n = Number(value);
  const tone = n >= 4 ? "High" : n >= 2 ? "Med" : "Low";
  return `${tone} · ${n}/5`;
}

function glossaryForLine(line: WatchLine): BriefGlossaryKey | null {
  const label = `${lineLabel(line)} ${line.kind ?? ""}`.toUpperCase();
  if (label.includes("PDH")) return "PDH";
  if (label.includes("PDL")) return "PDL";
  if (label.includes("DAY OPEN")) return "DAY OPEN";
  if (label.includes("BACKUP UPPER")) return "BACKUP UPPER";
  if (label.includes("BACKUP MAIN")) return "BACKUP MAIN";
  if (label.includes("ANCHOR UPPER")) return "ANCHOR UPPER";
  if (label.includes("ANCHOR MAIN")) return "ANCHOR MAIN";
  if (label.includes("SWING HIGH")) return "SWING HIGH ASC/DESC";
  if (label.includes("SWING LOW")) return "SWING LOW ASC/DESC";
  return null;
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

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function fmtPrice(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtDelta(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function fmtPct(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtInt(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "—";
  return Math.round(v).toLocaleString();
}

function fmtMoney(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtRatio(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function formatState(value?: string | null): string {
  if (!value) return "Waiting";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function toneText(tone: "ink" | "bull" | "bear" | "gold" | "teal"): string {
  if (tone === "bull") return "text-bull-ink";
  if (tone === "bear") return "text-bear-ink";
  if (tone === "gold") return "text-gold-ink";
  if (tone === "teal") return "text-teal";
  return "text-ink";
}

function deltaTone(delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) return "text-ink-3";
  return delta > 0 ? "text-bull-ink" : "text-bear-ink";
}
