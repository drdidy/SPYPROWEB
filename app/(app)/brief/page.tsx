import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CommandEmptyState } from "@/components/ui/CommandEmptyState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface BriefResponse {
  brief: string;
  source: "openai" | "engine" | "error";
  asOf?: string;
}

async function loadBrief(): Promise<BriefResponse> {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!host) return { brief: "", source: "error" };
    const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const res = await fetch(`${proto}://${host}/api/spy/brief`, { cache: "no-store" });
    if (!res.ok) return { brief: "", source: "error" };
    return (await res.json()) as BriefResponse;
  } catch {
    return { brief: "", source: "error" };
  }
}

export default async function Page() {
  const [{ data: snap, source }, brief] = await Promise.all([loadLiveSnapshot(), loadBrief()]);
  const high = snap.pivots.find((p) => p.kind === "HIGH");
  const low = snap.pivots.find((p) => p.kind === "LOW");
  const lines = [...snap.lines]
    .sort((a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice))
    .slice(0, 5);

  return (
    <div className="w-full max-w-[1280px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence - 10"
        title="Daily Brief"
        lede="The day in plain English. Yesterday's close, what overnight did, where the day looks like it's leaning."
        source={source}
      />

      <SectionLabel number="01">Today, in one read</SectionLabel>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <Card className="bg-[#071116] text-paper border-[#243138]">
          <CardHeader
            eyebrow={<span className="text-gold-soft">{brief.source === "openai" ? "Generated brief" : "Engine read"}</span>}
            title={
              <span className="text-paper">
                {snap.decision.verdict === "WAIT"
                  ? "Waiting"
                  : snap.decision.verdict === "STAND DOWN"
                    ? "Standing down"
                    : `Lean ${snap.decision.verdict.toLowerCase()}`}
              </span>
            }
            meta={<span className="text-paper/45">{snap.decision.windowET || "Current session"}</span>}
          />
          <CardBody>
            {brief.brief ? (
              <div className="font-serif text-[20px] leading-[1.55] text-paper/82 space-y-5">
                {brief.brief.split(/\n\s*\n/).map((para, i) => (
                  <p key={i}>{para}</p>
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
          <CardHeader eyebrow="Dossier" title="Anchors carried in" />
          <CardBody className="space-y-3">
            <Anchor kind="HIGH" pivot={high} />
            <Anchor kind="LOW" pivot={low} />
          </CardBody>
        </Card>
      </div>

      <SectionLabel number="02">First lines to watch</SectionLabel>
      <Card>
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
            <ol className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {lines.map((l, i) => (
                <li key={l.name} className="relative min-h-[150px] rounded-card border border-rule bg-paper-2/45 p-4 overflow-hidden">
                  <div className="absolute right-3 top-2 font-serif text-[56px] leading-none text-gold-ink/10">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">Watch line</div>
                  <div className="mt-2 font-mono text-[13px] text-ink truncate">{l.name}</div>
                  <div className="mt-6 font-mono text-[24px] font-semibold text-ink" data-num>
                    {l.currentValue.toFixed(2)}
                  </div>
                  <div className={l.distanceFromPrice >= 0 ? "text-bull-ink" : "text-bear-ink"}>
                    <span className="font-mono text-[12px]" data-num>
                      {l.distanceFromPrice >= 0 ? "+" : ""}
                      {l.distanceFromPrice.toFixed(2)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Anchor({
  kind,
  pivot,
}: {
  kind: "HIGH" | "LOW";
  pivot: { price: number; time: string; source: string } | undefined;
}) {
  if (!pivot) {
    return (
      <div className="px-4 py-3 rounded-card border border-rule bg-paper-2/60">
        <div className="eyebrow text-ink-3">{kind}</div>
        <div className="text-[13px] text-ink-3 mt-1">No anchor resolved.</div>
      </div>
    );
  }
  return (
    <div className="px-4 py-3 rounded-card border border-rule bg-paper-2/60">
      <div className="eyebrow text-ink-3">{kind}</div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-ink mt-1" data-num>
        {pivot.price.toFixed(2)}
      </div>
      <div className="text-[11px] text-ink-3 mt-1">
        {new Date(pivot.time).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}{" "}
        - {pivot.source}
      </div>
    </div>
  );
}
