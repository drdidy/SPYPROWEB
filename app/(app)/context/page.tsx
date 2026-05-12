import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { CommandStat } from "@/components/ui/CommandStat";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const toneToVariant: Record<string, "confirmed" | "watching" | "breached" | "stale"> = {
  green: "confirmed",
  amber: "watching",
  red: "breached",
  neutral: "stale",
};

export default async function Page() {
  const { data: snap, source } = await loadLiveSnapshot();
  const ctx = snap.marketContext;

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
