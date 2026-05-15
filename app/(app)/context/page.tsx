import { headers } from "next/headers";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { CommandStat } from "@/components/ui/CommandStat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MacroContext = {
  asOf?: string;
  marketStatus?: {
    available?: boolean;
    isOpen?: boolean | null;
    holiday?: string | null;
    sessionOpen?: string | null;
    sessionClose?: string | null;
  };
  news?: {
    available?: boolean;
    sessionUse?: string;
    sessionUseLabel?: string;
    items?: Array<{ headline?: string; summary?: string; publishedAt?: string | number | null; url?: string | null; ageMinutes?: number | null }>;
  };
  economicCalendar?: {
    available?: boolean;
    events?: Array<{
      date?: string;
      time?: string | null;
      event?: string | null;
      country?: string | null;
      impact?: string | null;
      forecast?: string | number | null;
      previous?: string | number | null;
    }>;
  };
};

const toneToVariant: Record<string, "confirmed" | "watching" | "breached" | "stale"> = {
  green: "confirmed",
  amber: "watching",
  red: "breached",
  neutral: "stale",
};

async function loadMacroContext(): Promise<MacroContext | null> {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const out: Record<string, string> = {};
    const cookie = h.get("cookie");
    if (cookie) out.cookie = cookie;
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      out["x-vercel-protection-bypass"] = bypass;
      out["x-vercel-set-bypass-cookie"] = "samesitenone";
    }
    const res = await fetch(`${proto}://${host}/api/macro/context`, {
      cache: "no-store",
      headers: out,
    });
    if (!res.ok) return null;
    return (await res.json()) as MacroContext;
  } catch {
    return null;
  }
}

export default async function Page() {
  const [{ data: snap, source }, macro] = await Promise.all([loadLiveSnapshot(), loadMacroContext()]);
  const ctx = snap.marketContext;
  const newsRecapOnly = macro?.news?.sessionUse === "recap_only" || macro?.news?.sessionUse === "stale_watch";
  const calendarEvents = normalizeCalendarEvents(macro?.economicCalendar?.events ?? []);

  return (
    <div className="w-full max-w-[1440px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence - 08"
        title="Market Context"
        lede="VIX, DXY, rates, breadth. The macro frame around today's read."
        source={source}
      />

      <SectionLabel number="01">Pressure board</SectionLabel>
      {!ctx ? (
        <CommandEmptyState
          eyebrow="Macro feed unavailable"
          title="Market context is unavailable."
          body="The dashboard is not receiving a market-context block in the current snapshot. No substitute pressure readings are shown; this panel reconnects when the engine publishes VIX, DXY, rates, and trigger-gap context."
          rows={[
            { label: "Values", value: "Hidden until loaded" },
            { label: "Mode", value: "Live snapshot only" },
            { label: "State", value: "Unavailable" },
          ]}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <CommandStat label="VIX" value={fmtNum(ctx.vix?.value, 2)} note={ctx.vix?.label} tone={toneFor(ctx.vix?.tone)} />
            <CommandStat label="DXY" value={fmtNum(ctx.dxy?.value, 2)} note={pctNote(ctx.dxy?.chgPct)} tone={toneFor(ctx.dxy?.tone)} />
            <CommandStat label="10Y" value={fmtNum(ctx.tnx?.value, 3)} note={bpsNote(ctx.tnx?.chgBps)} tone={toneFor(ctx.tnx?.tone)} />
            <CommandStat label="Trigger gap" value={fmtNum(ctx.triggerGap?.points, 2)} note={ctx.triggerGap?.lineName} tone={toneFor(ctx.triggerGap?.tone)} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
            <Card>
              <CardHeader eyebrow="Context map" title="Pressure fields" meta="Every tile is sourced from the snapshot." />
              <CardBody>
                <div className="grid grid-cols-12 gap-4">
                  <Tile
                    span="col-span-12 md:col-span-6"
                    eyebrow="VIX"
                    title={ctx.vix?.label ?? "-"}
                    value={fmtNum(ctx.vix?.value, 2)}
                    tone={ctx.vix?.tone}
                    note={ctx.vix?.copy}
                  />
                  <Tile
                    span="col-span-12 md:col-span-6"
                    eyebrow="VVIX"
                    title="Vol of vol"
                    value={fmtNum(ctx.vvix?.value, 2)}
                  />
                  <Tile
                    span="col-span-12 md:col-span-6"
                    eyebrow="SPY pressure"
                    title={ctx.spyPressure?.label ?? "-"}
                    value={fmtNum(ctx.spyPressure?.value, 2)}
                    tone={ctx.spyPressure?.tone}
                  />
                  <Tile
                    span="col-span-12 md:col-span-6"
                    eyebrow="Nearest trigger"
                    title={ctx.triggerGap?.lineName ?? "-"}
                    value={fmtNum(ctx.triggerGap?.points, 2)}
                    tone={ctx.triggerGap?.tone}
                    note={ctx.triggerGap?.label}
                  />
                </div>
              </CardBody>
            </Card>

            <Card className="bg-[#071116] text-paper border-[#243138]">
              <CardHeader
                eyebrow={<span className="text-gold-soft">Macro radar</span>}
                title={<span className="text-paper">Live pressure contour</span>}
                meta={<span className="text-paper/45">No model-imputed readings</span>}
              />
              <CardBody>
                <Radar
                  points={[
                    { label: "VIX", value: ctx.vix?.value },
                    { label: "DXY", value: ctx.dxy?.value },
                    { label: "10Y", value: ctx.tnx?.value },
                    { label: "SPY", value: ctx.spyPressure?.value },
                    { label: "GAP", value: ctx.triggerGap?.points },
                  ]}
                />
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <SectionLabel number="02">Headlines & scheduled risk</SectionLabel>
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_420px] gap-5">
        <Card>
          <CardHeader eyebrow="US session" title="Market status" meta={macro?.asOf ? `Updated ${timeOnly(macro.asOf)}` : "Waiting"} />
          <CardBody>
            <div className="rounded-card border border-rule bg-paper-2/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="eyebrow text-ink-3">Status</div>
                  <div className="mt-2 font-serif text-[28px] leading-none text-ink">
                    {macro?.marketStatus?.available ? (macro.marketStatus.isOpen ? "Open" : "Closed") : "Unavailable"}
                  </div>
                </div>
                <StatusPill variant={macro?.marketStatus?.isOpen ? "confirmed" : "stale"}>
                  {macro?.marketStatus?.isOpen ? "Live" : "Standby"}
                </StatusPill>
              </div>
              <div className="mt-4 grid gap-2 text-[12px] text-ink-3">
                <div className="flex justify-between gap-3">
                  <span>Session open</span>
                  <span className="font-mono tabular-nums" data-num>{sessionClock(macro?.marketStatus?.sessionOpen)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Session close</span>
                  <span className="font-mono tabular-nums" data-num>{sessionClock(macro?.marketStatus?.sessionClose)}</span>
                </div>
                {macro?.marketStatus?.holiday && (
                  <div className="rounded-soft bg-gold/10 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.10em] text-gold-ink">
                    {macro.marketStatus.holiday}
                  </div>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            eyebrow="Market news"
            title={macro?.news?.available ? (newsRecapOnly ? "Context, not a trigger" : "Headlines") : "Headlines unavailable"}
            meta={macro?.news?.sessionUseLabel ?? "Provider-neutral feed"}
          />
          <CardBody>
            {macro?.news?.items?.length ? (
              <div className="grid gap-3">
                {newsRecapOnly && (
                  <div className="rounded-[12px] border border-gold/25 bg-gold/10 px-3 py-2 text-[12px] leading-relaxed text-gold-ink">
                    These headlines are recap context. They are not used as live 0DTE trade triggers.
                  </div>
                )}
                {macro.news.items.slice(0, 5).map((item, i) => (
                  <HeadlineRow key={`${item.headline}-${i}`} item={item} />
                ))}
              </div>
            ) : (
              <CommandEmptyState
                eyebrow="News context"
                title="Headlines unavailable"
                body="Live headlines will appear here when the connected feed returns market news. The pressure board remains structure-first."
                rows={[
                  { label: "Treatment", value: "No-read" },
                  { label: "Plan impact", value: "Do not infer news" },
                  { label: "Retry", value: "Automatic" },
                ]}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Economic calendar" title="Scheduled risk" meta="Next 14 days" />
          <CardBody>
            {calendarEvents.length ? (
              <div className="space-y-3">
                {calendarEvents.slice(0, 8).map((event, i) => (
                  <CalendarRow key={`${event.date}-${event.event}-${i}`} event={event} />
                ))}
              </div>
            ) : (
              <CommandEmptyState
                eyebrow="Calendar"
                title="No scheduled events returned."
                body="The app will keep the brief structure-first until a connected calendar returns macro events."
                rows={[
                  { label: "Events", value: "0" },
                  { label: "Window", value: "Next 14 days" },
                  { label: "Status", value: "Waiting" },
                ]}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Tile({
  span,
  eyebrow,
  title,
  value,
  tone,
  note,
}: {
  span: string;
  eyebrow: string;
  title: string;
  value: string;
  tone?: string;
  note?: string | null;
}) {
  const variant = tone ? toneToVariant[tone] ?? "stale" : "stale";
  return (
    <div className={span}>
      <div className="rounded-card border border-rule bg-paper-2/45 p-4 h-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow text-ink-3">{eyebrow}</div>
            <div className="mt-1 text-title font-serif text-ink">{title}</div>
          </div>
          {tone && <StatusPill variant={variant}>{tone}</StatusPill>}
        </div>
        <div className="mt-4 font-mono text-3xl font-semibold tabular-nums text-ink" data-num>
          {value}
        </div>
        {note && <div className="text-[12px] text-ink-3 mt-2 leading-snug">{note}</div>}
      </div>
    </div>
  );
}

function Radar({
  points,
}: {
  points: Array<{ label: string; value: number | null | undefined }>;
}) {
  return (
    <div className="space-y-4">
      {points.map((p) => {
        const loaded = Number.isFinite(p.value ?? NaN);
        const width = loaded ? Math.max(8, Math.min(100, Math.abs(Number(p.value)) % 100)) : 0;
        return (
          <div key={p.label}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-paper/45">
                {p.label}
              </span>
              <span className="font-mono text-[11px] text-paper/80">{loaded ? fmtNum(p.value, 2) : "-"}</span>
            </div>
            <div className="mt-2 h-2 rounded-pill bg-paper/10 overflow-hidden">
              <div className="h-full rounded-pill bg-gold" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeadlineRow({
  item,
}: {
  item: { headline?: string; summary?: string; publishedAt?: string | number | null; url?: string | null };
}) {
  const body = (
    <div className="rounded-[12px] border border-rule bg-paper-2/60 px-3 py-3 transition-colors hover:bg-paper-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
        Market headline {item.publishedAt ? `· ${dateShort(String(item.publishedAt))}` : ""}
      </div>
      <div className="mt-1 text-[14px] font-semibold leading-snug text-ink-2">{item.headline ?? "Untitled headline"}</div>
      {item.summary && <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-3">{item.summary}</div>}
    </div>
  );
  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className="block outline-none focus-visible:ring-2 focus-visible:ring-gold/45 rounded-[12px]">
      {body}
    </a>
  ) : (
    body
  );
}

function CalendarRow({
  event,
}: {
  event: { date?: string; time?: string | null; event?: string | null; country?: string | null; impact?: string | null; forecast?: string | number | null; previous?: string | number | null };
}) {
  const impact = normalizeImpact(event.impact);
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)_64px] items-center gap-3 rounded-[12px] border border-rule bg-paper-2/60 px-3 py-3">
      <div>
        <div className="font-mono text-[11px] text-ink tabular-nums" data-num>{relativeDate(event.date)}</div>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">{shortDate(event.date)}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold text-ink-2" title={event.event ?? undefined}>{event.event ?? "Scheduled event"}</div>
        <div className="mt-0.5 truncate text-[11px] text-ink-3">
          {event.country ?? "US"} {event.forecast ? `· F ${event.forecast}` : ""} {event.previous ? `· P ${event.previous}` : ""}
        </div>
      </div>
      <div className={cn("rounded-pill px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.10em]", impactTone(impact))}>
        {impact}
      </div>
    </div>
  );
}

function normalizeCalendarEvents(
  events?: Array<{ date?: string; time?: string | null; event?: string | null; country?: string | null; impact?: string | null; forecast?: string | number | null; previous?: string | number | null }>,
) {
  const now = new Date();
  const freshnessFloor = now.getTime() - 30 * 60 * 1000;
  const cutoff = now.getTime() + 14 * 24 * 60 * 60 * 1000;
  return (events ?? [])
    .map((event) => ({ ...event, sortDate: parseCalendarEventTime(event) }))
    .filter((event) => {
      const time = event.sortDate.getTime();
      return Number.isFinite(time) && time >= freshnessFloor && time <= cutoff;
    })
    .sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
}

function parseCalendarEventTime(event: { date?: string; time?: string | null }): Date {
  const raw = String(event.time || "").trim();
  if (raw) {
    if (raw.includes("T")) return new Date(raw.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`);
    return new Date(`${raw.replace(" ", "T")}Z`);
  }
  return new Date(`${event.date}T08:30:00-04:00`);
}

function toneFor(tone?: string): "ink" | "bull" | "bear" | "gold" | "teal" {
  if (tone === "green") return "bull";
  if (tone === "red") return "bear";
  if (tone === "amber") return "gold";
  return "ink";
}

function fmtNum(n: number | null | undefined, dp: number): string {
  if (!Number.isFinite(n ?? NaN)) return "-";
  return Number(n).toFixed(dp);
}

function pctNote(n: number | null | undefined): string | undefined {
  if (!Number.isFinite(n ?? NaN)) return undefined;
  return `${Number(n) > 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
}

function bpsNote(n: number | null | undefined): string | undefined {
  if (!Number.isFinite(n ?? NaN)) return undefined;
  return `${Number(n) > 0 ? "+" : ""}${Number(n).toFixed(1)} bps`;
}

function sessionClock(value?: string | null): string {
  if (!value) return "-";
  return value.length > 5 ? value.slice(0, 5) : value;
}

function timeOnly(value?: string | null): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

function dateShort(value?: string | null): string {
  if (!value) return "";
  const numeric = Number(value);
  const dt = Number.isFinite(numeric) && String(value).length <= 10 ? new Date(numeric * 1000) : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

function relativeDate(value?: string | null): string {
  if (!value) return "Pending";
  const today = new Date();
  const date = new Date(`${value.slice(0, 10)}T12:00:00-05:00`);
  if (Number.isNaN(date.getTime())) return "Pending";
  const todayKey = today.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = tomorrow.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const key = date.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(date);
}

function shortDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T12:00:00-05:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalizeImpact(value?: string | null): "Low" | "Med" | "High" {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("high") || raw === "3") return "High";
  if (raw.includes("medium") || raw.includes("med") || raw === "2") return "Med";
  return "Low";
}

function impactTone(impact: "Low" | "Med" | "High"): string {
  if (impact === "High") return "bg-bear-tint text-bear-ink";
  if (impact === "Med") return "bg-gold/15 text-gold-ink";
  return "bg-paper-2 text-ink-3";
}
