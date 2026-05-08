import { Card, CardBody, CardHeader } from "@/components/ui/Card";
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
    <div className="max-w-[1200px] mx-auto pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence · 08"
        title="Market Context"
        lede="VIX, DXY, rates, breadth. The macro frame around today's read."
        source={source}
      />

      <SectionLabel number="01">Pressure tiles</SectionLabel>
      {!ctx ? (
        <Card>
          <CardBody className="py-10 text-[13px] text-ink-3">
            Market context unavailable. Reconnects with the next snapshot.
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <Tile
            span="col-span-6 md:col-span-4"
            eyebrow="VIX"
            title={ctx.vix?.label ?? "—"}
            value={ctx.vix?.value?.toFixed(2) ?? "—"}
            tone={ctx.vix?.tone}
            note={ctx.vix?.copy}
          />
          <Tile
            span="col-span-6 md:col-span-4"
            eyebrow="VVIX"
            title="Vol of vol"
            value={ctx.vvix?.value?.toFixed(2) ?? "—"}
          />
          <Tile
            span="col-span-6 md:col-span-4"
            eyebrow="DXY"
            title="Dollar index"
            value={ctx.dxy?.value?.toFixed(2) ?? "—"}
            tone={ctx.dxy?.tone}
            note={
              ctx.dxy?.chgPct !== null && ctx.dxy?.chgPct !== undefined
                ? `${ctx.dxy.chgPct > 0 ? "+" : ""}${ctx.dxy.chgPct.toFixed(2)}%`
                : undefined
            }
          />
          <Tile
            span="col-span-6 md:col-span-4"
            eyebrow="10Y"
            title="US Treasury"
            value={ctx.tnx?.value?.toFixed(3) ?? "—"}
            tone={ctx.tnx?.tone}
            note={
              ctx.tnx?.chgBps !== null && ctx.tnx?.chgBps !== undefined
                ? `${ctx.tnx.chgBps > 0 ? "+" : ""}${ctx.tnx.chgBps.toFixed(1)} bps`
                : undefined
            }
          />
          <Tile
            span="col-span-6 md:col-span-4"
            eyebrow="SPY pressure"
            title={ctx.spyPressure?.label ?? "—"}
            value={ctx.spyPressure?.value?.toFixed(2) ?? "—"}
            tone={ctx.spyPressure?.tone}
          />
          <Tile
            span="col-span-6 md:col-span-4"
            eyebrow="Trigger gap"
            title={ctx.triggerGap?.lineName ?? "—"}
            value={ctx.triggerGap?.points?.toFixed(2) ?? "—"}
            tone={ctx.triggerGap?.tone}
            note={ctx.triggerGap?.label}
          />
        </div>
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
      <Card>
        <CardHeader
          eyebrow={eyebrow}
          title={title}
          action={tone ? <StatusPill variant={variant}>{tone}</StatusPill> : undefined}
        />
        <CardBody>
          <div
            className="font-mono text-2xl font-semibold tabular-nums text-ink"
            data-num
          >
            {value}
          </div>
          {note && (
            <div className="text-[12px] text-ink-3 mt-1.5 leading-snug">
              {note}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
